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
// Spread-real mock pattern (see CLAUDE.md cross-file mock pollution rules).
// updateSettingsForSource is captured so /provider's settings writes are
// observable without touching a real settings.json.
import * as realSettings from '../../../utils/settings/settings.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let mockSettings: Record<string, unknown> = {}
const updateCalls: Array<{ source: string; update: Record<string, unknown> }> =
  []
mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getSettings_DEPRECATED: () => mockSettings,
  getInitialSettings: () => mockSettings,
  updateSettingsForSource: (
    source: string,
    update: Record<string, unknown>,
  ) => {
    updateCalls.push({ source, update })
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) delete mockSettings[key]
      else mockSettings[key] = value
    }
    return { error: null }
  },
}))

// The migrate/import path reads the active OAuth account through this seam;
// stub it so the developer's real global config is never touched.
const { _setOAuthConfigAccessForTest } = await import(
  '../../../services/connections/oauthAccounts.js'
)
_setOAuthConfigAccessForTest({
  getAccount: () => undefined,
  setAccount: () => {},
})

const { call } = await import('../nonInteractive.js')
const { _invalidateConnectionsCache, getDefaultAssignment, upsertConnection } =
  await import('../../../services/connections/store.js')
const { setSessionAssignment } = await import(
  '../../../services/connections/sessionAssignments.js'
)
const { setSessionProviderEnvOverlay } = await import(
  '../../../services/connections/sessionEnvOverlay.js'
)
const { getAPIProvider, setProviderCliOverride } = await import(
  '../../../utils/model/providers.js'
)
import type { Connection } from '../../../services/connections/types.js'

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
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
  'CLAUDE_CODE_USE_CURSOR',
]

let savedEnv: Record<string, string | undefined> = {}
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-provider-cmd-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  mockSettings = {}
  updateCalls.length = 0
  setProviderCliOverride(undefined)
  setSessionProviderEnvOverlay(null)
  setSessionAssignment('main', undefined)
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  setProviderCliOverride(undefined)
  setSessionProviderEnvOverlay(null)
  setSessionAssignment('main', undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

afterAll(() => {
  _setOAuthConfigAccessForTest(null)
})

function deepseekConn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-a',
    model: 'deepseek-chat',
    ...overrides,
  }
}

describe('/provider command', () => {
  test('no args shows the current provider', async () => {
    const result = await call('', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Current API provider: firstParty',
    })
  })

  test('unknown connection ref errors with the connection list', async () => {
    upsertConnection(deepseekConn())
    const result = await call('nope', {} as never)
    expect(result.type).toBe('text')
    const value = (result as { value: string }).value
    expect(value).toContain('Unknown connection')
    expect(value).toContain('deepseek')
    // No switch happened
    expect(getAPIProvider({}, process.env)).toBe('firstParty')
  })

  test('empty registry errors with /connect guidance', async () => {
    const result = await call('nope', {} as never)
    expect((result as { value: string }).value).toContain('/connect')
  })

  test('legacy provider type names are no longer accepted', async () => {
    upsertConnection(deepseekConn())
    const result = await call('openai', {} as never)
    expect((result as { value: string }).value).toContain('Unknown connection')
  })

  test('<connection> switches the main slot for this session', async () => {
    upsertConnection(deepseekConn({ thinkingEffort: 'high' }))
    const result = await call('deepseek', {} as never)
    const value = (result as { value: string }).value
    expect(value).toContain('DeepSeek (deepseek-chat, effort high)')
    expect(value).toContain('for this session')
    // Deployed env + provider override
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(process.env.OPENAI_API_KEY).toBe('sk-a')
    expect(getAPIProvider({}, process.env)).toBe('openai')
    // Session-only: no settings write
    expect(updateCalls).toHaveLength(0)
    expect(getDefaultAssignment('main')).toBeUndefined()
  })

  test('resolves connections by case-insensitive label', async () => {
    upsertConnection(
      deepseekConn({ id: 'deepseek-work', label: 'DeepSeek Work' }),
    )
    const result = await call('deepseek work', {} as never)
    expect((result as { value: string }).value).toContain('DeepSeek Work')
    expect(getAPIProvider({}, process.env)).toBe('openai')
  })

  test('<connection> global also persists the global default', async () => {
    upsertConnection(deepseekConn())
    const result = await call('deepseek global', {} as never)
    const value = (result as { value: string }).value
    expect(value).toContain('global default')
    expect(mockSettings['modelType']).toBe('openai')
    expect(getDefaultAssignment('main')).toEqual({
      connectionId: 'deepseek',
      model: 'deepseek-chat',
    })
    // Session applied too
    expect(process.env.OPENAI_API_KEY).toBe('sk-a')
  })

  test('unset clears settings, override and provider env vars', async () => {
    mockSettings = { modelType: 'openai' }
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.CLAUDE_CODE_USE_GROK = '1'
    setProviderCliOverride('openai')

    const result = await call('unset', {} as never)
    expect((result as { value: string }).value).toContain(
      'API provider cleared',
    )
    expect(mockSettings['modelType']).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_GROK).toBeUndefined()
    expect(getAPIProvider({}, {})).toBe('firstParty')
  })
})
