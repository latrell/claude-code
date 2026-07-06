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
    onDemand: { enabled: true, used: 1625, limit: 300000, remaining: 298375 },
  },
}

describe('parseCursorUsageSummary', () => {
  test('extracts membership, billing cycle, and full plan usage', () => {
    const snapshot = parseCursorUsageSummary(REAL_SUMMARY)
    expect(snapshot.membershipType).toBe('ultra')
    expect(snapshot.billingCycleEnd).toBe('2026-08-05T04:38:09.000Z')
    expect(snapshot.isUnlimited).toBe(false)

    expect(snapshot.plan?.totalPercent).toBeCloseTo(26.777, 2)
    expect(snapshot.plan?.apiPercent).toBeCloseTo(78.818, 2)
    expect(snapshot.plan?.autoPercent).toBeCloseTo(0.757, 2)
    // Plan allowance dollars ("your plan includes $400 of API usage").
    expect(snapshot.plan?.usedCents).toBe(40000)
    expect(snapshot.plan?.limitCents).toBe(40000)
    expect(snapshot.plan?.bonusCents).toBe(166)
  })

  test('extracts on-demand spend with its monthly limit', () => {
    const snapshot = parseCursorUsageSummary(REAL_SUMMARY)
    expect(snapshot.onDemand?.enabled).toBe(true)
    expect(snapshot.onDemand?.usedCents).toBe(1625)
    expect(snapshot.onDemand?.limitCents).toBe(300000)
  })

  test('keeps on-demand spend when the monthly limit is unlimited (null)', () => {
    const snapshot = parseCursorUsageSummary({
      individualUsage: {
        plan: { enabled: true, totalPercentUsed: 10 },
        onDemand: { enabled: true, used: 1500, limit: null },
      },
    })
    expect(snapshot.onDemand?.enabled).toBe(true)
    expect(snapshot.onDemand?.usedCents).toBe(1500)
    expect(snapshot.onDemand?.limitCents).toBeNull()
  })

  test('preserves percentages above 100 so overage stays visible', () => {
    const snapshot = parseCursorUsageSummary({
      individualUsage: {
        plan: {
          enabled: true,
          totalPercentUsed: 137.5,
          apiPercentUsed: 212.4,
        },
      },
    })
    expect(snapshot.plan?.totalPercent).toBe(137.5)
    expect(snapshot.plan?.apiPercent).toBe(212.4)
  })

  test('clamps negative percentages to 0', () => {
    const snapshot = parseCursorUsageSummary({
      individualUsage: { plan: { enabled: true, totalPercentUsed: -3 } },
    })
    expect(snapshot.plan?.totalPercent).toBe(0)
  })

  test('omits the plan when it is disabled', () => {
    const snapshot = parseCursorUsageSummary({
      individualUsage: {
        plan: { enabled: false, totalPercentUsed: 50 },
        onDemand: { enabled: true, used: 100, limit: 3000 },
      },
    })
    expect(snapshot.plan).toBeUndefined()
    expect(snapshot.onDemand?.usedCents).toBe(100)
  })

  test('returns an empty snapshot for an unusable payload', () => {
    expect(parseCursorUsageSummary(null).plan).toBeUndefined()
    expect(parseCursorUsageSummary(null).onDemand).toBeUndefined()
    expect(parseCursorUsageSummary({}).plan).toBeUndefined()
    expect(parseCursorUsageSummary('nonsense').plan).toBeUndefined()
  })
})

describe('mapCursorUsageToProviderBuckets', () => {
  test('maps every plan dimension and on-demand spend to buckets', () => {
    const snapshot = parseCursorUsageSummary(REAL_SUMMARY)
    const buckets = mapCursorUsageToProviderBuckets(snapshot)

    const labels = buckets.map(b => b.label)
    expect(labels).toEqual([
      'Included usage',
      'Included API usage',
      'Included Auto usage',
      'On-demand usage',
    ])

    const total = buckets.find(b => b.label === 'Included usage')
    expect(total?.utilization).toBeCloseTo(0.2678, 3)
    const expectedResetsAt = Math.floor(
      new Date('2026-08-05T04:38:09.000Z').getTime() / 1000,
    )
    expect(total?.resetsAt).toBe(expectedResetsAt)

    const onDemand = buckets.find(b => b.label === 'On-demand usage')
    expect(onDemand?.utilization).toBeCloseTo(1625 / 300000, 6)
    expect(onDemand?.usedCents).toBe(1625)
    expect(onDemand?.limitCents).toBe(300000)
  })

  test('keeps utilization above 1.0 for overage', () => {
    const buckets = mapCursorUsageToProviderBuckets({
      plan: { apiPercent: 137.5 },
    })
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.label).toBe('Included API usage')
    expect(buckets[0]?.utilization).toBeCloseTo(1.375, 4)
  })

  test('maps unlimited on-demand spend without a limit', () => {
    const buckets = mapCursorUsageToProviderBuckets({
      onDemand: { enabled: true, usedCents: 1625, limitCents: null },
    })
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.utilization).toBe(0)
    expect(buckets[0]?.usedCents).toBe(1625)
    expect(buckets[0]?.limitCents).toBeUndefined()
  })

  test('omits resetsAt when there is no billing cycle end', () => {
    const snapshot: CursorUsageSnapshot = {
      plan: { totalPercent: 50 },
    }
    const buckets = mapCursorUsageToProviderBuckets(snapshot)
    expect(buckets[0]?.resetsAt).toBeUndefined()
  })
})
