import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Connection } from 'src/services/connections/types.js'
import { logMock } from '../../../tests/mocks/log'
import * as realSettings from '../settings/settings.js'
import * as realThinking from '../thinking.js'

// Mock heavy dependencies to avoid import chain issues.
// log.ts must be mocked before any import that transitively loads it
// (effort.ts → connections/thinkingEffort.ts → store.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/thinking.js', () => ({
  ...realThinking,
  isUltrathinkEnabled: () => false,
}))
mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getInitialSettings: () => ({}),
  getSettingsWithErrors: () => ({ settings: {}, errors: [] }),
}))
mock.module('src/utils/auth.js', () => ({
  isProSubscriber: () => false,
  isMaxSubscriber: () => false,
  isTeamSubscriber: () => false,
}))
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: (_key: string, defaultValue: unknown) =>
    defaultValue ?? {},
}))
mock.module('src/utils/model/modelSupportOverrides.js', () => ({
  get3PModelCapabilityOverride: () => undefined,
}))

const {
  isEffortLevel,
  parseEffortValue,
  isValidNumericEffort,
  convertEffortValueToLevel,
  getEffortLevelDescription,
  resolvePickerEffortPersistence,
  getConnectionEffortValue,
  getDisplayedEffortLevel,
  getEffortSuffix,
  getDefaultEffortForModel,
  getSupportedEffortLevelsForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  modelSupportsXhighEffort,
  resolveAppliedEffort,
  EFFORT_LEVELS,
} = await import('src/utils/effort.js')
const { setSessionAssignment } = await import(
  'src/services/connections/sessionAssignments.js'
)
const { _invalidateConnectionsCache, setDefaultAssignment, upsertConnection } =
  await import('src/services/connections/store.js')

// ─── EFFORT_LEVELS constant ────────────────────────────────────────────

describe('EFFORT_LEVELS', () => {
  test('contains the five canonical levels', () => {
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })
})

describe('DeepSeek V4 effort calibration', () => {
  let savedEffortEnv: string | undefined

  beforeEach(() => {
    savedEffortEnv = process.env.CLAUDE_CODE_EFFORT_LEVEL
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL
  })

  afterEach(() => {
    if (savedEffortEnv === undefined) {
      delete process.env.CLAUDE_CODE_EFFORT_LEVEL
    } else {
      process.env.CLAUDE_CODE_EFFORT_LEVEL = savedEffortEnv
    }
  })

  test.each([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
  ])('%s supports exactly High and Max', model => {
    expect(modelSupportsEffort(model)).toBe(true)
    expect(getSupportedEffortLevelsForModel(model)).toEqual(['high', 'max'])
  })

  test.each([
    ['low', 'high'],
    ['medium', 'high'],
    ['high', 'high'],
    ['xhigh', 'max'],
    ['max', 'max'],
  ] as const)('normalizes %s to actual %s', (input, expected) => {
    expect(resolveAppliedEffort('deepseek-v4-flash', input)).toBe(expected)
  })

  test('leaves the DeepSeek effort field unset for provider auto-selection', () => {
    expect(getDefaultEffortForModel('deepseek-v4-pro')).toBeUndefined()
  })
})

describe('ChatGPT Codex model effort calibration', () => {
  const ENV_KEYS = [
    'CLAUDE_CODE_USE_OPENAI',
    'OPENAI_AUTH_MODE',
    'CLAUDE_CODE_EFFORT_LEVEL',
    'USER_TYPE',
  ] as const
  let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>

  beforeEach(() => {
    savedEnv = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]]),
    ) as Record<(typeof ENV_KEYS)[number], string | undefined>
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL
    delete process.env.USER_TYPE
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('uses the Codex catalog default for each ChatGPT model', () => {
    expect(getDefaultEffortForModel('gpt-5.6-sol')).toBe('low')
    expect(getDefaultEffortForModel('gpt-5.4')).toBe('medium')
    expect(getDefaultEffortForModel('codex-auto-review')).toBe('medium')
    expect(getDefaultEffortForModel('gpt-5.3-codex-spark')).toBe('high')
  })

  test('exposes max only for the models that advertise it', () => {
    for (const model of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      expect(modelSupportsMaxEffort(model)).toBe(true)
      expect(modelSupportsXhighEffort(model)).toBe(true)
    }
    for (const model of [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'codex-auto-review',
      'gpt-5.3-codex-spark',
    ]) {
      expect(modelSupportsMaxEffort(model)).toBe(false)
      expect(modelSupportsXhighEffort(model)).toBe(true)
    }
  })

  test('preserves the Codex catalog order for picker and SDK consumers', () => {
    expect(getSupportedEffortLevelsForModel('gpt-5.6-sol')).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
    expect(getSupportedEffortLevelsForModel('gpt-5.4')).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  test('keeps native max and clamps older models to xhigh', () => {
    expect(resolveAppliedEffort('gpt-5.6-sol', 'max')).toBe('max')
    expect(resolveAppliedEffort('gpt-5.6-luna', 'max')).toBe('max')
    expect(resolveAppliedEffort('gpt-5.5', 'max')).toBe('xhigh')
    expect(resolveAppliedEffort('gpt-5.4-mini', 'max')).toBe('xhigh')
  })
})

// ─── isEffortLevel ─────────────────────────────────────────────────────

describe('isEffortLevel', () => {
  test("returns true for 'low'", () => {
    expect(isEffortLevel('low')).toBe(true)
  })

  test("returns true for 'medium'", () => {
    expect(isEffortLevel('medium')).toBe(true)
  })

  test("returns true for 'high'", () => {
    expect(isEffortLevel('high')).toBe(true)
  })

  test("returns true for 'max'", () => {
    expect(isEffortLevel('max')).toBe(true)
  })

  test("returns false for 'invalid'", () => {
    expect(isEffortLevel('invalid')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isEffortLevel('')).toBe(false)
  })
})

// ─── parseEffortValue ──────────────────────────────────────────────────

describe('parseEffortValue', () => {
  test('returns undefined for undefined', () => {
    expect(parseEffortValue(undefined)).toBeUndefined()
  })

  test('returns undefined for null', () => {
    expect(parseEffortValue(null)).toBeUndefined()
  })

  test('returns undefined for empty string', () => {
    expect(parseEffortValue('')).toBeUndefined()
  })

  test('returns number for integer input', () => {
    expect(parseEffortValue(42)).toBe(42)
  })

  test('returns string for valid effort level string', () => {
    expect(parseEffortValue('low')).toBe('low')
    expect(parseEffortValue('medium')).toBe('medium')
    expect(parseEffortValue('high')).toBe('high')
    expect(parseEffortValue('max')).toBe('max')
  })

  test('parses numeric string to number', () => {
    expect(parseEffortValue('42')).toBe(42)
  })

  test('returns undefined for invalid string', () => {
    expect(parseEffortValue('invalid')).toBeUndefined()
  })

  test('non-integer number falls through to string parsing (parseInt truncates)', () => {
    // 3.14 fails isValidNumericEffort, then String(3.14) -> "3.14" -> parseInt = 3
    expect(parseEffortValue(3.14)).toBe(3)
  })

  test('handles case-insensitive effort level strings', () => {
    expect(parseEffortValue('LOW')).toBe('low')
    expect(parseEffortValue('HIGH')).toBe('high')
  })
})

// ─── isValidNumericEffort ──────────────────────────────────────────────

describe('isValidNumericEffort', () => {
  test('returns true for integer', () => {
    expect(isValidNumericEffort(50)).toBe(true)
  })

  test('returns true for zero', () => {
    expect(isValidNumericEffort(0)).toBe(true)
  })

  test('returns true for negative integer', () => {
    expect(isValidNumericEffort(-1)).toBe(true)
  })

  test('returns false for float', () => {
    expect(isValidNumericEffort(3.14)).toBe(false)
  })

  test('returns false for NaN', () => {
    expect(isValidNumericEffort(NaN)).toBe(false)
  })

  test('returns false for Infinity', () => {
    expect(isValidNumericEffort(Infinity)).toBe(false)
  })
})

// ─── convertEffortValueToLevel ─────────────────────────────────────────

describe('convertEffortValueToLevel', () => {
  test('returns valid effort level string as-is', () => {
    expect(convertEffortValueToLevel('low')).toBe('low')
    expect(convertEffortValueToLevel('medium')).toBe('medium')
    expect(convertEffortValueToLevel('high')).toBe('high')
    expect(convertEffortValueToLevel('max')).toBe('max')
  })

  test("returns 'high' for unknown string", () => {
    expect(convertEffortValueToLevel('unknown' as any)).toBe('high')
  })

  test("non-ant numeric value returns 'high'", () => {
    const saved = process.env.USER_TYPE
    delete process.env.USER_TYPE

    expect(convertEffortValueToLevel(50)).toBe('high')
    expect(convertEffortValueToLevel(100)).toBe('high')

    process.env.USER_TYPE = saved
  })

  describe('ant numeric mapping', () => {
    let savedUserType: string | undefined

    beforeEach(() => {
      savedUserType = process.env.USER_TYPE
      process.env.USER_TYPE = 'ant'
    })

    afterEach(() => {
      if (savedUserType === undefined) {
        delete process.env.USER_TYPE
      } else {
        process.env.USER_TYPE = savedUserType
      }
    })

    test("value <= 50 maps to 'low'", () => {
      expect(convertEffortValueToLevel(50)).toBe('low')
      expect(convertEffortValueToLevel(0)).toBe('low')
      expect(convertEffortValueToLevel(-10)).toBe('low')
    })

    test("value 51-85 maps to 'medium'", () => {
      expect(convertEffortValueToLevel(51)).toBe('medium')
      expect(convertEffortValueToLevel(85)).toBe('medium')
    })

    test("value 86-100 maps to 'high'", () => {
      expect(convertEffortValueToLevel(86)).toBe('high')
      expect(convertEffortValueToLevel(100)).toBe('high')
    })

    test("value > 100 maps to 'max'", () => {
      expect(convertEffortValueToLevel(101)).toBe('max')
      expect(convertEffortValueToLevel(200)).toBe('max')
    })
  })
})

// ─── getEffortLevelDescription ─────────────────────────────────────────

describe('getEffortLevelDescription', () => {
  test("returns description for 'low'", () => {
    const desc = getEffortLevelDescription('low')
    expect(desc).toContain('Quick')
  })

  test("returns description for 'medium'", () => {
    const desc = getEffortLevelDescription('medium')
    expect(desc).toContain('Balanced')
  })

  test("returns description for 'high'", () => {
    const desc = getEffortLevelDescription('high')
    expect(desc).toContain('Comprehensive')
  })

  test("returns description for 'max'", () => {
    const desc = getEffortLevelDescription('max')
    expect(desc).toContain('Maximum')
  })

  test('max description does not contain model names', () => {
    const desc = getEffortLevelDescription('max')
    expect(desc).not.toContain('Opus')
    expect(desc).not.toContain('DeepSeek')
  })

  test("returns description for 'xhigh'", () => {
    const desc = getEffortLevelDescription('xhigh')
    expect(desc).toContain('Extended reasoning')
  })

  test('xhigh description does not contain model names', () => {
    const desc = getEffortLevelDescription('xhigh')
    expect(desc).not.toContain('Opus')
  })
})

// ─── resolvePickerEffortPersistence ────────────────────────────────────

describe('resolvePickerEffortPersistence', () => {
  test('returns undefined when picked matches model default and no prior persistence', () => {
    const result = resolvePickerEffortPersistence(
      'high',
      'high',
      undefined,
      false,
    )
    expect(result).toBeUndefined()
  })

  test('returns picked when it differs from model default', () => {
    const result = resolvePickerEffortPersistence(
      'low',
      'high',
      undefined,
      false,
    )
    expect(result).toBe('low')
  })

  test('returns picked when priorPersisted is set (even if same as default)', () => {
    const result = resolvePickerEffortPersistence('high', 'high', 'high', false)
    expect(result).toBe('high')
  })

  test('returns picked when toggledInPicker is true (even if same as default)', () => {
    const result = resolvePickerEffortPersistence(
      'high',
      'high',
      undefined,
      true,
    )
    expect(result).toBe('high')
  })

  test('returns undefined picked value when no explicit and matches default', () => {
    const result = resolvePickerEffortPersistence(
      undefined,
      'high' as any,
      undefined,
      false,
    )
    expect(result).toBeUndefined()
  })
})

// ─── modelSupportsMaxEffort ────────────────────────────────────────────

describe('modelSupportsMaxEffort', () => {
  test('returns true for opus-4-7', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('claude-opus-4-7-20250918')).toBe(true)
  })

  test('returns true for opus-4-6', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('claude-opus-4-6-20250514')).toBe(true)
  })

  test('returns true for sonnet models', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('claude-sonnet-4-6-20250514')).toBe(true)
  })

  test('returns true for haiku models', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('claude-haiku-4-5-20251001')).toBe(true)
  })

  test('returns true for deepseek models', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('deepseek-v4-pro')).toBe(true)
  })

  test('returns true for unknown models', async () => {
    const { modelSupportsMaxEffort } = await import('src/utils/effort.js')
    expect(modelSupportsMaxEffort('some-random-model')).toBe(true)
  })
})

// ─── modelSupportsXhighEffort ──────────────────────────────────────────

describe('modelSupportsXhighEffort', () => {
  test('returns true for opus-4-7', async () => {
    const { modelSupportsXhighEffort } = await import('src/utils/effort.js')
    expect(modelSupportsXhighEffort('claude-opus-4-7-20250918')).toBe(true)
  })

  test('returns true for sonnet models', async () => {
    const { modelSupportsXhighEffort } = await import('src/utils/effort.js')
    expect(modelSupportsXhighEffort('claude-sonnet-4-6-20250514')).toBe(true)
  })

  test('returns true for haiku models', async () => {
    const { modelSupportsXhighEffort } = await import('src/utils/effort.js')
    expect(modelSupportsXhighEffort('claude-haiku-4-5-20251001')).toBe(true)
  })

  test('returns true for unknown models', async () => {
    const { modelSupportsXhighEffort } = await import('src/utils/effort.js')
    expect(modelSupportsXhighEffort('some-random-model')).toBe(true)
  })
})

// ─── connection profile effort merge (display path) ────────────────────
//
// Uses the real connections store against a throwaway CLAUDE_CONFIG_DIR —
// mocking any connections module here would leak process-globally into the
// connections test suite (bun mock.module is last-write-wins per process).

describe('connection profile effort merge (display path)', () => {
  const MODEL = 'claude-fable-5'
  let tmpDir: string
  let previousConfigDir: string | undefined
  let previousEffortEnv: string | undefined
  let previousUserType: string | undefined

  function restoreEnv(
    key: 'CLAUDE_CONFIG_DIR' | 'CLAUDE_CODE_EFFORT_LEVEL' | 'USER_TYPE',
    value: string | undefined,
  ): void {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ccb-effort-display-test-'))
    previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
    previousEffortEnv = process.env['CLAUDE_CODE_EFFORT_LEVEL']
    previousUserType = process.env['USER_TYPE']
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    delete process.env['CLAUDE_CODE_EFFORT_LEVEL']
    delete process.env['USER_TYPE']
    _invalidateConnectionsCache()
    setSessionAssignment('main', undefined)
  })

  afterEach(() => {
    restoreEnv('CLAUDE_CONFIG_DIR', previousConfigDir)
    restoreEnv('CLAUDE_CODE_EFFORT_LEVEL', previousEffortEnv)
    restoreEnv('USER_TYPE', previousUserType)
    _invalidateConnectionsCache()
    setSessionAssignment('main', undefined)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function conn(overrides: Partial<Connection> = {}): Connection {
    return {
      id: 'remote-a',
      label: 'Remote A',
      kind: 'openai-compat',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-a',
      model: 'model-a',
      ...overrides,
    }
  }

  describe('getConnectionEffortValue', () => {
    test('returns undefined when no connection is assigned', () => {
      expect(getConnectionEffortValue()).toBeUndefined()
    })

    test('returns the session-assigned connection pinned effort', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getConnectionEffortValue()).toBe('max')
    })

    test('falls back to the global default assignment', () => {
      upsertConnection(conn({ thinkingEffort: 'medium' }))
      setDefaultAssignment('main', { connectionId: 'remote-a' })
      expect(getConnectionEffortValue()).toBe('medium')
    })

    test("maps 'off' to undefined (thinking suppression, not an effort)", () => {
      upsertConnection(conn({ thinkingEffort: 'off' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getConnectionEffortValue()).toBeUndefined()
    })
  })

  describe('getDisplayedEffortLevel', () => {
    test("falls back to 'high' when nothing pins an effort", () => {
      expect(getDisplayedEffortLevel(MODEL, undefined)).toBe('high')
    })

    test('shows the connection pinned effort when appState is unset', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getDisplayedEffortLevel(MODEL, undefined)).toBe('max')
    })

    test('appState effort wins over the connection profile', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getDisplayedEffortLevel(MODEL, 'low')).toBe('low')
    })

    test('env CLAUDE_CODE_EFFORT_LEVEL wins over the connection profile', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      process.env['CLAUDE_CODE_EFFORT_LEVEL'] = 'medium'
      expect(getDisplayedEffortLevel(MODEL, undefined)).toBe('medium')
    })

    test('env auto suppresses the connection profile too', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      process.env['CLAUDE_CODE_EFFORT_LEVEL'] = 'auto'
      expect(getDisplayedEffortLevel(MODEL, undefined)).toBe('high')
    })

    test("connection 'off' leaves the model-default display untouched", () => {
      upsertConnection(conn({ thinkingEffort: 'off' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getDisplayedEffortLevel(MODEL, undefined)).toBe('high')
    })

    test('shows DeepSeek actual effort after compatible transport mapping', () => {
      const previousUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
      const previousAuthMode = process.env.OPENAI_AUTH_MODE
      process.env.CLAUDE_CODE_USE_OPENAI = '1'
      delete process.env.OPENAI_AUTH_MODE
      try {
        upsertConnection(
          conn({
            model: 'deepseek-v4-pro',
            thinkingEffort: 'max',
            thinkingEffortTransport: 'compatible',
          }),
        )
        setSessionAssignment('main', { connectionId: 'remote-a' })
        expect(getDisplayedEffortLevel('deepseek-v4-pro', undefined)).toBe(
          'high',
        )
        expect(getDisplayedEffortLevel('deepseek-v4-pro', 'medium')).toBe(
          'high',
        )
      } finally {
        if (previousUseOpenAI === undefined) {
          delete process.env.CLAUDE_CODE_USE_OPENAI
        } else {
          process.env.CLAUDE_CODE_USE_OPENAI = previousUseOpenAI
        }
        if (previousAuthMode === undefined) {
          delete process.env.OPENAI_AUTH_MODE
        } else {
          process.env.OPENAI_AUTH_MODE = previousAuthMode
        }
      }
    })

    test('shows DeepSeek exact Max when passthrough is configured', () => {
      const previousUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
      const previousAuthMode = process.env.OPENAI_AUTH_MODE
      process.env.CLAUDE_CODE_USE_OPENAI = '1'
      delete process.env.OPENAI_AUTH_MODE
      try {
        upsertConnection(
          conn({
            model: 'deepseek-v4-pro',
            thinkingEffort: 'max',
            thinkingEffortTransport: 'passthrough',
          }),
        )
        setSessionAssignment('main', { connectionId: 'remote-a' })
        expect(getDisplayedEffortLevel('deepseek-v4-pro', undefined)).toBe(
          'max',
        )
      } finally {
        if (previousUseOpenAI === undefined) {
          delete process.env.CLAUDE_CODE_USE_OPENAI
        } else {
          process.env.CLAUDE_CODE_USE_OPENAI = previousUseOpenAI
        }
        if (previousAuthMode === undefined) {
          delete process.env.OPENAI_AUTH_MODE
        } else {
          process.env.OPENAI_AUTH_MODE = previousAuthMode
        }
      }
    })
  })

  describe('getEffortSuffix', () => {
    test('empty when neither user nor connection pins an effort', () => {
      expect(getEffortSuffix(MODEL, undefined)).toBe('')
    })

    test('shows the connection pinned effort', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getEffortSuffix(MODEL, undefined)).toBe(' with max effort')
    })

    test('explicit effort value wins over the connection profile', () => {
      upsertConnection(conn({ thinkingEffort: 'max' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getEffortSuffix(MODEL, 'low')).toBe(' with low effort')
    })

    test("connection 'off' produces no suffix", () => {
      upsertConnection(conn({ thinkingEffort: 'off' }))
      setSessionAssignment('main', { connectionId: 'remote-a' })
      expect(getEffortSuffix(MODEL, undefined)).toBe('')
    })

    test('uses the DeepSeek wire level in the suffix', () => {
      const previousUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
      const previousAuthMode = process.env.OPENAI_AUTH_MODE
      process.env.CLAUDE_CODE_USE_OPENAI = '1'
      delete process.env.OPENAI_AUTH_MODE
      try {
        upsertConnection(
          conn({
            model: 'deepseek-v4-flash',
            thinkingEffort: 'max',
            thinkingEffortTransport: 'compatible',
          }),
        )
        setSessionAssignment('main', { connectionId: 'remote-a' })
        expect(getEffortSuffix('deepseek-v4-flash', undefined)).toBe(
          ' with high effort',
        )
      } finally {
        if (previousUseOpenAI === undefined) {
          delete process.env.CLAUDE_CODE_USE_OPENAI
        } else {
          process.env.CLAUDE_CODE_USE_OPENAI = previousUseOpenAI
        }
        if (previousAuthMode === undefined) {
          delete process.env.OPENAI_AUTH_MODE
        } else {
          process.env.OPENAI_AUTH_MODE = previousAuthMode
        }
      }
    })
  })
})
