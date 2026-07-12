import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

const { isKnownAdaptiveThinkingModel } = await import('../thinking.js')

describe('isKnownAdaptiveThinkingModel', () => {
  test('matches adaptive-thinking Claude model families', () => {
    expect(isKnownAdaptiveThinkingModel('claude-fable-5')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-opus-4-8')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-opus-4-7')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-opus-4-6')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-sonnet-5')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-sonnet-4-6')).toBe(true)
  })

  test('matches dated / suffixed model ids', () => {
    expect(isKnownAdaptiveThinkingModel('claude-sonnet-5-20260115')).toBe(true)
    expect(isKnownAdaptiveThinkingModel('claude-fable-5[1m]')).toBe(true)
  })

  test('does not match legacy Claude models', () => {
    expect(isKnownAdaptiveThinkingModel('claude-haiku-4-5-20251001')).toBe(
      false,
    )
    expect(isKnownAdaptiveThinkingModel('claude-sonnet-4-5')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('claude-opus-4-1')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('claude-3-5-haiku-latest')).toBe(false)
  })

  test('does not match third-party slot models', () => {
    // Slot-pinned models (fast/sonnet slots) flow through the same classifier
    // model resolution — a provider fallback here would wrongly suppress the
    // OpenAI-compat thinking:false disable payload for these.
    expect(isKnownAdaptiveThinkingModel('deepseek-v4-flash')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('deepseek-v4-pro')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('gpt-4o')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('gemini-3-pro')).toBe(false)
    expect(isKnownAdaptiveThinkingModel('grok-4')).toBe(false)
  })
})
