import { logForDebugging } from 'src/utils/debug.js'
import { getValidChatGPTAuth, isChatGPTAuthEnabled } from './chatgptAuth.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodexRateLimitBucket {
  label: string
  used: number
  limit: number
  remaining: number
  resetsAtSeconds: number
}

export interface CodexTokenUsage {
  tokensUsed: number
  date: string
}

export interface CodexAccount {
  subscriptionPlan?: string
  accountId?: string
}

export interface CodexUsageSnapshot {
  account?: CodexAccount
  rateLimits?: CodexRateLimitBucket[]
  tokenUsage?: CodexTokenUsage
}

// ---------------------------------------------------------------------------
// Online API response shapes (internal)
// ---------------------------------------------------------------------------

interface UsageWindowShape {
  used_percent?: number
  window_minutes?: number
  limit_window_seconds?: number
  reset_at?: number
  resets_at?: number
}

interface UsageResponseShape {
  plan_type?: string
  rate_limit?: {
    primary_window?: UsageWindowShape
    secondary_window?: UsageWindowShape
  }
  additional_rate_limits?: Array<{
    label?: string
    limit_name?: string
    primary_window?: UsageWindowShape
    secondary_window?: UsageWindowShape
    rate_limit?: {
      primary_window?: UsageWindowShape
      secondary_window?: UsageWindowShape
    }
  }>
}

interface DailyBucketShape {
  start_date?: string
  tokens?: number
}

interface ProfileResponseShape {
  summary?: {
    lifetime_tokens?: number | null
    peak_daily_tokens?: number | null
    longest_running_turn_sec?: number | null
    current_streak_days?: number | null
    longest_streak_days?: number | null
  }
  daily_usage_buckets?: DailyBucketShape[] | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://chatgpt.com/backend-api'
const FETCH_TIMEOUT_MS = 15_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function windowToBucket(
  windowShape: UsageWindowShape,
  label: string,
): CodexRateLimitBucket | null {
  const usedPercent = coerceNumber(windowShape.used_percent, NaN)
  if (!Number.isFinite(usedPercent)) return null

  // reset field: prefer `reset_at` (live API), fall back to `resets_at` (docs)
  const resetAtValue = coerceNumber(windowShape.reset_at, NaN)
  const resetsAt = Number.isFinite(resetAtValue)
    ? resetAtValue
    : coerceNumber(windowShape.resets_at, 0)

  // Window duration: prefer `window_minutes`, fall back to
  // `limit_window_seconds` converted to minutes
  let effectiveMins: number | undefined = windowShape.window_minutes
  if (effectiveMins === undefined) {
    const secs = coerceNumber(windowShape.limit_window_seconds, NaN)
    if (Number.isFinite(secs) && secs > 0) {
      effectiveMins = Math.round(secs / 60)
    }
  }

  return {
    label: effectiveMins ? `${label} (${effectiveMins}min)` : label,
    used: usedPercent,
    limit: 100,
    remaining: Math.max(0, 100 - usedPercent),
    resetsAtSeconds: resetsAt,
  }
}

function parseUsageResponse(data: unknown): {
  account?: CodexAccount
  rateLimits?: CodexRateLimitBucket[]
} {
  if (!isRecord(data)) return {}

  const account: CodexAccount = {}
  if (typeof data.plan_type === 'string') {
    account.subscriptionPlan = data.plan_type
  }

  const buckets: CodexRateLimitBucket[] = []

  const rateLimit = data.rate_limit
  if (isRecord(rateLimit)) {
    const pw = rateLimit.primary_window
    if (isRecord(pw)) {
      const b = windowToBucket(
        pw as unknown as UsageWindowShape,
        'Primary rate limit',
      )
      if (b) buckets.push(b)
    }
    const sw = rateLimit.secondary_window
    if (isRecord(sw)) {
      const b = windowToBucket(
        sw as unknown as UsageWindowShape,
        'Secondary rate limit',
      )
      if (b) buckets.push(b)
    }
  }

  const additional = data.additional_rate_limits
  if (Array.isArray(additional)) {
    for (const item of additional) {
      if (!isRecord(item)) continue

      // Label: prefer `limit_name` (live API), fall back to `label` (docs)
      const itemLabel =
        typeof item.limit_name === 'string'
          ? item.limit_name
          : typeof item.label === 'string'
            ? item.label
            : 'Rate limit'

      // Real API nests windows under item.rate_limit; fall back to legacy
      // shape where windows sit directly on the item.
      const windowsParent = isRecord(item.rate_limit) ? item.rate_limit : item

      const pw = windowsParent.primary_window
      if (isRecord(pw)) {
        const b = windowToBucket(pw as unknown as UsageWindowShape, itemLabel)
        if (b) buckets.push(b)
      }
      const sw = windowsParent.secondary_window
      if (isRecord(sw)) {
        const b = windowToBucket(sw as unknown as UsageWindowShape, itemLabel)
        if (b) buckets.push(b)
      }
    }
  }

  return {
    ...(account.subscriptionPlan ? { account } : {}),
    ...(buckets.length > 0 ? { rateLimits: buckets } : {}),
  }
}

function parseProfileResponse(data: unknown): {
  tokenUsage?: CodexTokenUsage
} {
  if (!isRecord(data)) return {}

  // Live API returns { profile, stats: { daily_usage_buckets }, metadata };
  // docs report a flatter shape with daily_usage_buckets at top level.
  let buckets: unknown = null
  const statsNode = data.stats
  if (isRecord(statsNode)) {
    buckets = statsNode.daily_usage_buckets
  }
  if (!Array.isArray(buckets) || (buckets as Array<unknown>).length === 0) {
    buckets = data.daily_usage_buckets
  }

  if (!Array.isArray(buckets) || buckets.length === 0) return {}

  const validBuckets = buckets
    .filter(
      (b): b is DailyBucketShape & { start_date: string; tokens: number } => {
        if (!isRecord(b)) return false
        const tokens = coerceNumber(b.tokens, NaN)
        return Number.isFinite(tokens) && typeof b.start_date === 'string'
      },
    )
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))

  const latest = validBuckets[0]
  if (!latest) return {}

  return {
    tokenUsage: {
      tokensUsed: coerceNumber(latest.tokens, 0),
      date: latest.start_date ?? new Date().toISOString().slice(0, 10),
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP fetch helper
// ---------------------------------------------------------------------------

async function codexFetch(
  path: string,
  token: string,
  accountId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'codex-cli',
    }
    if (accountId) {
      headers['ChatGPT-Account-Id'] = accountId
    }

    return await fetch(`${BASE_URL}${path}`, {
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function safeFetchJSON(
  path: string,
  token: string,
  accountId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown | null> {
  try {
    const res = await codexFetch(path, token, accountId, signal)
    if (!res.ok) {
      logForDebugging(`[codexUsage] ${path} returned HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as unknown
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      logForDebugging(`[codexUsage] ${path} request aborted`)
    } else {
      logForDebugging(`[codexUsage] ${path} fetch failed: ${String(err)}`)
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch ChatGPT Codex usage snapshot from the online HTTP API.
 *
 * Calls GET /backend-api/wham/usage and GET /backend-api/wham/profiles/me.
 * Requires OPENAI_AUTH_MODE=chatgpt and a valid ChatGPT access token.
 * Returns null on any failure so that /usage keeps its existing behaviour.
 */
export async function fetchCodexUsage(
  signal?: AbortSignal,
  _credentialScope?: string,
): Promise<CodexUsageSnapshot | null> {
  if (!isChatGPTAuthEnabled()) return null

  let auth: { accessToken: string; accountId?: string }
  try {
    auth = await getValidChatGPTAuth()
  } catch {
    logForDebugging('[codexUsage] ChatGPT auth not available')
    return null
  }

  const token = auth.accessToken
  const accountId = auth.accountId

  const [usageJSON, profileJSON] = await Promise.all([
    safeFetchJSON('/wham/usage', token, accountId, signal),
    safeFetchJSON('/wham/profiles/me', token, accountId, signal),
  ])

  const { account, rateLimits } = usageJSON ? parseUsageResponse(usageJSON) : {}
  const { tokenUsage } = profileJSON ? parseProfileResponse(profileJSON) : {}

  if (!account && !rateLimits && !tokenUsage) {
    logForDebugging('[codexUsage] no usable data from online API')
    return null
  }

  return { account, rateLimits, tokenUsage }
}
