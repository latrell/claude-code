import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sideQuery } from '../sideQuery.js'

type EnvKey =
  | 'CLAUDE_CODE_USE_OPENAI'
  | 'OPENAI_AUTH_MODE'
  | 'OPENAI_API_KEY'
  | 'OPENAI_BASE_URL'
  | 'CLAUDE_CONFIG_DIR'

type EnvSnapshot = Partial<Record<EnvKey, string>>

describe('sideQuery ChatGPT auth', () => {
  let originalFetch: typeof globalThis.fetch
  let tempDir: string
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    originalFetch = globalThis.fetch
    envSnapshot = {
      CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
      OPENAI_AUTH_MODE: process.env.OPENAI_AUTH_MODE,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    tempDir = join(
      tmpdir(),
      `side-query-chatgpt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    process.env.CLAUDE_CONFIG_DIR = tempDir
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(envSnapshot) as EnvKey[]) {
      const value = envSnapshot[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('passes unified fetch options for Gemini side queries', async () => {
    const controller = new AbortController()
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      capturedInit = init
      return Promise.resolve(
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: 'hello from gemini' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 3,
          },
          id: 'gemini-response-id',
        }),
      )
    }) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Hi' }],
      querySource: 'auto_mode',
      signal: controller.signal,
      providerRuntimeConfig: {
        provider: 'gemini',
        env: {
          GEMINI_API_KEY: 'gemini-key',
          GEMINI_MODEL: 'gemini-test-model',
        },
      },
    })

    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
    )
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.signal).toBe(controller.signal)
    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'gemini-key',
    })
    expect(capturedInit?.body).toContain('maxOutputTokens')
    const bunTimeout = (capturedInit as Record<string, unknown> | undefined)
      ?.timeout
    if (bunTimeout !== undefined) {
      expect(bunTimeout).toBe(false)
    }
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'hello from gemini',
    })
  })

  test('Gemini side query errors include status and response body', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response('rate limit exceeded', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      ),
    ) as unknown as typeof globalThis.fetch

    await expect(
      sideQuery({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'Hi' }],
        querySource: 'auto_mode',
        providerRuntimeConfig: {
          provider: 'gemini',
          env: {
            GEMINI_API_KEY: 'gemini-key',
            GEMINI_MODEL: 'gemini-test-model',
          },
        },
      }),
    ).rejects.toThrow(
      'Gemini API request failed (429 Too Many Requests): rate limit exceeded',
    )
  })

  test('uses ChatGPT Responses backend and returns tool_use content', async () => {
    let capturedUrl = ''
    let capturedAuth = ''
    let capturedBody: Record<string, unknown> | undefined
    const sse = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_classifier',
          name: 'classify_yolo_action',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta:
          '{"thinking":"safe print command","shouldBlock":false,"reason":"prints a constant"}',
      },
      { type: 'response.output_item.done', output_index: 0 },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            input_tokens_details: { cached_tokens: 3 },
          },
        },
      },
    ]
      .map(event => `data: ${JSON.stringify(event)}\n\n`)
      .join('')

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      capturedAuth = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ??
          '',
      )
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<
        string,
        unknown
      >
      return Promise.resolve(new Response(sse, { status: 200 }))
    }) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'gpt-5.5',
      system: 'classify the action',
      messages: [{ role: 'user', content: 'Bash python3 -c "print(123)"' }],
      tools: [
        {
          type: 'custom',
          name: 'classify_yolo_action',
          description: 'Classify action safety',
          input_schema: {
            type: 'object',
            properties: {
              thinking: { type: 'string' },
              shouldBlock: { type: 'boolean' },
              reason: { type: 'string' },
            },
            required: ['thinking', 'shouldBlock', 'reason'],
          },
        },
      ] as any,
      tool_choice: { type: 'tool', name: 'classify_yolo_action' },
      querySource: 'auto_mode',
    })

    expect(capturedUrl).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(capturedAuth).toBe('Bearer access-token')
    expect(capturedBody?.model).toBe('gpt-5.5')
    expect(capturedBody?.tools).toBeArrayOfSize(1)
    expect(capturedBody?.tool_choice).toEqual({
      type: 'function',
      name: 'classify_yolo_action',
    })
    expect(result.model).toBe('gpt-5.5')
    expect(result.usage.input_tokens).toBe(11)
    expect(result.usage.output_tokens).toBe(7)
    expect(result.usage.cache_read_input_tokens).toBe(3)
    expect(result.content).toBeArrayOfSize(1)
    const block = result.content[0] as {
      type: string
      name: string
      input: Record<string, unknown>
    }
    expect(block.type).toBe('tool_use')
    expect(block.name).toBe('classify_yolo_action')
    expect(block.input).toEqual({
      thinking: 'safe print command',
      shouldBlock: false,
      reason: 'prints a constant',
    })
  })
})
