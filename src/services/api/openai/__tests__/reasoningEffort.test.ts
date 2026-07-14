import { describe, expect, test } from 'bun:test'
import { resolveChatGPTResponsesReasoningEffort } from '../reasoningEffort.js'

describe('resolveChatGPTResponsesReasoningEffort', () => {
  test.each([
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
  ])('preserves max for %s', model => {
    expect(resolveChatGPTResponsesReasoningEffort(model, 'max', {})).toBe('max')
  })

  test.each([
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'unknown-model',
  ])('maps max to xhigh for %s', model => {
    expect(resolveChatGPTResponsesReasoningEffort(model, 'max', {})).toBe(
      'xhigh',
    )
  })

  test.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
    ['xhigh', 'xhigh'],
    [42, 'high'],
  ] as const)('preserves supported explicit effort %p', (effort, expected) => {
    expect(resolveChatGPTResponsesReasoningEffort('gpt-5.5', effort, {})).toBe(
      expected,
    )
  })

  test.each([
    ['gpt-5.6-sol', 'medium'],
    ['gpt-5.6-terra', 'medium'],
    ['gpt-5.6-luna', 'medium'],
    ['gpt-5.5', 'medium'],
    ['gpt-5.4', 'medium'],
    ['gpt-5.4-mini', 'medium'],
    ['gpt-5.3-codex', 'medium'],
    ['gpt-5.3-codex-spark', 'high'],
    ['unknown-model', 'medium'],
  ] as const)('uses the Codex default for %s', (model, expected) => {
    expect(resolveChatGPTResponsesReasoningEffort(model, undefined, {})).toBe(
      expected,
    )
  })

  test.each([
    'auto',
    'unset',
    ' AUTO ',
    ' UnSeT ',
  ])('omits reasoning effort for env override %p', envValue => {
    expect(
      resolveChatGPTResponsesReasoningEffort('gpt-5.6-sol', 'max', {
        CLAUDE_CODE_EFFORT_LEVEL: envValue,
      }),
    ).toBeUndefined()
  })

  test('uses the scoped env override before the explicit query effort', () => {
    expect(
      resolveChatGPTResponsesReasoningEffort('gpt-5.6-sol', 'low', {
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
      }),
    ).toBe('max')
  })

  test('never forwards ultra to the Responses backend', () => {
    expect(
      resolveChatGPTResponsesReasoningEffort('gpt-5.6-sol', 'ultra', {}),
    ).toBe('medium')
  })
})
