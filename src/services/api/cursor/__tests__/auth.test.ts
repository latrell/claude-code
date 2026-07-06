import { afterEach, describe, expect, test, beforeEach, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  resolveCursorCredentials,
  clearCursorCredentialsCache,
  getCursorStateDbPath,
} from '../auth.js'
import { getCursorOAuthFilePath } from '../cursorOAuth.js'

// A path that will never exist so the SQLite fallback is skipped and tests stay
// hermetic even on a machine with the Cursor IDE installed.
const NO_DB = join('/', 'definitely', 'no', 'cursor', 'state.vscdb')

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Build a JWT whose exp is `secondsFromNow` seconds in the future. */
function makeJwt(secondsFromNow: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  )
  return `${header}.${payload}.sig`
}

describe('getCursorStateDbPath', () => {
  test('honours CURSOR_STATE_DB', () => {
    expect(getCursorStateDbPath({ CURSOR_STATE_DB: '/tmp/x.vscdb' })).toBe(
      '/tmp/x.vscdb',
    )
  })

  test('derives from CURSOR_CONFIG_DIR', () => {
    expect(getCursorStateDbPath({ CURSOR_CONFIG_DIR: '/cfg' })).toBe(
      join('/cfg', 'globalStorage', 'state.vscdb'),
    )
  })
})

describe('resolveCursorCredentials', () => {
  beforeEach(() => {
    clearCursorCredentialsCache()
  })

  test('reads token and machine id from env', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: {
        CURSOR_API_KEY: 'user::tok',
        CURSOR_MACHINE_ID: 'mach-1',
        CURSOR_STATE_DB: NO_DB,
      },
    })
    expect(creds.accessToken).toBe('user::tok')
    expect(creds.machineId).toBe('mach-1')
    expect(creds.ghostMode).toBe(true)
  })

  test('derives a machine id when none is provided', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: { CURSOR_ACCESS_TOKEN: 'tok2', CURSOR_STATE_DB: NO_DB },
    })
    expect(creds.accessToken).toBe('tok2')
    expect(creds.machineId).toMatch(/^[0-9a-f]{64}$/)
  })

  test('respects CURSOR_GHOST_MODE=false', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: {
        CURSOR_API_KEY: 'tok',
        CURSOR_MACHINE_ID: 'm',
        CURSOR_GHOST_MODE: 'false',
        CURSOR_STATE_DB: NO_DB,
      },
    })
    expect(creds.ghostMode).toBe(false)
  })

  test('throws a descriptive error when no token is available', async () => {
    await expect(
      resolveCursorCredentials({ envOverride: { CURSOR_STATE_DB: NO_DB } }),
    ).rejects.toThrow(/No Cursor access token/)
  })
})

describe('resolveCursorCredentials (OAuth mode)', () => {
  let tmpDir: string
  let previousConfigDir: string | undefined

  beforeEach(() => {
    clearCursorCredentialsCache()
    tmpDir = mkdtempSync(join(tmpdir(), 'ccb-cursor-auth-'))
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('reads the scoped OAuth file and prefixes the token with userId', async () => {
    const jwt = makeJwt(3600)
    writeFileSync(
      getCursorOAuthFilePath('work'),
      JSON.stringify({
        auth_mode: 'cursor-oauth',
        tokens: {
          access_token: jwt,
          refresh_token: 'r1',
          user_id: 'user_99',
          machine_id: 'm-oauth',
        },
      }),
    )

    const creds = await resolveCursorCredentials({
      envOverride: {
        CURSOR_AUTH_MODE: 'oauth',
        CURSOR_CREDENTIAL_SCOPE: 'work',
        // These must be ignored when OAuth mode is active.
        CURSOR_API_KEY: 'should-be-ignored',
        CURSOR_STATE_DB: NO_DB,
      },
    })
    expect(creds.accessToken).toBe(`user_99::${jwt}`)
    expect(creds.machineId).toBe('m-oauth')
  })

  test('OAuth mode with a missing credential file throws', async () => {
    await expect(
      resolveCursorCredentials({
        envOverride: {
          CURSOR_AUTH_MODE: 'oauth',
          CURSOR_CREDENTIAL_SCOPE: 'gone',
          CURSOR_STATE_DB: NO_DB,
        },
      }),
    ).rejects.toThrow(/not signed in/i)
  })
})
