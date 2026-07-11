import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
// Spread-real mock pattern (see CLAUDE.md cross-file mock pollution rules)
import * as realSecureStorage from '../../../utils/secureStorage/index.js'
// NOTE: settings.ts, config.ts and auth.ts are intentionally NOT mocked —
// registering mock.module for them mid-suite deadlocks later dynamic imports
// of the command registry on this repo (bun module-graph interaction).
// Settings writes go through the real implementation into the per-test
// CLAUDE_CONFIG_DIR; the oauthAccount path uses the oauthAccounts test seam;
// auth's clearOAuthTokenCache is a harmless in-memory cache clear.
import type { AccountInfo } from '../../../utils/config.js'
import { resetSettingsCache } from '../../../utils/settings/settingsCache.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let _useMocks = false
let storageData: Record<string, unknown> | null = null

const memoryStorage = {
  name: 'memory',
  read: () => (storageData ? { ...storageData } : null),
  update: (data: Record<string, unknown>) => {
    storageData = { ...data }
    return { success: true }
  },
  delete: () => {
    storageData = null
    return true
  },
}

mock.module('src/utils/secureStorage/index.ts', () => ({
  ...realSecureStorage,
  getSecureStorage: () =>
    _useMocks ? memoryStorage : realSecureStorage.getSecureStorage(),
}))

const { _setOAuthConfigAccessForTest } = await import('../oauthAccounts.js')

let oauthAccount: AccountInfo | undefined
_setOAuthConfigAccessForTest({
  getAccount: () => oauthAccount,
  setAccount: value => {
    oauthAccount = value
  },
})

function setOauthAccount(value: AccountInfo | undefined) {
  oauthAccount = value
}

const {
  _setSettingsWriterForTest,
  activateConnectionForSession,
  activateConnectionGlobally,
  envForConnection,
} = await import('../activate.js')

// Settings writes are captured through the activate.ts test seam and merged
// into an in-memory object (mirrors updateSettingsForSource's merge for the
// shallow keys used here; undefined deletes a key).
let userSettingsState: Record<string, unknown> = {}
_setSettingsWriterForTest(value => {
  const patch = value as Record<string, unknown>
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      delete userSettingsState[key]
      continue
    }
    const existing = userSettingsState[key]
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      patchValue &&
      typeof patchValue === 'object' &&
      !Array.isArray(patchValue)
    ) {
      const merged: Record<string, unknown> = {
        ...(existing as Record<string, unknown>),
      }
      for (const [k, v] of Object.entries(
        patchValue as Record<string, unknown>,
      )) {
        if (v === undefined) delete merged[k]
        else merged[k] = v
      }
      userSettingsState[key] = merged
    } else {
      userSettingsState[key] = patchValue
    }
  }
  return { error: null }
})
const { getSubagentProviderConfig, setSubagentProviderConfigOverride } =
  await import('../../../utils/model/subagentProvider.js')
const {
  applySessionProviderEnvOverlay,
  getSessionProviderEnvOverlay,
  setSessionProviderEnvOverlay,
} = await import('../sessionEnvOverlay.js')
const { getAPIProvider, setProviderCliOverride } = await import(
  '../../../utils/model/providers.js'
)
const { _invalidateConnectionsCache, getDefaultAssignment, upsertConnection } =
  await import('../store.js')
const { readCCBProviderAuthData } = await import(
  '../../../utils/ccbProviderAuth.js'
)
import type { Connection } from '../types.js'

afterAll(() => {
  _useMocks = false
  _setOAuthConfigAccessForTest(null)
  _setSettingsWriterForTest(null)
  setProviderCliOverride(undefined)
  setSubagentProviderConfigOverride(undefined)
})

const ENV_KEYS = [
  'CODEX_HOME',
  'OPENAI_AUTH_MODE',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_DEFAULT_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'OPENAI_ENABLE_THINKING',
  'GEMINI_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_DEFAULT_MODEL',
  'GEMINI_DEFAULT_HAIKU_MODEL',
  'GEMINI_DEFAULT_SONNET_MODEL',
  'GEMINI_DEFAULT_OPUS_MODEL',
  'GROK_BASE_URL',
  'GROK_API_KEY',
  'GROK_MODEL',
  'GROK_DEFAULT_MODEL',
  'CURSOR_API_KEY',
  'CURSOR_MACHINE_ID',
  'CURSOR_AUTH_MODE',
  'CURSOR_CREDENTIAL_SCOPE',
  'CURSOR_BASE_URL',
  'CURSOR_MODEL',
  'CURSOR_DEFAULT_MODEL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
]

let savedEnv: Record<string, string | undefined> = {}
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-activate-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  resetSettingsCache()
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  // Point the Codex CLI fallback at a non-existent dir so a developer's real
  // ~/.codex/auth.json cannot satisfy the ChatGPT credential checks.
  process.env['CODEX_HOME'] = join(tmpDir, 'codex-home-missing')
  _useMocks = true
  storageData = null
  setOauthAccount(undefined)
  userSettingsState = {}
  setProviderCliOverride(undefined)
  setSubagentProviderConfigOverride(undefined)
  setSessionProviderEnvOverlay(null)
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  resetSettingsCache()
  setOauthAccount(undefined)
  setProviderCliOverride(undefined)
  setSubagentProviderConfigOverride(undefined)
  setSessionProviderEnvOverlay(null)
  rmSync(tmpDir, { recursive: true, force: true })
})

function readUserSettings(): Record<string, unknown> {
  return userSettingsState
}

function openaiConn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'deepseek-a',
    label: 'DeepSeek A',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-a',
    tierModels: { haiku: 'deepseek-chat', sonnet: 'deepseek-chat' },
    ...overrides,
  }
}

function chatgptConn(credentialRef = 'default'): Connection {
  return {
    id: 'gpt-main',
    label: 'ChatGPT Subscription',
    kind: 'chatgpt-oauth',
    credentialRef,
  }
}

/** Write a parseable ChatGPT credential file into the test config dir. */
function writeChatGPTAuthFile(scope?: string): void {
  const name =
    !scope || scope === 'default'
      ? 'openai-chatgpt-auth.json'
      : `openai-chatgpt-auth.${scope}.json`
  writeFileSync(
    join(tmpDir, name),
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { id_token: 'id', access_token: 'at', refresh_token: 'rt' },
    }),
  )
}

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Write a Cursor OAuth credential file into the test config dir. */
function writeCursorAuthFile(scope?: string): void {
  const name =
    !scope || scope === 'default'
      ? 'cursor-auth.json'
      : `cursor-auth.${scope}.json`
  const jwt = `${base64url('{}')}.${base64url(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  )}.sig`
  writeFileSync(
    join(tmpDir, name),
    JSON.stringify({
      auth_mode: 'cursor-oauth',
      tokens: {
        access_token: jwt,
        refresh_token: 'rt',
        user_id: 'user_1',
        machine_id: 'm-1',
      },
    }),
  )
}

function cursorOAuthConn(credentialRef = 'cur-oauth'): Connection {
  return {
    id: credentialRef,
    label: 'Cursor Account',
    kind: 'cursor',
    credentialRef,
  }
}

describe('envForConnection', () => {
  test('openai-compat clears auth mode and stale OPENAI_MODEL', () => {
    const env = envForConnection(openaiConn(), 'deepseek-reasoner')
    // Empty string (not undefined) blocks injectCCBProviderAuthEnv re-injection
    expect(env.OPENAI_AUTH_MODE).toBe('')
    expect(env.OPENAI_MODEL).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(env.OPENAI_API_KEY).toBe('sk-a')
    expect(env.OPENAI_DEFAULT_HAIKU_MODEL).toBe('deepseek-chat')
    // opus tier unset in connection → falls back to picked model
    expect(env.OPENAI_DEFAULT_OPUS_MODEL).toBe('deepseek-reasoner')
  })

  test('"Default" (null model) resolves the connection pinned model', () => {
    const env = envForConnection(openaiConn({ model: 'deepseek-chat' }), null)
    // Without this, getDefaultModel() falls back to the built-in Anthropic
    // model id (Fable 5) which third-party endpoints reject.
    expect(env.OPENAI_DEFAULT_MODEL).toBe('deepseek-chat')
  })

  test('"Default" (null model) ignores legacy tierModels/models catalog', () => {
    // The lazy migration backfills connection.model on load, so the env
    // builder no longer consults tierModels.sonnet or models[0].
    const env = envForConnection(
      openaiConn({
        model: undefined,
        tierModels: { sonnet: 'legacy-sonnet' },
        models: ['legacy-first', 'legacy-second'],
      }),
      null,
    )
    expect(env).toHaveProperty('OPENAI_DEFAULT_MODEL', undefined)
  })

  test('explicit model wins over the connection pinned model', () => {
    const env = envForConnection(
      openaiConn({ model: 'deepseek-chat' }),
      'deepseek-reasoner',
    )
    expect(env.OPENAI_DEFAULT_MODEL).toBe('deepseek-reasoner')
  })

  test('"Default" (null model) with no pinned model clears the default', () => {
    const env = envForConnection(
      openaiConn({ tierModels: undefined, models: undefined }),
      null,
    )
    expect(env).toHaveProperty('OPENAI_DEFAULT_MODEL', undefined)
  })

  test('openai-compat thinkingEffort off injects OPENAI_ENABLE_THINKING=0', () => {
    const env = envForConnection(
      openaiConn({ thinkingEffort: 'off', model: 'deepseek-reasoner' }),
      null,
    )
    expect(env.OPENAI_ENABLE_THINKING).toBe('0')
  })

  test('openai-compat non-off effort clears a stale OPENAI_ENABLE_THINKING', () => {
    const withHigh = envForConnection(
      openaiConn({ thinkingEffort: 'high' }),
      null,
    )
    expect(withHigh).toHaveProperty('OPENAI_ENABLE_THINKING', undefined)
    const withoutEffort = envForConnection(openaiConn(), null)
    expect(withoutEffort).toHaveProperty('OPENAI_ENABLE_THINKING', undefined)
  })

  test('gemini and grok also expose the connection default model', () => {
    const gemini = envForConnection(
      {
        id: 'gem',
        label: 'Gemini',
        kind: 'gemini',
        apiKey: 'k',
        model: 'gemini-2.5-pro',
      },
      null,
    )
    expect(gemini.GEMINI_DEFAULT_MODEL).toBe('gemini-2.5-pro')

    const grok = envForConnection(
      {
        id: 'grok',
        label: 'Grok',
        kind: 'grok',
        apiKey: 'k',
        model: 'grok-5',
      },
      null,
    )
    expect(grok.GROK_DEFAULT_MODEL).toBe('grok-5')
  })

  test('anthropic-oauth clears custom endpoint overrides', () => {
    const env = envForConnection({
      id: 'acc',
      label: 'Acc',
      kind: 'anthropic-oauth',
      credentialRef: 'u1',
    })
    expect(env).toHaveProperty('ANTHROPIC_BASE_URL', undefined)
    expect(env).toHaveProperty('ANTHROPIC_AUTH_TOKEN', undefined)
  })

  test('cursor sets token + machine id and the connection default model', () => {
    const env = envForConnection(
      {
        id: 'cur',
        label: 'Cursor',
        kind: 'cursor',
        apiKey: 'user::jwt',
        machineId: 'mach-1',
        model: 'claude-4.5-sonnet',
      },
      null,
    )
    expect(env.CURSOR_API_KEY).toBe('user::jwt')
    expect(env.CURSOR_MACHINE_ID).toBe('mach-1')
    expect(env.CURSOR_DEFAULT_MODEL).toBe('claude-4.5-sonnet')
    expect(env).toHaveProperty('CURSOR_MODEL', undefined)
  })

  test('cursor auto mode clears token + machine id so the IDE store is used', () => {
    const env = envForConnection({
      id: 'cur-auto',
      label: 'Cursor (auto)',
      kind: 'cursor',
    })
    expect(env).toHaveProperty('CURSOR_API_KEY', undefined)
    expect(env).toHaveProperty('CURSOR_MACHINE_ID', undefined)
    expect(env).toHaveProperty('CURSOR_AUTH_MODE', undefined)
  })

  test('cursor OAuth (credentialRef) routes to the scoped credential file', () => {
    const env = envForConnection({
      id: 'cur-oauth',
      label: 'Cursor Account',
      kind: 'cursor',
      credentialRef: 'cur-oauth',
      model: 'claude-4.5-sonnet',
    })
    expect(env.CURSOR_AUTH_MODE).toBe('oauth')
    expect(env.CURSOR_CREDENTIAL_SCOPE).toBe('cur-oauth')
    // Manual token/machine id must be cleared so they can't shadow the OAuth
    // credential.
    expect(env).toHaveProperty('CURSOR_API_KEY', undefined)
    expect(env).toHaveProperty('CURSOR_MACHINE_ID', undefined)
    expect(env.CURSOR_DEFAULT_MODEL).toBe('claude-4.5-sonnet')
  })

  test('chatgpt-oauth sets auth mode and clears api key', () => {
    const env = envForConnection({
      id: 'gpt',
      label: 'ChatGPT',
      kind: 'chatgpt-oauth',
      credentialRef: 'default',
    })
    expect(env.OPENAI_AUTH_MODE).toBe('chatgpt')
    expect(env).toHaveProperty('OPENAI_API_KEY', undefined)
    expect(env).toHaveProperty('OPENAI_BASE_URL', undefined)
    // A previous openai-compat activation's default must not leak in
    expect(env).toHaveProperty('OPENAI_DEFAULT_MODEL', undefined)
  })
})

describe('activateConnectionForSession (main slot)', () => {
  test('openai-compat: env applied, provider overridden, model returned', async () => {
    process.env.OPENAI_MODEL = 'stale-global-model'
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    upsertConnection(openaiConn())

    const result = await activateConnectionForSession(
      openaiConn(),
      'main',
      'deepseek-reasoner',
    )

    expect(result.success).toBe(true)
    expect(result.mainLoopModel).toBe('deepseek-reasoner')
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(process.env.OPENAI_API_KEY).toBe('sk-a')
    expect(process.env.OPENAI_MODEL).toBeUndefined()
    // Empty string (not deleted) so injectCCBProviderAuthEnv cannot
    // re-inject a global ChatGPT OPENAI_AUTH_MODE from ccb-provider-auth.json.
    expect(process.env.OPENAI_AUTH_MODE).toBe('')
    expect(getAPIProvider({}, process.env)).toBe('openai')
  })

  test('openai-compat: empty OPENAI_AUTH_MODE blocks auth-file re-injection', async () => {
    const { writeCCBProviderAuthEnv, injectCCBProviderAuthEnv } = await import(
      '../../../utils/ccbProviderAuth.js'
    )
    writeCCBProviderAuthEnv('openai', { OPENAI_AUTH_MODE: 'chatgpt' })
    upsertConnection(openaiConn())

    const result = await activateConnectionForSession(
      openaiConn(),
      'main',
      null,
    )
    expect(result.success).toBe(true)
    expect(process.env.OPENAI_AUTH_MODE).toBe('')

    // Simulate applyConfigEnvironmentVariables after session activation
    injectCCBProviderAuthEnv('openai')
    expect(process.env.OPENAI_AUTH_MODE).toBe('')
  })

  test('records the env delta as the session overlay for re-application', async () => {
    upsertConnection(openaiConn())
    const result = await activateConnectionForSession(
      openaiConn(),
      'main',
      'deepseek-reasoner',
    )
    expect(result.success).toBe(true)

    const overlay = getSessionProviderEnvOverlay()
    expect(overlay?.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(overlay?.OPENAI_API_KEY).toBe('sk-a')
    expect(overlay?.OPENAI_AUTH_MODE).toBe('')
    expect(overlay).toHaveProperty('OPENAI_MODEL', undefined)

    // Simulate the trust-time applyConfigEnvironmentVariables restoring a
    // ChatGPT global default over the session activation…
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    process.env.OPENAI_BASE_URL = 'https://global.example.com'
    process.env.OPENAI_MODEL = 'gpt-5.5'
    // …and the overlay re-assertion that now runs right after it.
    applySessionProviderEnvOverlay()

    expect(process.env.OPENAI_AUTH_MODE).toBe('')
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(process.env.OPENAI_MODEL).toBeUndefined()
    expect(process.env.OPENAI_DEFAULT_SONNET_MODEL).toBe('deepseek-chat')
  })

  test('subagent-slot activation does not record a session env overlay', async () => {
    upsertConnection(openaiConn())
    await activateConnectionForSession(openaiConn(), 'subagent', null)
    expect(getSessionProviderEnvOverlay()).toBeNull()
  })

  test('model omitted: falls back to the connection pinned model', async () => {
    const conn = openaiConn({ model: 'deepseek-reasoner' })
    upsertConnection(conn)

    const result = await activateConnectionForSession(conn, 'main')

    expect(result.success).toBe(true)
    expect(result.mainLoopModel).toBe('deepseek-reasoner')
    expect(process.env.OPENAI_DEFAULT_MODEL).toBe('deepseek-reasoner')
  })

  test('thinkingEffort off deploys OPENAI_ENABLE_THINKING=0 to the session', async () => {
    const conn = openaiConn({
      model: 'deepseek-reasoner',
      thinkingEffort: 'off',
    })
    upsertConnection(conn)

    const result = await activateConnectionForSession(conn, 'main')
    expect(result.success).toBe(true)
    expect(process.env.OPENAI_ENABLE_THINKING).toBe('0')
    expect(getSessionProviderEnvOverlay()?.OPENAI_ENABLE_THINKING).toBe('0')
  })

  test('switching between two openai-compat accounts swaps credentials', async () => {
    const connA = openaiConn()
    const connB = openaiConn({
      id: 'zhipu-b',
      label: 'Zhipu B',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'sk-b',
      tierModels: undefined,
    })
    upsertConnection(connA)
    upsertConnection(connB)

    await activateConnectionForSession(connA, 'main', 'deepseek-chat')
    expect(process.env.OPENAI_API_KEY).toBe('sk-a')

    await activateConnectionForSession(connB, 'main', 'glm-4.7')
    expect(process.env.OPENAI_API_KEY).toBe('sk-b')
    expect(process.env.OPENAI_BASE_URL).toBe(
      'https://open.bigmodel.cn/api/paas/v4',
    )
    // connA's tier mapping must not leak into connB
    expect(process.env.OPENAI_DEFAULT_HAIKU_MODEL).toBe('glm-4.7')
    expect(process.env.OPENAI_DEFAULT_MODEL).toBe('glm-4.7')
  })

  test('anthropic-oauth: activates the stored account slot', async () => {
    setOauthAccount({ accountUuid: 'u1', emailAddress: 'a@x.com' })
    storageData = {
      claudeAiOauth: {
        accessToken: 'at-a',
        refreshToken: 'rt-a',
        expiresAt: 1,
        scopes: [],
      },
      claudeAiOauthAccounts: {
        u2: {
          tokens: {
            accessToken: 'at-b',
            refreshToken: 'rt-b',
            expiresAt: 1,
            scopes: [],
          },
          account: { accountUuid: 'u2', emailAddress: 'b@x.com' },
          savedAt: 'x',
        },
      },
    }
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.com'
    const conn: Connection = {
      id: 'acc-b',
      label: 'b@x.com',
      kind: 'anthropic-oauth',
      credentialRef: 'u2',
    }
    upsertConnection(conn)

    const result = await activateConnectionForSession(conn, 'main', null)

    expect(result.success).toBe(true)
    expect(
      (storageData as Record<string, { accessToken?: string }>)['claudeAiOauth']
        ?.accessToken,
    ).toBe('at-b')
    expect(oauthAccount).toMatchObject({
      accountUuid: 'u2',
    })
    // Leftover custom endpoint cleared so OAuth is actually used
    expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(getAPIProvider({}, process.env)).toBe('firstParty')
  })

  test('anthropic-oauth without stored slot fails cleanly', async () => {
    const conn: Connection = {
      id: 'acc-x',
      label: 'x@x.com',
      kind: 'anthropic-oauth',
      credentialRef: 'missing',
    }
    const result = await activateConnectionForSession(conn, 'main')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('cursor OAuth: activates when the credential file exists', async () => {
    writeCursorAuthFile('cur-oauth')
    const conn = cursorOAuthConn()
    upsertConnection(conn)

    const result = await activateConnectionForSession(conn, 'main', 'auto')
    expect(result.success).toBe(true)
    expect(process.env.CURSOR_AUTH_MODE).toBe('oauth')
    expect(process.env.CURSOR_CREDENTIAL_SCOPE).toBe('cur-oauth')
    expect(getAPIProvider({}, process.env)).toBe('cursor')
  })

  test('cursor OAuth: fails cleanly when the credential file is missing', async () => {
    const conn = cursorOAuthConn('gone')
    const result = await activateConnectionForSession(conn, 'main')
    expect(result.success).toBe(false)
    expect(result.error).toContain('/connect')
    // Env + provider selection stay untouched on failure.
    expect(process.env.CURSOR_AUTH_MODE).toBeUndefined()
    expect(getAPIProvider({}, {})).toBe('firstParty')
  })

  test('cursor manual (apiKey) needs no credential file', async () => {
    const conn: Connection = {
      id: 'cur-manual',
      label: 'Cursor Manual',
      kind: 'cursor',
      apiKey: 'user::jwt',
      machineId: 'm-1',
    }
    upsertConnection(conn)
    const result = await activateConnectionForSession(conn, 'main', 'auto')
    expect(result.success).toBe(true)
    expect(process.env.CURSOR_API_KEY).toBe('user::jwt')
    expect(process.env.CURSOR_AUTH_MODE).toBeUndefined()
  })
})

describe('activateConnectionForSession (subagent slot)', () => {
  test('openai-compat: sets full subagent provider override', async () => {
    const conn = openaiConn()
    upsertConnection(conn)
    const result = await activateConnectionForSession(
      conn,
      'subagent',
      'deepseek-chat',
    )
    expect(result.success).toBe(true)

    const config = getSubagentProviderConfig({}, {})
    expect(config?.modelType).toBe('openai')
    expect(config?.model).toBe('deepseek-chat')
    expect(config?.env?.OPENAI_API_KEY).toBe('sk-a')
    expect(config?.env?.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
  })

  test('chatgpt-oauth: routes credentialScope to the connection scope', async () => {
    writeChatGPTAuthFile('gpt-work')
    const conn: Connection = {
      id: 'gpt-work',
      label: 'ChatGPT Work',
      kind: 'chatgpt-oauth',
      credentialRef: 'gpt-work',
    }
    upsertConnection(conn)
    const result = await activateConnectionForSession(conn, 'subagent', null)
    expect(result.success).toBe(true)

    const config = getSubagentProviderConfig({}, {})
    expect(config?.modelType).toBe('openai')
    expect(config?.credentialScope).toBe('gpt-work')
    expect(config?.env?.OPENAI_AUTH_MODE).toBe('chatgpt')
  })

  test('does not touch process.env or main provider', async () => {
    const conn = openaiConn()
    upsertConnection(conn)
    await activateConnectionForSession(conn, 'subagent', 'deepseek-chat')
    expect(process.env.OPENAI_API_KEY).toBeUndefined()
    expect(getAPIProvider({}, {})).toBe('firstParty')
  })

  test('model omitted: subagent config pins the connection model', async () => {
    const conn = openaiConn({ model: 'deepseek-reasoner' })
    upsertConnection(conn)
    const result = await activateConnectionForSession(conn, 'subagent')
    expect(result.success).toBe(true)
    expect(getSubagentProviderConfig({}, {})?.model).toBe('deepseek-reasoner')
  })

  test('connection thinkingEffort travels on the subagent override config', async () => {
    const conn = openaiConn({
      model: 'deepseek-reasoner',
      thinkingEffort: 'high',
    })
    upsertConnection(conn)
    const result = await activateConnectionForSession(conn, 'subagent')
    expect(result.success).toBe(true)
    const config = getSubagentProviderConfig({}, {}) as
      | (Record<string, unknown> & { env?: Record<string, string> })
      | undefined
    expect(config?.['thinkingEffort']).toBe('high')
  })

  test('thinkingEffort off puts OPENAI_ENABLE_THINKING=0 in the subagent env', async () => {
    const conn = openaiConn({
      model: 'deepseek-reasoner',
      thinkingEffort: 'off',
    })
    upsertConnection(conn)
    const result = await activateConnectionForSession(conn, 'subagent')
    expect(result.success).toBe(true)
    const config = getSubagentProviderConfig({}, {})
    expect(config?.env?.OPENAI_ENABLE_THINKING).toBe('0')
  })
})

describe('chatgpt-oauth credential validation', () => {
  test('default-scope session activation fails when no credential exists', async () => {
    const result = await activateConnectionForSession(chatgptConn(), 'main')
    expect(result.success).toBe(false)
    expect(result.error).toContain('/login')
    // Env and provider selection must stay untouched on failure
    expect(process.env.OPENAI_AUTH_MODE).toBeUndefined()
    expect(getAPIProvider({}, {})).toBe('firstParty')
  })

  test('default-scope session activation succeeds when the credential exists', async () => {
    writeChatGPTAuthFile()
    const result = await activateConnectionForSession(chatgptConn(), 'main')
    expect(result.success).toBe(true)
    expect(process.env.OPENAI_AUTH_MODE).toBe('chatgpt')
    expect(getAPIProvider({}, process.env)).toBe('openai')
  })

  test('Codex CLI auth.json satisfies the default-scope check', async () => {
    const codexDir = join(tmpDir, 'codex-live')
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      join(codexDir, 'auth.json'),
      JSON.stringify({
        tokens: { id_token: 'id', access_token: 'at', refresh_token: 'rt' },
      }),
    )
    process.env['CODEX_HOME'] = codexDir

    const result = await activateConnectionForSession(chatgptConn(), 'main')
    expect(result.success).toBe(true)
  })

  test('scoped activation fails with /connect guidance when the file is gone', async () => {
    const result = await activateConnectionForSession(
      chatgptConn('gpt-work'),
      'main',
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('/connect')
  })

  test('scoped activation deploys the scoped file into the default slot', async () => {
    writeChatGPTAuthFile('gpt-work')
    const result = await activateConnectionForSession(
      chatgptConn('gpt-work'),
      'main',
    )
    expect(result.success).toBe(true)
    expect(existsSync(join(tmpDir, 'openai-chatgpt-auth.json'))).toBe(true)
    expect(process.env.OPENAI_AUTH_MODE).toBe('chatgpt')
  })

  test('subagent session activation fails when no credential exists', async () => {
    const result = await activateConnectionForSession(chatgptConn(), 'subagent')
    expect(result.success).toBe(false)
    expect(getSubagentProviderConfig({}, {})).toBeUndefined()
  })

  test('global activation fails without persisting anything', async () => {
    const result = await activateConnectionGlobally(chatgptConn(), 'main')
    expect(result.success).toBe(false)
    expect(readUserSettings()['modelType']).toBeUndefined()
    expect(readCCBProviderAuthData()).toEqual({})
    expect(getDefaultAssignment('main')).toBeUndefined()
  })
})

describe('activateConnectionGlobally', () => {
  test('main slot: persists credentials, modelType, providerModels and default', async () => {
    const conn = openaiConn()
    upsertConnection(conn)

    const result = await activateConnectionGlobally(
      conn,
      'main',
      'deepseek-reasoner',
    )
    expect(result.success).toBe(true)

    // Credentials written to the CCB provider auth store
    const providerAuth = readCCBProviderAuthData()
    expect(providerAuth.openai?.env.OPENAI_API_KEY).toBe('sk-a')
    expect(providerAuth.openai?.env.OPENAI_BASE_URL).toBe(
      'https://api.deepseek.com',
    )

    // settings.json: modelType + per-provider model
    const settings = readUserSettings()
    expect(settings['modelType']).toBe('openai')
    expect(settings['providerModels']).toMatchObject({
      openai: { model: 'deepseek-reasoner' },
    })

    // Registry default recorded
    expect(getDefaultAssignment('main')).toEqual({
      connectionId: 'deepseek-a',
      model: 'deepseek-reasoner',
    })

    // Session applied too
    expect(process.env.OPENAI_API_KEY).toBe('sk-a')
    expect(result.mainLoopModel).toBe('deepseek-reasoner')
  })

  test('subagent slot: persists subagentProvider and subagentModel', async () => {
    const conn = openaiConn()
    upsertConnection(conn)

    const result = await activateConnectionGlobally(
      conn,
      'subagent',
      'deepseek-chat',
    )
    expect(result.success).toBe(true)

    const settings = readUserSettings() as {
      subagentProvider?: { modelType: string; env?: Record<string, string> }
      providerModels?: Record<string, { subagentModel?: string }>
    }
    expect(settings.subagentProvider?.modelType).toBe('openai')
    expect(settings.subagentProvider?.env?.OPENAI_API_KEY).toBe('sk-a')
    expect(settings.providerModels?.['openai']?.subagentModel).toBe(
      'deepseek-chat',
    )

    expect(getDefaultAssignment('subagent')).toEqual({
      connectionId: 'deepseek-a',
      model: 'deepseek-chat',
    })
  })

  test('main slot: model omitted resolves the connection pinned model', async () => {
    const conn = openaiConn({ model: 'deepseek-reasoner' })
    upsertConnection(conn)

    const result = await activateConnectionGlobally(conn, 'main')
    expect(result.success).toBe(true)
    expect(result.mainLoopModel).toBe('deepseek-reasoner')

    const settings = readUserSettings()
    expect(settings['providerModels']).toMatchObject({
      openai: { model: 'deepseek-reasoner' },
    })
    expect(getDefaultAssignment('main')).toEqual({
      connectionId: 'deepseek-a',
      model: 'deepseek-reasoner',
    })
  })

  test('anthropic-api main slot writes settings.env instead of provider auth file', async () => {
    const conn: Connection = {
      id: 'gateway',
      label: 'Gateway',
      kind: 'anthropic-api',
      baseUrl: 'https://gw.example.com',
      apiKey: 'tok',
    }
    upsertConnection(conn)

    const result = await activateConnectionGlobally(conn, 'main', null)
    expect(result.success).toBe(true)

    const settings = readUserSettings()
    expect(settings['env']).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://gw.example.com',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    })
    expect(settings['modelType']).toBe('anthropic')
    // Nothing written into the openai/gemini/grok credential file
    expect(readCCBProviderAuthData()).toEqual({})
  })
})
