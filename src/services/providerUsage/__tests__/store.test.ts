/**
 * Tests for the provider usage store, focusing on the updateProviderBuckets /
 * getProviderUsage data flow used by the Usage component's fallback rendering
 * branch and the StatusLine.
 *
 * These tests use the REAL store (not mocked) so they verify that:
 * - Buckets written via updateProviderBuckets are immediately readable
 * - An empty update replaces existing buckets (header source)
 * - The store persists across getProviderUsage calls within a session
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getProviderUsage,
  updateProviderBuckets,
  resetProviderUsage,
} from '../store.js'
import type { ProviderUsageBucket } from '../types.js'

describe('providerUsage store', () => {
  beforeEach(() => {
    // Ensure clean state before each test
    resetProviderUsage()
  })

  test('initial state has empty buckets', () => {
    const usage = getProviderUsage()
    expect(usage.providerId).toBe('unknown')
    expect(usage.buckets).toEqual([])
  })

  test('updateProviderBuckets writes data readable by getProviderUsage', () => {
    const buckets: ProviderUsageBucket[] = [
      {
        kind: 'tokens',
        label: 'TPM',
        utilization: 0.42,
        resetsAt: 1800000000,
      },
    ]
    updateProviderBuckets('openai', buckets)

    const usage = getProviderUsage()
    expect(usage.providerId).toBe('openai')
    expect(usage.buckets).toHaveLength(1)
    expect(usage.buckets[0]!.kind).toBe('tokens')
    expect(usage.buckets[0]!.label).toBe('TPM')
    expect(usage.buckets[0]!.utilization).toBeCloseTo(0.42)
    expect(usage.buckets[0]!.resetsAt).toBe(1800000000)
  })

  test('updateProviderBuckets with empty array clears previous buckets', () => {
    // First, write some buckets
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.5 },
    ])

    // Then replace with empty array
    updateProviderBuckets('openai', [])

    const usage = getProviderUsage()
    expect(usage.providerId).toBe('openai')
    expect(usage.buckets).toEqual([])
  })

  test('updateProviderBuckets replaces buckets from previous call', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.3 },
    ])

    // Second call should replace, not append
    updateProviderBuckets('openai', [
      { kind: 'requests', label: 'RPM', utilization: 0.6 },
      { kind: 'tokens', label: 'TPM', utilization: 0.8 },
    ])

    const usage = getProviderUsage()
    expect(usage.buckets).toHaveLength(2)
    expect(usage.buckets[0]!.kind).toBe('requests')
    expect(usage.buckets[1]!.kind).toBe('tokens')
  })

  test('providerId changes when updating for a different provider', () => {
    updateProviderBuckets('gemini', [
      { kind: 'tokens', label: 'TPM', utilization: 0.1 },
    ])

    let usage = getProviderUsage()
    expect(usage.providerId).toBe('gemini')

    updateProviderBuckets('openai', [
      { kind: 'requests', label: 'RPM', utilization: 0.5 },
    ])

    usage = getProviderUsage()
    expect(usage.providerId).toBe('openai')
    expect(usage.buckets).toHaveLength(1)
  })

  test('resetProviderUsage restores initial state', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.9 },
    ])

    resetProviderUsage()

    const usage = getProviderUsage()
    expect(usage.providerId).toBe('unknown')
    expect(usage.buckets).toEqual([])
  })

  test('getProviderUsage returns stable reference to current state', () => {
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.25 },
    ])

    const snap1 = getProviderUsage()
    const snap2 = getProviderUsage()

    // Both calls within the same tick should return equivalent data
    expect(snap1.providerId).toBe(snap2.providerId)
    expect(snap1.buckets.length).toBe(snap2.buckets.length)
  })

  test('multiple bucket kinds are preserved in order', () => {
    const buckets: ProviderUsageBucket[] = [
      {
        kind: 'session',
        label: 'Session limit',
        utilization: 0.1,
        resetsAt: 1,
      },
      { kind: 'weekly', label: 'Weekly limit', utilization: 0.2, resetsAt: 2 },
      { kind: 'requests', label: 'RPM', utilization: 0.3 },
      { kind: 'tokens', label: 'TPM', utilization: 0.4 },
      { kind: 'custom', label: 'Custom', utilization: 0.5 },
    ]
    updateProviderBuckets('openai', buckets)

    const usage = getProviderUsage()
    expect(usage.buckets).toHaveLength(5)
    expect(usage.buckets.map(b => b.kind)).toEqual([
      'session',
      'weekly',
      'requests',
      'tokens',
      'custom',
    ])
  })

  test('utilization between 0 and 1 is preserved accurately', () => {
    const testValues = [0, 0.001, 0.333, 0.5, 0.667, 0.999, 1.0]
    for (const val of testValues) {
      resetProviderUsage()
      updateProviderBuckets('openai', [
        { kind: 'tokens', label: 'TPM', utilization: val },
      ])
      const usage = getProviderUsage()
      expect(usage.buckets[0]!.utilization).toBeCloseTo(val, 5)
    }
  })
})
