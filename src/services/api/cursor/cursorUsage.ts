/**
 * Cursor subscription usage.
 *
 * Reads the same undocumented endpoints the Cursor dashboard/status bar use to
 * show plan quota (verified live against api2.cursor.sh):
 *
 *   GET  /auth/usage-summary        → billing cycle, membershipType, plan +
 *                                     on-demand usage (amounts in USD cents)
 *   GET  /auth/full_stripe_profile  → subscriptionStatus (active/trialing/…)
 *
 * Both sit behind the same HTTP/2-only ALB as the chat endpoint, so requests
 * are pinned to h2 (see client.ts cursorTransportOptions) and carry the Cursor
 * IDE identity headers (checksum etc.).
 *
 * Returns null on any failure so /usage keeps working for non-Cursor sessions.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo (and community
 * reverse-engineering of the Cursor dashboard API).
 */

import { getProxyFetchOptions } from '../../../utils/proxy.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getAPIProvider } from '../../../utils/model/providers.js'
import { updateProviderBuckets } from '../../providerUsage/store.js'
import type { ProviderUsageBucket } from '../../providerUsage/types.js'
import { resolveCursorCredentials } from './auth.js'
import { buildCursorModelsHeaders } from './clientPolicy.js'
import { cursorTransportOptions } from './client.js'

const DEFAULT_BASE_URL = 'https://api2.cursor.sh'
const FETCH_TIMEOUT_MS = 10_000

/** A single usage dimension (plan / api / auto / on-demand). */
export interface CursorUsageMetric {
  /** i18n label key for the bar title. */
  labelKey: string
  /** Percentage used, 0–100. */
  percentUsed: number
  /** Spent amount in USD cents, when the endpoint reports one. */
  usedCents?: number
  /** Limit in USD cents, when the endpoint reports one. */
  limitCents?: number
}

export interface CursorUsageSnapshot {
  membershipType?: string
  subscriptionStatus?: string
  /** Billing cycle end as an ISO timestamp (used as the reset time). */
  billingCycleEnd?: string
  isUnlimited?: boolean
  metrics: CursorUsageMetric[]
}

// ---------------------------------------------------------------------------
// Response shapes (partial — only the fields we consume)
// ---------------------------------------------------------------------------

interface UsageSummaryShape {
  billingCycleStart?: string
  billingCycleEnd?: string
  membershipType?: string
  isUnlimited?: boolean
  individualUsage?: {
    plan?: {
      enabled?: boolean
      used?: number
      limit?: number
      remaining?: number
      autoPercentUsed?: number
      apiPercentUsed?: number
      totalPercentUsed?: number
    }
    onDemand?: {
      enabled?: boolean
      used?: number
      limit?: number | null
    }
  }
}

interface StripeProfileShape {
  membershipType?: string
  subscriptionStatus?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clampPercent(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return Math.max(0, Math.min(100, value))
}

/**
 * Convert a /auth/usage-summary response into a normalized snapshot. Pure and
 * exported for unit testing without touching the network.
 */
export function parseCursorUsageSummary(data: unknown): CursorUsageSnapshot {
  const summary = (isRecord(data) ? data : {}) as UsageSummaryShape
  const plan = summary.individualUsage?.plan
  const onDemand = summary.individualUsage?.onDemand
  const metrics: CursorUsageMetric[] = []

  // Included-usage percentages mirror Cursor's own dashboard wording
  // ("You've used 27% of your included total usage", etc). Their basis is NOT
  // the plan.used/plan.limit dollar fields (which track only the base
  // allowance), so these are shown as percentages WITHOUT a dollar subtext —
  // pairing "27%" with "$400 / $400 spent" reads as contradictory.
  if (plan?.enabled !== false) {
    const total = clampPercent(num(plan?.totalPercentUsed))
    if (total !== undefined) {
      metrics.push({ labelKey: 'Included usage', percentUsed: total })
    }
    const api = clampPercent(num(plan?.apiPercentUsed))
    if (api !== undefined) {
      metrics.push({ labelKey: 'Included API usage', percentUsed: api })
    }
    const auto = clampPercent(num(plan?.autoPercentUsed))
    if (auto !== undefined) {
      metrics.push({ labelKey: 'Included Auto usage', percentUsed: auto })
    }
  }

  // On-demand (usage-based) spend: only meaningful when enabled with a limit.
  if (onDemand?.enabled) {
    const used = num(onDemand.used)
    const limit = num(onDemand.limit)
    if (used !== undefined && limit !== undefined && limit > 0) {
      metrics.push({
        labelKey: 'On-demand usage',
        percentUsed: clampPercent((used / limit) * 100) ?? 0,
        usedCents: used,
        limitCents: limit,
      })
    }
  }

  return {
    ...(summary.membershipType
      ? { membershipType: summary.membershipType }
      : {}),
    ...(summary.billingCycleEnd
      ? { billingCycleEnd: summary.billingCycleEnd }
      : {}),
    ...(typeof summary.isUnlimited === 'boolean'
      ? { isUnlimited: summary.isUnlimited }
      : {}),
    metrics,
  }
}

/**
 * Map the plan/on-demand metrics into the unified provider-usage store so the
 * status-line can show Cursor quota alongside other providers.
 */
export function mapCursorUsageToProviderBuckets(
  snapshot: CursorUsageSnapshot,
): ProviderUsageBucket[] {
  const resetsAt = snapshot.billingCycleEnd
    ? Math.floor(new Date(snapshot.billingCycleEnd).getTime() / 1000)
    : undefined
  return snapshot.metrics.map(metric => ({
    kind: 'custom' as const,
    label: metric.labelKey,
    utilization: metric.percentUsed / 100,
    ...(resetsAt && Number.isFinite(resetsAt) ? { resetsAt } : {}),
  }))
}

function baseUrl(env: Record<string, string | undefined>): string {
  return (env.CURSOR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

async function fetchJSON(
  url: string,
  headers: Record<string, string>,
  env: Record<string, string | undefined>,
  signal: AbortSignal | undefined,
): Promise<unknown | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      ...cursorTransportOptions(env),
      ...getProxyFetchOptions({ forAnthropicAPI: false }),
    } as RequestInit)
    if (!res.ok) {
      logForDebugging(`[cursorUsage] ${url} returned HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as unknown
  } catch (err) {
    logForDebugging(`[cursorUsage] ${url} fetch failed: ${String(err)}`)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch the Cursor subscription usage snapshot. Only runs when Cursor is the
 * active provider; returns null otherwise or on any failure.
 *
 * Side effect: on success, feeds usage metrics into the provider usage store
 * so the status-line can display them.
 */
export async function fetchCursorUsage(
  signal?: AbortSignal,
): Promise<CursorUsageSnapshot | null> {
  if (getAPIProvider() !== 'cursor') return null

  let credentials
  try {
    credentials = await resolveCursorCredentials()
  } catch {
    logForDebugging('[cursorUsage] Cursor credentials not available')
    return null
  }

  const env = process.env
  const headers = buildCursorModelsHeaders(credentials, env)
  const base = baseUrl(env)

  const [summaryJSON, profileJSON] = await Promise.all([
    fetchJSON(`${base}/auth/usage-summary`, headers, env, signal),
    fetchJSON(`${base}/auth/full_stripe_profile`, headers, env, signal),
  ])

  if (!summaryJSON && !profileJSON) {
    logForDebugging('[cursorUsage] no usable data from Cursor API')
    return null
  }

  const snapshot = parseCursorUsageSummary(summaryJSON ?? {})

  const profile = (
    isRecord(profileJSON) ? profileJSON : {}
  ) as StripeProfileShape
  if (profile.subscriptionStatus) {
    snapshot.subscriptionStatus = profile.subscriptionStatus
  }
  if (!snapshot.membershipType && profile.membershipType) {
    snapshot.membershipType = profile.membershipType
  }

  if (snapshot.metrics.length > 0) {
    updateProviderBuckets('cursor', mapCursorUsageToProviderBuckets(snapshot))
  }

  return snapshot
}
