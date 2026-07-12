import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  isRetryableCompatError,
  startStreamEagerly,
} from '../../compatRetry.js'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  createChatGPTResponsesStream,
  extractUsage,
} from '../responsesAdapter.js'

describe('buildResponsesRequest', () => {
  test('includes reasoning effort for ChatGPT Responses requests', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'xhigh',
    })

    expect(request.reasoning).toEqual({ effort: 'xhigh' })
  })

  test('does not include unsupported max_output_tokens parameter', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    }) as Record<string, unknown>

    expect('max_output_tokens' in request).toBe(false)
  })
})

describe('createChatGPTResponsesStream', () => {
  const envKeys = ['CLAUDE_CONFIG_DIR'] as const
  let envSnapshot: Partial<Record<(typeof envKeys)[number], string>>
  let tempDir: string

  beforeEach(() => {
    envSnapshot = {
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    tempDir = join(
      tmpdir(),
      `responses-adapter-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(
      join(tempDir, 'openai-chatgpt-auth.json'),
      `${JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: 'id-token',
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          account_id: 'account-123',
        },
      })}\n`,
    )
    process.env.CLAUDE_CONFIG_DIR = tempDir
  })

  afterEach(() => {
    for (const key of envKeys) {
      const value = envSnapshot[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('passes unified fetch options without dropping explicit request init', async () => {
    const controller = new AbortController()
    let capturedInit: RequestInit | undefined
    const fetchOverride = mock(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve(
          new Response('data: [DONE]\n\n', { status: 200 }),
        )
      },
    ) as unknown as typeof fetch

    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: controller.signal,
      fetchOverride,
    })

    for await (const _event of stream) {
      // drain the response so reader cleanup is exercised
    }

    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.signal).toBe(controller.signal)
    expect(capturedInit?.body).toContain('gpt-5.5')
    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    })
    expect(
      String(
        (capturedInit?.headers as Record<string, string> | undefined)
          ?.Authorization ?? '',
      ),
    ).toStartWith('Bearer ')
    const bunTimeout = (capturedInit as Record<string, unknown> | undefined)
      ?.timeout
    if (bunTimeout !== undefined) {
      expect(bunTimeout).toBe(false)
    }
  })

  test('preserves HTTP status so transient responses are retryable', async () => {
    for (const status of [408, 409, 429, 500, 503]) {
      const fetchOverride = (async () =>
        new Response('temporarily unavailable', {
          status,
        })) as unknown as typeof fetch

      try {
        await createChatGPTResponsesStream({
          request: buildResponsesRequest({
            model: 'gpt-5.5',
            messages: [{ role: 'user', content: 'hello' }],
            tools: [],
            toolChoice: undefined,
          }),
          signal: new AbortController().signal,
          fetchOverride,
        })
        expect(true).toBe(false)
      } catch (error) {
        expect((error as { status?: number }).status).toBe(status)
        expect(isRetryableCompatError(error)).toBe(true)
      }
    }
  })

  test('preserves non-retryable HTTP status', async () => {
    const fetchOverride = (async () =>
      new Response('invalid request', {
        status: 400,
      })) as unknown as typeof fetch

    try {
      await createChatGPTResponsesStream({
        request: buildResponsesRequest({
          model: 'gpt-5.5',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [],
          toolChoice: undefined,
        }),
        signal: new AbortController().signal,
        fetchOverride,
      })
      expect(true).toBe(false)
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400)
      expect(isRetryableCompatError(error)).toBe(false)
    }
  })
})

describe('adaptResponsesStreamToAnthropic', () => {
  test('does not emit message_start for transport-only lifecycle events', async () => {
    const rawStream = (async function* () {
      yield { type: 'response.created', response: { status: 'in_progress' } }
      yield {
        type: 'response.in_progress',
        response: { status: 'in_progress' },
      }
      throw new TypeError('terminated')
    })()

    try {
      await startStreamEagerly(
        adaptResponsesStreamToAnthropic(rawStream, 'gpt-5.5'),
      )
      expect(true).toBe(false)
    } catch (error) {
      expect((error as Error).message).toBe('terminated')
    }
  })

  test('preserves retryable stream error codes across all Responses event shapes', async () => {
    const cases = [
      {
        event: {
          type: 'response.failed',
          response: {
            error: { code: 'server_error', message: 'backend overloaded' },
          },
        },
        code: 'server_error',
      },
      {
        event: {
          type: 'response.error',
          error: {
            code: 'rate_limit_exceeded',
            message: 'slow down',
            status: 429,
          },
        },
        code: 'rate_limit_exceeded',
        status: 429,
      },
      {
        event: {
          type: 'error',
          code: 'vector_store_timeout',
          message: 'vector store timed out',
        },
        code: 'vector_store_timeout',
      },
    ]

    for (const testCase of cases) {
      const rawStream = (async function* () {
        yield { type: 'response.created', response: { status: 'in_progress' } }
        yield testCase.event
      })()

      try {
        await startStreamEagerly(
          adaptResponsesStreamToAnthropic(rawStream, 'gpt-5.5'),
        )
        expect(true).toBe(false)
      } catch (error) {
        expect((error as { code?: string }).code).toBe(testCase.code)
        expect((error as { status?: number }).status).toBe(testCase.status)
        expect(isRetryableCompatError(error)).toBe(true)
      }
    }
  })

  test('standard invalid stream errors remain non-retryable', async () => {
    const rawStream = (async function* () {
      yield { type: 'response.created', response: { status: 'in_progress' } }
      yield {
        type: 'error',
        code: 'invalid_prompt',
        message: 'prompt is invalid',
      }
    })()

    try {
      await startStreamEagerly(
        adaptResponsesStreamToAnthropic(rawStream, 'gpt-5.5'),
      )
      expect(true).toBe(false)
    } catch (error) {
      expect((error as Error).message).toBe('prompt is invalid')
      expect((error as { code?: string }).code).toBe('invalid_prompt')
      expect(isRetryableCompatError(error)).toBe(false)
    }
  })

  test('emits a legal message for an empty completed response', async () => {
    const rawStream = (async function* () {
      yield { type: 'response.created', response: { status: 'in_progress' } }
      yield {
        type: 'response.completed',
        response: { status: 'completed' },
      }
    })()
    const output = []

    for await (const event of adaptResponsesStreamToAnthropic(
      rawStream,
      'gpt-5.5',
    )) {
      output.push(event)
    }

    expect(output.map(event => event.type)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ])
  })

  test('emits text from completed message output items when text deltas are absent', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          content: [],
        },
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '继续修复测试',
            },
          ],
        },
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 5,
            output_tokens: 3,
          },
        },
      },
    ]

    const stream = adaptResponsesStreamToAnthropic(
      (async function* () {
        for (const event of events) yield event
      })(),
      'gpt-5.5',
    )

    const output = []
    for await (const event of stream) output.push(event)

    expect(output).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: '继续修复测试' },
    })
    expect(output).toContainEqual({
      type: 'message_stop',
    })
  })
})

describe('extractUsage', () => {
  test('returns zeros for undefined response', () => {
    const usage = extractUsage(undefined)
    expect(usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })

  test('extracts usage from ChatGPT Responses API response', () => {
    const response: Record<string, unknown> = {
      usage: {
        input_tokens: 1200,
        output_tokens: 300,
        input_tokens_details: {
          cached_tokens: 640,
        },
      },
    }
    const usage = extractUsage(response)
    expect(usage).toEqual({
      input_tokens: 1200,
      output_tokens: 300,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 640,
    })
  })

  test('handles missing input_tokens_details', () => {
    const response: Record<string, unknown> = {
      usage: {
        input_tokens: 500,
        output_tokens: 100,
      },
    }
    const usage = extractUsage(response)
    expect(usage.cache_read_input_tokens).toBe(0)
    expect(usage.cache_creation_input_tokens).toBe(0)
  })

  test('handles missing usage entirely', () => {
    const response: Record<string, unknown> = { status: 'completed' }
    const usage = extractUsage(response)
    expect(usage.input_tokens).toBe(0)
    expect(usage.output_tokens).toBe(0)
  })
})
