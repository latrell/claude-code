import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
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
  'OPENAI_AUTH_MODE',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'GEMINI_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_DEFAULT_HAIKU_MODEL',
  'GEMINI_DEFAULT_SONNET_MODEL',
  'GEMINI_DEFAULT_OPUS_MODEL',
  'GROK_BASE_URL',
  'GROK_API_KEY',
  'GROK_MODEL',
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
  _useMocks = true
  storageData = null
  setOauthAccount(undefined)
  userSettingsState = {}
  setProviderCliOverride(undefined)
  setSubagentProviderConfigOverride(undefined)
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

describe('envForConnection', () => {
  test('openai-compat clears auth mode and stale OPENAI_MODEL', () => {
    const env = envForConnection(openaiConn(), 'deepseek-reasoner')
    expect(env.OPENAI_AUTH_MODE).toBeUndefined()
    expect(env.OPENAI_MODEL).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(env.OPENAI_API_KEY).toBe('sk-a')
    expect(env.OPENAI_DEFAULT_HAIKU_MODEL).toBe('deepseek-chat')
    // opus tier unset in connection → falls back to picked model
    expect(env.OPENAI_DEFAULT_OPUS_MODEL).toBe('deepseek-reasoner')
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
    expect(process.env.OPENAI_AUTH_MODE).toBeUndefined()
    expect(getAPIProvider({}, process.env)).toBe('openai')
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
