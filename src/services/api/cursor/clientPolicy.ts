/**
 * Cursor Client Policy
 *
 * Single source of truth for Cursor request identity headers and checksum
 * generation. These headers mimic the Cursor IDE client so the backend accepts
 * the request.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import * as crypto from 'crypto'
import type { CursorApiCredentials } from './protobufSchema.js'

/**
 * Default Cursor client version advertised to the backend. Kept in step with a
 * recent Cursor release: the backend appends a "This is a very old version of
 * Cursor. Please update…" notice frame to chat responses when this is too old
 * (2.6.22 triggers it; 3.x does not), and may eventually hard-reject stale
 * versions. Bump when Cursor ships a new stable and the notice reappears.
 * Overridable at runtime via CURSOR_CLIENT_VERSION.
 */
export const DEFAULT_CURSOR_CLIENT_VERSION = '3.9.21'
export const CURSOR_USER_AGENT = 'connect-es/1.6.1'

export function getCursorClientVersion(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.CURSOR_CLIENT_VERSION || DEFAULT_CURSOR_CLIENT_VERSION
}

function getClientOs(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  return 'linux'
}

function getClientArch(): string {
  return process.arch === 'arm64' ? 'aarch64' : 'x64'
}

/**
 * Cursor access tokens may be stored as `<userId>::<jwt>`. Strip the prefix so
 * only the JWT is sent as the Bearer token.
 */
export function normalizeCursorAccessToken(accessToken: string): string {
  const delimIdx = accessToken.indexOf('::')
  return delimIdx !== -1 ? accessToken.slice(delimIdx + 2) : accessToken
}

/**
 * Generate the Cursor checksum using the Jyh cipher — a time-based XOR with a
 * rolling key seeded at 165, base64url-encoded and suffixed with the machine id.
 */
export function generateCursorChecksum(
  machineId: string,
  nowMs: number = Date.now(),
): string {
  if (!machineId) {
    throw new Error('Machine ID is required for Cursor API')
  }

  // Convert milliseconds to coarse ~1000-second units required by Cursor's
  // checksum routine.
  const timestamp = Math.floor(nowMs / 1000000)
  // JS bitwise shifts wrap modulo 32, so >>40 and >>32 give wrong results.
  // Use Math.trunc division for upper bytes that exceed the 32-bit range.
  const byteArray = new Uint8Array([
    Math.trunc(timestamp / 2 ** 40) & 0xff,
    Math.trunc(timestamp / 2 ** 32) & 0xff,
    (timestamp >>> 24) & 0xff,
    (timestamp >>> 16) & 0xff,
    (timestamp >>> 8) & 0xff,
    timestamp & 0xff,
  ])

  let t = 165
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = ((byteArray[i] ^ t) + (i % 256)) & 0xff
    t = byteArray[i]
  }

  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let encoded = ''

  for (let i = 0; i < byteArray.length; i += 3) {
    const a = byteArray[i]
    const b = i + 1 < byteArray.length ? byteArray[i + 1] : 0
    const c = i + 2 < byteArray.length ? byteArray[i + 2] : 0

    encoded += alphabet[a >> 2]
    encoded += alphabet[((a & 3) << 4) | (b >> 4)]

    if (i + 1 < byteArray.length) {
      encoded += alphabet[((b & 15) << 2) | (c >> 6)]
    }
    if (i + 2 < byteArray.length) {
      encoded += alphabet[c & 63]
    }
  }

  return `${encoded}${machineId}`
}

function buildCursorBaseHeaders(
  credentials: CursorApiCredentials,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const cleanToken = normalizeCursorAccessToken(credentials.accessToken)

  if (!cleanToken) {
    throw new Error('Cursor access token is empty after parsing')
  }

  if (!credentials.machineId) {
    throw new Error('Machine ID is required for Cursor API')
  }

  const ghostMode = credentials.ghostMode !== false
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex')

  return {
    authorization: `Bearer ${cleanToken}`,
    'x-amzn-trace-id': `Root=${crypto.randomUUID()}`,
    'x-client-key': tokenHash,
    'x-cursor-checksum': generateCursorChecksum(credentials.machineId),
    'x-cursor-client-version': getCursorClientVersion(env),
    'x-cursor-client-type': 'ide',
    'x-cursor-client-os': getClientOs(),
    'x-cursor-client-arch': getClientArch(),
    'x-cursor-client-device-type': 'desktop',
    'x-cursor-config-version': crypto.randomUUID(),
    'x-cursor-timezone':
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    'x-ghost-mode': ghostMode ? 'true' : 'false',
    'x-request-id': crypto.randomUUID(),
    'x-session-id': tokenHash.substring(0, 36),
  }
}

/**
 * Headers for the streaming ConnectRPC chat endpoint.
 */
export function buildCursorConnectHeaders(
  credentials: CursorApiCredentials,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return {
    ...buildCursorBaseHeaders(credentials, env),
    'connect-accept-encoding': 'gzip',
    'connect-protocol-version': '1',
    'content-type': 'application/connect+proto',
    'user-agent': CURSOR_USER_AGENT,
  }
}

/**
 * Headers for the JSON AvailableModels endpoint.
 */
export function buildCursorModelsHeaders(
  credentials: CursorApiCredentials,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return {
    ...buildCursorBaseHeaders(credentials, env),
    accept: 'application/json',
    'user-agent': CURSOR_USER_AGENT,
  }
}
