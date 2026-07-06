/**
 * Cursor credential resolution.
 *
 * Credentials = a Cursor access token (JWT) + a machine id. We resolve them in
 * this priority order:
 *   0. OAuth credential file (CURSOR_AUTH_MODE=oauth) — tokens obtained via the
 *      browser PKCE deep-link flow (cursorOAuth.ts), refreshed automatically
 *   1. Environment variables (CURSOR_ACCESS_TOKEN / CURSOR_API_KEY, CURSOR_MACHINE_ID)
 *   2. The local Cursor IDE SQLite store (state.vscdb) — auto-detected per-OS
 *
 * The SQLite fallback lets users who already signed into the Cursor IDE reuse
 * that session without copying tokens by hand. It is best-effort: if the DB is
 * missing, unreadable, or `bun:sqlite` is unavailable (e.g. Node runtime), we
 * silently fall back to whatever the environment provides.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import * as crypto from 'crypto'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { logForDebugging } from '../../../utils/debug.js'
import type { CursorApiCredentials } from './protobufSchema.js'
import { normalizeCursorAccessToken } from './clientPolicy.js'
import { getValidCursorOAuth, isCursorOAuthEnabled } from './cursorOAuth.js'

const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken'
const MACHINE_ID_KEY = 'storage.serviceMachineId'

let cachedCredentials: CursorApiCredentials | null = null

export function clearCursorCredentialsCache(): void {
  cachedCredentials = null
}

/**
 * Resolve the default path to Cursor's global state SQLite database for the
 * current platform. Honours CURSOR_STATE_DB (explicit file) and
 * CURSOR_CONFIG_DIR (Cursor's `User` config directory) overrides.
 */
export function getCursorStateDbPath(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.CURSOR_STATE_DB) return env.CURSOR_STATE_DB

  const configDir = env.CURSOR_CONFIG_DIR ?? defaultCursorUserDir()
  if (!configDir) return null
  return join(configDir, 'globalStorage', 'state.vscdb')
}

function defaultCursorUserDir(): string | null {
  const home = homedir()
  if (!home) return null
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Cursor', 'User')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User')
  }
  return join(home, '.config', 'Cursor', 'User')
}

/**
 * Read a set of key/value entries from Cursor's ItemTable using bun:sqlite.
 * Returns an empty map when SQLite is unavailable or the read fails.
 */
async function readItemTable(
  dbPath: string,
  keys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const { Database } = (await import(
      'bun:sqlite'
    )) as typeof import('bun:sqlite')
    const db = new Database(dbPath, { readonly: true })
    try {
      const placeholders = keys.map(() => '?').join(', ')
      const rows = db
        .query(
          `SELECT key, value FROM ItemTable WHERE key IN (${placeholders})`,
        )
        .all(...keys) as Array<{ key: string; value: unknown }>
      for (const row of rows) {
        const value =
          typeof row.value === 'string'
            ? row.value
            : row.value instanceof Uint8Array
              ? new TextDecoder().decode(row.value)
              : row.value == null
                ? ''
                : String(row.value)
        if (value) out.set(row.key, value)
      }
    } finally {
      db.close()
    }
  } catch (err) {
    logForDebugging(
      `[Cursor] Failed to read Cursor state DB (${dbPath}): ${String(err)}`,
      { level: 'error' },
    )
  }
  return out
}

/**
 * Cursor stores the access token either as a bare JWT or wrapped in a small
 * JSON object under cursorAuth/accessToken. Normalise both shapes.
 */
function coerceStoredToken(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      const token =
        (parsed.accessToken as string | undefined) ??
        (parsed.token as string | undefined) ??
        (parsed.access_token as string | undefined)
      if (typeof token === 'string') return token
    } catch {
      // fall through to raw value
    }
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Derive a deterministic machine id from the token when none is available.
 * Mirrors the reference implementation's fallback so checksum generation still
 * succeeds without a real serviceMachineId.
 */
function deriveMachineId(cleanToken: string): string {
  return crypto
    .createHash('sha256')
    .update(`${cleanToken}machineId`)
    .digest('hex')
}

/**
 * Resolve Cursor credentials. Throws a descriptive error when no access token
 * can be found so the caller can surface actionable guidance to the user.
 */
export async function resolveCursorCredentials(options?: {
  envOverride?: Record<string, string | undefined>
}): Promise<CursorApiCredentials> {
  const env = options?.envOverride ?? process.env

  if (!options?.envOverride && cachedCredentials) {
    return cachedCredentials
  }

  const ghostMode = parseGhostMode(env.CURSOR_GHOST_MODE)

  // 0. OAuth credential file (browser sign-in). Takes priority so an activated
  // OAuth connection always uses its own refreshed token rather than whatever
  // token happens to be exported in the environment or stored by the IDE.
  // Never cached: the access JWT is short-lived, and getValidCursorOAuth reads
  // the file (and refreshes near expiry) on every call so long sessions don't
  // pin a stale token.
  if (isCursorOAuthEnabled(env)) {
    const scope = env.CURSOR_CREDENTIAL_SCOPE || 'default'
    const oauth = await getValidCursorOAuth(
      scope === 'default' ? undefined : scope,
    )
    return {
      accessToken: oauth.userId
        ? `${oauth.userId}::${oauth.accessToken}`
        : oauth.accessToken,
      machineId: oauth.machineId,
      ghostMode,
    }
  }

  let accessToken = env.CURSOR_ACCESS_TOKEN || env.CURSOR_API_KEY || ''
  let machineId = env.CURSOR_MACHINE_ID || ''

  if (!accessToken || !machineId) {
    const dbPath = getCursorStateDbPath(env)
    if (dbPath && existsSync(dbPath)) {
      const stored = await readItemTable(dbPath, [
        ACCESS_TOKEN_KEY,
        MACHINE_ID_KEY,
      ])
      if (!accessToken) {
        const rawToken = stored.get(ACCESS_TOKEN_KEY)
        if (rawToken) accessToken = coerceStoredToken(rawToken)
      }
      if (!machineId) {
        machineId = stored.get(MACHINE_ID_KEY) || ''
      }
    }
  }

  if (!accessToken) {
    throw new Error(
      'No Cursor access token found. Set CURSOR_API_KEY (or CURSOR_ACCESS_TOKEN) ' +
        'to a Cursor session token, or sign in to the Cursor IDE so it can be ' +
        'read from the local state store.',
    )
  }

  const cleanToken = normalizeCursorAccessToken(accessToken)
  if (!machineId) {
    machineId = deriveMachineId(cleanToken)
  }

  const credentials: CursorApiCredentials = {
    accessToken,
    machineId,
    ghostMode,
  }

  if (!options?.envOverride) {
    cachedCredentials = credentials
  }

  return credentials
}

function parseGhostMode(value: string | undefined): boolean {
  if (value === undefined) return true
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}
