import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { disableKeepAlive, _resetKeepAliveForTesting } from 'src/utils/proxy.js'
import { clearOpenAIClientCache, getOpenAIClient } from '../client.js'

function fetchOptionsOf(client: unknown): { keepalive?: false } | undefined {
  return (client as { fetchOptions?: { keepalive?: false } }).fetchOptions
}

describe('getOpenAIClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearOpenAIClientCache()
    _resetKeepAliveForTesting()
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.OPENAI_BASE_URL
  })

  afterEach(() => {
    clearOpenAIClientCache()
    _resetKeepAliveForTesting()
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
})
