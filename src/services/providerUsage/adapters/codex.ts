import type { BucketKind, ProviderUsageBucket } from '../types.js'

const MINUTES_PER_HOUR = 60
const MINUTES_PER_FIVE_HOURS = 5 * MINUTES_PER_HOUR
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY
const MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY
const MINUTES_PER_YEAR = 365 * MINUTES_PER_DAY
const WINDOW_TOLERANCE = 0.05

export const CODEX_PRIMARY_LIMIT_LABEL = 'Primary rate limit'
export const CODEX_SECONDARY_LIMIT_LABEL = 'Secondary rate limit'

export interface CodexRateLimitWindowInput {
  usedPercent: number
  windowMinutes?: number
  resetsAt?: number
}

export interface CodexRateLimitHeaderParseOptions {
  /** Ignore named/additional limit families and read only the base Codex quota. */
  baseOnly?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Whether a valid numeric base Codex quota family is present. */
export function hasCodexBaseRateLimitHeaders(headers: Headers): boolean {
  return (
    finiteNumber(headers.get('x-codex-primary-used-percent')) !== undefined ||
    finiteNumber(headers.get('x-codex-secondary-used-percent')) !== undefined
  )
}

function approximateWindow(minutes: number, expected: number): boolean {
  return (
    minutes >= expected * (1 - WINDOW_TOLERANCE) &&
    minutes <= expected * (1 + WINDOW_TOLERANCE)
  )
}

/** Match Codex's compact labels for well-known quota window durations. */
export function getCodexWindowLabel(
  windowMinutes: number | undefined,
  isSecondary: boolean,
): string {
  if (windowMinutes !== undefined) {
    const minutes = Math.max(0, windowMinutes)
    if (approximateWindow(minutes, MINUTES_PER_FIVE_HOURS)) return '5h'
    if (approximateWindow(minutes, MINUTES_PER_DAY)) return 'daily'
    if (approximateWindow(minutes, MINUTES_PER_WEEK)) return 'weekly'
    if (approximateWindow(minutes, MINUTES_PER_MONTH)) return 'monthly'
    if (approximateWindow(minutes, MINUTES_PER_YEAR)) return 'annual'
  }
  return isSecondary ? 'secondary usage' : 'usage'
}

/** Preserve the existing broad bucket model without misclassifying windows. */
export function getCodexWindowKind(
  windowMinutes: number | undefined,
): BucketKind {
  if (windowMinutes === undefined) return 'custom'
  if (approximateWindow(windowMinutes, MINUTES_PER_FIVE_HOURS)) {
    return 'session'
  }
  if (approximateWindow(windowMinutes, MINUTES_PER_WEEK)) return 'weekly'
  return 'custom'
}

export function codexWindowToProviderBucket(
  window: CodexRateLimitWindowInput,
  label: string,
): ProviderUsageBucket {
  return {
    kind: getCodexWindowKind(window.windowMinutes),
    label,
    utilization: window.usedPercent / 100,
    ...(window.windowMinutes !== undefined
      ? { windowMinutes: window.windowMinutes }
      : {}),
    ...(window.resetsAt !== undefined && window.resetsAt > 0
      ? { resetsAt: window.resetsAt }
      : {}),
  }
}

function parseHeaderWindow(
  headers: Headers,
  prefix: string,
  role: 'primary' | 'secondary',
): CodexRateLimitWindowInput | undefined {
  const usedPercent = finiteNumber(
    headers.get(`${prefix}-${role}-used-percent`),
  )
  if (usedPercent === undefined) return undefined

  const windowMinutes = finiteNumber(
    headers.get(`${prefix}-${role}-window-minutes`),
  )
  const resetsAt = finiteNumber(headers.get(`${prefix}-${role}-reset-at`))
  const hasData =
    usedPercent !== 0 ||
    (windowMinutes !== undefined && windowMinutes !== 0) ||
    resetsAt !== undefined
  if (!hasData) return undefined

  return {
    usedPercent,
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  }
}

function normalizeLimitId(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '_')
}

/**
 * Parse the `x-codex-*-used-percent/window-minutes/reset-at` header families.
 * `null` means no Codex quota headers were present, so callers can preserve the
 * last subscription snapshot instead of treating unrelated headers as quota.
 */
export function parseCodexRateLimitHeaders(
  headers: Headers,
  options: CodexRateLimitHeaderParseOptions = {},
): ProviderUsageBucket[] | null {
  const prefixes = new Set<string>()
  headers.forEach((_value, rawName) => {
    const name = rawName.toLowerCase()
    const match =
      /^(x-codex(?:-[a-z0-9-]+)?)-(?:primary|secondary)-used-percent$/.exec(
        name,
      )
    if (match?.[1]) prefixes.add(match[1])
  })
  if (prefixes.size === 0) return null

  const orderedPrefixes = [...prefixes].sort((left, right) => {
    if (left === 'x-codex') return -1
    if (right === 'x-codex') return 1
    return left.localeCompare(right)
  })
  const buckets: ProviderUsageBucket[] = []

  for (const prefix of orderedPrefixes) {
    const limitId = normalizeLimitId(prefix.slice(2))
    const isBaseLimit = limitId === 'codex'
    if (options.baseOnly && !isBaseLimit) continue
    const limitName = headers.get(`${prefix}-limit-name`)?.trim()
    const additionalLabel = limitName || limitId

    const primary = parseHeaderWindow(headers, prefix, 'primary')
    if (primary) {
      buckets.push(
        codexWindowToProviderBucket(
          primary,
          isBaseLimit ? CODEX_PRIMARY_LIMIT_LABEL : additionalLabel,
        ),
      )
    }

    const secondary = parseHeaderWindow(headers, prefix, 'secondary')
    if (secondary) {
      buckets.push(
        codexWindowToProviderBucket(
          secondary,
          isBaseLimit ? CODEX_SECONDARY_LIMIT_LABEL : additionalLabel,
        ),
      )
    }
  }

  return buckets
}

function parseEventWindow(
  value: unknown,
): CodexRateLimitWindowInput | undefined {
  if (!isRecord(value)) return undefined
  const usedPercent = finiteNumber(value.used_percent)
  if (usedPercent === undefined) return undefined
  const windowMinutes = finiteNumber(value.window_minutes)
  const resetsAt = finiteNumber(value.reset_at)
  return {
    usedPercent,
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  }
}

/** Parse an in-stream `codex.rate_limits` event into status-line buckets. */
export function parseCodexRateLimitEvent(
  event: Record<string, unknown>,
): ProviderUsageBucket[] | undefined {
  if (event.type !== 'codex.rate_limits') return undefined

  const rawLimitId =
    (typeof event.metered_limit_name === 'string'
      ? event.metered_limit_name
      : undefined) ??
    (typeof event.limit_name === 'string' ? event.limit_name : undefined) ??
    'codex'
  const limitId = normalizeLimitId(rawLimitId)
  const isBaseLimit = limitId === 'codex'
  const limits = isRecord(event.rate_limits) ? event.rate_limits : undefined
  const buckets: ProviderUsageBucket[] = []

  const primary = parseEventWindow(limits?.primary)
  if (primary) {
    buckets.push(
      codexWindowToProviderBucket(
        primary,
        isBaseLimit ? CODEX_PRIMARY_LIMIT_LABEL : limitId,
      ),
    )
  }

  const secondary = parseEventWindow(limits?.secondary)
  if (secondary) {
    buckets.push(
      codexWindowToProviderBucket(
        secondary,
        isBaseLimit ? CODEX_SECONDARY_LIMIT_LABEL : limitId,
      ),
    )
  }

  return buckets
}
