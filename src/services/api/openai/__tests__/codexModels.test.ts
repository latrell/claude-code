import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

let requestedScopes: Array<string | undefined> = []

async function resolveTestAuth(scope?: string) {
  requestedScopes.push(scope)
  return { accessToken: 'stored-token', accountId: 'stored-account' }
}

async function refreshTestAuth(scope?: string) {
  requestedScopes.push(scope)
  return { accessToken: 'refreshed-token', accountId: 'stored-account' }
}

import {
  CHATGPT_CODEX_MODELS_URL,
  CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION,
  clearChatGPTCodexModelsCacheForTests,
  fetchChatGPTCodexModels,
  parseChatGPTCodexModels,
} from '../codexModels.js'
import { getChatGPTCodexModelOptions } from 'src/utils/model/chatgptModels.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as unknown as typeof fetch
}

function remoteModel(
  slug: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug,
    display_name: slug.toUpperCase(),
    description: `${slug} description`,
    default_reasoning_level: 'medium',
    supported_reasoning_levels: [
      { effort: 'low', description: 'Low' },
      { effort: 'medium', description: 'Medium' },
      { effort: 'high', description: 'High' },
    ],
    visibility: 'list',
    supported_in_api: true,
    priority: 10,
    context_window: 272_000,
    max_context_window: 272_000,
    input_modalities: ['text', 'image'],
    support_verbosity: true,
    default_verbosity: 'low',
    supports_parallel_tool_calls: true,
    use_responses_lite: false,
    ...overrides,
  }
}

beforeEach(() => {
  clearChatGPTCodexModelsCacheForTests()
  requestedScopes = []
})

afterEach(() => {
  clearChatGPTCodexModelsCacheForTests()
})

describe('parseChatGPTCodexModels', () => {
  test('maps Codex model metadata and converts product Ultra to wire Max', () => {
    const models = parseChatGPTCodexModels({
      models: [
        remoteModel('future-sol', {
          display_name: 'Future Sol',
          default_reasoning_level: 'ultra',
          supported_reasoning_levels: [
            { effort: 'ultra', description: 'Delegates automatically' },
            { effort: 'low', description: 'Fast' },
            { effort: 'xhigh', description: 'Deep' },
          ],
          visibility: 'list',
          supported_in_api: false,
          priority: 9,
          context_window: 300_000,
          max_context_window: 1_000_000,
          effective_context_window_percent: 91,
          auto_compact_token_limit: 250_000,
          input_modalities: ['text'],
          default_verbosity: 'high',
          supports_parallel_tool_calls: false,
          use_responses_lite: true,
          default_reasoning_summary: 'detailed',
          tool_mode: 'shell',
          multi_agent_version: 'v2',
          available_in_plans: ['plus', 'pro', 42],
          upgrade: { model: 'future-sol-2' },
          unknown_future_field: { accepted: true },
        }),
        remoteModel('first-by-priority', {
          priority: 1,
          visibility: 'hidden',
          supported_reasoning_levels: ['medium', 'max'],
        }),
      ],
    })

    expect(models.map(model => model.value)).toEqual([
      'first-by-priority',
      'future-sol',
    ])
    expect(models[0]?.visibility).toBe('hide')
    expect(models[1]).toMatchObject({
      value: 'future-sol',
      label: 'Future Sol',
      defaultEffortLevel: 'max',
      supportedEffortLevels: ['low', 'xhigh', 'max'],
      contextWindow: 300_000,
      maxContextWindow: 1_000_000,
      effectiveContextWindowPercent: 91,
      autoCompactTokenLimit: 250_000,
      useResponsesLite: true,
      visibility: 'list',
      priority: 9,
      supportedInApi: false,
      inputModalities: ['text'],
      supportsParallelToolCalls: false,
      defaultVerbosity: 'high',
      supportsReasoningSummaryParameter: true,
      defaultReasoningSummary: 'detailed',
      toolMode: 'shell',
      supportsUltra: true,
      multiAgentVersion: 'v2',
      availablePlans: ['plus', 'pro'],
      upgradeModel: 'future-sol-2',
    })
    expect(models[1]?.supportedEffortLevels).not.toContain('ultra')
  })

  test('uses safe defaults for optional metadata and skips invalid entries', () => {
    const models = parseChatGPTCodexModels({
      models: [
        null,
        { display_name: 'No slug' },
        {
          slug: 'minimal-model',
          visibility: 'future-visibility',
          supported_reasoning_levels: [{ effort: 'minimal' }],
          input_modalities: [],
          support_verbosity: false,
        },
      ],
    })

    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      value: 'minimal-model',
      label: 'minimal-model',
      defaultEffortLevel: 'medium',
      supportedEffortLevels: ['medium'],
      contextWindow: 272_000,
      maxContextWindow: 272_000,
      visibility: 'none',
      priority: 1000,
      supportedInApi: false,
      inputModalities: ['text'],
      supportsParallelToolCalls: false,
    })
    expect(models[0]?.defaultVerbosity).toBeUndefined()
  })

  test('rejects a response without a models array', () => {
    expect(() => parseChatGPTCodexModels({ data: [] })).toThrow(
      'Invalid ChatGPT Codex model catalog response',
    )
  })
})

describe('fetchChatGPTCodexModels', () => {
  test('advertises the audited Codex protocol baseline by default', async () => {
    let capturedURL = ''
    let capturedHeaders: Headers | undefined
    await fetchChatGPTCodexModels({
      fetchOverride: stubFetch(async (input, init) => {
        capturedURL = String(input)
        capturedHeaders = new Headers(init?.headers)
        return jsonResponse({ models: [remoteModel('baseline-model')] })
      }),
      authOverride: { accessToken: 'oauth-secret' },
    })

    expect(new URL(capturedURL).searchParams.get('client_version')).toBe(
      CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION,
    )
    expect(capturedHeaders?.get('version')).toBe(
      CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION,
    )
  })

  test('uses the subscription Codex route, OAuth headers, version, and proxy', async () => {
    let capturedURL = ''
    let capturedInit: RequestInit | undefined
    const fetchOverride = stubFetch(async (input, init): Promise<Response> => {
      capturedURL = String(input)
      capturedInit = init
      return jsonResponse({ models: [remoteModel('remote-lite')] })
    })

    const models = await fetchChatGPTCodexModels({
      credentialScope: 'work-account',
      fetchOverride,
      authOverride: {
        accessToken: 'oauth-secret',
        accountId: 'account-123',
        isFedRAMP: true,
      },
      clientVersion: '2.8.3 beta',
    })

    const url = new URL(capturedURL)
    const headers = new Headers(capturedInit?.headers)
    expect(`${url.origin}${url.pathname}`).toBe(CHATGPT_CODEX_MODELS_URL)
    expect(url.searchParams.get('client_version')).toBe('2.8.3 beta')
    expect(capturedInit?.method).toBe('GET')
    expect(headers.get('Authorization')).toBe('Bearer oauth-secret')
    expect(headers.get('ChatGPT-Account-Id')).toBe('account-123')
    expect(headers.get('X-OpenAI-Fedramp')).toBe('true')
    expect(headers.get('originator')).toBe('claude-code-best')
    expect(headers.get('version')).toBe('2.8.3 beta')
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
    expect(models[0]?.value).toBe('remote-lite')
  })

  test('loads OAuth for the requested credential scope when not overridden', async () => {
    let capturedHeaders: Headers | undefined
    await fetchChatGPTCodexModels({
      credentialScope: 'team-account',
      clientVersion: 'test-version',
      authResolverOverride: resolveTestAuth,
      fetchOverride: stubFetch(async (_input, init) => {
        capturedHeaders = new Headers(init?.headers)
        return jsonResponse({ models: [remoteModel('scoped-model')] })
      }),
    })

    expect(requestedScopes).toEqual(['team-account'])
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer stored-token')
    expect(capturedHeaders?.get('ChatGPT-Account-Id')).toBe('stored-account')
  })

  test('installs a visible remote response as the authoritative catalog', async () => {
    await fetchChatGPTCodexModels({
      credentialScope: 'remote-account',
      authOverride: { accessToken: 'token' },
      clientVersion: 'test-version',
      fetchOverride: stubFetch(async () =>
        jsonResponse({
          models: [
            remoteModel('remote-visible'),
            remoteModel('remote-hidden', { visibility: 'hide' }),
          ],
        }),
      ),
    })

    expect(
      getChatGPTCodexModelOptions('remote-account').map(model => model.value),
    ).toEqual(['remote-visible', 'remote-hidden'])
    expect(getChatGPTCodexModelOptions().map(model => model.value)).toContain(
      'gpt-5.6-sol',
    )
  })

  test('keeps the bundled fallback when the remote response has no list model', async () => {
    const credentialScope = 'hidden-only-account'
    await fetchChatGPTCodexModels({
      credentialScope,
      authOverride: { accessToken: 'token' },
      clientVersion: 'test-version',
      fetchOverride: stubFetch(async () =>
        jsonResponse({ models: [remoteModel('previous-visible')] }),
      ),
    })
    await fetchChatGPTCodexModels({
      credentialScope,
      authOverride: { accessToken: 'token' },
      clientVersion: 'test-version',
      force: true,
      fetchOverride: stubFetch(async () =>
        jsonResponse({
          models: [remoteModel('remote-hidden', { visibility: 'hide' })],
        }),
      ),
    })

    const activeIds = getChatGPTCodexModelOptions(credentialScope).map(
      model => model.value,
    )
    expect(activeIds).toContain('gpt-5.6-sol')
    expect(activeIds).not.toContain('remote-hidden')
  })

  test('caches per scope for five minutes and merges concurrent callers', async () => {
    let fetchCount = 0
    let releaseFetch: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      releaseFetch = resolve
    })
    const fetchOverride = stubFetch(async (): Promise<Response> => {
      fetchCount += 1
      await gate
      return jsonResponse({ models: [remoteModel('cached-model')] })
    })
    const common = {
      authOverride: { accessToken: 'token' },
      clientVersion: 'test-version',
      fetchOverride,
    }

    const first = fetchChatGPTCodexModels({
      ...common,
      credentialScope: 'scope-a',
    })
    const concurrent = fetchChatGPTCodexModels({
      ...common,
      credentialScope: 'scope-a',
    })
    await Promise.resolve()
    expect(fetchCount).toBe(1)
    releaseFetch?.()
    await Promise.all([first, concurrent])

    await fetchChatGPTCodexModels({
      ...common,
      credentialScope: 'scope-a',
    })
    expect(fetchCount).toBe(1)

    await fetchChatGPTCodexModels({
      ...common,
      credentialScope: 'scope-b',
    })
    expect(fetchCount).toBe(2)
  })

  test('binds a scope cache to the authenticated account identity', async () => {
    let fetchCount = 0
    const fetchOverride = stubFetch(async (_input, init) => {
      fetchCount += 1
      const token = new Headers(init?.headers)
        .get('Authorization')
        ?.replace('Bearer ', '')
      return jsonResponse({ models: [remoteModel(`model-${token}`)] })
    })

    const first = await fetchChatGPTCodexModels({
      credentialScope: 'relogin',
      authOverride: { accessToken: 'a', accountId: 'account-a' },
      clientVersion: 'test-version',
      fetchOverride,
    })
    const second = await fetchChatGPTCodexModels({
      credentialScope: 'relogin',
      authOverride: { accessToken: 'b', accountId: 'account-b' },
      clientVersion: 'test-version',
      fetchOverride,
    })

    expect(fetchCount).toBe(2)
    expect(first[0]?.value).toBe('model-a')
    expect(second[0]?.value).toBe('model-b')
    expect(getChatGPTCodexModelOptions('relogin')[0]?.value).toBe('model-b')
  })

  test('ignores an old account catalog that arrives after an account switch', async () => {
    let resolveA: ((response: Response) => void) | undefined
    let resolveB: ((response: Response) => void) | undefined
    const fetchOverride = stubFetch(async (_input, init) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      return new Promise<Response>(resolve => {
        if (authorization === 'Bearer token-a') resolveA = resolve
        else resolveB = resolve
      })
    })

    const requestA = fetchChatGPTCodexModels({
      credentialScope: 'switching',
      authOverride: { accessToken: 'token-a', accountId: 'account-a' },
      clientVersion: 'test-version',
      fetchOverride,
    })
    const requestB = fetchChatGPTCodexModels({
      credentialScope: 'switching',
      authOverride: { accessToken: 'token-b', accountId: 'account-b' },
      clientVersion: 'test-version',
      fetchOverride,
    })
    await Promise.resolve()

    resolveB?.(jsonResponse({ models: [remoteModel('model-b')] }))
    await requestB
    resolveA?.(jsonResponse({ models: [remoteModel('model-a')] }))
    await requestA

    expect(getChatGPTCodexModelOptions('switching')[0]?.value).toBe('model-b')
  })

  test('ignores an old account whose OAuth refresh finishes after a newer switch', async () => {
    let resolveAuthA:
      | ((auth: { accessToken: string; accountId: string }) => void)
      | undefined
    const authAGate = new Promise<{
      accessToken: string
      accountId: string
    }>(resolve => {
      resolveAuthA = resolve
    })
    const fetchOverride = stubFetch(async (_input, init) => {
      const token = new Headers(init?.headers)
        .get('Authorization')
        ?.replace('Bearer ', '')
      return jsonResponse({ models: [remoteModel(`model-${token}`)] })
    })

    const requestA = fetchChatGPTCodexModels({
      credentialScope: 'auth-switching',
      authResolverOverride: () => authAGate,
      clientVersion: 'test-version',
      fetchOverride,
    })
    const requestB = fetchChatGPTCodexModels({
      credentialScope: 'auth-switching',
      authOverride: { accessToken: 'token-b', accountId: 'account-b' },
      clientVersion: 'test-version',
      fetchOverride,
    })

    await requestB
    resolveAuthA?.({ accessToken: 'token-a', accountId: 'account-a' })
    await requestA

    expect(getChatGPTCodexModelOptions('auth-switching')[0]?.value).toBe(
      'model-token-b',
    )
  })

  test('does not expose OAuth tokens in HTTP errors', async () => {
    const secret = 'never-print-this-oauth-token'
    let thrown: unknown
    try {
      await fetchChatGPTCodexModels({
        authOverride: { accessToken: secret },
        clientVersion: 'test-version',
        fetchOverride: stubFetch(
          async () => new Response(`server echoed ${secret}`, { status: 401 }),
        ),
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      'ChatGPT Codex model catalog request failed (401)',
    )
    expect((thrown as Error).message).not.toContain(secret)
  })

  test('refreshes and replays once when the catalog rejects OAuth', async () => {
    const authorizations: string[] = []
    const models = await fetchChatGPTCodexModels({
      credentialScope: 'refresh-account',
      clientVersion: 'test-version',
      authResolverOverride: resolveTestAuth,
      authRefreshOverride: refreshTestAuth,
      fetchOverride: stubFetch(async (_input, init) => {
        const authorization = new Headers(init?.headers).get('Authorization')
        authorizations.push(authorization ?? '')
        return authorizations.length === 1
          ? new Response('expired', { status: 401 })
          : jsonResponse({ models: [remoteModel('after-refresh')] })
      }),
    })

    expect(models[0]?.value).toBe('after-refresh')
    expect(authorizations).toEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
    expect(requestedScopes).toEqual(['refresh-account', 'refresh-account'])
  })
})
