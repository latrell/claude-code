import { describe, expect, mock, test } from 'bun:test'
import { setChatGPTSubscriptionPlan } from '../../../bootstrap/state.js'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const { fetchRemoteModelsForConnection, getStaticModelsForConnection } =
  await import('../modelCatalog.js')
import type { Connection } from '../types.js'

const CHATGPT_CODEX_MODELS = [
  ['gpt-5.6-sol', '372K'],
  ['gpt-5.6-terra', '372K'],
  ['gpt-5.6-luna', '372K'],
  ['gpt-5.5', '272K'],
  ['gpt-5.4', '272K'],
  ['gpt-5.4-mini', '272K'],
  ['gpt-5.3-codex-spark', '128K'],
] as const

describe('getStaticModelsForConnection', () => {
  test('anthropic kinds expose default + alias entries', () => {
    const conn: Connection = {
      id: 'acc',
      label: 'Acc',
      kind: 'anthropic-oauth',
      credentialRef: 'u1',
    }
    const models = getStaticModelsForConnection(conn)
    expect(models[0]?.value).toBeNull()
    expect(models.map(m => m.value)).toEqual(
      expect.arrayContaining([null, 'opus', 'sonnet', 'haiku']),
    )
  })

  test('chatgpt-oauth exposes the current Codex roster with context windows', () => {
    const conn: Connection = {
      id: 'gpt',
      label: 'ChatGPT',
      kind: 'chatgpt-oauth',
      credentialRef: 'default',
    }
    setChatGPTSubscriptionPlan('pro')
    try {
      const models = getStaticModelsForConnection(conn)
      expect(models[0]?.value).toBeNull()
      expect(models.map(m => m.value)).toEqual([
        null,
        ...CHATGPT_CODEX_MODELS.map(([model]) => model),
      ])

      for (const [model, contextWindow] of CHATGPT_CODEX_MODELS) {
        const entry = models.find(candidate => candidate.value === model)
        expect(entry).toBeDefined()
        expect(entry?.description).toContain(`ctx ${contextWindow}`)
      }
    } finally {
      setChatGPTSubscriptionPlan(null)
    }
  })

  test('chatgpt-oauth filters gated models and applies plan windows', () => {
    const conn: Connection = {
      id: 'gpt-plus',
      label: 'ChatGPT Plus',
      kind: 'chatgpt-oauth',
      credentialRef: 'default',
    }
    setChatGPTSubscriptionPlan('plus')
    try {
      const models = getStaticModelsForConnection(conn)
      expect(models.some(model => model.value === 'gpt-5.3-codex-spark')).toBe(
        false,
      )
      expect(
        models.find(model => model.value === 'gpt-5.6-sol')?.description,
      ).toContain('ctx 256K')
    } finally {
      setChatGPTSubscriptionPlan(null)
    }
  })

  test('cursor exposes the curated default + model list', () => {
    const conn: Connection = {
      id: 'cur',
      label: 'Cursor',
      kind: 'cursor',
    }
    const models = getStaticModelsForConnection(conn)
    expect(models[0]?.value).toBeNull()
    expect(models.map(m => m.value)).toEqual(
      expect.arrayContaining([
        'default',
        'composer-2.5',
        'claude-4.5-sonnet',
        'gpt-5.5-medium',
      ]),
    )
  })

  test('preset connections expose the preset catalog with pricing details', () => {
    const conn: Connection = {
      id: 'ds',
      label: 'DeepSeek',
      kind: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk',
      presetId: 'deepseek',
    }
    const models = getStaticModelsForConnection(conn)
    const pro = models.find(m => m.value === 'deepseek-v4-pro')
    expect(pro).toBeDefined()
    expect(pro?.label).toBe('DeepSeek V4 Pro')
    expect(pro?.description).toContain('1M')
  })

  test('merges explicit model list and tier values without duplicates', () => {
    const conn: Connection = {
      id: 'custom',
      label: 'Custom',
      kind: 'openai-compat',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk',
      models: ['model-a', 'model-b'],
      tierModels: { sonnet: 'model-a', haiku: 'model-c' },
    }
    const models = getStaticModelsForConnection(conn)
    const values = models.map(m => m.value)
    expect(values).toEqual([null, 'model-a', 'model-b', 'model-c'])
    // Tier annotation only on the tier-sourced entry
    expect(models.find(m => m.value === 'model-c')?.description).toContain(
      'haiku',
    )
  })

  test('annotates entries with recorded context windows', () => {
    const conn: Connection = {
      id: 'custom',
      label: 'Custom',
      kind: 'openai-compat',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk',
      models: ['model-a', 'model-b'],
      modelContextWindows: {
        'model-a': { tokens: 1_000_000, source: 'auto' },
      },
    }
    const models = getStaticModelsForConnection(conn)
    expect(models.find(m => m.value === 'model-a')?.description).toContain(
      'ctx 1M',
    )
    expect(models.find(m => m.value === 'model-b')?.description).toBeUndefined()
  })

  test('recorded window supersedes the preset context string', () => {
    const conn: Connection = {
      id: 'ds',
      label: 'DeepSeek',
      kind: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk',
      presetId: 'deepseek',
      modelContextWindows: {
        'deepseek-v4-pro': { tokens: 131_072, source: 'manual' },
      },
    }
    const models = getStaticModelsForConnection(conn)
    const pro = models.find(m => m.value === 'deepseek-v4-pro')
    expect(pro?.description).toContain('ctx 131K')
  })
})

describe('fetchRemoteModelsForConnection', () => {
  const baseConn: Connection = {
    id: 'remote',
    label: 'Remote',
    kind: 'openai-compat',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-r',
  }

  test('fetches and sorts model ids from an OpenAI-compatible endpoint', async () => {
    const calls: Array<{ url: string; auth: string | undefined }> = []
    const fetchOverride = (async (
      url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push({
        url: String(url),
        auth: (init?.headers as Record<string, string>)?.['Authorization'],
      })
      return new Response(
        JSON.stringify({
          data: [{ id: 'z-model' }, { id: 'a-model' }, { notId: true }],
        }),
        { status: 200 },
      )
    }) as typeof fetch

    const models = await fetchRemoteModelsForConnection(baseConn, {
      fetchOverride,
    })
    expect(models).toEqual([{ id: 'a-model' }, { id: 'z-model' }])
    expect(calls[0]?.url).toBe('https://api.example.com/v1/models')
    expect(calls[0]?.auth).toBe('Bearer sk-r')
  })

  test('extracts context window fields across ecosystem variants', async () => {
    const fetchOverride = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'openrouter-style', context_length: 1_048_576 },
            { id: 'vllm-style', max_model_len: 131072 },
            { id: 'lmstudio-style', max_context_length: 200_000 },
            { id: 'gateway-style', context_window: 256_000 },
            { id: 'gateway-input', max_input_tokens: 400_000 },
            { id: 'no-context' },
            { id: 'bogus-small', context_length: 42 },
            { id: 'bogus-string', context_length: '128000' },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const models = await fetchRemoteModelsForConnection(baseConn, {
      fetchOverride,
    })
    const byId = new Map(models.map(m => [m.id, m.contextLength]))
    expect(byId.get('openrouter-style')).toBe(1_048_576)
    expect(byId.get('vllm-style')).toBe(131_072)
    expect(byId.get('lmstudio-style')).toBe(200_000)
    expect(byId.get('gateway-style')).toBe(256_000)
    expect(byId.get('gateway-input')).toBe(400_000)
    expect(byId.get('no-context')).toBeUndefined()
    // Values that are implausibly small or not numbers are ignored
    expect(byId.get('bogus-small')).toBeUndefined()
    expect(byId.get('bogus-string')).toBeUndefined()
  })

  test('returns [] on HTTP errors', async () => {
    const fetchOverride = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch
    const models = await fetchRemoteModelsForConnection(baseConn, {
      fetchOverride,
    })
    expect(models).toEqual([])
  })

  test('returns [] on network failure', async () => {
    const fetchOverride = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const models = await fetchRemoteModelsForConnection(baseConn, {
      fetchOverride,
    })
    expect(models).toEqual([])
  })

  test('skips kinds without a model list endpoint', async () => {
    const conn: Connection = {
      id: 'acc',
      label: 'Acc',
      kind: 'anthropic-oauth',
      credentialRef: 'u1',
    }
    expect(await fetchRemoteModelsForConnection(conn)).toEqual([])
  })

  test('grok falls back to the default x.ai base url', async () => {
    const calls: string[] = []
    const fetchOverride = (async (url: RequestInfo | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ data: [{ id: 'grok-4' }] }), {
        status: 200,
      })
    }) as typeof fetch
    const conn: Connection = {
      id: 'grok',
      label: 'Grok',
      kind: 'grok',
      apiKey: 'xai-key',
    }
    const models = await fetchRemoteModelsForConnection(conn, { fetchOverride })
    expect(models).toEqual([{ id: 'grok-4' }])
    expect(calls[0]).toBe('https://api.x.ai/v1/models')
  })

  test('gemini uses ListModels with inputTokenLimit and method filtering', async () => {
    const calls: Array<{ url: string; key: string | undefined }> = []
    const fetchOverride = (async (
      url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push({
        url: String(url),
        key: (init?.headers as Record<string, string>)?.['x-goog-api-key'],
      })
      return new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.5-pro',
              inputTokenLimit: 1_048_576,
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            {
              name: 'models/gemini-2.5-flash',
              inputTokenLimit: 1_048_576,
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/text-embedding-004',
              inputTokenLimit: 2_048,
              supportedGenerationMethods: ['embedContent'],
            },
            { notName: true },
          ],
        }),
        { status: 200 },
      )
    }) as typeof fetch

    const conn: Connection = {
      id: 'gem',
      label: 'Gemini',
      kind: 'gemini',
      apiKey: 'g-key',
    }
    const models = await fetchRemoteModelsForConnection(conn, {
      fetchOverride,
    })
    expect(models).toEqual([
      { id: 'gemini-2.5-flash', contextLength: 1_048_576 },
      { id: 'gemini-2.5-pro', contextLength: 1_048_576 },
    ])
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    )
    expect(calls[0]?.key).toBe('g-key')
  })

  test('gemini respects a custom base url', async () => {
    const calls: string[] = []
    const fetchOverride = (async (url: RequestInfo | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ models: [] }), { status: 200 })
    }) as typeof fetch
    const conn: Connection = {
      id: 'gem-proxy',
      label: 'Gemini Proxy',
      kind: 'gemini',
      baseUrl: 'https://proxy.example.com/v1beta/',
      apiKey: 'g-key',
    }
    await fetchRemoteModelsForConnection(conn, { fetchOverride })
    expect(calls[0]).toBe(
      'https://proxy.example.com/v1beta/models?pageSize=1000',
    )
  })
})
