import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  mapCursorUsageToProviderBuckets,
  parseCursorUsageSummary,
  type CursorUsageSnapshot,
} from '../cursorUsage.js'

// Real /auth/usage-summary response shape captured live from an ultra plan.
const REAL_SUMMARY = {
  billingCycleStart: '2026-07-05T04:38:09.000Z',
  billingCycleEnd: '2026-08-05T04:38:09.000Z',
  membershipType: 'ultra',
  limitType: 'user',
  isUnlimited: false,
  individualUsage: {
    plan: {
      enabled: true,
      used: 40000,
      limit: 40000,
      remaining: 0,
      breakdown: { included: 40000, bonus: 166, total: 40166 },
      autoPercentUsed: 0.757,
      apiPercentUsed: 78.818,
      totalPercentUsed: 26.7773,
    },
    onDemand: { enabled: true, used: 0, limit: 300000, remaining: 300000 },
  },
}

describe('parseCursorUsageSummary', () => {
  test('extracts membership, billing cycle, and plan metrics', () => {
    const snapshot = parseCursorUsageSummary(REAL_SUMMARY)
    expect(snapshot.membershipType).toBe('ultra')
    expect(snapshot.billingCycleEnd).toBe('2026-08-05T04:38:09.000Z')
    expect(snapshot.isUnlimited).toBe(false)

    // Included-usage percent mirrors totalPercentUsed and carries NO dollar
    // subtext (the used/limit dollar fields track a different base allowance,
    // so pairing them with this percent would read as contradictory).
    const included = snapshot.metrics.find(m => m.labelKey === 'Included usage')
    expect(included?.percentUsed).toBeCloseTo(26.777, 2)
    expect(included?.usedCents).toBeUndefined()
    expect(included?.limitCents).toBeUndefined()

    const api = snapshot.metrics.find(m => m.labelKey === 'Included API usage')
    expect(api?.percentUsed).toBeCloseTo(78.818, 2)

    const auto = snapshot.metrics.find(
      m => m.labelKey === 'Included Auto usage',
    )
    expect(auto?.percentUsed).toBeCloseTo(0.757, 2)
  })

  test('includes on-demand only when enabled with a positive limit', () => {
    const withOnDemand = parseCursorUsageSummary({
      individualUsage: {
        plan: { enabled: true, totalPercentUsed: 10 },
        onDemand: { enabled: true, used: 1500, limit: 30000 },
      },
    })
    const onDemand = withOnDemand.metrics.find(
      m => m.labelKey === 'On-demand usage',
    )
    expect(onDemand?.percentUsed).toBeCloseTo(5, 5)
    expect(onDemand?.usedCents).toBe(1500)
    expect(onDemand?.limitCents).toBe(30000)

    // Disabled / zero-limit on-demand is omitted.
    const withoutOnDemand = parseCursorUsageSummary({
      individualUsage: {
        plan: { enabled: true, totalPercentUsed: 10 },
        onDemand: { enabled: false, used: 0, limit: null },
      },
    })
    expect(
      withoutOnDemand.metrics.some(m => m.labelKey === 'On-demand usage'),
    ).toBe(false)
  })

  test('clamps out-of-range percentages to 0–100', () => {
    const snapshot = parseCursorUsageSummary({
      individualUsage: { plan: { enabled: true, totalPercentUsed: 137.5 } },
    })
    expect(snapshot.metrics[0]?.percentUsed).toBe(100)
  })

  test('returns an empty metric list for an unusable payload', () => {
    expect(parseCursorUsageSummary(null).metrics).toEqual([])
    expect(parseCursorUsageSummary({}).metrics).toEqual([])
    expect(parseCursorUsageSummary('nonsense').metrics).toEqual([])
  })
})

describe('mapCursorUsageToProviderBuckets', () => {
  test('maps metrics to 0–1 utilization buckets with the billing reset', () => {
    const snapshot: CursorUsageSnapshot = {
      membershipType: 'ultra',
      billingCycleEnd: '2026-08-05T04:38:09.000Z',
      metrics: [
        { labelKey: 'Included usage', percentUsed: 26.78 },
        { labelKey: 'Included API usage', percentUsed: 78.82 },
      ],
    }
    const buckets = mapCursorUsageToProviderBuckets(snapshot)
    expect(buckets).toHaveLength(2)
    expect(buckets[0]).toMatchObject({
      kind: 'custom',
      label: 'Included usage',
    })
    expect(buckets[0]?.utilization).toBeCloseTo(0.2678, 4)
    const expectedResetsAt = Math.floor(
      new Date('2026-08-05T04:38:09.000Z').getTime() / 1000,
    )
    expect(buckets[0]?.resetsAt).toBe(expectedResetsAt)
  })

  test('omits resetsAt when there is no billing cycle end', () => {
    const buckets = mapCursorUsageToProviderBuckets({
      metrics: [{ labelKey: 'Included usage', percentUsed: 50 }],
    })
    expect(buckets[0]?.resetsAt).toBeUndefined()
  })
})
