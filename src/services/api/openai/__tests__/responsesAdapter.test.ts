import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CHATGPT_CODEX_MODEL_OPTIONS,
  clearRemoteChatGPTCodexModelOptions,
  setRemoteChatGPTCodexModelOptions,
} from '../../../../utils/model/chatgptModels.js'
import {
  isRetryableCompatError,
  startStreamEagerly,
  withCompatRetry,
} from '../../compatRetry.js'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  createChatGPTResponsesStream,
  extractUsage,
  type ChatGPTCodexTurnSession,
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

  test('forwards max reasoning effort without clamping it', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'max',
    })

    expect(request.reasoning).toEqual({
      effort: 'max',
      context: 'all_turns',
    })
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

  test('uses the model catalog default reasoning summary when supported', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'medium',
    })

    expect(request.reasoning).toEqual({
      effort: 'medium',
      summary: 'auto',
    })
  })

  test('uses the current Responses Lite contract for GPT-5.6 models', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [
        { role: 'system', content: 'Follow the repository instructions.' },
        { role: 'user', content: 'Fix the failing test.' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
        },
      ],
      toolChoice: { type: 'function', function: { name: 'read_file' } },
      reasoningEffort: 'max',
      promptCacheKey: '019f7e61-aece-7b21-bbbc-f025759f2765',
    })

    expect(request.instructions).toBeUndefined()
    expect(request.tools).toBeUndefined()
    expect(request.tool_choice).toBe('auto')
    expect(request.parallel_tool_calls).toBe(false)
    expect(request.reasoning).toEqual({
      effort: 'max',
      context: 'all_turns',
    })
    expect(request.include).toEqual(['reasoning.encrypted_content'])
    expect(request.prompt_cache_key).toBe(
      '019f7e61-aece-7b21-bbbc-f025759f2765',
    )
    expect(request.client_metadata).toEqual({
      session_id: '019f7e61-aece-7b21-bbbc-f025759f2765',
      thread_id: '019f7e61-aece-7b21-bbbc-f025759f2765',
    })
    expect(request.text).toEqual({ verbosity: 'low' })
    expect(request.input).toEqual([
      {
        type: 'additional_tools',
        role: 'developer',
        tools: [
          {
            type: 'function',
            name: 'read_file',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
            strict: false,
          },
        ],
      },
      {
        type: 'message',
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: 'Follow the repository instructions.',
          },
        ],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Fix the failing test.' }],
      },
    ])
  })

  test('omits remote image URLs from Responses Lite input', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/private-image.png' },
            },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
      tools: [],
      toolChoice: undefined,
    })

    expect(request.input.at(-1)).toEqual({
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'image content omitted because remote image URLs are not supported',
        },
        {
          type: 'input_image',
          image_url: 'data:image/png;base64,aGVsbG8=',
        },
      ],
    })
    expect(JSON.stringify(request)).not.toContain(
      'https://example.com/private-image.png',
    )
  })

  test('omits remote user and tool image URLs from full Responses input', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/user-image.png' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call-image',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/tool-image.png' },
            },
          ],
        },
      ],
      tools: [],
      toolChoice: undefined,
    })

    const serialized = JSON.stringify(request)
    expect(serialized).not.toContain('https://example.com/user-image.png')
    expect(serialized).not.toContain('https://example.com/tool-image.png')
    expect(
      serialized.match(
        /image content omitted because remote image URLs are not supported/g,
      ),
    ).toHaveLength(2)
  })

  test('replays complete encrypted reasoning items in Lite history', () => {
    const reasoningItem = {
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: 'Reasoning summary.' }],
      content: [{ type: 'reasoning_text', text: 'Reasoning content.' }],
      encrypted_content: 'encrypted-reasoning-payload',
    }
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [
        { role: 'user', content: 'Use a tool.' },
        {
          role: 'assistant',
          content: null,
          responses_reasoning_items: [reasoningItem],
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: 'done' },
      ],
      tools: [],
      toolChoice: undefined,
    })

    expect(request.input).toContainEqual(reasoningItem)
  })

  test('uses catalog defaults for full Responses models', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    })

    expect(request.tool_choice).toBe('auto')
    expect(request.parallel_tool_calls).toBe(true)
    expect(request.text).toEqual({ verbosity: 'low' })

    expect(
      buildResponsesRequest({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }).text,
    ).toEqual({ verbosity: 'medium' })
  })

  test('replaces image input for text-only Codex models with the official placeholder', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.3-codex-spark',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
      tools: [],
      toolChoice: undefined,
    })
    expect(request.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'image content omitted because you do not support image input',
          },
        ],
      },
    ])
  })

  test('preserves structured images in function-call outputs', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [
        {
          role: 'tool',
          tool_call_id: 'call_image',
          content: 'screenshot',
          responses_output_content: [
            { type: 'text', text: 'screenshot' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
      tools: [],
      toolChoice: undefined,
    })

    expect(request.input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_image',
        output: [
          { type: 'input_text', text: 'screenshot' },
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,aGVsbG8=',
          },
        ],
      },
    ])
  })

  test('uses model capabilities from the matching credential scope', () => {
    setRemoteChatGPTCodexModelOptions(
      [
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[3]!,
          value: 'scope-lite-model',
          useResponsesLite: true,
        },
      ],
      'work-account',
    )
    try {
      const scoped = buildResponsesRequest({
        model: 'scope-lite-model',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
        credentialScope: 'work-account',
      })
      const otherAccount = buildResponsesRequest({
        model: 'scope-lite-model',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
        credentialScope: 'personal-account',
      })

      expect(scoped.input[0]).toMatchObject({ type: 'additional_tools' })
      expect(scoped.parallel_tool_calls).toBe(false)
      expect(otherAccount.input[0]).toMatchObject({ type: 'message' })
      expect(otherAccount.parallel_tool_calls).toBe(false)
    } finally {
      clearRemoteChatGPTCodexModelOptions()
    }
  })
})

describe('createChatGPTResponsesStream', () => {
  const envKeys = ['CLAUDE_CONFIG_DIR'] as const
  let envSnapshot: Partial<Record<(typeof envKeys)[number], string>>
  let tempDir: string
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    envSnapshot = {
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    originalFetch = globalThis.fetch
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
    globalThis.fetch = originalFetch
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
    let capturedInput: RequestInfo | URL | undefined
    let capturedInit: RequestInit | undefined
    const fetchOverride = mock(
      (input: RequestInfo | URL, init?: RequestInit) => {
        capturedInput = input
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

    expect(String(capturedInput)).toBe(
      'https://chatgpt.com/backend-api/codex/responses',
    )
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.signal).toBe(controller.signal)
    expect(capturedInit?.body).toContain('gpt-5.5')
    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      version: expect.any(String),
    })
    expect(
      String(
        (capturedInit?.headers as Record<string, string> | undefined)
          ?.Authorization ?? '',
      ),
    ).toStartWith('Bearer ')
    expect(
      (capturedInit?.headers as Record<string, string> | undefined)?.[
        'OpenAI-Beta'
      ],
    ).toBeUndefined()
    expect(
      (capturedInit?.headers as Record<string, string> | undefined)?.[
        'x-openai-internal-codex-responses-lite'
      ],
    ).toBeUndefined()
    const bunTimeout = (capturedInit as Record<string, unknown> | undefined)
      ?.timeout
    if (bunTimeout !== undefined) {
      expect(bunTimeout).toBe(false)
    }
  })

  test('sends Responses Lite and session-correlation headers for GPT-5.6', async () => {
    let capturedHeaders: Record<string, string> | undefined
    const promptCacheKey = '019f7e61-aece-7b21-bbbc-f025759f2765'
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
        promptCacheKey,
      }),
      signal: new AbortController().signal,
      fetchOverride: (async (_input, init) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('data: [DONE]\r\n\r\n', { status: 200 })
      }) as typeof fetch,
    })

    for await (const _event of stream) {
      // drain the response so reader cleanup is exercised
    }

    expect(capturedHeaders).toMatchObject({
      'x-openai-internal-codex-responses-lite': 'true',
      'session-id': promptCacheKey,
      'thread-id': promptCacheKey,
      'x-client-request-id': promptCacheKey,
    })
    expect(capturedHeaders?.['OpenAI-Beta']).toBeUndefined()
  })

  test('captures and replays the first Codex turn-state header within one turn', async () => {
    const turnSession: ChatGPTCodexTurnSession = {}
    const requestHeaders: Headers[] = []
    let requestCount = 0
    const fetchOverride = (async (_input, init) => {
      requestHeaders.push(new Headers(init?.headers))
      requestCount += 1
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: {
          'x-codex-turn-state':
            requestCount === 1 ? 'sticky-turn-state' : 'must-not-overwrite',
        },
      })
    }) as typeof fetch
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    })

    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = await createChatGPTResponsesStream({
        request,
        signal: new AbortController().signal,
        fetchOverride,
        turnSession,
      })
      for await (const _event of stream) {
        // drain
      }
    }

    expect(requestHeaders[0]?.get('x-codex-turn-state')).toBeNull()
    expect(requestHeaders[1]?.get('x-codex-turn-state')).toBe(
      'sticky-turn-state',
    )
    expect(turnSession.turnState).toBe('sticky-turn-state')
  })

  test('replays Codex turn state when an eager stream retry opens a new request', async () => {
    const turnSession: ChatGPTCodexTurnSession = {}
    const requestHeaders: Headers[] = []
    let requestCount = 0
    const controller = new AbortController()
    const fetchOverride = (async (_input, init) => {
      requestHeaders.push(new Headers(init?.headers))
      requestCount += 1
      if (requestCount === 1) {
        return new Response(
          'data: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
          {
            status: 200,
            headers: { 'x-codex-turn-state': 'retry-turn-state' },
          },
        )
      }
      return new Response(
        'data: {"type":"response.completed","response":{"id":"resp-retry","status":"completed","end_turn":true}}\n\n',
        { status: 200 },
      )
    }) as typeof fetch
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    })
    const retriedStream = (async function* () {
      const adaptedStream = yield* withCompatRetry(
        async signal =>
          startStreamEagerly(
            adaptResponsesStreamToAnthropic(
              await createChatGPTResponsesStream({
                request,
                signal,
                fetchOverride,
                turnSession,
              }),
              'gpt-5.5',
              turnSession,
            ),
          ),
        { signal: controller.signal, provider: 'openai', maxRetries: 1 },
      )
      yield* adaptedStream
    })()

    for await (const _event of retriedStream) {
      // drain retry progress and the recovered response
    }

    expect(requestCount).toBe(2)
    expect(requestHeaders[0]?.get('x-codex-turn-state')).toBeNull()
    expect(requestHeaders[1]?.get('x-codex-turn-state')).toBe(
      'retry-turn-state',
    )
  })

  test('refreshes OAuth and replays the response request once after 401', async () => {
    const authorizations: string[] = []
    let refreshBody: Record<string, unknown> | undefined
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      refreshBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'access-token-refreshed',
            refresh_token: 'refresh-token-refreshed',
          }),
          { status: 200 },
        ),
      )
    }) as unknown as typeof globalThis.fetch
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: new AbortController().signal,
      fetchOverride: (async (_input, init) => {
        const authorization = new Headers(init?.headers).get('Authorization')
        authorizations.push(authorization ?? '')
        return authorizations.length === 1
          ? new Response('expired', { status: 401 })
          : new Response('data: [DONE]\n\n', { status: 200 })
      }) as typeof fetch,
    })

    for await (const _event of stream) {
      // drain
    }

    expect(authorizations).toEqual([
      'Bearer access-token',
      'Bearer access-token-refreshed',
    ])
    expect(refreshBody).toEqual({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
    })
  })

  test('sends the FedRAMP header derived from the ChatGPT ID token', async () => {
    const idToken = `header.${Buffer.from(
      JSON.stringify({
        'https://api.openai.com/auth': {
          chatgpt_account_id: 'account-123',
          chatgpt_account_is_fedramp: true,
        },
      }),
    ).toString('base64url')}.signature`
    writeFileSync(
      join(tempDir, 'openai-chatgpt-auth.json'),
      `${JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: idToken,
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      })}\n`,
    )
    let headers: Headers | undefined
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: new AbortController().signal,
      fetchOverride: (async (_input, init) => {
        headers = new Headers(init?.headers)
        return new Response('data: [DONE]\n\n', { status: 200 })
      }) as typeof fetch,
    })

    for await (const _event of stream) {
      // drain
    }
    expect(headers?.get('X-OpenAI-Fedramp')).toBe('true')
  })

  test('parses CRLF-delimited SSE frames and a final unterminated frame', async () => {
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: new AbortController().signal,
      fetchOverride: (async () =>
        new Response(
          'data: {"type":"response.created"}\r\n\r\ndata: {"type":"response.completed"}',
          { status: 200 },
        )) as unknown as typeof fetch,
    })
    const events = []

    for await (const event of stream) events.push(event)

    expect(events.map(event => event.type)).toEqual([
      'response.created',
      'response.completed',
    ])
  })

  test('cancels the SSE response body when the consumer stops early', async () => {
    let bodyCancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
          ),
        )
      },
      cancel() {
        bodyCancelled = true
      },
    })
    const fetchOverride = (async () =>
      new Response(body, { status: 200 })) as unknown as typeof fetch
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: new AbortController().signal,
      fetchOverride,
    })
    const iterator = stream[Symbol.asyncIterator]()

    expect((await iterator.next()).done).toBe(false)
    await iterator.return?.()

    expect(bodyCancelled).toBe(true)
  })

  test('actively cancels the open SSE body when the request signal aborts', async () => {
    const controller = new AbortController()
    let bodyCancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(
          new TextEncoder().encode(
            'data: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
          ),
        )
      },
      cancel() {
        bodyCancelled = true
      },
    })
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: controller.signal,
      fetchOverride: (async () =>
        new Response(body, { status: 200 })) as unknown as typeof fetch,
    })
    const iterator = stream[Symbol.asyncIterator]()

    expect((await iterator.next()).done).toBe(false)
    controller.abort('user-cancel')
    await Promise.resolve()

    // The iterator is paused at yield; cancellation therefore came directly
    // from the abort listener, not from consumer return/finally cleanup.
    expect(bodyCancelled).toBe(true)
    await iterator.return?.()
  })

  test('times out and cancels an idle SSE stream with a retryable error', async () => {
    let bodyCancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        bodyCancelled = true
      },
    })
    const stream = await createChatGPTResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
      }),
      signal: new AbortController().signal,
      fetchOverride: (async () =>
        new Response(body, { status: 200 })) as unknown as typeof fetch,
      streamIdleTimeoutMs: 10,
    })

    try {
      await stream[Symbol.asyncIterator]().next()
      expect(true).toBe(false)
    } catch (error) {
      expect((error as Error).message).toContain('stream idle timeout')
      expect(isRetryableCompatError(error)).toBe(true)
    }
    expect(bodyCancelled).toBe(true)
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

  test('preserves HTTP Retry-After for the retry scheduler', async () => {
    const fetchOverride = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'rate_limit_exceeded',
            message: 'Please try again in 2s.',
          },
        }),
        {
          status: 429,
          headers: { 'Retry-After': '12' },
        },
      )) as unknown as typeof fetch

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
      expect((error as { retryAfterMs?: number }).retryAfterMs).toBe(12_000)
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
  test('records response.completed end_turn for query continuation', async () => {
    const turnSession: ChatGPTCodexTurnSession = {}
    const rawStream = (async function* () {
      yield {
        type: 'response.completed',
        response: { id: 'resp-continue', status: 'completed', end_turn: false },
      }
    })()

    for await (const _event of adaptResponsesStreamToAnthropic(
      rawStream,
      'gpt-5.6-sol',
      turnSession,
    )) {
      // drain
    }

    expect(turnSession.lastResponseEndTurn).toBe(false)
  })

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
      {
        event: {
          type: 'response.failed',
          response: {
            error: {
              type: 'internal_server_error',
              message: 'backend failed internally',
            },
          },
        },
        code: 'internal_server_error',
      },
      {
        event: {
          type: 'error',
          message:
            'An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists. Please include the request ID ae1a5e80-c5c4-492d-995e-09d06dc196bd in your message.',
        },
        code: 'server_error',
        requestId: 'ae1a5e80-c5c4-492d-995e-09d06dc196bd',
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
        expect((error as { requestId?: string }).requestId).toBe(
          testCase.requestId,
        )
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

  test('uses official fatal allowlist and retries unknown response.failed codes', async () => {
    const cases = [
      ['context_length_exceeded', false],
      ['insufficient_quota', false],
      ['usage_not_included', false],
      ['cyber_policy', false],
      ['invalid_prompt', false],
      ['bio_policy', false],
      ['server_is_overloaded', false],
      ['slow_down', false],
      ['future_transient_backend_error', true],
    ] as const

    for (const [code, retryable] of cases) {
      const rawStream = (async function* () {
        yield {
          type: 'response.failed',
          response: { error: { code, message: `failed: ${code}` } },
        }
      })()
      try {
        for await (const _event of adaptResponsesStreamToAnthropic(
          rawStream,
          'gpt-5.5',
        )) {
          // drain until response.failed is classified
        }
        expect(true).toBe(false)
      } catch (error) {
        expect(isRetryableCompatError(error)).toBe(retryable)
      }
    }
  })

  test('parses official rate-limit retry delay units from response.failed', async () => {
    for (const [delayText, expectedMs] of [
      ['11.054s', 11_054],
      ['28ms', 28],
      ['2 seconds', 2_000],
    ] as const) {
      const rawStream = (async function* () {
        yield {
          type: 'response.failed',
          response: {
            error: {
              code: 'rate_limit_exceeded',
              message: `Please try again in ${delayText}.`,
            },
          },
        }
      })()
      try {
        for await (const _event of adaptResponsesStreamToAnthropic(
          rawStream,
          'gpt-5.5',
        )) {
          // drain until response.failed is parsed
        }
        expect(true).toBe(false)
      } catch (error) {
        expect((error as { retryAfterMs?: number }).retryAfterMs).toBe(
          expectedMs,
        )
      }
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

  test('uses a done-only function call as authoritative and stops for tool use', async () => {
    const events = [
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_done',
          name: 'shell',
          arguments: '{"command":"pwd"}',
        },
      },
      {
        type: 'response.completed',
        response: { status: 'completed' },
      },
    ]
    const output = []
    for await (const event of adaptResponsesStreamToAnthropic(
      (async function* () {
        for (const event of events) yield event
      })(),
      'gpt-5.5',
    )) {
      output.push(event)
    }

    expect(output).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'call_done',
        name: 'shell',
        input: {},
      },
    })
    expect(output).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"command":"pwd"}',
      },
    })
    expect(output).toContainEqual({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as any)
  })

  test('retries rather than dropping a function call without output_item.done', async () => {
    async function* rawStream() {
      yield {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_incomplete',
          name: 'write_file',
          arguments: '',
        },
      }
      yield {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta: '{"path":"unfinished',
      }
      yield {
        type: 'response.completed',
        response: { id: 'resp_incomplete_tool', status: 'completed' },
      }
    }

    const events: Array<Record<string, unknown>> = []
    try {
      for await (const event of adaptResponsesStreamToAnthropic(
        rawStream(),
        'gpt-5.5',
      )) {
        events.push(event as unknown as Record<string, unknown>)
      }
      expect(true).toBe(false)
    } catch (error) {
      expect((error as Error).message).toContain(
        'completed before finalizing a function call',
      )
      expect(isRetryableCompatError(error)).toBe(true)
    }
    expect(events).toHaveLength(0)
  })

  test('rejects conflicting streamed and authoritative function-call arguments', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_conflict',
          name: 'shell',
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta: '{"command":"pwd"}',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_conflict',
          name: 'shell',
          arguments: '{"command":"whoami"}',
        },
      },
    ]

    try {
      for await (const _event of adaptResponsesStreamToAnthropic(
        (async function* () {
          for (const event of events) yield event
        })(),
        'gpt-5.5',
      )) {
        // consume until the authoritative done item detects the conflict
      }
      expect(true).toBe(false)
    } catch (error) {
      expect((error as { code?: string }).code).toBe('server_error')
      expect((error as Error).message).toContain(
        'conflicting final function-call arguments',
      )
    }
  })

  test('rejects incomplete authoritative function calls without publishing tools', async () => {
    for (const missing of ['call_id', 'name', 'arguments'] as const) {
      const item: Record<string, unknown> = {
        type: 'function_call',
        call_id: 'call-complete',
        name: 'shell',
        arguments: '{}',
      }
      delete item[missing]
      const published: Array<Record<string, unknown>> = []
      try {
        for await (const event of adaptResponsesStreamToAnthropic(
          (async function* () {
            yield {
              type: 'response.output_item.done',
              output_index: 0,
              item,
            }
          })(),
          'gpt-5.5',
        )) {
          published.push(event as unknown as Record<string, unknown>)
        }
        expect(true).toBe(false)
      } catch (error) {
        expect((error as Error).message).toContain(
          'incomplete final function call',
        )
        expect(isRetryableCompatError(error)).toBe(true)
      }
      expect(published).toHaveLength(0)
    }
  })

  test('preserves encrypted reasoning for the next Responses turn', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'reasoning', summary: [], encrypted_content: null },
      },
      {
        type: 'response.reasoning_summary_text.delta',
        output_index: 0,
        delta: 'Checking the repository.',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Checking the repository.' }],
          content: [
            { type: 'reasoning_text', text: 'Internal reasoning content.' },
          ],
          encrypted_content: 'encrypted-reasoning-payload',
        },
      },
      {
        type: 'response.completed',
        response: { status: 'completed' },
      },
    ]
    const output = []

    for await (const event of adaptResponsesStreamToAnthropic(
      (async function* () {
        for (const event of events) yield event
      })(),
      'gpt-5.6-sol',
    )) {
      output.push(event)
    }

    expect(output).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'signature_delta',
        signature: 'encrypted-reasoning-payload',
      },
    })
    const thinkingStart = output.find(
      event =>
        event.type === 'content_block_start' &&
        event.content_block.type === 'thinking',
    ) as unknown as { content_block: Record<string, unknown> }
    expect(thinkingStart.content_block.responses_reasoning_item).toEqual({
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: 'Checking the repository.' }],
      content: [
        { type: 'reasoning_text', text: 'Internal reasoning content.' },
      ],
      encrypted_content: 'encrypted-reasoning-payload',
    })
  })

  test('accepts done-only and multipart reasoning summary events', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'reasoning', summary: [], encrypted_content: null },
      },
      {
        type: 'response.reasoning_summary_text.done',
        output_index: 0,
        summary_index: 0,
        text: 'First summary.',
      },
      {
        type: 'response.reasoning_summary_part.added',
        output_index: 0,
        summary_index: 1,
      },
      {
        type: 'response.reasoning_summary_text.delta',
        output_index: 0,
        summary_index: 1,
        delta: 'Second summary.',
      },
      {
        type: 'response.reasoning_summary_text.done',
        output_index: 0,
        summary_index: 1,
        text: 'Second summary.',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'reasoning',
          summary: [],
          encrypted_content: 'encrypted-summary',
        },
      },
      { type: 'response.completed', response: { status: 'completed' } },
    ]
    const output = []
    for await (const event of adaptResponsesStreamToAnthropic(
      (async function* () {
        for (const event of events) yield event
      })(),
      'gpt-5.5',
    )) {
      output.push(event)
    }

    expect(output).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'thinking_delta',
        thinking: 'First summary.\n\nSecond summary.',
      },
    })
  })

  test('keeps reasoning-only failures inside the eager retry boundary', async () => {
    const rawStream = (async function* () {
      yield {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'reasoning', summary: [], encrypted_content: null },
      }
      yield {
        type: 'response.reasoning_summary_text.delta',
        output_index: 0,
        delta: 'Still reasoning.',
      }
      yield {
        type: 'response.failed',
        response: {
          error: {
            type: 'internal_server_error',
            message: 'backend failed internally',
          },
        },
      }
    })()

    try {
      await startStreamEagerly(
        adaptResponsesStreamToAnthropic(rawStream, 'gpt-5.6-sol'),
      )
      expect(true).toBe(false)
    } catch (error) {
      expect((error as { code?: string }).code).toBe('internal_server_error')
      expect(isRetryableCompatError(error)).toBe(true)
    }
  })

  test('ends immediately after a completed terminal event', async () => {
    const rawStream = (async function* () {
      yield {
        type: 'response.completed',
        response: { id: 'resp-complete', status: 'completed' },
      }
      yield {
        type: 'error',
        code: 'server_error',
        message: 'late frame must be ignored',
      }
    })()
    const output = []

    for await (const event of adaptResponsesStreamToAnthropic(
      rawStream,
      'gpt-5.6-sol',
    )) {
      output.push(event)
    }

    expect(output.map(event => event.type)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ])
  })

  test('rejects non-token incomplete responses instead of misreporting max tokens', async () => {
    const rawStream = (async function* () {
      yield {
        type: 'response.incomplete',
        response: {
          id: 'resp-filtered',
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
        },
      }
    })()

    try {
      for await (const _event of adaptResponsesStreamToAnthropic(
        rawStream,
        'gpt-5.6-sol',
      )) {
        // consume until the adapter throws
      }
      expect(true).toBe(false)
    } catch (error) {
      expect((error as { code?: string }).code).toBe('content_filter')
      expect((error as { responseId?: string }).responseId).toBe(
        'resp-filtered',
      )
      expect(isRetryableCompatError(error)).toBe(true)
    }
  })

  test('rejects token-limit incomplete responses instead of accepting truncated output', async () => {
    const rawStream = (async function* () {
      yield {
        type: 'response.incomplete',
        response: {
          id: 'resp-truncated',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        },
      }
    })()

    try {
      for await (const _event of adaptResponsesStreamToAnthropic(
        rawStream,
        'gpt-5.6-sol',
      )) {
        // consume until the adapter rejects the incomplete response
      }
      expect(true).toBe(false)
    } catch (error) {
      expect((error as { code?: string }).code).toBe('max_output_tokens')
      expect((error as { responseId?: string }).responseId).toBe(
        'resp-truncated',
      )
    }
  })

  test('rejects a clean EOF that arrives before a terminal Responses event', async () => {
    const rawStream = (async function* () {
      yield { type: 'response.created', response: { status: 'in_progress' } }
    })()

    try {
      for await (const _event of adaptResponsesStreamToAnthropic(
        rawStream,
        'gpt-5.6-sol',
      )) {
        // consume until the adapter validates the terminal event
      }
      expect(true).toBe(false)
    } catch (error) {
      expect((error as Error).message).toContain('terminal event')
      expect(isRetryableCompatError(error)).toBe(true)
    }
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
          cache_write_tokens: 80,
        },
      },
    }
    const usage = extractUsage(response)
    expect(usage).toEqual({
      input_tokens: 480,
      output_tokens: 300,
      cache_creation_input_tokens: 80,
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
