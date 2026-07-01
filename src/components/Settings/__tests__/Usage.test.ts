import { describe, test, expect } from 'bun:test'
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
})
