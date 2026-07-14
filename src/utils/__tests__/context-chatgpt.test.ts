import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getChatGPTSubscriptionPlan,
  setChatGPTSubscriptionPlan,
} from '../../bootstrap/state.js'
import { setProviderCliOverride } from '../model/providers.js'

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

  test('getChatGPTCodexContextWindow uses the lower plan or model cap', async () => {
    const { getChatGPTCodexContextWindow } = await import(
      '../../utils/model/chatgptModels.js'
    )

    const cases = [
      ['pro', 'gpt-5.6-sol', 372_000],
      ['plus', 'gpt-5.6-sol', 256_000],
      ['pro', 'gpt-5.5', 272_000],
      ['pro', 'gpt-5.3-codex', 272_000],
      ['pro', 'gpt-5.3-codex-spark', 128_000],
    ] as const
    for (const [plan, model, contextWindow] of cases) {
      expect(getChatGPTCodexContextWindow(plan, model)).toBe(contextWindow)
    }
  })

  test('runtime caps unsupported [1m] variants at their model window', async () => {
    const { getContextWindowForModel } = await import('../context.js')
    setChatGPTSubscriptionPlan('pro')

    const unsupported1mVariants = [
      ['gpt-5.6-sol[1m]', 372_000],
      ['gpt-5.6-terra[1m]', 372_000],
      ['gpt-5.6-luna[1m]', 372_000],
      ['gpt-5.5[1m]', 272_000],
      ['gpt-5.4-mini[1m]', 272_000],
      ['gpt-5.3-codex[1m]', 272_000],
      ['gpt-5.3-codex-spark[1m]', 128_000],
    ] as const
    for (const [model, contextWindow] of unsupported1mVariants) {
      expect(getContextWindowForModel(model)).toBe(contextWindow)
    }
  })

  test('runtime allows the supported GPT-5.4 [1m] variant', async () => {
    const { getContextWindowForModel } = await import('../context.js')
    setChatGPTSubscriptionPlan('pro')

    expect(getContextWindowForModel('gpt-5.4[1m]')).toBe(1_000_000)
  })

  test('runtime applies the lower plan or model cap without [1m]', async () => {
    const { getContextWindowForModel } = await import('../context.js')

    const cases = [
      ['pro', 'gpt-5.6-sol', 372_000],
      ['plus', 'gpt-5.6-sol', 256_000],
      ['pro', 'gpt-5.3-codex', 272_000],
      ['pro', 'gpt-5.3-codex-spark', 128_000],
    ] as const
    for (const [plan, model, contextWindow] of cases) {
      setChatGPTSubscriptionPlan(plan)
      expect(getContextWindowForModel(model)).toBe(contextWindow)
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
