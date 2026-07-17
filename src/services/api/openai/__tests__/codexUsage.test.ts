import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

// =============================================================================
// Mocks — simulated with module-level state; lazy so fetchCodexUsage pulls
// the latest values at call time.
// =============================================================================

let authEnabled = false
let authThrows = false
let authToken = 'test-token'
let authAccountId: string | undefined = 'acc-123'

mock.module('src/services/api/openai/chatgptAuth.js', () => ({
  isChatGPTAuthEnabled: (() => authEnabled) as () => boolean,
  getValidChatGPTAuth: (async () => {
    if (authThrows) throw new Error('Not logged in')
    return { accessToken: authToken, accountId: authAccountId }
  }) as () => Promise<{ accessToken: string; accountId?: string }>,
}))

// =============================================================================
// Provider usage store mock — tracks updateProviderBuckets calls so we can
// verify fetchCodexUsage() side-effects without touching the real store.
// =============================================================================

interface StoreCall {
  providerId: string
  buckets: unknown[]
}

let storeUpdateCalls: StoreCall[] = []

mock.module('src/services/providerUsage/store.js', () => ({
  getProviderUsage: () => ({ providerId: 'unknown', buckets: [] }),
  updateProviderBuckets: (providerId: string, buckets: unknown[]) => {
    storeUpdateCalls.push({ providerId, buckets })
  },
  subscribeProviderUsage: (() => () => {}) as unknown,
  resetProviderUsage: () => {},
  setProviderBalance: () => {},
}))

// We'll replace fetch per-test below.

import {
  fetchCodexUsage,
  mapCodexLimitsToProviderBuckets,
} from '../codexUsage.js'
import type { CodexRateLimitBucket } from '../codexUsage.js'
import type { ProviderUsageBucket } from 'src/services/providerUsage/types.js'

// =============================================================================
// Helpers
// =============================================================================

type StubFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

const BASE = 'https://chatgpt.com/backend-api'

function resetState(): void {
  authEnabled = false
  authThrows = false
  authToken = 'test-token'
  authAccountId = 'acc-123'
  storeUpdateCalls = []
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

// =============================================================================
// Tests
// =============================================================================

describe('fetchCodexUsage', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetState()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ---------------------------------------------------------------------------
  // Auth / pre-condition failures
  // ---------------------------------------------------------------------------

  test('returns null when ChatGPT auth is not enabled', async () => {
    authEnabled = false
    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  test('returns null when getValidChatGPTAuth throws', async () => {
    authEnabled = true
    authThrows = true
    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Success — both endpoints return valid data
  // ---------------------------------------------------------------------------

  test('returns full snapshot when both endpoints succeed', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'plus',
            rate_limit: {
              primary_window: {
                used_percent: 42,
                window_minutes: 180,
                resets_at: 1700000000,
              },
              secondary_window: {
                used_percent: 15,
                window_minutes: 1440,
                resets_at: 1700086400,
              },
            },
            additional_rate_limits: [
              {
                label: 'o1',
                primary_window: {
                  used_percent: 67,
                  window_minutes: 1440,
                  resets_at: 1700086400,
                },
              },
            ],
          }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            summary: {
              lifetime_tokens: 9999,
            },
            daily_usage_buckets: [
              { start_date: '2025-06-30', tokens: 1500 },
              { start_date: '2025-07-01', tokens: 2345 },
            ],
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('plus')
    expect(result!.rateLimits).toHaveLength(3)

    // Primary
    expect(result!.rateLimits![0].label).toBe('Primary rate limit (180min)')
    expect(result!.rateLimits![0].labelKey).toBe('Primary rate limit')
    expect(result!.rateLimits![0].windowMinutes).toBe(180)
    expect(result!.rateLimits![0].used).toBe(42)
    expect(result!.rateLimits![0].limit).toBe(100)
    expect(result!.rateLimits![0].remaining).toBe(58)
    expect(result!.rateLimits![0].resetsAtSeconds).toBe(1700000000)

    // Secondary
    expect(result!.rateLimits![1].label).toBe('Secondary rate limit (1440min)')
    expect(result!.rateLimits![1].labelKey).toBe('Secondary rate limit')
    expect(result!.rateLimits![1].windowMinutes).toBe(1440)
    expect(result!.rateLimits![1].used).toBe(15)
    expect(result!.rateLimits![1].remaining).toBe(85)

    // Additional
    expect(result!.rateLimits![2].label).toBe('o1 (1440min)')
    expect(result!.rateLimits![2].labelKey).toBe('o1')
    expect(result!.rateLimits![2].windowMinutes).toBe(1440)

    // Token usage (latest bucket)
    expect(result!.tokenUsage?.tokensUsed).toBe(2345)
    expect(result!.tokenUsage?.date).toBe('2025-07-01')
  })

  // ---------------------------------------------------------------------------
  // Success — live API shape (reset_at, limit_name, nested rate_limit,
  //                           limit_window_seconds, stats.daily_usage_buckets)
  // ---------------------------------------------------------------------------

  test('parses live API response shape', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'pro',
            rate_limit: {
              primary_window: {
                used_percent: 55,
                limit_window_seconds: 10800, // 180 min
                reset_at: 1719000000,
              },
              secondary_window: {
                used_percent: 20,
                limit_window_seconds: 86400, // 1440 min
                reset_at: 1719086400,
              },
            },
            additional_rate_limits: [
              {
                limit_name: 'o3',
                rate_limit: {
                  primary_window: {
                    used_percent: 80,
                    limit_window_seconds: 43200, // 720 min
                    reset_at: 1719086400,
                  },
                  secondary_window: {
                    used_percent: 5,
                    limit_window_seconds: 86400, // 1440 min
                    reset_at: 1719086400,
                  },
                },
              },
              {
                limit_name: 'gpt-5',
                rate_limit: {
                  primary_window: {
                    used_percent: 33,
                    reset_at: 1719000000,
                  },
                },
              },
            ],
          }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            profile: {},
            stats: {
              daily_usage_buckets: [
                { start_date: '2025-07-01', tokens: 8900 },
                { start_date: '2025-06-30', tokens: 1200 },
              ],
            },
            metadata: {},
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('pro')

    // Rate limit windows — primary + secondary + 2 additional items * windows
    // (o3 has 2 windows, gpt-5 has 1 window w/o seconds)
    expect(result!.rateLimits).toHaveLength(5)

    // Primary: reset_at used, limit_window_seconds converted to minutes
    expect(result!.rateLimits![0].label).toBe('Primary rate limit (180min)')
    expect(result!.rateLimits![0].used).toBe(55)
    expect(result!.rateLimits![0].resetsAtSeconds).toBe(1719000000)

    // Secondary
    expect(result!.rateLimits![1].label).toBe('Secondary rate limit (1440min)')
    expect(result!.rateLimits![1].used).toBe(20)

    // o3 primary
    expect(result!.rateLimits![2].label).toBe('o3 (720min)')
    expect(result!.rateLimits![2].used).toBe(80)

    // o3 secondary
    expect(result!.rateLimits![3].label).toBe('o3 (1440min)')
    expect(result!.rateLimits![3].used).toBe(5)

    // gpt-5 primary (no limit_window_seconds, so no window suffix)
    expect(result!.rateLimits![4].label).toBe('gpt-5')
    expect(result!.rateLimits![4].used).toBe(33)

    // Token usage (live shape via stats.daily_usage_buckets, latest day)
    expect(result!.tokenUsage?.tokensUsed).toBe(8900)
    expect(result!.tokenUsage?.date).toBe('2025-07-01')
  })

  // ---------------------------------------------------------------------------
  // Mixed shapes — live usage + legacy profile (and vice versa)
  // ---------------------------------------------------------------------------

  test('parses live usage with legacy profile shape', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'team',
            rate_limit: {
              primary_window: {
                used_percent: 10,
                reset_at: 1720000000,
              },
            },
            additional_rate_limits: [
              {
                limit_name: 'gpt-4.1',
                rate_limit: {
                  primary_window: {
                    used_percent: 45,
                    limit_window_seconds: 3600,
                    reset_at: 1720000000,
                  },
                },
              },
            ],
          }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        // Legacy shape: daily_usage_buckets at top level
        return Promise.resolve(
          jsonResponse({
            daily_usage_buckets: [{ start_date: '2025-07-01', tokens: 5000 }],
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('team')
    expect(result!.rateLimits![0].label).toBe('Primary rate limit')
    expect(result!.rateLimits![0].labelKey).toBe('Primary rate limit')
    expect(result!.rateLimits![0].windowMinutes).toBeUndefined()
    expect(result!.rateLimits![0].resetsAtSeconds).toBe(1720000000)
    expect(result!.rateLimits![1].label).toBe('gpt-4.1 (60min)')
    expect(result!.rateLimits![1].used).toBe(45)
    expect(result!.tokenUsage?.tokensUsed).toBe(5000)
    expect(result!.tokenUsage?.date).toBe('2025-07-01')
  })

  test('parses legacy usage with live profile shape', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        // Legacy shape: label + flat primary_window
        return Promise.resolve(
          jsonResponse({
            plan_type: 'plus',
            rate_limit: {
              primary_window: {
                used_percent: 90,
                window_minutes: 60,
                resets_at: 1730000000,
              },
            },
            additional_rate_limits: [
              {
                label: 'Legacy model',
                primary_window: {
                  used_percent: 12,
                  window_minutes: 180,
                  resets_at: 1730000000,
                },
              },
            ],
          }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        // Live shape: nested under stats
        return Promise.resolve(
          jsonResponse({
            profile: {},
            stats: {
              daily_usage_buckets: [{ start_date: '2025-07-01', tokens: 300 }],
            },
            metadata: {},
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.rateLimits![0].label).toBe('Primary rate limit (60min)')
    expect(result!.rateLimits![0].resetsAtSeconds).toBe(1730000000)
    expect(result!.rateLimits![1].label).toBe('Legacy model (180min)')
    expect(result!.tokenUsage?.tokensUsed).toBe(300)
  })
  // ---------------------------------------------------------------------------

  test('returns partial snapshot when /wham/usage succeeds but /wham/profiles/me fails', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'free',
            rate_limit: {
              primary_window: {
                used_percent: 88,
                window_minutes: 180,
                resets_at: 1700000000,
              },
            },
          }),
        )
      }
      // profiles/me returns 500
      return Promise.resolve(
        new Response('Internal Server Error', { status: 500 }),
      )
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('free')
    expect(result!.rateLimits).toHaveLength(1)
    expect(result!.tokenUsage).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Partial success — profile succeeds, usage fails
  // ---------------------------------------------------------------------------

  test('returns partial snapshot when /wham/profiles/me succeeds but /wham/usage fails', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          new Response('Service Unavailable', { status: 503 }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            daily_usage_buckets: [{ start_date: '2025-07-01', tokens: 500 }],
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account).toBeUndefined()
    expect(result!.rateLimits).toBeUndefined()
    expect(result!.tokenUsage?.tokensUsed).toBe(500)
  })

  // ---------------------------------------------------------------------------
  // HTTP error codes
  // ---------------------------------------------------------------------------

  test('returns null when /wham/usage returns 401 and profiles returns 401', async () => {
    authEnabled = true

    globalThis.fetch = mock(
      (_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }))
      },
    ) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  test('returns null when /wham/usage returns 404', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(new Response('Not Found', { status: 404 }))
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            daily_usage_buckets: [{ start_date: '2025-07-01', tokens: 100 }],
          }),
        )
      }
      return Promise.resolve(new Response('Not Found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    // Profile succeeded but usage returned 404; only tokenUsage present.
    expect(result).not.toBeNull()
    expect(result!.tokenUsage?.tokensUsed).toBe(100)
    expect(result!.account).toBeUndefined()
    expect(result!.rateLimits).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Non-JSON response
  // ---------------------------------------------------------------------------

  test('returns null when both endpoints return non-JSON', async () => {
    authEnabled = true

    globalThis.fetch = mock(
      (_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.resolve(textResponse('<html>Error</html>', 200))
      },
    ) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Invalid JSON structure
  // ---------------------------------------------------------------------------

  test('returns null when usage response is valid JSON but has no relevant fields', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(jsonResponse({ foo: 'bar' }))
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(jsonResponse({ baz: 1 }))
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Rate limit with missing/non-finite used_percent
  // ---------------------------------------------------------------------------

  test('skips rate limit windows with missing used_percent', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'plus',
            rate_limit: {
              primary_window: { window_minutes: 180 },
              secondary_window: { used_percent: 30, resets_at: 1700000000 },
            },
          }),
        )
      }
      // profiles returns empty (no daily_usage_buckets)
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    // primary_window skipped (no used_percent), only secondary window kept
    expect(result!.rateLimits).toHaveLength(1)
    expect(result!.rateLimits![0].label).toBe('Secondary rate limit')
    expect(result!.rateLimits![0].used).toBe(30)
  })

  // ---------------------------------------------------------------------------
  // daily_usage_buckets filtering (non-finite tokens, missing start_date)
  // ---------------------------------------------------------------------------

  test('skips daily buckets with non-finite tokens', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(jsonResponse({}))
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            daily_usage_buckets: [
              { start_date: '2025-07-01', tokens: null },
              { start_date: '2025-06-30', tokens: 1234 },
            ],
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.tokenUsage?.tokensUsed).toBe(1234)
    expect(result!.tokenUsage?.date).toBe('2025-06-30')
  })

  // ---------------------------------------------------------------------------
  // Network / abort errors
  // ---------------------------------------------------------------------------

  test('returns null on network fetch error', async () => {
    authEnabled = true

    globalThis.fetch = mock(
      (_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.reject(new Error('connect ECONNREFUSED'))
      },
    ) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).toBeNull()
  })

  test('returns null when request is aborted via AbortSignal', async () => {
    authEnabled = true

    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      // Simulate abort by listening to signal and rejecting
      if (init?.signal) {
        const signal = init.signal as AbortSignal
        if (signal.aborted) {
          return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    const controller = new AbortController()
    const promise = fetchCodexUsage(controller.signal)

    // Abort after a tick
    await new Promise(resolve => setTimeout(resolve, 10))
    controller.abort()

    const result = await promise
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Edge case: plan_type without rate limits
  // ---------------------------------------------------------------------------

  test('handles plan_type present but no rate limit windows', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(jsonResponse({ plan_type: 'team' }))
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('team')
    expect(result!.rateLimits).toBeUndefined()
    expect(result!.tokenUsage).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Edge case: auth has no accountId
  // ---------------------------------------------------------------------------

  test('sends requests without ChatGPT-Account-Id header when accountId is missing', async () => {
    authEnabled = true
    authAccountId = undefined

    let capturedHeaders: Record<string, string> = {}

    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      if (headers) {
        capturedHeaders = { ...capturedHeaders, ...headers }
      }
      return Promise.resolve(
        jsonResponse({
          plan_type: 'pro',
          rate_limit: {
            primary_window: {
              used_percent: 10,
              resets_at: 1700000000,
            },
          },
        }),
      )
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.account?.subscriptionPlan).toBe('pro')
    expect(Object.keys(capturedHeaders)).not.toContain('ChatGPT-Account-Id')
  })

  // ---------------------------------------------------------------------------
  // Edge case: empty daily_usage_buckets array
  // ---------------------------------------------------------------------------

  test('handles empty daily_usage_buckets array', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            rate_limit: {
              primary_window: { used_percent: 50, resets_at: 1700000000 },
            },
          }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(jsonResponse({ daily_usage_buckets: [] }))
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.tokenUsage).toBeUndefined()
    expect(result!.rateLimits).toHaveLength(1)
  })
})

// =============================================================================
// fetchCodexUsage → providerUsage store side-effect tests
// =============================================================================

describe('fetchCodexUsage side-effect: updateProviderBuckets', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetState()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('calls updateProviderBuckets with mapped buckets when rateLimits are present', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'plus',
            rate_limit: {
              primary_window: {
                used_percent: 42,
                window_minutes: 180,
                resets_at: 1700000000,
              },
            },
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    await fetchCodexUsage()

    expect(storeUpdateCalls).toHaveLength(1)
    expect(storeUpdateCalls[0]!.providerId).toBe('openai')
    expect(storeUpdateCalls[0]!.buckets).toHaveLength(1)

    const bucket = storeUpdateCalls[0]!.buckets[0] as ProviderUsageBucket
    expect(bucket.kind).toBe('session')
    expect(bucket.label).toBe('Primary rate limit')
    expect(bucket.utilization).toBeCloseTo(0.42, 5)
    expect(bucket.resetsAt).toBe(1700000000)
  })

  test('maps a weekly-only primary window for the status line', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'plus',
            rate_limit: {
              primary_window: {
                used_percent: 42,
                limit_window_seconds: 604800,
                reset_at: 1800000000,
              },
            },
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    await fetchCodexUsage()

    expect(storeUpdateCalls).toHaveLength(1)
    const bucket = storeUpdateCalls[0]!.buckets[0] as ProviderUsageBucket
    expect(bucket.kind).toBe('weekly')
    expect(bucket.label).toBe('Primary rate limit')
    expect(bucket.utilization).toBeCloseTo(0.42, 5)
    expect(bucket.resetsAt).toBe(1800000000)
  })

  test('clears provider buckets when usage succeeds without rate limits', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(jsonResponse({ plan_type: 'team' }))
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(storeUpdateCalls).toEqual([{ providerId: 'openai', buckets: [] }])
  })

  test('does NOT call updateProviderBuckets when usage endpoint fails', async () => {
    authEnabled = true

    globalThis.fetch = mock(
      (_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }))
      },
    ) as unknown as typeof globalThis.fetch

    await fetchCodexUsage()
    expect(storeUpdateCalls).toHaveLength(0)
  })

  test('does NOT call updateProviderBuckets when auth is disabled', async () => {
    authEnabled = false

    globalThis.fetch = mock(
      (_input: RequestInfo | URL, _init?: RequestInit) => {
        return Promise.resolve(jsonResponse({}))
      },
    ) as unknown as typeof globalThis.fetch

    await fetchCodexUsage()
    expect(storeUpdateCalls).toHaveLength(0)
  })

  test('does NOT call updateProviderBuckets when only tokenUsage is returned (no rateLimits)', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          new Response('Service Unavailable', { status: 503 }),
        )
      }
      if (url === `${BASE}/wham/profiles/me`) {
        return Promise.resolve(
          jsonResponse({
            daily_usage_buckets: [{ start_date: '2025-07-01', tokens: 500 }],
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }) as unknown as typeof globalThis.fetch

    const result = await fetchCodexUsage()
    expect(result).not.toBeNull()
    expect(result!.tokenUsage?.tokensUsed).toBe(500)
    expect(storeUpdateCalls).toHaveLength(0)
  })

  test('calls updateProviderBuckets with multiple mapped buckets from live API shape', async () => {
    authEnabled = true

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === `${BASE}/wham/usage`) {
        return Promise.resolve(
          jsonResponse({
            plan_type: 'pro',
            rate_limit: {
              primary_window: {
                used_percent: 55,
                limit_window_seconds: 10800,
                reset_at: 1719000000,
              },
            },
            additional_rate_limits: [
              {
                limit_name: 'o3',
                rate_limit: {
                  primary_window: {
                    used_percent: 80,
                    limit_window_seconds: 43200,
                    reset_at: 1719086400,
                  },
                },
              },
            ],
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    }) as unknown as typeof globalThis.fetch

    await fetchCodexUsage()

    expect(storeUpdateCalls).toHaveLength(1)
    expect(storeUpdateCalls[0]!.providerId).toBe('openai')
    expect(storeUpdateCalls[0]!.buckets).toHaveLength(2)

    const b0 = storeUpdateCalls[0]!.buckets[0] as ProviderUsageBucket
    expect(b0.label).toBe('Primary rate limit')
    expect(b0.kind).toBe('session')

    const b1 = storeUpdateCalls[0]!.buckets[1] as ProviderUsageBucket
    expect(b1.label).toBe('o3')
    expect(b1.kind).toBe('custom')
    expect(b1.utilization).toBeCloseTo(0.8, 5)
  })
})

// =============================================================================
// mapCodexLimitsToProviderBuckets — pure-function tests
// =============================================================================

describe('mapCodexLimitsToProviderBuckets', () => {
  test('maps single rate limit bucket with windowMinutes <= 360 to session kind', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'Primary rate limit (300min)',
        labelKey: 'Primary rate limit',
        windowMinutes: 300,
        used: 42,
        limit: 100,
        remaining: 58,
        resetsAtSeconds: 1800000000,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('session')
    expect(result[0]!.label).toBe('Primary rate limit')
    expect(result[0]!.utilization).toBeCloseTo(0.42, 5)
    expect(result[0]!.resetsAt).toBe(1800000000)
  })

  test('maps rate limit with windowMinutes >= 1440 to weekly kind', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'Daily limit (1440min)',
        windowMinutes: 1440,
        used: 75,
        limit: 100,
        remaining: 25,
        resetsAtSeconds: 1800100000,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('weekly')
    expect(result[0]!.utilization).toBeCloseTo(0.75, 5)
  })

  test('maps windowMinutes between 361-1439 to custom kind', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: '12h window',
        windowMinutes: 720,
        used: 10,
        limit: 100,
        remaining: 90,
        resetsAtSeconds: 0,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('custom')
  })

  test('handles limit=0 gracefully (utilization=0)', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'Unlimited',
        used: 500,
        limit: 0,
        remaining: 0,
        resetsAtSeconds: 0,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result).toHaveLength(1)
    expect(result[0]!.utilization).toBe(0)
    expect(result[0]!.resetsAt).toBeUndefined()
  })

  test('uses labelKey over label when present', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'gpt-4.1 (60min)',
        labelKey: 'gpt-4.1',
        windowMinutes: 60,
        used: 30,
        limit: 100,
        remaining: 70,
        resetsAtSeconds: 0,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result[0]!.label).toBe('gpt-4.1')
  })

  test('falls back to label when labelKey is absent', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'Primary rate limit (300min)',
        used: 30,
        limit: 100,
        remaining: 70,
        resetsAtSeconds: 0,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result[0]!.label).toBe('Primary rate limit (300min)')
  })

  test('handles multiple buckets with mixed kinds', () => {
    const input: CodexRateLimitBucket[] = [
      {
        label: 'Session (300min)',
        windowMinutes: 300,
        used: 25,
        limit: 100,
        remaining: 75,
        resetsAtSeconds: 1,
      },
      {
        label: 'Secondary rate limit',
        used: 60,
        limit: 100,
        remaining: 40,
        resetsAtSeconds: 1800100000,
      },
    ]
    const result = mapCodexLimitsToProviderBuckets(input)
    expect(result).toHaveLength(2)
    expect(result[0]!.kind).toBe('session')
    expect(result[0]!.resetsAt).toBe(1)
    // Second bucket has no windowMinutes => custom
    expect(result[1]!.kind).toBe('custom')
  })

  test('returns empty array for empty input', () => {
    expect(mapCodexLimitsToProviderBuckets([])).toEqual([])
  })
})
