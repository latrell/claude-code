/**
 * Cursor OAuth (PKCE deep-link) login flow.
 *
 * Cursor's desktop "Sign in" is an OAuth 2.0 PKCE deep-link flow with polling
 * and no local callback server — structurally the same shape as the ChatGPT
 * Codex device flow (see openai/chatgptAuth.ts), which this module mirrors:
 *
 *   1. Generate a PKCE verifier + SHA-256 challenge and a random uuid locally.
 *   2. Open https://www.cursor.com/loginDeepControl?challenge=&uuid=&mode=login
 *      in the browser; the user confirms the sign-in there.
 *   3. Poll GET https://api2.cursor.sh/auth/poll?uuid=&verifier= until it
 *      returns { accessToken, refreshToken, authId } (404 = not confirmed yet).
 *   4. Persist tokens to cursor-auth.<scope>.json (0600), refreshing the short
 *      lived access JWT via POST https://api2.cursor.sh/oauth/token when needed.
 *
 * The protocol is undocumented and reverse-engineered from open-source projects
 * (eisbaw/cursor_api_demo and others); endpoints/fields may change with Cursor
 * releases. This is for study/research use — respect Cursor's Terms of Service.
 */

import { chmod, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { randomBytes, createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getCursorClientVersion } from './clientPolicy.js'

/** Browser page the user visits to confirm the sign-in. */
const CURSOR_LOGIN_ISSUER = 'https://www.cursor.com'
/** REST base for the poll + token-refresh endpoints. */
const CURSOR_API_BASE = 'https://api2.cursor.sh'
/** Auth0 client id used by Cursor for the refresh_token grant. */
const CURSOR_OAUTH_CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'
const AUTH_FILE = 'cursor-auth.json'
/** Refresh the access JWT this long before its exp. */
const REFRESH_SKEW_MS = 10 * 60 * 1000
/** Poll interval and overall deadline. */
const POLL_INTERVAL_MS = 2000
const POLL_DEADLINE_MS = 10 * 60 * 1000

/** Marks a cursor connection whose credentials come from the OAuth flow. */
export const CURSOR_OAUTH_AUTH_MODE = 'oauth'

export type CursorDeviceCode = {
  /** URL to open in the browser for the user to confirm the login. */
  verificationUrl: string
  uuid: string
  verifier: string
  intervalMs: number
}

export type CursorOAuthTokens = {
  accessToken: string
  refreshToken: string
  authId?: string
  userId?: string
  /** Stable machine id generated at login, reused across refreshes. */
  machineId?: string
  lastRefresh?: string
}

/** Resolved credentials handed to the Cursor API client. */
export type CursorOAuth = {
  accessToken: string
  machineId: string
  userId?: string
}

type StoredAuthFile = {
  auth_mode?: string
  tokens?: {
    access_token?: string
    refresh_token?: string
    auth_id?: string
    user_id?: string
    machine_id?: string
  }
  last_refresh?: string
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * PKCE pair. challenge = base64url(sha256(ASCII(verifier))), matching the
 * S256 method the Cursor login page validates against.
 */
function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(
    createHash('sha256').update(verifier).digest(),
  )
  return { verifier, challenge }
}

/** 64-hex machine id, matching the shape Cursor stores as serviceMachineId. */
function generateMachineId(): string {
  return randomBytes(32).toString('hex')
}

// ---------------------------------------------------------------------------
// Credential file storage (cursor-auth.<scope>.json)
// ---------------------------------------------------------------------------

function authFilePath(scope?: string): string {
  if (!scope || scope === 'default') {
    return join(getClaudeConfigHomeDir(), AUTH_FILE)
  }
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '-')
  return join(getClaudeConfigHomeDir(), `cursor-auth.${safeScope}.json`)
}

/**
 * On-disk path of a Cursor OAuth credential file for a scope. Exposed for the
 * connection registry / diagnostics.
 */
export function getCursorOAuthFilePath(scope?: string): string {
  return authFilePath(scope)
}

async function readStoredAuth(path: string): Promise<CursorOAuthTokens | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as StoredAuthFile
    const tokens = parsed.tokens
    const accessToken = tokens?.access_token
    const refreshToken = tokens?.refresh_token
    if (!accessToken || !refreshToken) return null
    return {
      accessToken,
      refreshToken,
      authId: tokens.auth_id,
      userId: tokens.user_id,
      machineId: tokens.machine_id,
      lastRefresh: parsed.last_refresh,
    }
  } catch {
    return null
  }
}

async function saveStoredAuth(
  tokens: CursorOAuthTokens,
  scope?: string,
): Promise<void> {
  const path = authFilePath(scope)
  await mkdir(getClaudeConfigHomeDir(), { recursive: true })
  const body: StoredAuthFile = {
    auth_mode: 'cursor-oauth',
    tokens: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      auth_id: tokens.authId,
      user_id: tokens.userId,
      machine_id: tokens.machineId,
    },
    last_refresh: new Date().toISOString(),
  }
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// JWT helpers (access token expiry + user id)
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.')
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const value = JSON.parse(json) as unknown
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

/**
 * Cursor's poll response returns authId as `<provider>|<userId>` (e.g.
 * `google-oauth2|user_01ABC`). Extract the userId half for the checksum's
 * userId::token prefix when the JWT itself lacks a usable claim.
 */
function extractUserId(
  authId?: string,
  accessToken?: string,
): string | undefined {
  if (authId) {
    const parts = authId.split('|')
    if (parts.length > 1 && parts[1]) return parts[1]
  }
  if (accessToken) {
    const sub = decodeJwtPayload(accessToken)?.sub
    if (typeof sub === 'string' && sub.length > 0) return sub
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Device flow
// ---------------------------------------------------------------------------

/**
 * Begin the Cursor login: generate PKCE + uuid and build the browser URL.
 * Synchronous — Cursor generates the challenge client-side, so no server
 * round-trip is needed before opening the browser.
 */
export function startCursorDeviceLogin(): CursorDeviceCode {
  const { verifier, challenge } = generatePkcePair()
  const uuid = randomUUID()
  const url = new URL(`${CURSOR_LOGIN_ISSUER}/loginDeepControl`)
  url.searchParams.set('challenge', challenge)
  url.searchParams.set('uuid', uuid)
  url.searchParams.set('mode', 'login')
  return {
    verificationUrl: url.toString(),
    uuid,
    verifier,
    intervalMs: POLL_INTERVAL_MS,
  }
}

function pollHeaders(
  env: Record<string, string | undefined>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': `Cursor/${getCursorClientVersion(env)}`,
  }
}

/**
 * Poll the Cursor auth endpoint until the browser sign-in completes. Returns
 * { accessToken, refreshToken, authId }. 404 means "not confirmed yet".
 */
async function pollForTokens(
  deviceCode: CursorDeviceCode,
  signal?: AbortSignal,
  env: Record<string, string | undefined> = process.env,
): Promise<CursorOAuthTokens> {
  type PollResponse = {
    accessToken?: string
    refreshToken?: string
    authId?: string
  }
  const started = Date.now()
  const url = `${CURSOR_API_BASE}/auth/poll?uuid=${encodeURIComponent(
    deviceCode.uuid,
  )}&verifier=${encodeURIComponent(deviceCode.verifier)}`

  while (Date.now() - started < POLL_DEADLINE_MS) {
    if (signal?.aborted) throw new Error('Cursor login cancelled')
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: pollHeaders(env),
        signal,
      })
    } catch (err) {
      if (signal?.aborted) throw new Error('Cursor login cancelled')
      // Transient network error — keep polling until the deadline.
      logForDebugging(`[Cursor] auth poll error: ${String(err)}`, {
        level: 'error',
      })
      await sleep(deviceCode.intervalMs)
      continue
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as PollResponse
      if (data.accessToken && data.refreshToken) {
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          authId: data.authId,
          userId: extractUserId(data.authId, data.accessToken),
          machineId: generateMachineId(),
        }
      }
    } else if (res.status !== 404 && res.status >= 400 && res.status < 500) {
      // 404 = pending confirmation. Other 4xx that isn't rate limiting is a
      // hard failure (bad request / expired challenge).
      if (res.status !== 429) {
        throw new Error(`Cursor login failed (${res.status})`)
      }
    }
    await sleep(deviceCode.intervalMs)
  }
  throw new Error('Cursor login timed out after 10 minutes')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Refresh the short-lived access JWT using the refresh token. Cursor keeps the
 * same refresh token and returns a new access_token; shouldLogout=true means
 * the refresh token is no longer valid and the user must sign in again.
 */
async function refreshTokens(
  tokens: CursorOAuthTokens,
): Promise<CursorOAuthTokens> {
  type RefreshResponse = {
    access_token?: string
    id_token?: string
    shouldLogout?: boolean
  }
  const res = await fetch(`${CURSOR_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CURSOR_OAUTH_CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }),
  })
  if (!res.ok) {
    throw new Error(`Cursor token refresh failed (${res.status})`)
  }
  const data = (await res.json()) as RefreshResponse
  if (data.shouldLogout || !data.access_token) {
    throw new Error(
      'Cursor session expired. Re-add this connection via /connect to sign in again.',
    )
  }
  return {
    ...tokens,
    accessToken: data.access_token,
    userId: tokens.userId ?? extractUserId(tokens.authId, data.access_token),
  }
}

/**
 * Complete the login: poll for tokens, then persist them under the scope.
 */
export async function completeCursorDeviceLogin(
  deviceCode: CursorDeviceCode,
  signal?: AbortSignal,
  scope?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<CursorOAuthTokens> {
  const tokens = await pollForTokens(deviceCode, signal, env)
  await saveStoredAuth(tokens, scope)
  return tokens
}

// ---------------------------------------------------------------------------
// Consumption (client credential resolution)
// ---------------------------------------------------------------------------

/** Whether a cursor connection is configured to use the OAuth credential flow. */
export function isCursorOAuthEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CURSOR_AUTH_MODE === CURSOR_OAUTH_AUTH_MODE
}

/**
 * Whether a parseable Cursor OAuth credential exists for the scope, without
 * refreshing or throwing. Used by the connection registry to reject activating
 * a connection whose credential file has been deleted.
 */
export async function hasStoredCursorOAuth(scope?: string): Promise<boolean> {
  return (await readStoredAuth(authFilePath(scope))) !== null
}

/**
 * Resolve a valid Cursor access token for the scope, refreshing the JWT when it
 * is within REFRESH_SKEW_MS of expiry. Throws when no credential is stored.
 */
export async function getValidCursorOAuth(
  scope?: string,
): Promise<CursorOAuth> {
  let tokens = await readStoredAuth(authFilePath(scope))
  if (!tokens) {
    throw new Error(
      'Cursor account is not signed in. Run /connect and add a Cursor connection with browser sign-in.',
    )
  }
  const expiresAt = getTokenExpiryMs(tokens.accessToken)
  if (expiresAt !== null && expiresAt <= Date.now() + REFRESH_SKEW_MS) {
    tokens = await refreshTokens(tokens)
    await saveStoredAuth(tokens, scope)
  }
  return {
    accessToken: tokens.accessToken,
    machineId: tokens.machineId ?? generateMachineId(),
    userId: tokens.userId,
  }
}

export async function removeCursorOAuth(scope?: string): Promise<void> {
  await unlink(authFilePath(scope)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  })
}
