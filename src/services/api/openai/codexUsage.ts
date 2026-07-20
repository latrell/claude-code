import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { setChatGPTSubscriptionPlan } from 'src/bootstrap/state.js'
import { logForDebugging } from 'src/utils/debug.js'
import {
  forceRefreshChatGPTAuth,
  getChatGPTAuthFilePath,
  getValidChatGPTAuth,
  isChatGPTAuthEnabled,
  type ChatGPTAuth,
} from './chatgptAuth.js'
import { getChatGPTCredentialScope } from 'src/utils/model/chatgptModels.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import { updateProviderBuckets } from 'src/services/providerUsage/store.js'
import { CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION } from './codexModels.js'
import type {
  BucketKind,
  ProviderUsageBucket,
} from 'src/services/providerUsage/types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodexRateLimitBucket {
  label: string
  /**
   * Un-concatenated base label (e.g. 'Primary rate limit'), used by the UI
   * layer as an i18n lookup key. `label` keeps the pre-formatted English
   * string for backward compatibility.
   */
  labelKey?: string
  /** Rate limit window length in minutes, when reported by the API. */
  windowMinutes?: number
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
// Plan cache (persisted to disk, keyed by accountId, TTL-guarded)
// ---------------------------------------------------------------------------

/**
 * Maximum age of a cached plan before a network refresh is required.
 * 6 hours balances freshness (subscription changes are rare) against
 * startup speed (no network round-trip for most sessions).
 */
const PLAN_CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface PlanCacheEntry {
  accountId: string
  plan: string | null
  updatedAt: number
}

function getPlanCachePath(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  return join(dir.normalize('NFC'), 'openai-chatgpt-plan-cache.json')
}

function getClaudeConfigDir(): string {
  return (
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  ).normalize('NFC')
}

function readPlanCacheSync(): PlanCacheEntry | null {
  try {
    const raw = readFileSync(getPlanCachePath(), 'utf8')
    const parsed = JSON.parse(raw) as PlanCacheEntry
    if (
      parsed &&
      typeof parsed.accountId === 'string' &&
      typeof parsed.updatedAt === 'number'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function writePlanCacheSync(
  accountId: string,
  plan: string | null | undefined,
): void {
  const entry: PlanCacheEntry = {
    accountId,
    plan: plan ?? null,
    updatedAt: Date.now(),
  }
  try {
    mkdirSync(getClaudeConfigDir(), { recursive: true })
    writeFileSync(getPlanCachePath(), `${JSON.stringify(entry)}\n`, {
      mode: 0o600,
    })
  } catch {
    // Cache write failures should never block startup or usage display.
  }
}

/**
 * Extract accountId from the on-disk ChatGPT auth file without touching
 * the network or the token-refresh machinery. Used at startup so the plan
 * cache can be validated synchronously before the first render.
 */
function extractAccountIdFromAuthFileSync(
  credentialScope?: string,
): string | undefined {
  try {
    const raw = readFileSync(getChatGPTAuthFilePath(credentialScope), 'utf8')
    const stored = JSON.parse(raw) as {
      tokens?: { account_id?: string; id_token?: string; access_token?: string }
    }
    const tokens = stored.tokens
    if (!tokens) return undefined

    // Direct account_id field (set during login)
    if (typeof tokens.account_id === 'string' && tokens.account_id.length > 0) {
      return tokens.account_id
    }

    // Fallback: decode JWT payload from id_token or access_token
    for (const token of [tokens.id_token, tokens.access_token]) {
      if (typeof token !== 'string') continue
      try {
        const [, payload] = token.split('.')
        if (!payload) continue
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(
          normalized.length + ((4 - (normalized.length % 4)) % 4),
          '=',
        )
        const json = Buffer.from(padded, 'base64').toString('utf8')
        const claims = JSON.parse(json) as Record<string, unknown>
        const nested = claims['https://api.openai.com/auth']
        const authClaims = (
          nested && typeof nested === 'object' ? nested : claims
        ) as Record<string, unknown>
        const accountId =
          authClaims.chatgpt_account_id ??
          authClaims.chatgpt_account_user_id ??
          authClaims.account_id
        if (typeof accountId === 'string' && accountId.length > 0) {
          return accountId
        }
      } catch {
        // Continue to next token
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Initialize the ChatGPT subscription plan for the current session.
 *
 * Strategy:
 * 1. Read the on-disk auth file to extract the current accountId (sync).
 * 2. Read the plan cache (sync).
 * 3. If the cached entry matches the current accountId AND is within
 *    PLAN_CACHE_TTL_MS, call setChatGPTSubscriptionPlan() immediately and
 *    return `{ usedCache: true }` — the caller can fire-and-forget a
 *    background refresh.
 * 4. Otherwise return `{ usedCache: false }` — the caller should await
 *    fetchCodexUsage() before proceeding so the context window and startup
 *    billing label are accurate on the first render.
 *
 * This is intentionally synchronous for the cache-hit path so the logo /
 * billing label is correct without blocking the event loop. Cache-miss and
 * expired-cache callers pay the network cost once at startup (swallowing
 * failures so auth/network errors never prevent CLI launch).
 */
export function initializeChatGPTPlan(): { usedCache: boolean } {
  if (!isChatGPTAuthEnabled()) return { usedCache: false }

  const accountId = extractAccountIdFromAuthFileSync(
    getChatGPTCredentialScope(),
  )
  if (!accountId) return { usedCache: false }

  const entry = readPlanCacheSync()
  if (
    entry &&
    entry.accountId === accountId &&
    entry.plan &&
    Date.now() - entry.updatedAt < PLAN_CACHE_TTL_MS
  ) {
    setChatGPTSubscriptionPlan(entry.plan)
    logForDebugging(`[codexUsage] plan loaded from cache: ${entry.plan}`)
    return { usedCache: true }
  }

  return { usedCache: false }
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
    labelKey: label,
    ...(effectiveMins ? { windowMinutes: effectiveMins } : {}),
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
  auth: ChatGPTAuth,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
      'User-Agent': 'codex-cli',
      originator: 'claude-code-best',
      version: CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION,
    }
    if (auth.accountId) {
      headers['ChatGPT-Account-Id'] = auth.accountId
    }
    if (auth.isFedRAMP) {
      headers['X-OpenAI-Fedramp'] = 'true'
    }

    return await fetch(`${BASE_URL}${path}`, {
      ...getProxyFetchOptions({ forAnthropicAPI: false }),
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function safeFetchJSON(
  path: string,
  auth: ChatGPTAuth,
  credentialScope: string | undefined,
  signal: AbortSignal | undefined,
  refreshAuth: (
    credentialScope?: string,
    rejectedAccessToken?: string,
    expectedAccountId?: string,
    expectedCredentialId?: string,
  ) => Promise<ChatGPTAuth>,
): Promise<unknown | null> {
  try {
    let currentAuth = auth
    let res = await codexFetch(path, currentAuth, signal)
    if (res.status === 401 && !signal?.aborted) {
      await res.body?.cancel().catch(() => undefined)
      currentAuth = await refreshAuth(
        credentialScope,
        currentAuth.accessToken,
        currentAuth.accountId,
        currentAuth.credentialId,
      )
      res = await codexFetch(path, currentAuth, signal)
    }
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
// Codex → ProviderUsageBucket mapping
// ---------------------------------------------------------------------------

/**
 * Map ChatGPT Codex rate-limit buckets into the unified ProviderUsageBucket
 * shape so the status-line can display them alongside Anthropic/OpenAI data.
 *
 * Kind heuristic:
 * - windowMinutes <= 360 (6 h) → `session`
 * - windowMinutes >= 1440 (1 d) → `weekly`
 * - otherwise → `custom`
 *
 * @param rateLimits Raw Codex rate-limit buckets from the /wham/usage API.
 * @returns ProviderUsageBucket[] suitable for the provider usage store.
 */
export function mapCodexLimitsToProviderBuckets(
  rateLimits: CodexRateLimitBucket[],
): ProviderUsageBucket[] {
  const buckets: ProviderUsageBucket[] = []
  for (const rl of rateLimits) {
    const utilization = rl.limit > 0 ? rl.used / rl.limit : 0
    let kind: BucketKind = 'custom'
    if (rl.windowMinutes !== undefined && rl.windowMinutes > 0) {
      if (rl.windowMinutes <= 360) {
        kind = 'session'
      } else if (rl.windowMinutes >= 1440) {
        kind = 'weekly'
      }
    }
    buckets.push({
      kind,
      // Prefer the un-concatenated labelKey so the display is cleaner;
      // if absent, use the pre-formatted label from the API response.
      label: rl.labelKey ?? rl.label,
      utilization,
      ...(rl.resetsAtSeconds > 0 ? { resetsAt: rl.resetsAtSeconds } : {}),
    })
  }
  return buckets
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
 *
 * Side effect: on success, feeds rate-limit buckets into the provider usage
 * store so the status-line can display them without relying on
 * x-ratelimit-* response headers (which the Codex backend does not emit).
 */
let activeUsageGeneration = 0

/**
 * Prevent every usage request started before this call from publishing into
 * the process-global plan / status-line stores.
 *
 * Main-provider activation must call this synchronously at the provider switch
 * boundary, including when switching away from ChatGPT. Merely clearing the
 * provider-usage store is insufficient: an older in-flight ChatGPT request can
 * otherwise repopulate it after the switch.
 */
export function invalidateCodexUsagePublication(): void {
  activeUsageGeneration += 1
  setChatGPTSubscriptionPlan(null)
}

export async function fetchCodexUsage(
  signal?: AbortSignal,
  credentialScope?: string,
  authOverrides?: {
    isAuthEnabled?: () => boolean
    getAuth?: (credentialScope?: string) => Promise<ChatGPTAuth>
    refreshAuth?: (
      credentialScope?: string,
      rejectedAccessToken?: string,
      expectedAccountId?: string,
      expectedCredentialId?: string,
    ) => Promise<ChatGPTAuth>
    /** False for background/scoped snapshots that must not replace main UI state. */
    publish?: boolean
  },
): Promise<CodexUsageSnapshot | null> {
  const shouldPublish = authOverrides?.publish ?? true
  // Reserve publication order before the first await. Auth resolution may
  // refresh an expired OAuth token over the network; if an older account's
  // refresh finishes after a newer account switch, completion order must not
  // make the older request authoritative again.
  if (shouldPublish) activeUsageGeneration += 1
  const requestGeneration = activeUsageGeneration

  if (!(authOverrides?.isAuthEnabled ?? isChatGPTAuthEnabled)()) return null

  const resolvedCredentialScope = credentialScope ?? getChatGPTCredentialScope()

  let auth: ChatGPTAuth
  try {
    auth = await (authOverrides?.getAuth ?? getValidChatGPTAuth)(
      resolvedCredentialScope,
    )
  } catch {
    logForDebugging('[codexUsage] ChatGPT auth not available')
    return null
  }

  const accountId = auth.accountId

  const [usageJSON, profileJSON] = await Promise.all([
    safeFetchJSON(
      '/wham/usage',
      auth,
      resolvedCredentialScope,
      signal,
      authOverrides?.refreshAuth ?? forceRefreshChatGPTAuth,
    ),
    safeFetchJSON(
      '/wham/profiles/me',
      auth,
      resolvedCredentialScope,
      signal,
      authOverrides?.refreshAuth ?? forceRefreshChatGPTAuth,
    ),
  ])

  const { account, rateLimits } = usageJSON ? parseUsageResponse(usageJSON) : {}
  const { tokenUsage } = profileJSON ? parseProfileResponse(profileJSON) : {}

  if (shouldPublish && activeUsageGeneration === requestGeneration) {
    // Cache the subscription plan so getContextWindowForModel can auto-adapt
    // the context window for the active ChatGPT Codex account.
    setChatGPTSubscriptionPlan(account?.subscriptionPlan)

    // Persist only the active account. An older account's delayed request must
    // not replace the plan cache after a connection switch.
    if (accountId) {
      writePlanCacheSync(accountId, account?.subscriptionPlan)
    }

    // A successful usage response is authoritative for ChatGPT subscription
    // limits. Replace the whole snapshot, including with an empty list, so a
    // removed window cannot linger in the status line.
    if (usageJSON !== null) {
      updateProviderBuckets(
        'openai',
        rateLimits ? mapCodexLimitsToProviderBuckets(rateLimits) : [],
      )
    }
  }

  if (!account && !rateLimits && !tokenUsage) {
    logForDebugging('[codexUsage] no usable data from online API')
    return null
  }

  return { account, rateLimits, tokenUsage }
}
