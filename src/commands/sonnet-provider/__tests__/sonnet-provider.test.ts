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
// The mock shape MUST stay identical to subagent-provider/__tests__ and
// fast-provider/__tests__ — bun's mock.module is process-global
// (last-write-wins across test files).
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
const { call: jsxCall } = await import('../sonnet-provider.js')
const { _invalidateConnectionsCache, getDefaultAssignment, upsertConnection } =
  await import('../../../services/connections/store.js')
const { setSessionAssignment } = await import(
  '../../../services/connections/sessionAssignments.js'
)
const { getSonnetProviderConfig, setSonnetProviderCliOverride } = await import(
  '../../../utils/model/sonnetProvider.js'
)
import type { Connection } from '../../../services/connections/types.js'

let tmpDir: string
let previousConfigDir: string | undefined
let savedCodexHome: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-sonnet-provider-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  savedCodexHome = process.env['CODEX_HOME']
  process.env['CODEX_HOME'] = join(tmpDir, 'codex-home-missing')
  _invalidateConnectionsCache()
  mockSettings = {}
  updateCalls.length = 0
  setSonnetProviderCliOverride(undefined)
  setSessionAssignment('sonnet', undefined)
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  if (savedCodexHome === undefined) {
    delete process.env['CODEX_HOME']
  } else {
    process.env['CODEX_HOME'] = savedCodexHome
  }
  _invalidateConnectionsCache()
  setSonnetProviderCliOverride(undefined)
  setSessionAssignment('sonnet', undefined)
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
    model: 'deepseek-v4-pro',
    ...overrides,
  }
}

describe('/sonnet-provider command', () => {
  test('no args shows current sonnet provider', async () => {
    mockSettings = { sonnetProvider: { modelType: 'openai' } }
    const result = await call('', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain(
      'Current sonnet provider:',
    )
    expect((result as { value: string }).value).toContain(
      '(from settings: openai)',
    )
  })

  test('no args shows no settings source when unconfigured', async () => {
    const result = await call('', {} as never)
    expect((result as { value: string }).value).toContain(
      'Current sonnet provider:',
    )
    expect((result as { value: string }).value).not.toContain('(from settings:')
  })

  test('unknown connection errors with the connections table', async () => {
    const result = await call('nope', {} as never)
    expect((result as { value: string }).value).toContain('/connect')
  })

  test('<connection> activates the sonnet slot for this session', async () => {
    upsertConnection(deepseekConn({ thinkingEffort: 'high' }))
    const result = await call('deepseek', {} as never)
    const value = (result as { value: string }).value
    expect(value).toContain('DeepSeek (deepseek-v4-pro, effort high)')
    expect(value).toContain('for this session')
    expect(value).toContain('sonnet (SONNET tier)')

    const config = getSonnetProviderConfig({}, {})
    expect(config?.modelType).toBe('openai')
    expect(config?.model).toBe('deepseek-v4-pro')
    expect(config?.env?.OPENAI_API_KEY).toBe('sk-a')
    // Session-only: no settings write, no registry default
    expect(updateCalls).toHaveLength(0)
    expect(getDefaultAssignment('sonnet')).toBeUndefined()
  })

  test('<connection> global persists sonnetProvider and the default', async () => {
    upsertConnection(deepseekConn())
    const result = await call('deepseek global', {} as never)
    expect((result as { value: string }).value).toContain('global default')

    const sonnetProvider = mockSettings['sonnetProvider'] as
      | { modelType?: string; model?: string }
      | undefined
    expect(sonnetProvider?.modelType).toBe('openai')
    expect(sonnetProvider?.model).toBe('deepseek-v4-pro')
    expect(getDefaultAssignment('sonnet')).toEqual({
      connectionId: 'deepseek',
      model: 'deepseek-v4-pro',
    })
  })

  test('unset clears overrides and settings so sonnet calls inherit main', async () => {
    upsertConnection(deepseekConn())
    await call('deepseek global', {} as never)
    expect(getSonnetProviderConfig({}, {})).toBeDefined()

    const result = await call('unset', {} as never)
    expect(result).toEqual({
      type: 'text',
      value:
        'Sonnet provider cleared. Internal SONNET-tier calls will now inherit the main provider.',
    })
    expect(mockSettings['sonnetProvider']).toBeUndefined()
    expect(getDefaultAssignment('sonnet')).toBeUndefined()
    // The unset override also blocks SONNET_* env staging for this process
    expect(
      getSonnetProviderConfig({}, { SONNET_OPENAI_API_KEY: 'sk-x' }),
    ).toBeUndefined()
  })

  test('interactive argument path refreshes provider slot display on success', async () => {
    upsertConnection(deepseekConn())
    const appState = { providerSlotsVersion: 0 }
    const context = {
      setAppState(updater: (prev: typeof appState) => typeof appState) {
        Object.assign(appState, updater(appState))
      },
    }
    let doneMessage: string | undefined

    await jsxCall(
      message => {
        doneMessage = message
      },
      context as never,
      'deepseek',
    )

    expect(doneMessage).toContain('DeepSeek')
    expect(appState.providerSlotsVersion).toBe(1)
  })

  test('interactive picker path passes provider slot refresh callback', async () => {
    const appState = { providerSlotsVersion: 0 }
    const context = {
      setAppState(updater: (prev: typeof appState) => typeof appState) {
        Object.assign(appState, updater(appState))
      },
    }

    const element = (await jsxCall(() => {}, context as never, '')) as {
      props: { onAuthChanged: () => void }
    }
    element.props.onAuthChanged()

    expect(appState.providerSlotsVersion).toBe(1)
  })
})
