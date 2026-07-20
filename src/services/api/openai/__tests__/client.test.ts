import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getProviderUsage,
  resetProviderUsage,
} from 'src/services/providerUsage/store.js'
import { setProviderCliOverride } from 'src/utils/model/providers.js'
import { disableKeepAlive, _resetKeepAliveForTesting } from 'src/utils/proxy.js'
import {
  clearOpenAIClientCache,
  getOpenAIClient,
  shouldPublishOpenAIUsage,
} from '../client.js'

function fetchOptionsOf(client: unknown): { keepalive?: false } | undefined {
  return (client as { fetchOptions?: { keepalive?: false } }).fetchOptions
}

function fetchOf(client: unknown): typeof fetch {
  return (client as { fetch: typeof fetch }).fetch
}

describe('getOpenAIClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearOpenAIClientCache()
    _resetKeepAliveForTesting()
    resetProviderUsage()
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_AUTH_MODE
    setProviderCliOverride('openai')
  })

  afterEach(() => {
    clearOpenAIClientCache()
    _resetKeepAliveForTesting()
    setProviderCliOverride(undefined)
    process.env = { ...originalEnv }
  })

  test('returns cached client on second call', () => {
    const client1 = getOpenAIClient()
    const client2 = getOpenAIClient()

    expect(client1).toBe(client2)
  })

  test('does not reuse cached client when fetchOverride is provided', () => {
    const cached = getOpenAIClient()
    const overrideFetch = (async () =>
      new Response()) as unknown as typeof fetch
    const overridden = getOpenAIClient({ fetchOverride: overrideFetch })

    expect(overridden).not.toBe(cached)
    expect(getOpenAIClient()).toBe(cached)
  })

  test('does not reuse cached client across different retry policies', () => {
    const noSdkRetries = getOpenAIClient({ maxRetries: 0 })
    const sdkRetries = getOpenAIClient({ maxRetries: 2 })

    expect(sdkRetries).not.toBe(noSdkRetries)
    expect(noSdkRetries.maxRetries).toBe(0)
    expect(sdkRetries.maxRetries).toBe(2)
    expect(getOpenAIClient({ maxRetries: 2 })).toBe(sdkRetries)
  })

  test('rebuilds cached client after keep-alive is disabled', () => {
    const client1 = getOpenAIClient()
    expect(fetchOptionsOf(client1)?.keepalive).toBeUndefined()

    disableKeepAlive()
    const client2 = getOpenAIClient()

    expect(client2).not.toBe(client1)
    expect(fetchOptionsOf(client2)?.keepalive).toBe(false)
    expect(getOpenAIClient()).toBe(client2)
  })

  test('publishes quota only for the active main OpenAI-compatible runtime', () => {
    delete process.env.OPENAI_AUTH_MODE
    expect(shouldPublishOpenAIUsage()).toBe(true)
    expect(shouldPublishOpenAIUsage({ OPENAI_API_KEY: 'scoped-key' })).toBe(
      false,
    )

    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    expect(shouldPublishOpenAIUsage()).toBe(false)

    delete process.env.OPENAI_AUTH_MODE
    setProviderCliOverride('anthropic')
    expect(shouldPublishOpenAIUsage()).toBe(false)
  })

  test('publishes standard quota headers for the current main OpenAI request', async () => {
    const client = getOpenAIClient({
      fetchOverride: (async () =>
        new Response('', {
          headers: {
            'x-ratelimit-limit-requests': '100',
            'x-ratelimit-remaining-requests': '25',
          },
        })) as unknown as typeof fetch,
    })

    await fetchOf(client)('https://api.example.test/v1/models')

    expect(getProviderUsage()).toMatchObject({
      providerId: 'openai',
      buckets: [{ kind: 'requests', label: 'RPM', utilization: 0.75 }],
    })
  })

  test('does not publish an old OpenAI response after a connection reset', async () => {
    let resolveResponse!: (response: Response) => void
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve
    })
    const client = getOpenAIClient({
      fetchOverride: (() => responsePromise) as unknown as typeof fetch,
    })
    const request = fetchOf(client)('https://old-account.example/v1/models')

    // `/connect` resets the publication epoch before deploying the new
    // account. The old request may still finish, but cannot repopulate usage.
    resetProviderUsage()
    resolveResponse(
      new Response('', {
        headers: {
          'x-ratelimit-limit-requests': '100',
          'x-ratelimit-remaining-requests': '1',
        },
      }),
    )
    await request

    expect(getProviderUsage()).toEqual({ providerId: 'unknown', buckets: [] })
  })

  test('does not publish an OpenAI API response after switching to ChatGPT', async () => {
    let resolveResponse!: (response: Response) => void
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve
    })
    const client = getOpenAIClient({
      fetchOverride: (() => responsePromise) as unknown as typeof fetch,
    })
    const request = fetchOf(client)('https://old-api.example/v1/models')

    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    resolveResponse(
      new Response('', {
        headers: {
          'x-ratelimit-limit-tokens': '1000',
          'x-ratelimit-remaining-tokens': '10',
        },
      }),
    )
    await request

    expect(getProviderUsage()).toEqual({ providerId: 'unknown', buckets: [] })
  })
})
