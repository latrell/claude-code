/**
 * Tests for shouldFilterSuggestion / countSuggestionWords.
 *
 * Focus: the CJK word-counting fix — Chinese suggestions have no spaces, so
 * the old split(/\s+/) counted them as 1 "word" and too_few_words killed
 * nearly every Chinese suggestion (the root cause of "suggestions sometimes
 * appear, sometimes not" for zh users).
 */
import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))

import {
  countSuggestionWords,
  shouldFilterSuggestion,
} from '../promptSuggestion'

describe('countSuggestionWords', () => {
  test('counts whitespace-delimited English words', () => {
    expect(countSuggestionWords('run the tests')).toBe(3)
    expect(countSuggestionWords('  commit this  ')).toBe(2)
  })

  test('counts CJK characters at 2-per-word', () => {
    expect(countSuggestionWords('运行测试')).toBe(2)
    expect(countSuggestionWords('继续')).toBe(1)
    expect(countSuggestionWords('修复登录按钮的样式')).toBe(5)
  })

  test('counts mixed CJK and Latin segments', () => {
    expect(countSuggestionWords('修复 login 按钮')).toBe(3)
    expect(countSuggestionWords('运行 bun test')).toBe(3)
  })

  test('ignores punctuation-only segments', () => {
    expect(countSuggestionWords('yes')).toBe(1)
    expect(countSuggestionWords('')).toBe(0)
    expect(countSuggestionWords('   ')).toBe(0)
  })
})

describe('shouldFilterSuggestion', () => {
  test('keeps multi-word English suggestions', () => {
    expect(shouldFilterSuggestion('run the tests', 'user_intent')).toBe(false)
  })

  test('keeps short Chinese action suggestions (CJK fix)', () => {
    expect(shouldFilterSuggestion('运行测试', 'user_intent')).toBe(false)
    expect(shouldFilterSuggestion('提交并推送', 'user_intent')).toBe(false)
    expect(shouldFilterSuggestion('修复这个报错', 'user_intent')).toBe(false)
  })

  test('keeps whitelisted single words in both languages', () => {
    expect(shouldFilterSuggestion('continue', 'user_intent')).toBe(false)
    expect(shouldFilterSuggestion('继续', 'user_intent')).toBe(false)
    expect(shouldFilterSuggestion('好的', 'user_intent')).toBe(false)
    expect(shouldFilterSuggestion('好', 'user_intent')).toBe(false)
  })

  test('keeps slash commands', () => {
    expect(shouldFilterSuggestion('/compact', 'user_intent')).toBe(false)
  })

  test('still filters unlisted single words', () => {
    expect(shouldFilterSuggestion('interesting', 'user_intent')).toBe(true)
    expect(shouldFilterSuggestion('嗯', 'user_intent')).toBe(true)
  })

  test('filters overly long Chinese suggestions via too_many_words', () => {
    // 30 CJK chars → 15 words > 12
    expect(shouldFilterSuggestion('把'.repeat(30), 'user_intent')).toBe(true)
  })

  test('filters empty and evaluative suggestions', () => {
    expect(shouldFilterSuggestion(null, 'user_intent')).toBe(true)
    expect(shouldFilterSuggestion('looks good to me', 'user_intent')).toBe(true)
  })

  test('filters Claude-voice suggestions', () => {
    expect(shouldFilterSuggestion("I'll fix the tests", 'user_intent')).toBe(
      true,
    )
  })
})
