import { afterEach, describe, expect, test } from 'bun:test'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_FAST_MODEL,
  CHATGPT_CODEX_MODEL_OPTIONS,
  chatGPTCodexModelSupportsImages,
  chatGPTCodexModelSupportsParallelToolCalls,
  chatGPTCodexModelSupportsEffortLevel,
  chatGPTCodexModelUsesResponsesLite,
  clearRemoteChatGPTCodexModelOptions,
  formatChatGPTCodexContextWindow,
  getChatGPTCodexContextWindow,
  getChatGPTCodexDefaultModel,
  getChatGPTCodexDefaultEffortLevel,
  getChatGPTCodexFastModel,
  getChatGPTCodexModelContextWindow,
  getChatGPTCodexModelDisplayName,
  getChatGPTCodexModelMaxContextWindow,
  getChatGPTCodexSupportedEffortLevels,
  isChatGPTCodexReasoningModel,
  isChatGPTCodexModelAvailable,
  isChatGPTCodexModelUnavailable,
  isChatGPTCodexModelVisible,
  setRemoteChatGPTCodexModelOptions,
} from '../chatgptModels.js'

afterEach(() => {
  clearRemoteChatGPTCodexModelOptions()
})

const MODEL_WINDOWS = [
  ['gpt-5.6-sol', 272_000, 272_000],
  ['gpt-5.6-terra', 272_000, 272_000],
  ['gpt-5.6-luna', 272_000, 272_000],
  ['gpt-5.5', 272_000, 272_000],
  ['gpt-5.4', 272_000, 1_000_000],
  ['gpt-5.4-mini', 272_000, 272_000],
  ['gpt-5.3-codex-spark', 128_000, 128_000],
  ['gpt-5.2', 272_000, 272_000],
  ['codex-auto-review', 272_000, 1_000_000],
] as const

const MODEL_EFFORTS = [
  ['gpt-5.6-sol', 'low', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.6-terra', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.6-luna', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.5', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.4-mini', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.3-codex-spark', 'high', ['low', 'medium', 'high', 'xhigh']],
  ['gpt-5.2', 'medium', ['low', 'medium', 'high', 'xhigh']],
  ['codex-auto-review', 'medium', ['low', 'medium', 'high', 'xhigh']],
] as const

const LEGACY_MODELS = ['gpt-5.5-pro', 'gpt-5.4-nano', 'gpt-5.3-codex'] as const

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

  test('uses the account catalog for default and fast fallbacks', () => {
    setRemoteChatGPTCodexModelOptions(
      [
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[0]!,
          value: 'hidden-first',
          visibility: 'hide',
          priority: 1,
        },
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[1]!,
          value: 'account-default',
          visibility: 'list',
          priority: 2,
        },
      ],
      'account',
    )

    expect(getChatGPTCodexDefaultModel('account')).toBe('account-default')
    expect(getChatGPTCodexFastModel('account')).toBe('account-default')
  })

  test('contains the complete bundled model roster and context metadata', () => {
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

  test('uses Responses Lite only for GPT-5.6 models', () => {
    for (const model of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      expect(chatGPTCodexModelUsesResponsesLite(model)).toBe(true)
    }
    expect(chatGPTCodexModelUsesResponsesLite('gpt-5.6')).toBe(true)
    expect(chatGPTCodexModelUsesResponsesLite('GPT-5.6-SOL[1M]')).toBe(true)
    expect(chatGPTCodexModelUsesResponsesLite('gpt-5.5')).toBe(false)
    expect(chatGPTCodexModelUsesResponsesLite('unknown-model')).toBe(false)
  })

  test('captures input and tool-call capabilities from the Codex catalog', () => {
    expect(chatGPTCodexModelSupportsImages('gpt-5.6-sol')).toBe(true)
    expect(chatGPTCodexModelSupportsImages('gpt-5.3-codex-spark')).toBe(false)
    expect(chatGPTCodexModelSupportsImages('unknown-model')).toBe(true)
    expect(chatGPTCodexModelSupportsParallelToolCalls('gpt-5.5')).toBe(true)
    expect(chatGPTCodexModelSupportsParallelToolCalls('unknown-model')).toBe(
      false,
    )
  })

  test('isolates authoritative catalogs by credential scope', () => {
    setRemoteChatGPTCodexModelOptions(
      [
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[0]!,
          value: 'scope-a-model',
          label: 'Scope A Model',
        },
      ],
      'account-a',
    )

    expect(getChatGPTCodexModelDisplayName('scope-a-model', 'account-a')).toBe(
      'Scope A Model',
    )
    expect(getChatGPTCodexModelDisplayName('scope-a-model')).toBeNull()
    expect(getChatGPTCodexModelDisplayName('gpt-5.6-sol')).toBe('GPT 5.6 Sol')
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
    expect(getChatGPTCodexModelContextWindow('gpt-5.6')).toBe(272_000)
    expect(getChatGPTCodexModelMaxContextWindow('gpt-5.6')).toBe(272_000)
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
    [400_000, '400K'],
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
    expect(getChatGPTCodexDefaultEffortLevel('  GPT-5.6  ')).toBe('low')
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

  test('trusts the account-scoped catalog instead of local plan guesses', () => {
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', 'pro')).toBe(
      true,
    )
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', 'plus')).toBe(
      true,
    )
    expect(isChatGPTCodexModelAvailable('gpt-5.3-codex-spark', null)).toBe(true)
  })

  test('uses server visibility rather than marking known models unavailable', () => {
    expect(isChatGPTCodexModelUnavailable('gpt-5.3-codex-spark', 'plus')).toBe(
      false,
    )
    expect(isChatGPTCodexModelUnavailable('gpt-5.3-codex-spark', 'pro')).toBe(
      false,
    )
    expect(isChatGPTCodexModelUnavailable('custom-model', 'plus')).toBe(false)
  })

  test('shows only picker-visible models from the active catalog', () => {
    for (const model of [
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.3-codex-spark',
    ]) {
      expect(isChatGPTCodexModelVisible(model, 'plus')).toBe(true)
    }
    expect(isChatGPTCodexModelVisible('gpt-5.4', 'plus')).toBe(false)
    expect(isChatGPTCodexModelVisible('gpt-5.4-mini', 'plus')).toBe(false)
    expect(isChatGPTCodexModelVisible('codex-auto-review', 'plus')).toBe(false)
  })
})

describe('getChatGPTCodexContextWindow', () => {
  test.each(PLAN_WINDOWS)('%s plan has a %i-token cap', (plan, window) => {
    expect(getChatGPTCodexContextWindow(plan)).toBe(window)
  })

  test.each([
    ['pro', 'gpt-5.6-sol', 258_400],
    ['plus', 'gpt-5.6-sol', 258_400],
    ['pro', 'gpt-5.5', 258_400],
    ['pro', 'gpt-5.3-codex-spark', 121_600],
    ['free', 'gpt-5.3-codex-spark', 121_600],
  ] as const)('%s / %s uses the %i-token catalog window', (plan, model, window) => {
    expect(getChatGPTCodexContextWindow(plan, model)).toBe(window)
  })

  test('uses a known model cap when the plan is unavailable', () => {
    expect(getChatGPTCodexContextWindow(null, 'gpt-5.6-sol')).toBe(258_400)
    expect(getChatGPTCodexContextWindow('unknown', 'gpt-5.5')).toBe(258_400)
  })

  test('preserves a known plan cap when the model is unavailable', () => {
    expect(getChatGPTCodexContextWindow('pro', 'gpt-4')).toBe(400_000)
  })

  test('matches plan strings case-insensitively and trims whitespace', () => {
    expect(getChatGPTCodexContextWindow('  PRO  ', 'gpt-5.6-sol')).toBe(258_400)
    expect(getChatGPTCodexContextWindow('\tFREE\n', 'gpt-5.6-sol')).toBe(
      258_400,
    )
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
