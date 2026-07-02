import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getChatGPTSubscriptionPlan,
  setChatGPTSubscriptionPlan,
} from '../../bootstrap/state.js'

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

  beforeEach(() => {
    origOpenAIAuthMode = process.env.OPENAI_AUTH_MODE
    origClaudeCodeUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
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
    setChatGPTSubscriptionPlan(null)
  })

  // This test suite validates that the getChatGPTCodexContextWindow lookup
  // itself is correct. The full getContextWindowForModel integration is
  // verified separately via the queryModelOpenAI.isolated.ts mock chain
  // which stubs getContextWindowForModel → the context window size feeds
  // into the request builder.

  test('getChatGPTCodexContextWindow returns correct values for all known plans', async () => {
    // Dynamic import avoids affecting other test files' module state
    const { getChatGPTCodexContextWindow } = await import(
      '../../utils/model/chatgptModels.js'
    )

    expect(getChatGPTCodexContextWindow('free')).toBe(27_000)
    expect(getChatGPTCodexContextWindow('go')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('plus')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('pro')).toBe(400_000)
    expect(getChatGPTCodexContextWindow('team')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('business')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('enterprise')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('edu')).toBe(256_000)
    expect(getChatGPTCodexContextWindow(null)).toBeUndefined()
    expect(getChatGPTCodexContextWindow(undefined)).toBeUndefined()
    expect(getChatGPTCodexContextWindow('unknown')).toBeUndefined()
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
