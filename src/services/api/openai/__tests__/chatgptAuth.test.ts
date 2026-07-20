import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { dirname, join } from 'path'
import { debugMock } from '../../../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import {
  forceRefreshChatGPTAuth,
  getChatGPTAuthFilePath,
  getCodexChatGPTAuthFilePath,
  getValidChatGPTAuth,
} from '../chatgptAuth.js'

type StoredAuth = {
  auth_mode: 'chatgpt'
  tokens: {
    id_token: string
    access_token: string
    refresh_token: string
    account_id?: string
    custom_token_field?: string
  }
  last_refresh?: string
  custom_top_level?: string
}

function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

function accessToken(expiresAtSeconds: number): string {
  return jwt({ exp: expiresAtSeconds })
}

function idToken(accountId: string, fedRAMP = false): string {
  return jwt({
    'https://api.openai.com/auth': {
      chatgpt_account_id: accountId,
      chatgpt_account_is_fedramp: fedRAMP,
    },
  })
}

function storedAuth(overrides: Partial<StoredAuth> = {}): StoredAuth {
  const tokens = overrides.tokens ?? {
    id_token: idToken('account-a', true),
    access_token: accessToken(Math.floor(Date.now() / 1000) - 60),
    refresh_token: 'refresh-old',
  }
  return {
    auth_mode: 'chatgpt',
    tokens,
    last_refresh: new Date().toISOString(),
    ...overrides,
  }
}

function writeAuth(path: string, auth: StoredAuth): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(auth, null, 2)}\n`)
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for test condition')
}

describe('ChatGPT Codex OAuth storage and refresh', () => {
  const envKeys = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'HOME'] as const
  let savedEnv: Record<(typeof envKeys)[number], string | undefined>
  let originalFetch: typeof globalThis.fetch
  let root: string

  beforeEach(() => {
    savedEnv = Object.fromEntries(
      envKeys.map(key => [key, process.env[key]]),
    ) as Record<(typeof envKeys)[number], string | undefined>
    originalFetch = globalThis.fetch
    root = join(
      tmpdir(),
      `chatgpt-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    process.env.CLAUDE_CONFIG_DIR = join(root, 'claude')
    process.env.CODEX_HOME = join(root, 'codex')
    delete process.env.HOME
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    for (const key of envKeys) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
  })

  test('uses homedir for the Windows Codex fallback when env homes are absent', () => {
    delete process.env.CODEX_HOME
    delete process.env.HOME
    expect(getCodexChatGPTAuthFilePath()).toBe(
      join(homedir(), '.codex', 'auth.json'),
    )
    process.env.CODEX_HOME = '   '
    expect(getCodexChatGPTAuthFilePath()).toBe(
      join(homedir(), '.codex', 'auth.json'),
    )
  })

  test('refreshes once with the official JSON body and atomically preserves fields', async () => {
    const path = getChatGPTAuthFilePath()
    writeAuth(
      path,
      storedAuth({
        custom_top_level: 'keep-top',
        tokens: {
          id_token: idToken('account-a', true),
          access_token: accessToken(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'refresh-old',
          account_id: 'account-a',
          custom_token_field: 'keep-token',
        },
      }),
    )
    let fetchCount = 0
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCount += 1
      capturedInit = init
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }) as unknown as typeof fetch

    const [first, second] = await Promise.all([
      getValidChatGPTAuth(),
      getValidChatGPTAuth(),
    ])

    expect(fetchCount).toBe(1)
    expect(first.accessToken).toBe(second.accessToken)
    expect(first.accountId).toBe('account-a')
    expect(first.isFedRAMP).toBe(true)
    expect(new Headers(capturedInit?.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-old',
    })

    const saved = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    expect(saved.custom_top_level).toBe('keep-top')
    expect(saved.tokens.custom_token_field).toBe('keep-token')
    expect(saved.tokens.id_token).toContain('.')
    expect(saved.tokens.refresh_token).toBe('refresh-old')
    expect(readdirSync(dirname(path)).some(name => name.endsWith('.tmp'))).toBe(
      false,
    )
  })

  test('refreshes a Codex fallback in place without creating split credentials', async () => {
    const codexPath = getCodexChatGPTAuthFilePath()
    writeAuth(
      codexPath,
      storedAuth({
        custom_top_level: 'codex-field',
        tokens: {
          id_token: idToken('account-a'),
          access_token: accessToken(Math.floor(Date.now() / 1000) - 60),
          refresh_token: 'codex-refresh',
          custom_token_field: 'keep-me',
        },
      }),
    )
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
            refresh_token: 'codex-refresh-new',
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    await getValidChatGPTAuth()

    const saved = JSON.parse(readFileSync(codexPath, 'utf8')) as StoredAuth
    expect(saved.custom_top_level).toBe('codex-field')
    expect(saved.tokens.custom_token_field).toBe('keep-me')
    expect(saved.tokens.refresh_token).toBe('codex-refresh-new')
    expect(() => readFileSync(getChatGPTAuthFilePath(), 'utf8')).toThrow()
  })

  test('uses last_refresh to refresh an old opaque access token', async () => {
    writeAuth(
      getChatGPTAuthFilePath('opaque'),
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'opaque-access-token',
          refresh_token: 'opaque-refresh',
        },
        last_refresh: new Date(
          Date.now() - 9 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    )
    let fetchCount = 0
    globalThis.fetch = mock(() => {
      fetchCount += 1
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'new-opaque-token' }), {
          status: 200,
        }),
      )
    }) as unknown as typeof fetch

    const auth = await getValidChatGPTAuth('opaque')

    expect(fetchCount).toBe(1)
    expect(auth.accessToken).toBe('new-opaque-token')
  })

  test('reloads a changed token after 401 without consuming its refresh token', async () => {
    const path = getChatGPTAuthFilePath('work')
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'new-token-from-another-process',
          refresh_token: 'new-refresh-token',
        },
      }),
    )
    let fetchCount = 0
    globalThis.fetch = mock(() => {
      fetchCount += 1
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as unknown as typeof fetch

    const auth = await forceRefreshChatGPTAuth('work', 'rejected-old-token')

    expect(auth.accessToken).toBe('new-token-from-another-process')
    expect(fetchCount).toBe(0)
  })

  test('does not persist a refresh response for a different account', async () => {
    const path = getChatGPTAuthFilePath('mismatch')
    const original = storedAuth({
      tokens: {
        id_token: idToken('account-a'),
        access_token: accessToken(Math.floor(Date.now() / 1000) - 60),
        refresh_token: 'refresh-a',
        account_id: 'account-a',
      },
    })
    writeAuth(path, original)
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id_token: idToken('account-b'),
            access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
            refresh_token: 'refresh-b',
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    await expect(getValidChatGPTAuth('mismatch')).rejects.toThrow(
      'different account',
    )
    const saved = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    expect(saved.tokens.refresh_token).toBe('refresh-a')
  })

  test('does not overwrite a different account selected while refresh is in flight', async () => {
    const path = getChatGPTAuthFilePath('account-switch')
    const accessA = 'access-a'
    const accessB = 'access-b'
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: accessA,
          refresh_token: 'refresh-a',
          account_id: 'account-a',
        },
      }),
    )

    let resolveAccountA!: (response: Response) => void
    const accountAResponse = new Promise<Response>(resolve => {
      resolveAccountA = resolve
    })
    const requestedRefreshTokens: string[] = []
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        refresh_token: string
      }
      requestedRefreshTokens.push(request.refresh_token)
      if (request.refresh_token === 'refresh-a') return accountAResponse
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id_token: idToken('account-b'),
            access_token: 'access-b-refreshed',
            refresh_token: 'refresh-b-refreshed',
          }),
          { status: 200 },
        ),
      )
    }) as unknown as typeof fetch

    const staleAccountARefresh = forceRefreshChatGPTAuth(
      'account-switch',
      accessA,
      'account-a',
    )
    await waitFor(() => requestedRefreshTokens.includes('refresh-a'))

    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-b'),
          access_token: accessB,
          refresh_token: 'refresh-b',
          account_id: 'account-b',
        },
      }),
    )
    const accountB = await forceRefreshChatGPTAuth(
      'account-switch',
      accessB,
      'account-b',
    )
    expect(accountB.accountId).toBe('account-b')
    expect(accountB.accessToken).toBe('access-b-refreshed')

    resolveAccountA(
      new Response(
        JSON.stringify({
          id_token: idToken('account-a'),
          access_token: 'stale-access-a-refreshed',
          refresh_token: 'stale-refresh-a-refreshed',
        }),
        { status: 200 },
      ),
    )
    await expect(staleAccountARefresh).rejects.toThrow('different account')
    expect(requestedRefreshTokens).toEqual(['refresh-a', 'refresh-b'])

    const saved = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    expect(saved.tokens.account_id).toBe('account-b')
    expect(saved.tokens.access_token).toBe('access-b-refreshed')
    expect(saved.tokens.refresh_token).toBe('refresh-b-refreshed')
  })

  test('keeps a newer same-account credential written during refresh', async () => {
    const path = getChatGPTAuthFilePath('same-account-rotation')
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'old-access-a',
          refresh_token: 'old-refresh-a',
          account_id: 'account-a',
        },
      }),
    )

    let resolveRefresh!: (response: Response) => void
    let refreshStarted = false
    globalThis.fetch = mock(() => {
      refreshStarted = true
      return new Promise<Response>(resolve => {
        resolveRefresh = resolve
      })
    }) as unknown as typeof fetch

    const refreshing = forceRefreshChatGPTAuth(
      'same-account-rotation',
      'old-access-a',
      'account-a',
    )
    await waitFor(() => refreshStarted)
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'newer-access-a',
          refresh_token: 'newer-refresh-a',
          account_id: 'account-a',
        },
      }),
    )
    resolveRefresh(
      new Response(
        JSON.stringify({
          access_token: 'stale-refreshed-access-a',
          refresh_token: 'stale-refreshed-refresh-a',
        }),
        { status: 200 },
      ),
    )

    const auth = await refreshing
    expect(auth.accessToken).toBe('newer-access-a')
    const saved = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    expect(saved.tokens.access_token).toBe('newer-access-a')
    expect(saved.tokens.refresh_token).toBe('newer-refresh-a')
  })

  test('rejects an in-flight opaque-token refresh after the credential switches', async () => {
    const path = getChatGPTAuthFilePath('opaque-account-switch')
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: 'opaque-id-a',
          access_token: 'opaque-access-a',
          refresh_token: 'opaque-refresh-a',
        },
      }),
    )
    const authA = await getValidChatGPTAuth('opaque-account-switch')
    expect(authA.accountId).toBeUndefined()
    expect(authA.credentialId).toBeString()

    let resolveRefresh!: (response: Response) => void
    let refreshStarted = false
    globalThis.fetch = mock(() => {
      refreshStarted = true
      return new Promise<Response>(resolve => {
        resolveRefresh = resolve
      })
    }) as unknown as typeof fetch

    const staleRefresh = forceRefreshChatGPTAuth(
      'opaque-account-switch',
      authA.accessToken,
      authA.accountId,
      authA.credentialId,
    )
    await waitFor(() => refreshStarted)
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: 'opaque-id-b',
          access_token: 'opaque-access-b',
          refresh_token: 'opaque-refresh-b',
        },
      }),
    )
    resolveRefresh(
      new Response(
        JSON.stringify({
          access_token: 'stale-opaque-access-a-refreshed',
          refresh_token: 'stale-opaque-refresh-a-refreshed',
        }),
        { status: 200 },
      ),
    )

    await expect(staleRefresh).rejects.toThrow('identity was unavailable')
    const saved = JSON.parse(readFileSync(path, 'utf8')) as StoredAuth
    expect(saved.tokens.access_token).toBe('opaque-access-b')
    expect(saved.tokens.refresh_token).toBe('opaque-refresh-b')
  })

  test('does not singleflight two rejected tokens from the same account', async () => {
    const path = getChatGPTAuthFilePath('same-account-double-401')
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'access-a1',
          refresh_token: 'refresh-a1',
          account_id: 'account-a',
        },
      }),
    )

    let resolveFirst!: (response: Response) => void
    const requestedRefreshTokens: string[] = []
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        refresh_token: string
      }
      requestedRefreshTokens.push(request.refresh_token)
      if (request.refresh_token === 'refresh-a1') {
        return new Promise<Response>(resolve => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'access-a2-refreshed',
            refresh_token: 'refresh-a2-refreshed',
          }),
          { status: 200 },
        ),
      )
    }) as unknown as typeof fetch

    const first = forceRefreshChatGPTAuth(
      'same-account-double-401',
      'access-a1',
      'account-a',
    )
    await waitFor(() => requestedRefreshTokens.includes('refresh-a1'))
    writeAuth(
      path,
      storedAuth({
        tokens: {
          id_token: idToken('account-a'),
          access_token: 'access-a2',
          refresh_token: 'refresh-a2',
          account_id: 'account-a',
        },
      }),
    )

    const second = await forceRefreshChatGPTAuth(
      'same-account-double-401',
      'access-a2',
      'account-a',
    )
    expect(second.accessToken).toBe('access-a2-refreshed')
    resolveFirst(
      new Response(
        JSON.stringify({
          access_token: 'stale-access-a1-refreshed',
          refresh_token: 'stale-refresh-a1-refreshed',
        }),
        { status: 200 },
      ),
    )
    expect((await first).accessToken).toBe('access-a2-refreshed')
    expect(requestedRefreshTokens).toEqual(['refresh-a1', 'refresh-a2'])
  })

  test('clears a failed singleflight refresh so the next attempt can recover', async () => {
    writeAuth(getChatGPTAuthFilePath('retry'), storedAuth())
    let fetchCount = 0
    globalThis.fetch = mock(() => {
      fetchCount += 1
      return Promise.resolve(
        fetchCount === 1
          ? new Response('temporary failure', { status: 500 })
          : new Response(
              JSON.stringify({
                access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
              }),
              { status: 200 },
            ),
      )
    }) as unknown as typeof fetch

    await expect(getValidChatGPTAuth('retry')).rejects.toThrow('(500)')
    const recovered = await getValidChatGPTAuth('retry')

    expect(fetchCount).toBe(2)
    expect(recovered.accessToken).not.toBe('')
  })
})
