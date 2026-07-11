/**
 * Tests for the global (settings.json) coordinator mode persistence.
 *
 * The `coordinatorMode` settings key is the default for NEW sessions only:
 * applyGlobalCoordinatorDefault() deploys it to the
 * CLAUDE_CODE_COORDINATOR_MODE env var at startup, and an explicitly set
 * env var (truthy or falsy) always wins.
 */
import {
  afterAll,
  afterEach,
  describe,
  expect,
  test,
  beforeEach,
  mock,
} from 'bun:test'
import * as settingsModule from '../../utils/settings/settings.js'

// ── Mocks must be declared before the module under test is imported ──────────

let mockSettings: Record<string, unknown> = {}
let lastUpdate: { source: string; patch: Record<string, unknown> } | null = null

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({
    hasBase: false,
    hasDropIns: false,
  }),
  parseSettingsFile: () => ({ settings: null, errors: [] }),
  getSettingsRootPathForSource: () => '',
  getSettingsFilePathForSource: () => undefined,
  getRelativeSettingsFilePathForSource: () => '',
  getInitialSettings: () => mockSettings,
  getSettingsForSource: () => mockSettings,
  getPolicySettingsOrigin: () => null,
  getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
  getSettingsWithSources: () => ({ effective: mockSettings, sources: [] }),
  getSettings_DEPRECATED: () => mockSettings,
  settingsMergeCustomizer: () => undefined,
  getManagedSettingsKeysForLogging: () => [],
  // Keep unrelated exports aligned with the real settings module so this
  // full-surface mock cannot change later test files if Bun keeps it alive.
  hasAutoModeOptIn: () => true,
  hasSkipDangerousModePermissionPrompt: () => false,
  getAutoModeConfig: () => undefined,
  getUseAutoModeDuringPlan: () => true,
  rawSettingsContainsKey: (key: string) => key in mockSettings,
  updateSettingsForSource: (source: string, patch: Record<string, unknown>) => {
    lastUpdate = { source, patch }
    mockSettings = { ...mockSettings, ...patch }
  },
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
})

// Import AFTER mocks are registered. The query suffix gives this file its own
// module instance so cross-file coordinatorGlobal.js mocks cannot replace the
// subject under test during Bun's shared coverage run.
const coordinatorGlobalModulePath =
  '../coordinatorGlobal.js?coordinatorGlobalTest'
const {
  applyGlobalCoordinatorDefault,
  getGlobalCoordinatorSetting,
  setGlobalCoordinatorSetting,
} = (await import(
  coordinatorGlobalModulePath
)) as typeof import('../coordinatorGlobal.js')

const savedEnv = process.env.CLAUDE_CODE_COORDINATOR_MODE

beforeEach(() => {
  mockSettings = {}
  lastUpdate = null
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
})

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  } else {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = savedEnv
  }
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getGlobalCoordinatorSetting', () => {
  test('returns false when settings has no coordinatorMode key', () => {
    mockSettings = {}
    expect(getGlobalCoordinatorSetting()).toBe(false)
  })

  test('returns true when settings.coordinatorMode === true', () => {
    mockSettings = { coordinatorMode: true }
    expect(getGlobalCoordinatorSetting()).toBe(true)
  })

  test('returns false for non-boolean truthy values', () => {
    mockSettings = { coordinatorMode: '1' }
    expect(getGlobalCoordinatorSetting()).toBe(false)
  })
})

describe('setGlobalCoordinatorSetting', () => {
  test('true writes coordinatorMode: true to userSettings', () => {
    setGlobalCoordinatorSetting(true)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    expect(lastUpdate!.patch.coordinatorMode).toBe(true)
  })

  test('false writes coordinatorMode: undefined (removes key)', () => {
    setGlobalCoordinatorSetting(false)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    // false || undefined === undefined — key is removed to keep settings clean
    expect(lastUpdate!.patch.coordinatorMode).toBeUndefined()
  })

  test('round-trips through getGlobalCoordinatorSetting', () => {
    setGlobalCoordinatorSetting(true)
    expect(getGlobalCoordinatorSetting()).toBe(true)

    setGlobalCoordinatorSetting(false)
    expect(getGlobalCoordinatorSetting()).toBe(false)
  })
})

describe('applyGlobalCoordinatorDefault', () => {
  test('sets env var to "1" when env is unset and settings is true', () => {
    mockSettings = { coordinatorMode: true }
    applyGlobalCoordinatorDefault()
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
  })

  test('leaves env unset when env is unset and settings is missing', () => {
    mockSettings = {}
    applyGlobalCoordinatorDefault()
    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
  })

  test('does not touch an explicitly truthy env var', () => {
    mockSettings = {}
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    applyGlobalCoordinatorDefault()
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
  })

  test('does not override an explicitly falsy env var even when settings is true', () => {
    // CLAUDE_CODE_COORDINATOR_MODE=0 must beat the global default so users
    // can opt out per invocation.
    mockSettings = { coordinatorMode: true }
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '0'
    applyGlobalCoordinatorDefault()
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '0',
    )
  })

  test('is idempotent', () => {
    mockSettings = { coordinatorMode: true }
    applyGlobalCoordinatorDefault()
    applyGlobalCoordinatorDefault()
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
  })
})
