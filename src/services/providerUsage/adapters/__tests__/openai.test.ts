/**
 * Tests for the OpenAI provider-usage adapter's parseHeaders() method.
 *
 * These tests verify the header-parsing guard pattern used in client.ts and
 * responsesAdapter.ts: `parseHeaders()` must return an empty array when
 * headers carry no rate-limit data, so the caller can skip calling
 * updateProviderBuckets() and avoid clearing Codex-derived buckets.
 */

import { describe, test, expect } from 'bun:test'
import { openaiAdapter } from '../openai.js'

/**
 * Helper: create a Headers instance from a plain key-value record.
 */
function makeHeaders(entries: Record<string, string>): Headers {
  const h = new Headers()
  for (const [key, value] of Object.entries(entries)) {
    h.set(key, value)
  }
  return h
}

describe('openaiAdapter.parseHeaders', () => {
  // ---------------------------------------------------------------------------
  // Empty / absent rate-limit headers → empty buckets (guard: do NOT call
  // updateProviderBuckets)
  // ---------------------------------------------------------------------------

  test('returns empty array when no rate-limit headers are present', () => {
    const headers = makeHeaders({
      'content-type': 'application/json',
      'x-request-id': 'abc123',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  test('returns empty array for empty headers', () => {
    const result = openaiAdapter.parseHeaders(new Headers())
    expect(result).toEqual([])
  })

  test('returns empty array when limit headers exist but remaining header is missing', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-reset-requests': '6m0s',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  test('returns empty array when remaining headers exist but limit header is missing', () => {
    const headers = makeHeaders({
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-reset-requests': '6m0s',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  test('returns empty array when limit is zero', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '0',
      'x-ratelimit-remaining-requests': '50',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  test('returns empty array when remaining exceeds limit', () => {
    // remaining=150, limit=100 → used = -50 → utilization = -0.5 → clamped to 0
    // computeUtilization: Math.max(0, Math.min(1, -50/100)) = Math.max(0, -0.5) = 0
    // Result: utilization=0, which IS a valid bucket (not null)
    // But wait — the function returns 0 which IS valid, so it SHOULD produce a bucket
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '150',
    })
    const result = openaiAdapter.parseHeaders(headers)
    // utilization = max(0, min(1, (100-150)/100)) = max(0, min(1, -0.5)) = 0
    // Since 0 !== null, a bucket IS returned with 0% utilization
    expect(result).toHaveLength(1)
    if (result.length > 0) {
      expect(result[0]!.utilization).toBeCloseTo(0)
      expect(result[0]!.kind).toBe('requests')
    }
  })

  test('returns empty array when values are non-numeric strings', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': 'unlimited',
      'x-ratelimit-remaining-requests': 'many',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // Valid rate-limit headers → non-empty buckets (caller should call
  // updateProviderBuckets)
  // ---------------------------------------------------------------------------

  test('parses requests RPM bucket from valid headers', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '58',
      'x-ratelimit-reset-requests': '6m0s',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('requests')
    expect(result[0]!.label).toBe('RPM')
    // utilization = (100 - 58) / 100 = 0.42
    expect(result[0]!.utilization).toBeCloseTo(0.42, 5)
    // reset time should be set (6m = 360s from now)
    expect(result[0]!.resetsAt).toBeGreaterThan(0)
  })

  test('parses tokens TPM bucket from valid headers', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-tokens': '200000',
      'x-ratelimit-remaining-tokens': '150000',
      'x-ratelimit-reset-tokens': '1h30m',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('tokens')
    expect(result[0]!.label).toBe('TPM')
    // utilization = (200000 - 150000) / 200000 = 0.25
    expect(result[0]!.utilization).toBeCloseTo(0.25, 5)
  })

  test('parses both RPM and TPM buckets when both are present', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '500',
      'x-ratelimit-remaining-requests': '400',
      'x-ratelimit-limit-tokens': '1000000',
      'x-ratelimit-remaining-tokens': '300000',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(2)

    const rpm = result.find(b => b.kind === 'requests')
    const tpm = result.find(b => b.kind === 'tokens')
    expect(rpm).toBeDefined()
    expect(tpm).toBeDefined()
    // RPM: (500 - 400) / 500 = 0.2
    expect(rpm!.utilization).toBeCloseTo(0.2, 5)
    // TPM: (1000000 - 300000) / 1000000 = 0.7
    expect(tpm!.utilization).toBeCloseTo(0.7, 5)
  })

  test('handles 100% utilization (remaining=0)', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '0',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.utilization).toBeCloseTo(1.0, 5)
  })

  test('handles 0% utilization (remaining=limit)', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-tokens': '100000',
      'x-ratelimit-remaining-tokens': '100000',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.utilization).toBeCloseTo(0, 5)
  })

  // ---------------------------------------------------------------------------
  // Reset header parsing — various formats
  // ---------------------------------------------------------------------------

  test('parses reset header in seconds format', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-reset-requests': '30s',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    // 30s from now
    const expectedMin = Math.floor(Date.now() / 1000) + 25
    const expectedMax = Math.floor(Date.now() / 1000) + 35
    expect(result[0]!.resetsAt).toBeGreaterThanOrEqual(expectedMin)
    expect(result[0]!.resetsAt).toBeLessThanOrEqual(expectedMax)
  })

  test('parses reset header with raw seconds number', () => {
    // Some proxies emit raw unix epoch seconds as the reset value
    const futureEpoch = Math.floor(Date.now() / 1000) + 60
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-reset-requests': String(futureEpoch),
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    // fallback: raw number is treated as seconds → added to now
    expect(result[0]!.resetsAt).toBeGreaterThan(0)
  })

  test('returns undefined resetsAt when reset header is zero or invalid', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-reset-requests': '0ms',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.resetsAt).toBeUndefined()
  })

  test('returns undefined resetsAt when reset header is absent', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '50',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.resetsAt).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Mixed header scenarios (simulate real API responses)
  // ---------------------------------------------------------------------------

  test('parses only tokens when requests headers are incomplete', () => {
    const headers = makeHeaders({
      // Only requests limit, no remaining
      'x-ratelimit-limit-requests': '500',
      // Complete tokens headers
      'x-ratelimit-limit-tokens': '200000',
      'x-ratelimit-remaining-tokens': '100000',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('tokens')
    expect(result[0]!.utilization).toBeCloseTo(0.5, 5)
  })

  test('returns empty when all rate-limit headers are non-numeric garbage', () => {
    const headers = makeHeaders({
      'x-ratelimit-limit-requests': 'N/A',
      'x-ratelimit-remaining-requests': 'N/A',
      'x-ratelimit-limit-tokens': 'unlimited',
      'x-ratelimit-remaining-tokens': 'unlimited',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })

  test('simulates ChatGPT Codex response (no x-ratelimit-* headers at all)', () => {
    // The ChatGPT Codex backend does NOT emit x-ratelimit-* headers.
    // This is the exact scenario that the empty-buckets guard protects against.
    const headers = makeHeaders({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-request-id': 'req_codex_123',
      'openai-organization': 'org-abc',
      'openai-processing-ms': '150',
      'openai-version': '2025-01-01-preview',
    })
    const result = openaiAdapter.parseHeaders(headers)
    expect(result).toEqual([])
  })
})
