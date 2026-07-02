import { describe, expect, test } from 'bun:test'
import { getChatGPTCodexContextWindow } from '../chatgptModels.js'

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
