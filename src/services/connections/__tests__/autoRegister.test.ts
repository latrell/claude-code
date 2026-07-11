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
import { logMock } from '../../../../tests/mocks/log'
// Spread-real mock pattern (see CLAUDE.md cross-file mock pollution rules)
import * as realSecureStorage from '../../../utils/secureStorage/index.js'
// NOTE: config.ts is intentionally NOT mocked — registering a mock.module
// for it mid-suite deadlocks later dynamic imports of the command registry
// on this repo. The oauthAccount path uses the oauthAccounts test seam.
import type { AccountInfo } from '../../../utils/config.js'

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

const {
  registerConnectionFromOAuthLogin,
  registerConnectionFromProviderLogin,
} = await import('../autoRegister.js')
const { _invalidateConnectionsCache, listConnections, upsertConnection } =
  await import('../store.js')

afterAll(() => {
  _useMocks = false
  _setOAuthConfigAccessForTest(null)
})

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-autoreg-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
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
  setOauthAccount(undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('registerConnectionFromProviderLogin', () => {
  test('registers an openai-compat connection from login env', () => {
    registerConnectionFromProviderLogin('openai', {
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_API_KEY: 'sk-x',
      OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-chat',
    })
    const conns = listConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0]?.kind).toBe('openai-compat')
    expect(conns[0]?.label).toBe('api.deepseek.com')
    expect(conns[0]?.tierModels?.sonnet).toBe('deepseek-chat')
    // No explicit *_MODEL in the login env → pinned model derived from the
    // sonnet tier immediately, not on the next startup's lazy migration
    expect(conns[0]?.model).toBe('deepseek-chat')
  })

  test('explicit OPENAI_MODEL wins over the sonnet tier as the pinned model', () => {
    registerConnectionFromProviderLogin('openai', {
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_API_KEY: 'sk-x',
      OPENAI_MODEL: 'deepseek-reasoner',
      OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-chat',
    })
    expect(listConnections()[0]?.model).toBe('deepseek-reasoner')
  })

  test('re-login never clobbers an existing pinned model', () => {
    registerConnectionFromProviderLogin('openai', {
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_API_KEY: 'sk-x',
      OPENAI_MODEL: 'deepseek-chat',
    })
    const first = listConnections()[0]
    expect(first?.model).toBe('deepseek-chat')

    // Simulate the user pinning a different model via /model
    upsertConnection({
      ...(first as NonNullable<typeof first>),
      model: 'deepseek-reasoner',
      contextWindow: 65_536,
    })

    // Same credentials, different login-time model → pin is preserved
    registerConnectionFromProviderLogin('openai', {
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_API_KEY: 'sk-x',
      OPENAI_MODEL: 'deepseek-chat',
    })
    const conns = listConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0]?.model).toBe('deepseek-reasoner')
    expect(conns[0]?.contextWindow).toBe(65_536)
  })

  test('OPENAI_AUTH_MODE=chatgpt registers a chatgpt-oauth connection', () => {
    registerConnectionFromProviderLogin('openai', {
      OPENAI_AUTH_MODE: 'chatgpt',
    })
    const conns = listConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0]?.kind).toBe('chatgpt-oauth')
    expect(conns[0]?.credentialRef).toBe('default')
    // No model source for subscription logins → follows provider default
    expect(conns[0]?.model).toBeUndefined()
  })

  test('gemini and grok logins pin their *_MODEL env values', () => {
    registerConnectionFromProviderLogin('gemini', {
      GEMINI_API_KEY: 'g-1',
      GEMINI_MODEL: 'gemini-2.5-pro',
    })
    registerConnectionFromProviderLogin('grok', {
      XAI_API_KEY: 'x-1',
      GROK_MODEL: 'grok-4',
    })
    const gemini = listConnections().find(c => c.kind === 'gemini')
    const grok = listConnections().find(c => c.kind === 'grok')
    expect(gemini?.model).toBe('gemini-2.5-pro')
    expect(grok?.model).toBe('grok-4')
  })

  test('same credentials update the existing connection instead of duplicating', () => {
    registerConnectionFromProviderLogin('gemini', { GEMINI_API_KEY: 'g-1' })
    registerConnectionFromProviderLogin('gemini', { GEMINI_API_KEY: 'g-1' })
    expect(listConnections()).toHaveLength(1)

    // Different key = different account = second connection
    registerConnectionFromProviderLogin('gemini', { GEMINI_API_KEY: 'g-2' })
    expect(listConnections()).toHaveLength(2)
  })

  test('ignores logins without credentials', () => {
    registerConnectionFromProviderLogin('openai', {})
    registerConnectionFromProviderLogin('anthropic', {})
    expect(listConnections()).toHaveLength(0)
  })

  test('anthropic custom endpoint registers anthropic-api connection', () => {
    registerConnectionFromProviderLogin('anthropic', {
      ANTHROPIC_BASE_URL: 'https://gw.example.com',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    })
    const conns = listConnections()
    expect(conns[0]?.kind).toBe('anthropic-api')
    expect(conns[0]?.apiKey).toBe('tok')
  })

  test('re-login with cosmetic baseUrl variants updates instead of duplicating', () => {
    registerConnectionFromProviderLogin('anthropic', {
      ANTHROPIC_BASE_URL: 'https://gw.example.com',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    })
    // Same endpoint entered with an explicit /v1 suffix and trailing slash
    registerConnectionFromProviderLogin('anthropic', {
      ANTHROPIC_BASE_URL: 'https://gw.example.com/v1/',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    })
    const conns = listConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0]?.baseUrl).toBe('https://gw.example.com/v1/')

    // Genuinely different path prefix on the same host = new connection
    registerConnectionFromProviderLogin('anthropic', {
      ANTHROPIC_BASE_URL: 'https://gw.example.com/other/v1',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    })
    expect(listConnections()).toHaveLength(2)
  })
})

describe('registerConnectionFromOAuthLogin', () => {
  test('registers the active claude.ai account and seeds its slot', () => {
    setOauthAccount({ accountUuid: 'u9', emailAddress: 'me@ex.com' })
    storageData = {
      claudeAiOauth: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: 1,
        scopes: [],
      },
    }
    registerConnectionFromOAuthLogin()
    const conns = listConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0]?.kind).toBe('anthropic-oauth')
    expect(conns[0]?.credentialRef).toBe('u9')
    expect(conns[0]?.accountEmail).toBe('me@ex.com')
    // Subscription accounts have no model source → provider default
    expect(conns[0]?.model).toBeUndefined()

    // Second login with the same account does not duplicate
    registerConnectionFromOAuthLogin()
    expect(listConnections()).toHaveLength(1)
  })

  test('no-op when tokens are inference-only', () => {
    setOauthAccount({ accountUuid: 'u9', emailAddress: 'me@ex.com' })
    storageData = {
      claudeAiOauth: {
        accessToken: 'at',
        refreshToken: null,
        expiresAt: null,
        scopes: [],
      },
    }
    registerConnectionFromOAuthLogin()
    expect(listConnections()).toHaveLength(0)
  })

  test('no-op when no oauth account is stored', () => {
    registerConnectionFromOAuthLogin()
    expect(listConnections()).toHaveLength(0)
  })
})
