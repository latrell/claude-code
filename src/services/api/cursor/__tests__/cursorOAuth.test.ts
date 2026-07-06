import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  completeCursorDeviceLogin,
  getCursorOAuthFilePath,
  getValidCursorOAuth,
  hasStoredCursorOAuth,
  isCursorOAuthEnabled,
  removeCursorOAuth,
  startCursorDeviceLogin,
} from '../cursorOAuth.js'

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Build a JWT whose exp is `secondsFromNow` seconds in the future. */
function makeJwt(secondsFromNow: number, sub = 'user_abc'): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      sub,
      exp: Math.floor(Date.now() / 1000) + secondsFromNow,
    }),
  )
  return `${header}.${payload}.sig`
}

let tmpDir: string
let previousConfigDir: string | undefined
const realFetch = globalThis.fetch

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-cursor-oauth-'))
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
})

afterEach(() => {
  globalThis.fetch = realFetch
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Write a credential file the way saveStoredAuth would. */
function writeAuthFile(
  scope: string | undefined,
  tokens: {
    access_token: string
    refresh_token: string
    auth_id?: string
    user_id?: string
    machine_id?: string
  },
): void {
  writeFileSync(
    getCursorOAuthFilePath(scope),
    JSON.stringify({ auth_mode: 'cursor-oauth', tokens }),
  )
}

describe('startCursorDeviceLogin', () => {
  test('builds a loginDeepControl URL with a valid PKCE challenge', () => {
    const code = startCursorDeviceLogin()
    const url = new URL(code.verificationUrl)
    expect(url.host).toBe('www.cursor.com')
    expect(url.pathname).toBe('/loginDeepControl')
    expect(url.searchParams.get('mode')).toBe('login')
    expect(url.searchParams.get('uuid')).toBe(code.uuid)

    // challenge must equal base64url(sha256(verifier))
    const expected = createHash('sha256')
      .update(code.verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(url.searchParams.get('challenge')).toBe(expected)
  })

  test('generates a fresh uuid and verifier each call', () => {
    const a = startCursorDeviceLogin()
    const b = startCursorDeviceLogin()
    expect(a.uuid).not.toBe(b.uuid)
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('isCursorOAuthEnabled', () => {
  test('true only when CURSOR_AUTH_MODE=oauth', () => {
    expect(isCursorOAuthEnabled({ CURSOR_AUTH_MODE: 'oauth' })).toBe(true)
    expect(isCursorOAuthEnabled({ CURSOR_AUTH_MODE: 'manual' })).toBe(false)
    expect(isCursorOAuthEnabled({})).toBe(false)
  })
})

describe('completeCursorDeviceLogin', () => {
  test('polls until tokens arrive, then persists them', async () => {
    let calls = 0
    globalThis.fetch = (async (input: string | URL) => {
      calls++
      const urlStr = String(input)
      expect(urlStr).toContain('/auth/poll')
      expect(urlStr).toContain('verifier=')
      // First call: pending (404). Second call: success.
      if (calls === 1) {
        return new Response('', { status: 404 })
      }
      return new Response(
        JSON.stringify({
          accessToken: makeJwt(3600),
          refreshToken: 'refresh-xyz',
          authId: 'google-oauth2|user_42',
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const code = { ...startCursorDeviceLogin(), intervalMs: 1 }
    const tokens = await completeCursorDeviceLogin(code, undefined, 'work')

    expect(calls).toBe(2)
    expect(tokens.refreshToken).toBe('refresh-xyz')
    expect(tokens.userId).toBe('user_42')
    expect(tokens.machineId).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(getCursorOAuthFilePath('work'))).toBe(true)

    const saved = JSON.parse(
      readFileSync(getCursorOAuthFilePath('work'), 'utf8'),
    ) as { auth_mode: string; tokens: { refresh_token: string } }
    expect(saved.auth_mode).toBe('cursor-oauth')
    expect(saved.tokens.refresh_token).toBe('refresh-xyz')
  })

  test('aborts promptly when the signal fires', async () => {
    globalThis.fetch = (async () =>
      new Response('', { status: 404 })) as unknown as typeof fetch
    const controller = new AbortController()
    const code = { ...startCursorDeviceLogin(), intervalMs: 50 }
    const promise = completeCursorDeviceLogin(code, controller.signal, 'x')
    controller.abort()
    await expect(promise).rejects.toThrow(/cancelled/)
  })

  test('throws on a hard 4xx (expired challenge)', async () => {
    globalThis.fetch = (async () =>
      new Response('bad', { status: 400 })) as unknown as typeof fetch
    const code = { ...startCursorDeviceLogin(), intervalMs: 1 }
    await expect(
      completeCursorDeviceLogin(code, undefined, 'x'),
    ).rejects.toThrow(/Cursor login failed \(400\)/)
  })
})

describe('getValidCursorOAuth', () => {
  test('returns the stored token without refreshing when far from expiry', async () => {
    let refreshCalled = false
    globalThis.fetch = (async () => {
      refreshCalled = true
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    writeAuthFile('work', {
      access_token: makeJwt(3600),
      refresh_token: 'r1',
      user_id: 'user_42',
      machine_id: 'm-1',
    })

    const auth = await getValidCursorOAuth('work')
    expect(auth.userId).toBe('user_42')
    expect(auth.machineId).toBe('m-1')
    expect(refreshCalled).toBe(false)
  })

  test('refreshes the access token when near expiry and persists it', async () => {
    const newAccess = makeJwt(3600)
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/oauth/token')
      const body = JSON.parse(String(init?.body)) as {
        grant_type: string
        refresh_token: string
      }
      expect(body.grant_type).toBe('refresh_token')
      expect(body.refresh_token).toBe('r1')
      return new Response(
        JSON.stringify({ access_token: newAccess, shouldLogout: false }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    // exp only 60s away → inside the 10-minute refresh skew
    writeAuthFile('work', {
      access_token: makeJwt(60),
      refresh_token: 'r1',
      machine_id: 'm-1',
    })

    const auth = await getValidCursorOAuth('work')
    expect(auth.accessToken).toBe(newAccess)

    // The refreshed token was written back to disk.
    const saved = JSON.parse(
      readFileSync(getCursorOAuthFilePath('work'), 'utf8'),
    ) as { tokens: { access_token: string } }
    expect(saved.tokens.access_token).toBe(newAccess)
  })

  test('throws when the refresh token is rejected (shouldLogout)', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: '', shouldLogout: true }), {
        status: 200,
      })) as unknown as typeof fetch

    writeAuthFile('work', {
      access_token: makeJwt(60),
      refresh_token: 'r1',
    })

    await expect(getValidCursorOAuth('work')).rejects.toThrow(
      /session expired/i,
    )
  })

  test('throws when no credential is stored', async () => {
    await expect(getValidCursorOAuth('missing')).rejects.toThrow(
      /not signed in/i,
    )
  })
})

describe('hasStoredCursorOAuth / removeCursorOAuth', () => {
  test('reports presence and removes the file', async () => {
    writeAuthFile(undefined, { access_token: 'a', refresh_token: 'b' })
    expect(await hasStoredCursorOAuth()).toBe(true)
    await removeCursorOAuth()
    expect(await hasStoredCursorOAuth()).toBe(false)
  })

  test('remove is a no-op when the file is absent', async () => {
    await expect(removeCursorOAuth('nope')).resolves.toBeUndefined()
  })
})
