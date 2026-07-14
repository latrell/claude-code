import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sideQuery } from '../sideQuery.js'
import { decodeMessage } from '../../services/api/cursor/protobufDecoder.js'
import { encodeField } from '../../services/api/cursor/protobufEncoder.js'
import { FIELD, WIRE_TYPE } from '../../services/api/cursor/protobufSchema.js'

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

  test('Gemini side queries preserve forced schema tools', async () => {
    let capturedBody: Record<string, unknown> | undefined
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<
        string,
        unknown
      >
      return Promise.resolve(
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'select_relevant_memories',
                      args: { selected_memories: ['project.md'] },
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      )
    }) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'gemini-test-model',
      messages: [{ role: 'user', content: 'Pick a memory' }],
      tools: [
        {
          type: 'custom',
          name: 'select_relevant_memories',
          description: 'Select memories',
          input_schema: {
            type: 'object',
            properties: {
              selected_memories: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['selected_memories'],
          },
        },
      ] as any,
      tool_choice: { type: 'tool', name: 'select_relevant_memories' },
      querySource: 'memdir_relevance',
      providerRuntimeConfig: {
        provider: 'gemini',
        env: {
          GEMINI_API_KEY: 'gemini-key',
          GEMINI_MODEL: 'gemini-test-model',
        },
      },
    })

    expect(capturedBody?.toolConfig).toEqual({
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['select_relevant_memories'],
      },
    })
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'select_relevant_memories',
      input: { selected_memories: ['project.md'] },
    })
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

  test('retries a retryable Responses stream error before semantic output', async () => {
    const toSSE = (events: Record<string, unknown>[]) =>
      events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    const failed = toSSE([
      { type: 'response.created', response: { status: 'in_progress' } },
      {
        type: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'server_error', message: 'backend overloaded' },
        },
      },
    ])
    const recovered = toSSE([
      { type: 'response.created', response: { status: 'in_progress' } },
      { type: 'response.output_text.delta', delta: 'recovered' },
      {
        type: 'response.completed',
        response: { status: 'completed', usage: {} },
      },
    ])
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      return Promise.resolve(
        new Response(callCount === 1 ? failed : recovered, { status: 200 }),
      )
    }) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      maxRetries: 1,
      querySource: 'model_validation',
    })

    expect(callCount).toBe(2)
    const textBlock = result.content.find(block => block.type === 'text')
    expect(textBlock).toMatchObject({ type: 'text', text: 'recovered' })
  })
})

describe('sideQuery OpenAI-compatible thinking control', () => {
  let originalFetch: typeof globalThis.fetch
  let capturedBody: Record<string, unknown> | undefined

  const CHAT_COMPLETION_RESPONSE = {
    id: 'chatcmpl-1',
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'classify_yolo_action',
                arguments: '{"shouldBlock":false}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    capturedBody = undefined
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<
        string,
        unknown
      >
      return Promise.resolve(Response.json(CHAT_COMPLETION_RESPONSE))
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const CLASSIFIER_TOOL = {
    type: 'custom',
    name: 'classify_yolo_action',
    description: 'Classify action safety',
    input_schema: {
      type: 'object',
      properties: { shouldBlock: { type: 'boolean' } },
      required: ['shouldBlock'],
    },
  }

  const runtimeFor = (model: string) => ({
    provider: 'openai' as const,
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://api.example.test/v1',
      OPENAI_MODEL: model,
    },
  })

  const classifierQuery = (
    model: string,
    thinking?: false,
    runtimeOverrides: {
      thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'
      thinkingEffortTransport?: 'compatible' | 'passthrough'
    } = {},
  ) =>
    sideQuery({
      model,
      system: 'classify the action',
      messages: [{ role: 'user', content: 'Bash ls -la' }],
      tools: [CLASSIFIER_TOOL] as any,
      tool_choice: { type: 'tool', name: 'classify_yolo_action' },
      ...(thinking === false && { thinking }),
      querySource: 'auto_mode',
      providerRuntimeConfig: { ...runtimeFor(model), ...runtimeOverrides },
    })

  test('thinking:false sends all three disable formats for DeepSeek models', async () => {
    // DeepSeek v4 endpoints default to thinking mode server-side, and
    // thinking mode rejects forced tool_choice with a 400 — the explicit
    // disable keeps the auto-mode classifier's named tool_choice working.
    await classifierQuery('deepseek-v4-flash', false)

    expect(capturedBody?.thinking).toEqual({ type: 'disabled' })
    expect(capturedBody?.enable_thinking).toBe(false)
    expect(capturedBody?.chat_template_kwargs).toEqual({
      thinking: false,
      enable_thinking: false,
    })
    // The forced tool_choice must be preserved
    expect(capturedBody?.tool_choice).toEqual({
      type: 'function',
      function: { name: 'classify_yolo_action' },
    })
  })

  test('thinking:false sends no thinking fields for non-thinking-family models', async () => {
    await classifierQuery('gpt-4o-mini', false)

    expect(capturedBody).toBeDefined()
    expect(Object.keys(capturedBody!)).not.toContain('thinking')
    expect(Object.keys(capturedBody!)).not.toContain('enable_thinking')
    expect(Object.keys(capturedBody!)).not.toContain('chat_template_kwargs')
  })

  test('omitted thinking sends no thinking fields even for DeepSeek models', async () => {
    await classifierQuery('deepseek-v4-flash')

    expect(capturedBody).toBeDefined()
    expect(Object.keys(capturedBody!)).not.toContain('thinking')
    expect(Object.keys(capturedBody!)).not.toContain('enable_thinking')
    expect(Object.keys(capturedBody!)).not.toContain('chat_template_kwargs')
  })

  test('compatible max sends reasoning_effort=high', async () => {
    await classifierQuery('deepseek-v4-flash', undefined, {
      thinkingEffort: 'max',
      thinkingEffortTransport: 'compatible',
    })

    expect(capturedBody?.reasoning_effort).toBe('high')
  })

  test('passthrough max sends reasoning_effort=max', async () => {
    await classifierQuery('deepseek-v4-flash', undefined, {
      thinkingEffort: 'max',
      thinkingEffortTransport: 'passthrough',
    })

    expect(capturedBody?.reasoning_effort).toBe('max')
  })
})

describe('sideQuery Cursor routing', () => {
  let originalFetch: typeof globalThis.fetch

  function cursorTextResponse(text: string): ArrayBuffer {
    const responseInner = encodeField(
      FIELD.ChatResponse.TEXT,
      WIRE_TYPE.LEN,
      text,
    )
    const payload = encodeField(
      FIELD.Response.RESPONSE,
      WIRE_TYPE.LEN,
      responseInner,
    )
    const header = Buffer.alloc(5)
    header.writeUInt32BE(payload.length, 1)
    const body = Buffer.concat([header, Buffer.from(payload)])
    return body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('uses the Cursor ConnectRPC path and thinking:false overrides env effort', async () => {
    const responseBody = cursorTextResponse('hello from cursor')
    let capturedUrl = ''
    let capturedThinkingLevel: number | undefined
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      const requestFrame = Buffer.from(init?.body as Uint8Array)
      const top = decodeMessage(requestFrame.subarray(5))
      const request = top.get(FIELD.Request.REQUEST)?.[0]?.value as Uint8Array
      const chat = decodeMessage(request)
      capturedThinkingLevel = chat.get(FIELD.Chat.THINKING_LEVEL)?.[0]?.value as
        | number
        | undefined
      return Promise.resolve(new Response(responseBody))
    }) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'Hi' }],
      querySource: 'memdir_relevance',
      thinking: false,
      providerRuntimeConfig: {
        provider: 'cursor',
        thinkingEffort: 'high',
        env: {
          CURSOR_API_KEY: 'cursor-token',
          CURSOR_MACHINE_ID: 'cursor-machine',
          CURSOR_BASE_URL: 'https://cursor.example.test',
          CURSOR_HTTP2: '0',
          CURSOR_REASONING_EFFORT: 'high',
        },
      },
    })

    expect(capturedUrl).toBe(
      'https://cursor.example.test/aiserver.v1.ChatService/StreamUnifiedChatWithTools',
    )
    expect(capturedThinkingLevel).toBe(0)
    expect(result.model).toBe('claude-4.5-sonnet')
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'hello from cursor',
    })
  })

  test('synthesizes a forced tool_use from one strict JSON text object', async () => {
    const responseBody = cursorTextResponse(
      '{"riskLevel":"high","explanation":"Deletes files"}',
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(responseBody)),
    ) as unknown as typeof globalThis.fetch

    const result = await sideQuery({
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'Explain this command' }],
      tools: [
        {
          type: 'custom',
          name: 'explain_command',
          description: 'Explain a command',
          input_schema: {
            type: 'object',
            properties: {
              riskLevel: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['riskLevel', 'explanation'],
          },
        },
      ] as any,
      tool_choice: { type: 'tool', name: 'explain_command' },
      querySource: 'permission_explainer',
      providerRuntimeConfig: {
        provider: 'cursor',
        env: {
          CURSOR_API_KEY: 'cursor-token',
          CURSOR_MACHINE_ID: 'cursor-machine',
          CURSOR_BASE_URL: 'https://cursor.example.test',
          CURSOR_HTTP2: '0',
        },
      },
    })

    expect(result.stop_reason).toBe('tool_use')
    expect(result.content).toContainEqual(
      expect.objectContaining({
        type: 'tool_use',
        name: 'explain_command',
        input: {
          riskLevel: 'high',
          explanation: 'Deletes files',
        },
      }),
    )
  })
})
