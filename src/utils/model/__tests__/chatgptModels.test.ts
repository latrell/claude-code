import { describe, expect, test } from 'bun:test'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_FAST_MODEL,
  CHATGPT_CODEX_MODEL_OPTIONS,
  chatGPTCodexModelSupportsEffortLevel,
  formatChatGPTCodexContextWindow,
  getChatGPTCodexContextWindow,
  getChatGPTCodexDefaultEffortLevel,
  getChatGPTCodexModelContextWindow,
  getChatGPTCodexModelDisplayName,
  getChatGPTCodexModelMaxContextWindow,
  getChatGPTCodexSupportedEffortLevels,
  isChatGPTCodexReasoningModel,
  isChatGPTCodexModelAvailable,
  isChatGPTCodexModelUnavailable,
} from '../chatgptModels.js'

const MODEL_WINDOWS = [
  ['gpt-5.6-sol', 372_000, 372_000],
  ['gpt-5.6-terra', 372_000, 372_000],
  ['gpt-5.6-luna', 372_000, 372_000],
  ['gpt-5.5', 272_000, 272_000],
  ['gpt-5.4', 272_000, 1_000_000],
  ['gpt-5.4-mini', 272_000, 272_000],
  ['gpt-5.3-codex-spark', 128_000, 128_000],
] as const

const MODEL_EFFORTS = [
  ['gpt-5.6-sol', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.6-terra', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.6-luna', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.5', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4-mini', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.3-codex-spark', 'high', ['low', 'medium', 'high', 'xhigh']],
] as const

const LEGACY_MODELS = [
  'gpt-5.5-pro',
  'gpt-5.4-nano',
  'gpt-5.3-codex',
  'gpt-5.2',
] as const

const PLAN_WINDOWS = [
  ['free', 27_000],
  ['go', 256_000],
  ['plus', 256_000],
  ['pro', 400_000],
  ['team', 256_000],
  ['business', 256_000],
  ['enterprise', 256_000],
  ['edu', 256_000],
] as const

describe('CHATGPT_CODEX_MODEL_OPTIONS', () => {
  test('uses Claude-style display aliases without hyphens', () => {
    for (const option of CHATGPT_CODEX_MODEL_OPTIONS) {
      expect(option.label).not.toContain('-')
    }
  })

  test('uses the current default and fast models', () => {
    expect(CHATGPT_CODEX_DEFAULT_MODEL).toBe('gpt-5.6-sol')
    expect(CHATGPT_CODEX_FAST_MODEL).toBe('gpt-5.6-luna')
  })

  test('contains the current seven-model roster and context metadata', () => {
    expect(
      CHATGPT_CODEX_MODEL_OPTIONS.map(
        ({ value, contextWindow, maxContextWindow }) => [
          value,
          contextWindow,
          maxContextWindow,
        ],
      ),
    ).toEqual(MODEL_WINDOWS.map(entry => [...entry]))
  })

  test('does not retain superseded roster entries', () => {
    const values = new Set(CHATGPT_CODEX_MODEL_OPTIONS.map(o => o.value))
    for (const model of LEGACY_MODELS) {
      expect(values.has(model)).toBe(false)
    }
  })

  test('every option has unique, non-empty display metadata', () => {
    const values = CHATGPT_CODEX_MODEL_OPTIONS.map(o => o.value)
    expect(new Set(values).size).toBe(values.length)
    for (const option of CHATGPT_CODEX_MODEL_OPTIONS) {
      expect(option.value).toBeTruthy()
      expect(option.label).toBeTruthy()
      expect(option.description).toBeTruthy()
    }
  })
})

describe('ChatGPT Codex model context windows', () => {
  test.each(
    MODEL_WINDOWS,
  )('%s exposes its normal and maximum context windows', (model, contextWindow, maxContextWindow) => {
    expect(getChatGPTCodexModelContextWindow(model)).toBe(contextWindow)
    expect(getChatGPTCodexModelMaxContextWindow(model)).toBe(maxContextWindow)
  })

  test('maps the gpt-5.6 alias to gpt-5.6-sol metadata', () => {
    expect(getChatGPTCodexModelContextWindow('gpt-5.6')).toBe(372_000)
    expect(getChatGPTCodexModelMaxContextWindow('gpt-5.6')).toBe(372_000)
  })

  test('normalizes case and an optional [1m] suffix for metadata lookup', () => {
    expect(getChatGPTCodexModelContextWindow('GPT-5.4[1M]')).toBe(272_000)
    expect(getChatGPTCodexModelMaxContextWindow('GPT-5.4[1M]')).toBe(1_000_000)
  })

  test('returns undefined for unknown models', () => {
    expect(getChatGPTCodexModelContextWindow('gpt-4')).toBeUndefined()
    expect(getChatGPTCodexModelMaxContextWindow('gpt-4')).toBeUndefined()
  })

  test.each([
    [27_000, '27K'],
    [128_000, '128K'],
    [272_000, '272K'],
    [372_000, '372K'],
    [1_000_000, '1M'],
    [1_050_000, '1.05M'],
  ] as const)('formats %i tokens as %s', (tokens, formatted) => {
    expect(formatChatGPTCodexContextWindow(tokens)).toBe(formatted)
  })
})

describe('ChatGPT Codex model effort metadata', () => {
  test.each(
    MODEL_EFFORTS,
  )('%s defaults to %s and exposes its supported effort levels', (model, defaultEffort, supportedEfforts) => {
    expect(getChatGPTCodexDefaultEffortLevel(model)).toBe(defaultEffort)
    expect(getChatGPTCodexSupportedEffortLevels(model)).toEqual(
      supportedEfforts,
    )
  })

  test('normalizes aliases, case, whitespace, and the optional [1m] suffix', () => {
    expect(getChatGPTCodexDefaultEffortLevel('  GPT-5.6  ')).toBe('medium')
    expect(getChatGPTCodexSupportedEffortLevels('GPT-5.4[1M]')).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  test.each(
    MODEL_EFFORTS,
  )('%s accepts exactly its advertised effort levels', (model, _defaultEffort, supportedEfforts) => {
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      expect(chatGPTCodexModelSupportsEffortLevel(model, level)).toBe(
        (supportedEfforts as readonly string[]).includes(level),
      )
    }
  })

  test('returns no effort metadata for unknown models', () => {
    expect(getChatGPTCodexDefaultEffortLevel('gpt-4')).toBeUndefined()
    expect(getChatGPTCodexSupportedEffortLevels('gpt-4')).toBeUndefined()
    expect(chatGPTCodexModelSupportsEffortLevel('gpt-4', 'high')).toBe(false)
  })
})

describe('isChatGPTCodexReasoningModel', () => {
  test.each(
    MODEL_WINDOWS.map(([model]) => [model]),
  )('%s is a reasoning model', model => {
    expect(isChatGPTCodexReasoningModel(model)).toBe(true)
  })

  test.each([
    'gpt-5.6',
    'GPT-5.6',
    'GPT-5.6-SOL',
    'gpt-5.4[1m]',
  ])('recognizes normalized model id %s', model => {
    expect(isChatGPTCodexReasoningModel(model)).toBe(true)
  })

  test.each([
    'gpt-4',
    ...LEGACY_MODELS,
  ])('%s is not in the current reasoning roster', model => {
    expect(isChatGPTCodexReasoningModel(model)).toBe(false)
  })
})

describe('isChatGPTCodexModelAvailable', () => {
  test('keeps standard models available for every or unknown plan', () => {
    expect(isChatGPTCodexModelAvailable('gpt-5.6-sol', 'plus')).toBe(true)
    expect(isChatGPTCodexModelAvailable('gpt-5.6-sol', null)).toBe(true)
  })

  test('limits Codex Spark to ChatGPT Pro', () => {
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', 'pro')).toBe(
      true,
    )
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', 'plus')).toBe(
      false,
    )
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', null)).toBe(
      false,
    )
  })

  test('only marks recognized gated models unavailable', () => {
    expect(isChatGPTCodexModelUnavailable('gpt-5.3-codex-spark', 'plus')).toBe(
      true,
    )
    expect(isChatGPTCodexModelUnavailable('gpt-5.3-codex-spark', 'pro')).toBe(
      false,
    )
    expect(isChatGPTCodexModelUnavailable('custom-model', 'plus')).toBe(false)
  })
})

describe('getChatGPTCodexContextWindow', () => {
  test.each(PLAN_WINDOWS)('%s plan has a %i-token cap', (plan, window) => {
    expect(getChatGPTCodexContextWindow(plan)).toBe(window)
  })

  test.each([
    ['pro', 'gpt-5.6-sol', 372_000],
    ['plus', 'gpt-5.6-sol', 256_000],
    ['pro', 'gpt-5.5', 272_000],
    ['pro', 'gpt-5.3-codex-spark', 128_000],
    ['free', 'gpt-5.3-codex-spark', 27_000],
  ] as const)('uses the lower of the %s plan and %s model caps', (plan, model, window) => {
    expect(getChatGPTCodexContextWindow(plan, model)).toBe(window)
  })

  test('uses a known model cap when the plan is unavailable', () => {
    expect(getChatGPTCodexContextWindow(null, 'gpt-5.6-sol')).toBe(372_000)
    expect(getChatGPTCodexContextWindow('unknown', 'gpt-5.5')).toBe(272_000)
  })

  test('preserves a known plan cap when the model is unavailable', () => {
    expect(getChatGPTCodexContextWindow('pro', 'gpt-4')).toBe(400_000)
  })

  test('matches plan strings case-insensitively and trims whitespace', () => {
    expect(getChatGPTCodexContextWindow('  PRO  ', 'gpt-5.6-sol')).toBe(372_000)
    expect(getChatGPTCodexContextWindow('\tFREE\n', 'gpt-5.6-sol')).toBe(27_000)
  })

  test.each([
    null,
    undefined,
    '',
    '   ',
    'unknown',
  ])('returns undefined when neither plan nor model supplies a cap: %p', plan => {
    expect(getChatGPTCodexContextWindow(plan)).toBeUndefined()
  })
})

describe('getChatGPTCodexModelDisplayName', () => {
  test.each(
    CHATGPT_CODEX_MODEL_OPTIONS.map(option => [option] as const),
  )('$value uses its curated label', option => {
    expect(getChatGPTCodexModelDisplayName(option.value)).toBe(option.label)
  })

  test('resolves the gpt-5.6 alias to the Sol display name', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.6')).toBe('GPT 5.6 Sol')
  })

  test('marks the supported 1M variant in the display name', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.4[1m]')).toBe(
      'GPT 5.4 (1M context)',
    )
  })

  test('does not advertise 1M for models without a 1M product cap', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.6-sol[1m]')).toBe(
      'GPT 5.6 Sol',
    )
    expect(getChatGPTCodexModelDisplayName('gpt-5.3-codex-spark[1m]')).toBe(
      'GPT 5.3 Codex Spark',
    )
  })

  test.each([
    'gpt-4',
    'gpt-4o',
    '',
    ...LEGACY_MODELS,
  ])('returns null for unknown model %p', model => {
    expect(getChatGPTCodexModelDisplayName(model)).toBeNull()
  })
})
