import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { disableKeepAlive, _resetKeepAliveForTesting } from 'src/utils/proxy.js'
import { getGrokClient, clearGrokClientCache } from '../client.js'

describe('getGrokClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearGrokClientCache()
    _resetKeepAliveForTesting()
    process.env.GROK_API_KEY = 'test-key'
    delete process.env.GROK_BASE_URL
  })

  afterEach(() => {
    clearGrokClientCache()
    _resetKeepAliveForTesting()
    process.env = { ...originalEnv }
  })

  test('creates client with default base URL', () => {
    const client = getGrokClient()
    expect(client).toBeDefined()
    expect(client.baseURL).toBe('https://api.x.ai/v1')
  })

  test('uses GROK_BASE_URL when set', () => {
    process.env.GROK_BASE_URL = 'https://custom.grok.api/v1'
    clearGrokClientCache()
    const client = getGrokClient()
    expect(client.baseURL).toBe('https://custom.grok.api/v1')
  })

  test('returns cached client on second call', () => {
    const client1 = getGrokClient()
    const client2 = getGrokClient()
    expect(client1).toBe(client2)
  })

  test('does not reuse cached client when fetchOverride is provided', () => {
    const cached = getGrokClient()
    const overrideFetch = (async () =>
      new Response()) as unknown as typeof fetch
    const overridden = getGrokClient({ fetchOverride: overrideFetch })

    expect(overridden).not.toBe(cached)
    expect(getGrokClient()).toBe(cached)
  })

  test('does not reuse cached client across different retry policies', () => {
    const noSdkRetries = getGrokClient({ maxRetries: 0 })
    const sdkRetries = getGrokClient({ maxRetries: 2 })

    expect(sdkRetries).not.toBe(noSdkRetries)
    expect(noSdkRetries.maxRetries).toBe(0)
    expect(sdkRetries.maxRetries).toBe(2)
    expect(getGrokClient({ maxRetries: 2 })).toBe(sdkRetries)
  })

  test('rebuilds cached client after keep-alive is disabled', () => {
    const client1 = getGrokClient()
    expect(
      (client1 as unknown as { fetchOptions?: { keepalive?: false } })
        .fetchOptions?.keepalive,
    ).toBeUndefined()

    disableKeepAlive()
    const client2 = getGrokClient()

    expect(client2).not.toBe(client1)
    expect(
      (client2 as unknown as { fetchOptions?: { keepalive?: false } })
        .fetchOptions?.keepalive,
    ).toBe(false)
    expect(getGrokClient()).toBe(client2)
  })

  test('clearGrokClientCache resets cache', () => {
    const client1 = getGrokClient()
    clearGrokClientCache()
    process.env.GROK_BASE_URL = 'https://other.api/v1'
    const client2 = getGrokClient()
    expect(client1).not.toBe(client2)
  })
})
