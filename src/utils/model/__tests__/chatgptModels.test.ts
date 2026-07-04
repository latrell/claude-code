import { describe, expect, test } from 'bun:test'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_FAST_MODEL,
  CHATGPT_CODEX_MODEL_OPTIONS,
  getChatGPTCodexContextWindow,
  getChatGPTCodexModelDisplayName,
  isChatGPTCodexReasoningModel,
} from '../chatgptModels.js'

describe('CHATGPT_CODEX_MODEL_OPTIONS', () => {
  test('default model is gpt-5.5', () => {
    expect(CHATGPT_CODEX_DEFAULT_MODEL).toBe('gpt-5.5')
  })

  test('fast model is gpt-5.4-mini', () => {
    expect(CHATGPT_CODEX_FAST_MODEL).toBe('gpt-5.4-mini')
  })

  test('includes all recommended models', () => {
    const values = CHATGPT_CODEX_MODEL_OPTIONS.map(o => o.value)
    expect(values).toContain('gpt-5.5')
    expect(values).toContain('gpt-5.5-pro')
    expect(values).toContain('gpt-5.4')
    expect(values).toContain('gpt-5.4-mini')
    expect(values).toContain('gpt-5.4-nano')
    expect(values).toContain('gpt-5.3-codex')
    expect(values).toContain('gpt-5.3-codex-spark')
    expect(values).toContain('gpt-5.2')
  })

  test('model count is 8', () => {
    expect(CHATGPT_CODEX_MODEL_OPTIONS).toHaveLength(8)
  })

  test('every option has a non-empty value, label, and description', () => {
    for (const opt of CHATGPT_CODEX_MODEL_OPTIONS) {
      expect(opt.value).toBeTruthy()
      expect(opt.label).toBeTruthy()
      expect(opt.description).toBeTruthy()
    }
  })

  test('values are unique', () => {
    const values = CHATGPT_CODEX_MODEL_OPTIONS.map(o => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('isChatGPTCodexReasoningModel', () => {
  test('gpt-5.5 is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.5')).toBe(true)
  })

  test('gpt-5.5-pro is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.5-pro')).toBe(true)
  })

  test('gpt-5.4 is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.4')).toBe(true)
  })

  test('gpt-5.4-mini is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.4-mini')).toBe(true)
  })

  test('gpt-5.4-nano is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.4-nano')).toBe(true)
  })

  test('gpt-5.3-codex is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.3-codex')).toBe(true)
  })

  test('gpt-5.3-codex-spark is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.3-codex-spark')).toBe(true)
  })

  test('gpt-5.2 is a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.2')).toBe(true)
  })

  test('unknown model is not a reasoning model', () => {
    expect(isChatGPTCodexReasoningModel('gpt-4')).toBe(false)
  })

  test('case insensitive match', () => {
    expect(isChatGPTCodexReasoningModel('GPT-5.5')).toBe(true)
    expect(isChatGPTCodexReasoningModel('Gpt-5.5-Pro')).toBe(true)
  })

  test('strip [1m] suffix before matching', () => {
    expect(isChatGPTCodexReasoningModel('gpt-5.5[1m]')).toBe(true)
    expect(isChatGPTCodexReasoningModel('gpt-5.4-nano[1m]')).toBe(true)
  })
})

describe('getChatGPTCodexContextWindow', () => {
  // ---------------------------------------------------------------------------
  // Known plans — reasoning/coding tier context windows
  // ---------------------------------------------------------------------------

  test('free plan returns 27_000', () => {
    expect(getChatGPTCodexContextWindow('free')).toBe(27_000)
  })

  test('go plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('go')).toBe(256_000)
  })

  test('plus plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('plus')).toBe(256_000)
  })

  test('pro plan returns 400_000', () => {
    expect(getChatGPTCodexContextWindow('pro')).toBe(400_000)
  })

  test('team plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('team')).toBe(256_000)
  })

  test('business plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('business')).toBe(256_000)
  })

  test('enterprise plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('enterprise')).toBe(256_000)
  })

  test('edu plan returns 256_000', () => {
    expect(getChatGPTCodexContextWindow('edu')).toBe(256_000)
  })

  // ---------------------------------------------------------------------------
  // Case insensitivity
  // ---------------------------------------------------------------------------

  test('matches plan strings case-insensitively', () => {
    expect(getChatGPTCodexContextWindow('FREE')).toBe(27_000)
    expect(getChatGPTCodexContextWindow('Free')).toBe(27_000)
    expect(getChatGPTCodexContextWindow('PRO')).toBe(400_000)
    expect(getChatGPTCodexContextWindow('Pro')).toBe(400_000)
    expect(getChatGPTCodexContextWindow('PLUS')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('Plus')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('TEAM')).toBe(256_000)
    expect(getChatGPTCodexContextWindow('Business')).toBe(256_000)
  })

  // ---------------------------------------------------------------------------
  // Whitespace tolerance
  // ---------------------------------------------------------------------------

  test('trims whitespace around plan strings', () => {
    expect(getChatGPTCodexContextWindow('  pro  ')).toBe(400_000)
    expect(getChatGPTCodexContextWindow('\tfree\n')).toBe(27_000)
  })

  // ---------------------------------------------------------------------------
  // Null / undefined / empty
  // ---------------------------------------------------------------------------

  test('returns undefined for null', () => {
    expect(getChatGPTCodexContextWindow(null)).toBeUndefined()
  })

  test('returns undefined for undefined', () => {
    expect(getChatGPTCodexContextWindow(undefined)).toBeUndefined()
  })

  test('returns undefined for empty string', () => {
    expect(getChatGPTCodexContextWindow('')).toBeUndefined()
  })

  test('returns undefined for whitespace-only string', () => {
    expect(getChatGPTCodexContextWindow('   ')).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Unknown plans
  // ---------------------------------------------------------------------------

  test('returns undefined for unknown plan strings', () => {
    expect(getChatGPTCodexContextWindow('basic')).toBeUndefined()
    expect(getChatGPTCodexContextWindow('premium')).toBeUndefined()
    expect(getChatGPTCodexContextWindow('starter')).toBeUndefined()
  })

  test('returns undefined for garbage input', () => {
    expect(getChatGPTCodexContextWindow('xyzzy')).toBeUndefined()
    expect(getChatGPTCodexContextWindow('not-a-plan')).toBeUndefined()
  })
})

describe('getChatGPTCodexModelDisplayName', () => {
  test('gpt-5.5 returns GPT-5.5', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.5')).toBe('GPT-5.5')
  })

  test('gpt-5.5-pro returns GPT-5.5 Pro', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.5-pro')).toBe('GPT-5.5 Pro')
  })

  test('gpt-5.4 returns GPT-5.4', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.4')).toBe('GPT-5.4')
  })

  test('gpt-5.4-mini returns GPT-5.4-Mini', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.4-mini')).toBe('GPT-5.4-Mini')
  })

  test('gpt-5.4-nano returns GPT-5.4-Nano', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.4-nano')).toBe('GPT-5.4-Nano')
  })

  test('gpt-5.3-codex returns GPT-5.3-Codex', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.3-codex')).toBe(
      'GPT-5.3-Codex',
    )
  })

  test('gpt-5.3-codex-spark returns GPT-5.3-Codex-Spark', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.3-codex-spark')).toBe(
      'GPT-5.3-Codex-Spark',
    )
  })

  test('gpt-5.2 returns GPT-5.2', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.2')).toBe('GPT-5.2')
  })

  test('gpt-5.5[1m] returns GPT-5.5 (1M context)', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.5[1m]')).toBe(
      'GPT-5.5 (1M context)',
    )
  })

  test('gpt-5.5-pro[1m] returns GPT-5.5 Pro (1M context)', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.5-pro[1m]')).toBe(
      'GPT-5.5 Pro (1M context)',
    )
  })

  test('gpt-5.3-codex-spark[1m] returns GPT-5.3-Codex-Spark (1M context)', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-5.3-codex-spark[1m]')).toBe(
      'GPT-5.3-Codex-Spark (1M context)',
    )
  })

  test('unknown model returns null', () => {
    expect(getChatGPTCodexModelDisplayName('gpt-4')).toBeNull()
    expect(getChatGPTCodexModelDisplayName('gpt-4o')).toBeNull()
  })

  test('empty string returns null', () => {
    expect(getChatGPTCodexModelDisplayName('')).toBeNull()
  })
})
