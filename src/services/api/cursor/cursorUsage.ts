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

/**
 * Bucket labels pushed into the provider-usage store. The status line
 * (StatusLine.tsx / BuiltinStatusLine.tsx) matches on these exact strings.
 */
const CURSOR_BUCKET_LABELS = {
  total: 'Included usage',
  api: 'Included API usage',
  auto: 'Included Auto usage',
  onDemand: 'On-demand usage',
} as const

/** Included-in-plan usage (the Cursor client's "Included in <plan>" panel). */
export interface CursorPlanUsage {
  /**
   * Headline "Total" percentage. Intentionally NOT capped at 100 so overage
   * stays visible.
   */
  totalPercent?: number
  /** "API" share of the included quota, percent. */
  apiPercent?: number
  /** "Auto + Composer" share of the included quota, percent. */
  autoPercent?: number
  /** Plan allowance spend in USD cents (Ultra: "$400 of API usage"). */
  usedCents?: number
  /** Plan allowance in USD cents. */
  limitCents?: number
  /** Bonus allowance in USD cents (breakdown.bonus). */
  bonusCents?: number
}

/** On-demand (usage-based) spend past the included quota. */
export interface CursorOnDemandUsage {
  enabled: boolean
  /** Spend so far this cycle, USD cents. */
  usedCents?: number
  /** Monthly limit in USD cents; null when the user set it to unlimited. */
  limitCents?: number | null
}

export interface CursorUsageSnapshot {
  membershipType?: string
  subscriptionStatus?: string
  /** Billing cycle end as an ISO timestamp (used as the reset time). */
  billingCycleEnd?: string
  isUnlimited?: boolean
  plan?: CursorPlanUsage
  onDemand?: CursorOnDemandUsage
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
      breakdown?: { included?: number; bonus?: number; total?: number }
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

/**
 * Sanitize a percentage: negative values clamp to 0, but values above 100 are
 * preserved so the UI can report quota overage (e.g. "137% used").
 */
function pct(value: unknown): number | undefined {
  const n = num(value)
  if (n === undefined) return undefined
  return Math.max(0, n)
}

/**
 * Convert a /auth/usage-summary response into a normalized snapshot. Pure and
 * exported for unit testing without touching the network.
 */
export function parseCursorUsageSummary(data: unknown): CursorUsageSnapshot {
  const summary = (isRecord(data) ? data : {}) as UsageSummaryShape
  const planRaw = summary.individualUsage?.plan
  const onDemandRaw = summary.individualUsage?.onDemand

  let plan: CursorPlanUsage | undefined
  if (planRaw && planRaw.enabled !== false) {
    const total = pct(planRaw.totalPercentUsed)
    const api = pct(planRaw.apiPercentUsed)
    const auto = pct(planRaw.autoPercentUsed)
    const used = num(planRaw.used)
    const limit = num(planRaw.limit)
    const bonus = num(planRaw.breakdown?.bonus)
    const candidate: CursorPlanUsage = {
      ...(total !== undefined ? { totalPercent: total } : {}),
      ...(api !== undefined ? { apiPercent: api } : {}),
      ...(auto !== undefined ? { autoPercent: auto } : {}),
      ...(used !== undefined ? { usedCents: used } : {}),
      ...(limit !== undefined ? { limitCents: limit } : {}),
      ...(bonus !== undefined && bonus > 0 ? { bonusCents: bonus } : {}),
    }
    if (Object.keys(candidate).length > 0) plan = candidate
  }

  let onDemand: CursorOnDemandUsage | undefined
  if (isRecord(onDemandRaw)) {
    const used = num(onDemandRaw.used)
    onDemand = {
      enabled: onDemandRaw.enabled === true,
      ...(used !== undefined ? { usedCents: used } : {}),
      // null means "no monthly limit" (unlimited); undefined means unknown.
      ...(onDemandRaw.limit === null
        ? { limitCents: null }
        : num(onDemandRaw.limit) !== undefined
          ? { limitCents: num(onDemandRaw.limit) }
          : {}),
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
    ...(plan ? { plan } : {}),
    ...(onDemand ? { onDemand } : {}),
  }
}

/**
 * Map the plan/on-demand usage into the unified provider-usage store so the
 * status-line can show Cursor quota alongside other providers. Utilization is
 * intentionally allowed to exceed 1.0 so overage stays visible downstream.
 */
export function mapCursorUsageToProviderBuckets(
  snapshot: CursorUsageSnapshot,
): ProviderUsageBucket[] {
  const resetsAtRaw = snapshot.billingCycleEnd
    ? Math.floor(new Date(snapshot.billingCycleEnd).getTime() / 1000)
    : undefined
  const resetsAt =
    resetsAtRaw !== undefined && Number.isFinite(resetsAtRaw)
      ? { resetsAt: resetsAtRaw }
      : {}

  const buckets: ProviderUsageBucket[] = []
  const plan = snapshot.plan
  if (plan?.totalPercent !== undefined) {
    buckets.push({
      kind: 'custom',
      label: CURSOR_BUCKET_LABELS.total,
      utilization: plan.totalPercent / 100,
      ...resetsAt,
    })
  }
  if (plan?.apiPercent !== undefined) {
    buckets.push({
      kind: 'custom',
      label: CURSOR_BUCKET_LABELS.api,
      utilization: plan.apiPercent / 100,
      ...resetsAt,
    })
  }
  if (plan?.autoPercent !== undefined) {
    buckets.push({
      kind: 'custom',
      label: CURSOR_BUCKET_LABELS.auto,
      utilization: plan.autoPercent / 100,
      ...resetsAt,
    })
  }

  const onDemand = snapshot.onDemand
  if (onDemand?.enabled && onDemand.usedCents !== undefined) {
    const hasLimit =
      typeof onDemand.limitCents === 'number' && onDemand.limitCents > 0
    buckets.push({
      kind: 'custom',
      label: CURSOR_BUCKET_LABELS.onDemand,
      utilization: hasLimit
        ? onDemand.usedCents / (onDemand.limitCents as number)
        : 0,
      usedCents: onDemand.usedCents,
      ...(hasLimit ? { limitCents: onDemand.limitCents as number } : {}),
      ...resetsAt,
    })
  }

  return buckets
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

  const buckets = mapCursorUsageToProviderBuckets(snapshot)
  if (buckets.length > 0) {
    updateProviderBuckets('cursor', buckets)
  }

  return snapshot
}

// ---------------------------------------------------------------------------
// Status-line refresh polling
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5 * 60_000

let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * Keep the provider-usage store fresh so the status line reflects quota
 * changes (e.g. a dimension crossing 100% and on-demand spend starting to
 * accrue) during long sessions. Idempotent; each tick is a no-op unless
 * Cursor is the active provider at that moment.
 */
export function startCursorUsagePolling(): void {
  void fetchCursorUsage().catch(() => undefined)
  if (pollTimer !== null) return
  pollTimer = setInterval(() => {
    void fetchCursorUsage().catch(() => undefined)
  }, POLL_INTERVAL_MS)
  // Don't keep the event loop alive just for the poller.
  const timer = pollTimer as unknown as { unref?: () => void }
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopCursorUsagePolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
