import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logMock } from '../../../../tests/mocks/log'
// Spread-real mock pattern (see CLAUDE.md cross-file mock pollution rules)
import * as realSecureStorage from '../../../utils/secureStorage/index.js'
// NOTE: settings.ts and config.ts are intentionally NOT mocked — registering
// mock.module for either mid-suite deadlocks later dynamic imports of the
// command registry on this repo (bun module-graph interaction). Settings
// content is provided via a real settings.json in the per-test
// CLAUDE_CONFIG_DIR; the oauthAccount path uses the oauthAccounts test seam.
import type { AccountInfo } from '../../../utils/config.js'
import { resetSettingsCache } from '../../../utils/settings/settingsCache.js'

mock.module('src/utils/log.ts', logMock)

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

const { importLegacyConnections } = await import('../migrate.js')
const { _invalidateConnectionsCache, listConnections, upsertConnection } =
  await import('../store.js')

afterAll(() => {
  _useMocks = false
  _setOAuthConfigAccessForTest(null)
})

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-migrate-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  resetSettingsCache()
  _useMocks = true
  storageData = null
  setOauthAccount(undefined)
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  resetSettingsCache()
  setOauthAccount(undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

function writeProviderAuth(data: Record<string, unknown>): void {
  writeFileSync(
    join(tmpDir, 'ccb-provider-auth.json'),
    JSON.stringify(data, null, 2),
  )
}

function writeUserSettings(data: Record<string, unknown>): void {
  writeFileSync(join(tmpDir, 'settings.json'), JSON.stringify(data, null, 2))
  resetSettingsCache()
}

describe('importLegacyConnections', () => {
  test('imports nothing from a pristine environment', () => {
    const { imported } = importLegacyConnections()
    expect(imported).toBe(0)
    expect(listConnections()).toEqual([])
  })

  test('imports an OpenAI-compat entry with tier models and preset label', () => {
    writeProviderAuth({
      openai: {
        env: {
          OPENAI_BASE_URL: 'https://api.deepseek.com',
          OPENAI_API_KEY: 'sk-legacy',
          OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-chat',
          OPENAI_DEFAULT_OPUS_MODEL: 'deepseek-reasoner',
          OPENAI_DEFAULT_HAIKU_MODEL: 'deepseek-chat',
        },
      },
    })

    const { imported } = importLegacyConnections()
    expect(imported).toBe(1)

    const conn = listConnections()[0]
    expect(conn?.kind).toBe('openai-compat')
    expect(conn?.label).toBe('DeepSeek')
    expect(conn?.presetId).toBe('deepseek')
    expect(conn?.baseUrl).toBe('https://api.deepseek.com')
    expect(conn?.apiKey).toBe('sk-legacy')
    expect(conn?.tierModels?.sonnet).toBe('deepseek-chat')
    expect(conn?.models).toEqual(['deepseek-reasoner', 'deepseek-chat'])
  })

  test('imports ChatGPT subscription from OPENAI_AUTH_MODE marker', () => {
    writeProviderAuth({
      openai: { env: { OPENAI_AUTH_MODE: 'chatgpt' } },
    })

    const { imported } = importLegacyConnections()
    expect(imported).toBe(1)
    const conn = listConnections()[0]
    expect(conn?.kind).toBe('chatgpt-oauth')
    expect(conn?.credentialRef).toBe('default')
  })

  test('imports ChatGPT subscription from the default auth file', () => {
    writeFileSync(
      join(tmpDir, 'openai-chatgpt-auth.json'),
      JSON.stringify({ auth_mode: 'chatgpt', tokens: {} }),
    )

    const { imported } = importLegacyConnections()
    expect(imported).toBe(1)
    const conn = listConnections()[0]
    expect(conn?.kind).toBe('chatgpt-oauth')
    expect(conn?.credentialRef).toBe('default')
  })

  test('does not re-import the default ChatGPT slot when a ChatGPT connection exists', () => {
    // Activating a scoped connection deploys its credential file into the
    // default slot and writes the chatgpt marker into provider auth. Neither
    // artifact is a legacy login, so nothing should be imported.
    upsertConnection({
      id: 'chatgpt',
      label: 'ChatGPT 订阅',
      kind: 'chatgpt-oauth',
      credentialRef: 'chatgpt',
    })
    writeFileSync(
      join(tmpDir, 'openai-chatgpt-auth.json'),
      JSON.stringify({ auth_mode: 'chatgpt', tokens: {} }),
    )
    writeProviderAuth({
      openai: { env: { OPENAI_AUTH_MODE: 'chatgpt' } },
    })

    const { imported } = importLegacyConnections()
    expect(imported).toBe(0)
    expect(listConnections()).toHaveLength(1)
    expect(listConnections()[0]?.credentialRef).toBe('chatgpt')
  })

  test('imports gemini and grok entries', () => {
    writeProviderAuth({
      gemini: {
        env: {
          GEMINI_API_KEY: 'g-key',
          GEMINI_DEFAULT_SONNET_MODEL: 'gemini-2.5-pro',
        },
      },
      grok: {
        env: { XAI_API_KEY: 'x-key', GROK_MODEL: 'grok-4' },
      },
    })

    const { imported } = importLegacyConnections()
    expect(imported).toBe(2)

    const kinds = listConnections()
      .map(c => c.kind)
      .sort()
    expect(kinds).toEqual(['gemini', 'grok'])
    const grok = listConnections().find(c => c.kind === 'grok')
    expect(grok?.apiKey).toBe('x-key')
    expect(grok?.models).toEqual(['grok-4'])
  })

  test('imports anthropic-compatible endpoint from userSettings.env', () => {
    writeUserSettings({
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example.com',
        ANTHROPIC_AUTH_TOKEN: 'tok-1',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'my-sonnet',
      },
    })

    const { imported } = importLegacyConnections()
    expect(imported).toBe(1)
    const conn = listConnections()[0]
    expect(conn?.kind).toBe('anthropic-api')
    expect(conn?.baseUrl).toBe('https://gateway.example.com')
    expect(conn?.apiKey).toBe('tok-1')
    expect(conn?.label).toBe('gateway.example.com')
  })

  test('imports the active claude.ai OAuth account and seeds its slot', () => {
    setOauthAccount({ accountUuid: 'u1', emailAddress: 'me@x.com' })
    storageData = {
      claudeAiOauth: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 1000,
        scopes: ['user:inference'],
      },
    }

    const { imported } = importLegacyConnections()
    expect(imported).toBe(1)

    const conn = listConnections()[0]
    expect(conn?.kind).toBe('anthropic-oauth')
    expect(conn?.credentialRef).toBe('u1')
    expect(conn?.accountEmail).toBe('me@x.com')

    // Slot seeded in secure storage
    const slots = (storageData as Record<string, unknown>)[
      'claudeAiOauthAccounts'
    ] as Record<string, { tokens: { accessToken: string } }>
    expect(slots['u1']?.tokens.accessToken).toBe('at')
  })

  test('skips OAuth account with inference-only tokens', () => {
    setOauthAccount({ accountUuid: 'u1', emailAddress: 'me@x.com' })
    storageData = {
      claudeAiOauth: {
        accessToken: 'at',
        refreshToken: null,
        expiresAt: null,
        scopes: ['user:inference'],
      },
    }
    const { imported } = importLegacyConnections()
    expect(imported).toBe(0)
  })

  test('is idempotent across repeated calls', () => {
    writeProviderAuth({
      openai: {
        env: {
          OPENAI_BASE_URL: 'https://api.deepseek.com',
          OPENAI_API_KEY: 'sk-legacy',
        },
      },
      gemini: { env: { GEMINI_API_KEY: 'g-key' } },
    })

    expect(importLegacyConnections().imported).toBe(2)
    expect(importLegacyConnections().imported).toBe(0)
    expect(listConnections()).toHaveLength(2)
  })

  test('does not duplicate a connection the user already created manually', () => {
    writeProviderAuth({
      openai: {
        env: {
          OPENAI_BASE_URL: 'https://api.deepseek.com',
          OPENAI_API_KEY: 'sk-legacy',
        },
      },
    })
    // Simulate a pre-existing manual connection with the same signature
    upsertConnection({
      id: 'my-deepseek',
      label: 'My DeepSeek',
      kind: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-legacy',
    })

    expect(importLegacyConnections().imported).toBe(0)
    expect(listConnections()).toHaveLength(1)
  })
})
