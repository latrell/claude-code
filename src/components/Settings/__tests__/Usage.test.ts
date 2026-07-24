import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import {
  bucketToLimitBar,
  codexBucketToLimitBar,
  providerDisplayName,
} from '../Usage.js'
import type { ProviderUsageBucket } from '../../../services/providerUsage/types.js'
import type { CodexRateLimitBucket } from '../../../services/api/openai/codexUsage.js'

describe('providerDisplayName', () => {
  test('returns label for known providers', () => {
    expect(providerDisplayName('openai')).toBe('OpenAI / ChatGPT')
    expect(providerDisplayName('anthropic')).toBe('Anthropic')
    expect(providerDisplayName('bedrock')).toBe('AWS Bedrock')
    expect(providerDisplayName('vertex')).toBe('Google Vertex AI')
    expect(providerDisplayName('gemini')).toBe('Google Gemini')
    expect(providerDisplayName('grok')).toBe('xAI Grok')
  })

  test('returns raw providerId for unknown providers', () => {
    expect(providerDisplayName('custom-provider')).toBe('custom-provider')
    expect(providerDisplayName('')).toBe('')
  })
})

describe('bucketToLimitBar', () => {
  test('converts utilization from 0-1 ratio to 0-100 percentage', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'tokens',
      label: 'TPM',
      utilization: 0.75,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.label).toBe('TPM')
    expect(result.limit.utilization).toBe(75)
    expect(result.limit.resets_at).toBeNull()
  })

  test('handles 0% utilization', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'requests',
      label: 'RPM',
      utilization: 0,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.limit.utilization).toBe(0)
  })

  test('handles 100% utilization', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'requests',
      label: 'RPM',
      utilization: 1,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.limit.utilization).toBe(100)
  })

  test('converts resetsAt unix timestamp to ISO string', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'tokens',
      label: 'TPM',
      utilization: 0.5,
      resetsAt: 1800000000,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.limit.resets_at).toBe(
      new Date(1800000000 * 1000).toISOString(),
    )
  })

  test('rounds utilization to nearest integer', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'tokens',
      label: 'TPM',
      utilization: 0.425,
    }
    const result = bucketToLimitBar(bucket)
    // Math.round(0.425 * 100) = Math.round(42.5) = 43
    expect(result.limit.utilization).toBe(43)
  })
})

describe('codexBucketToLimitBar', () => {
  test('converts Codex rate limit bucket to LimitBar format', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'GPT-5 requests per day',
      used: 25,
      limit: 100,
      remaining: 75,
      resetsAtSeconds: 1800000000,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.title).toBe('GPT-5 requests per day')
    expect(result.limit.utilization).toBe(25)
    expect(result.limit.resets_at).toBe(
      new Date(1800000000 * 1000).toISOString(),
    )
  })

  test('returns null utilization when limit is 0', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Unlimited plan',
      used: 500,
      limit: 0,
      remaining: 0,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.limit.utilization).toBeNull()
  })

  test('returns null resets_at when resetsAtSeconds is 0', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'GPT-5 requests per day',
      used: 50,
      limit: 100,
      remaining: 50,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.limit.resets_at).toBeNull()
  })

  test('handles 100% utilization', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Rate limit',
      used: 100,
      limit: 100,
      remaining: 0,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.limit.utilization).toBe(100)
  })

  test('handles 0% utilization', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Rate limit',
      used: 0,
      limit: 100,
      remaining: 100,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.limit.utilization).toBe(0)
  })

  // Title assertions below accept both English and Chinese output because the
  // resolved language depends on the host locale/config (see t.ts).

  test('builds title from labelKey and windowMinutes when present', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Primary rate limit (300min)',
      labelKey: 'Primary rate limit',
      windowMinutes: 300,
      used: 10,
      limit: 100,
      remaining: 90,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(['Primary rate limit (5h)', '主要速率限制（5时）']).toContain(
      result.title,
    )
  })

  test('builds title from labelKey alone when windowMinutes is absent', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Secondary rate limit',
      labelKey: 'Secondary rate limit',
      used: 10,
      limit: 100,
      remaining: 90,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(['Secondary rate limit', '次要速率限制']).toContain(result.title)
  })

  test('passes server-provided labelKey through untranslated', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'gpt-4.1 (60min)',
      labelKey: 'gpt-4.1',
      windowMinutes: 60,
      used: 10,
      limit: 100,
      remaining: 90,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(['gpt-4.1 (1h)', 'gpt-4.1（1时）']).toContain(result.title)
  })

  test('falls back to pre-formatted label when labelKey is absent', () => {
    const bucket: CodexRateLimitBucket = {
      label: 'Primary rate limit (300min)',
      used: 10,
      limit: 100,
      remaining: 90,
      resetsAtSeconds: 0,
    }
    const result = codexBucketToLimitBar(bucket)
    expect(result.title).toBe('Primary rate limit (300min)')
  })
})

describe('bucketToLimitBar with Codex-style buckets', () => {
  test('handles session-kind bucket', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'session',
      label: 'Primary rate limit',
      utilization: 0.42,
      resetsAt: 1800000000,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.label).toBe('Primary rate limit')
    expect(result.limit.utilization).toBe(42)
  })

  test('handles weekly-kind bucket', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'weekly',
      label: 'Daily limit',
      utilization: 0.75,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.label).toBe('Daily limit')
    expect(result.limit.utilization).toBe(75)
  })

  test('handles custom-kind bucket', () => {
    const bucket: ProviderUsageBucket = {
      kind: 'custom',
      label: 'gpt-4.1',
      utilization: 0.3,
      resetsAt: 1800100000,
    }
    const result = bucketToLimitBar(bucket)
    expect(result.label).toBe('gpt-4.1')
    expect(result.limit.utilization).toBe(30)
  })
})

describe('providerUsage store → bucketToLimitBar pipeline', () => {
  // These tests verify the end-to-end data flow from the provider-usage store
  // through the display helpers used by the Usage component's fallback branch.
  // They do NOT render Ink; they test the pure data transformation pipeline.

  // Dynamic imports so the real store is used (not mocked).
  let getProviderUsage: () => import('src/services/providerUsage/types.js').ProviderUsage
  let updateProviderBuckets: (
    pid: string,
    buckets: import('src/services/providerUsage/types.js').ProviderUsageBucket[],
  ) => void
  let resetProviderUsage: () => void

  beforeAll(async () => {
    const store = await import('../../../services/providerUsage/store.js')
    getProviderUsage = store.getProviderUsage
    updateProviderBuckets = store.updateProviderBuckets
    resetProviderUsage = store.resetProviderUsage
  })

  beforeEach(() => {
    resetProviderUsage()
  })

  test('full pipeline: update → get → bucketToLimitBar with single bucket', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.42, resetsAt: 1800000000 },
    ])

    const usage = getProviderUsage()
    expect(usage.buckets).toHaveLength(1)

    const result = bucketToLimitBar(usage.buckets[0]!)
    expect(result.label).toBe('TPM')
    expect(result.limit.utilization).toBe(42) // 0.42 * 100 = 42
    expect(result.limit.resets_at).toBe(
      new Date(1800000000 * 1000).toISOString(),
    )
  })

  test('full pipeline: empty store → empty buckets → no display data', () => {
    const usage = getProviderUsage()
    expect(usage.buckets).toEqual([])
  })

  test('full pipeline: multiple Codex-mapped buckets from store', () => {
    // Simulate what mapCodexLimitsToProviderBuckets writes to the store
    updateProviderBuckets('openai', [
      {
        kind: 'session',
        label: 'Primary rate limit',
        utilization: 0.15,
        resetsAt: 1700000000,
      },
      {
        kind: 'weekly',
        label: 'Daily limit',
        utilization: 0.8,
        resetsAt: 1700086400,
      },
      { kind: 'custom', label: 'gpt-4.1', utilization: 0.3 },
    ])

    const usage = getProviderUsage()
    expect(usage.buckets).toHaveLength(3)

    // Verify each bucket maps correctly through bucketToLimitBar
    const results = usage.buckets.map(b => bucketToLimitBar(b))

    expect(results[0]!.label).toBe('Primary rate limit')
    expect(results[0]!.limit.utilization).toBe(15)

    expect(results[1]!.label).toBe('Daily limit')
    expect(results[1]!.limit.utilization).toBe(80)

    expect(results[2]!.label).toBe('gpt-4.1')
    expect(results[2]!.limit.utilization).toBe(30)
    expect(results[2]!.limit.resets_at).toBeNull() // no resetsAt → null
  })

  test('full pipeline: utilization=0 bucket still produces valid LimitBar props', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0 },
    ])

    const usage = getProviderUsage()
    const result = bucketToLimitBar(usage.buckets[0]!)
    // utilization=0 → Math.round(0 * 100) = 0, which is valid (not null)
    expect(result.limit.utilization).toBe(0)
    // A utilization of 0 is NOT null, so the LimitBar component would render it
    expect(result.limit.utilization).not.toBeNull()
  })

  test('provider switch invalidates previous buckets', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.5 },
    ])

    // Switch to another provider — buckets should be replaced
    updateProviderBuckets('gemini', [
      { kind: 'requests', label: 'RPM', utilization: 0.3 },
    ])

    const usage = getProviderUsage()
    expect(usage.providerId).toBe('gemini')
    expect(usage.buckets).toHaveLength(1)
    expect(usage.buckets[0]!.kind).toBe('requests')
  })
})
