import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getChatGPTSubscriptionPlan,
  setChatGPTSubscriptionPlan,
} from '../../bootstrap/state.js'
import { setProviderCliOverride } from '../model/providers.js'
import {
  clearRemoteChatGPTCodexModelOptions,
  setRemoteChatGPTCodexModelOptions,
  type ChatGPTCodexModelOption,
} from '../model/chatgptModels.js'

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

function windowPolicyModel(
  overrides: Partial<ChatGPTCodexModelOption> = {},
): ChatGPTCodexModelOption {
  return {
    value: 'gpt-window-policy',
    label: 'Window Policy',
    description: 'Test model',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: ['low', 'medium'],
    contextWindow: 300_000,
    maxContextWindow: 300_000,
    effectiveContextWindowPercent: 91,
    visibility: 'list',
    priority: 1,
    supportedInApi: true,
    inputModalities: ['text'],
    supportsParallelToolCalls: false,
    ...overrides,
  }
}

describe('getChatGPTSubscriptionPlan state', () => {
  const saved = process.env.OPENAI_AUTH_MODE

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.OPENAI_AUTH_MODE
    } else {
      process.env.OPENAI_AUTH_MODE = saved
    }
  })

  test('setChatGPTSubscriptionPlan stores a plan string', () => {
    setChatGPTSubscriptionPlan('pro')
    expect(getChatGPTSubscriptionPlan()).toBe('pro')
  })

  test('setChatGPTSubscriptionPlan stores null for null input', () => {
    setChatGPTSubscriptionPlan('pro')
    setChatGPTSubscriptionPlan(null)
    expect(getChatGPTSubscriptionPlan()).toBeNull()
  })

  test('setChatGPTSubscriptionPlan stores null for undefined input', () => {
    setChatGPTSubscriptionPlan('free')
    setChatGPTSubscriptionPlan(undefined)
    expect(getChatGPTSubscriptionPlan()).toBeNull()
  })

  test('getChatGPTSubscriptionPlan returns null by default', () => {
    setChatGPTSubscriptionPlan(null)
    // Re-read to confirm the module-level singleton pattern works
    expect(getChatGPTSubscriptionPlan()).toBeNull()
  })
})

describe('getContextWindowForModel with ChatGPT plan', () => {
  let origOpenAIAuthMode: string | undefined
  let origClaudeCodeUseOpenAI: string | undefined
  let origDisable1mContext: string | undefined

  beforeEach(() => {
    origOpenAIAuthMode = process.env.OPENAI_AUTH_MODE
    origClaudeCodeUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
    origDisable1mContext = process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    setProviderCliOverride('openai')
    clearRemoteChatGPTCodexModelOptions()
  })

  afterEach(() => {
    if (origOpenAIAuthMode === undefined) {
      delete process.env.OPENAI_AUTH_MODE
    } else {
      process.env.OPENAI_AUTH_MODE = origOpenAIAuthMode
    }
    if (origClaudeCodeUseOpenAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = origClaudeCodeUseOpenAI
    }
    if (origDisable1mContext === undefined) {
      delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    } else {
      process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT = origDisable1mContext
    }
    setProviderCliOverride(undefined)
    setChatGPTSubscriptionPlan(null)
    clearRemoteChatGPTCodexModelOptions()
  })

  test('getChatGPTCodexContextWindow applies every known plan cap', async () => {
    const { getChatGPTCodexContextWindow } = await import(
      '../../utils/model/chatgptModels.js'
    )

    for (const [plan, contextWindow] of PLAN_WINDOWS) {
      expect(getChatGPTCodexContextWindow(plan)).toBe(contextWindow)
    }
    expect(getChatGPTCodexContextWindow(null)).toBeUndefined()
    expect(getChatGPTCodexContextWindow(undefined)).toBeUndefined()
    expect(getChatGPTCodexContextWindow('unknown')).toBeUndefined()
  })

  test('getChatGPTCodexContextWindow trusts known model catalog windows', async () => {
    const { getChatGPTCodexContextWindow } = await import(
      '../../utils/model/chatgptModels.js'
    )

    const cases = [
      ['pro', 'gpt-5.6-sol', 258_400],
      ['plus', 'gpt-5.6-sol', 258_400],
      ['pro', 'gpt-5.5', 258_400],
      ['free', 'gpt-5.5', 258_400],
      ['pro', 'gpt-5.3-codex-spark', 121_600],
    ] as const
    for (const [plan, model, contextWindow] of cases) {
      expect(getChatGPTCodexContextWindow(plan, model)).toBe(contextWindow)
    }
  })

  test('runtime caps unsupported [1m] variants at their model window', async () => {
    const { getContextWindowForModel } = await import('../context.js')
    setChatGPTSubscriptionPlan('pro')

    const unsupported1mVariants = [
      ['gpt-5.6-sol[1m]', 258_400],
      ['gpt-5.6-terra[1m]', 258_400],
      ['gpt-5.6-luna[1m]', 258_400],
      ['gpt-5.5[1m]', 258_400],
      ['gpt-5.4-mini[1m]', 258_400],
      ['gpt-5.3-codex-spark[1m]', 121_600],
    ] as const
    for (const [model, contextWindow] of unsupported1mVariants) {
      expect(getContextWindowForModel(model)).toBe(contextWindow)
    }
  })

  test('runtime allows the supported GPT-5.4 [1m] variant', async () => {
    const { getContextWindowForModel } = await import('../context.js')
    setChatGPTSubscriptionPlan('pro')

    expect(getContextWindowForModel('gpt-5.4[1m]')).toBe(950_000)
  })

  test('runtime uses account-scoped model windows without [1m]', async () => {
    const { getContextWindowForModel } = await import('../context.js')

    const cases = [
      ['pro', 'gpt-5.6-sol', 258_400],
      ['plus', 'gpt-5.6-sol', 258_400],
      ['free', 'gpt-5.5', 258_400],
      ['pro', 'gpt-5.3-codex-spark', 121_600],
    ] as const
    for (const [plan, model, contextWindow] of cases) {
      setChatGPTSubscriptionPlan(plan)
      expect(getContextWindowForModel(model)).toBe(contextWindow)
    }
  })

  test('runtime provider and credential scope override the global account', async () => {
    const { getContextWindowForModel, modelSupports1M } = await import(
      '../context.js'
    )
    const remoteModel = (
      contextWindow: number,
      maxContextWindow: number,
    ): ChatGPTCodexModelOption => ({
      value: 'gpt-scoped-context',
      label: 'Scoped Context',
      description: 'Test-only scoped catalog model',
      defaultEffortLevel: 'medium',
      supportedEffortLevels: ['low', 'medium'],
      contextWindow,
      maxContextWindow,
      visibility: 'list',
      priority: 1,
      supportedInApi: false,
      inputModalities: ['text'],
      supportsParallelToolCalls: false,
    })
    setRemoteChatGPTCodexModelOptions(
      [remoteModel(333_000, 1_000_000)],
      'scope-a',
    )
    setRemoteChatGPTCodexModelOptions(
      [remoteModel(128_000, 128_000)],
      'scope-b',
    )

    // Prove scoped decisions do not depend on the process-global provider.
    setProviderCliOverride('anthropic')
    const runtimeA = {
      provider: 'openai' as const,
      env: {
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_CHATGPT_CREDENTIAL_SCOPE: 'scope-b',
      },
      // An explicit runtime scope wins over the runtime environment.
      credentialScope: 'scope-a',
    }
    const runtimeB = {
      provider: 'openai' as const,
      env: {
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_CHATGPT_CREDENTIAL_SCOPE: 'scope-b',
      },
    }

    expect(
      getContextWindowForModel('gpt-scoped-context', undefined, runtimeA),
    ).toBe(316_350)
    expect(
      getContextWindowForModel('gpt-scoped-context', undefined, runtimeB),
    ).toBe(121_600)
    expect(modelSupports1M('gpt-scoped-context[1m]', runtimeA)).toBe(true)
    expect(modelSupports1M('gpt-scoped-context[1m]', runtimeB)).toBe(false)
    expect(
      getContextWindowForModel('gpt-scoped-context[1m]', undefined, runtimeA),
    ).toBe(950_000)
    expect(
      getContextWindowForModel('gpt-scoped-context[1m]', undefined, runtimeB),
    ).toBe(121_600)

    setChatGPTSubscriptionPlan('pro')
    expect(
      getContextWindowForModel('account-only-missing', undefined, runtimeB),
    ).toBe(200_000)
  })

  test('uses effective window and safely clamps the Codex auto-compact limit', async () => {
    const { getContextWindowForModel, getModelAutoCompactTokenLimit } =
      await import('../context.js')
    const { getAutoCompactThreshold } = await import(
      '../../services/compact/autoCompact.js'
    )
    setRemoteChatGPTCodexModelOptions(
      [windowPolicyModel({ autoCompactTokenLimit: 250_000 })],
      'window-policy',
    )
    const runtime = {
      provider: 'openai' as const,
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
      credentialScope: 'window-policy',
    }

    expect(
      getContextWindowForModel('gpt-window-policy', undefined, runtime),
    ).toBe(273_000)
    expect(getModelAutoCompactTokenLimit('gpt-window-policy', runtime)).toBe(
      250_000,
    )
    // 300K * 91% effective = 273K, minus the 20K summary-output reserve and
    // the 13K local autocompact buffer. The catalog's 250K value must not
    // bypass that local safe trigger.
    expect(getAutoCompactThreshold('gpt-window-policy', runtime)).toBe(240_000)
  })

  test('clamps the catalog 90% fallback to the local compact capacity', async () => {
    const { getModelAutoCompactTokenLimit } = await import('../context.js')
    const { getAutoCompactThreshold } = await import(
      '../../services/compact/autoCompact.js'
    )
    setRemoteChatGPTCodexModelOptions(
      [windowPolicyModel({ autoCompactTokenLimit: undefined })],
      'window-policy',
    )
    const runtime = {
      provider: 'openai' as const,
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
      credentialScope: 'window-policy',
    }

    // Official catalog fallback: 90% of the raw 300K window.
    expect(getModelAutoCompactTokenLimit('gpt-window-policy', runtime)).toBe(
      270_000,
    )
    // Local capacity: 273K effective - 20K summary reserve - 13K buffer.
    expect(getAutoCompactThreshold('gpt-window-policy', runtime)).toBe(240_000)
  })

  test('honors a smaller local auto-compact window before catalog limits', async () => {
    const previousWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
    try {
      process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '230000'
      const { getAutoCompactThreshold } = await import(
        '../../services/compact/autoCompact.js'
      )
      setRemoteChatGPTCodexModelOptions(
        [windowPolicyModel({ autoCompactTokenLimit: 250_000 })],
        'window-policy',
      )
      const runtime = {
        provider: 'openai' as const,
        env: { OPENAI_AUTH_MODE: 'chatgpt' },
        credentialScope: 'window-policy',
      }

      // 230K local cap - 20K summary reserve - 13K buffer.
      expect(getAutoCompactThreshold('gpt-window-policy', runtime)).toBe(
        197_000,
      )
    } finally {
      if (previousWindow === undefined) {
        delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
      } else {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = previousWindow
      }
    }
  })

  test('plan cached via setChatGPTSubscriptionPlan is readable', () => {
    setChatGPTSubscriptionPlan('pro')
    expect(getChatGPTSubscriptionPlan()).toBe('pro')

    setChatGPTSubscriptionPlan('free')
    expect(getChatGPTSubscriptionPlan()).toBe('free')

    setChatGPTSubscriptionPlan(null)
    expect(getChatGPTSubscriptionPlan()).toBeNull()
  })
})
