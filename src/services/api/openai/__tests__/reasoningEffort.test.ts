import { afterEach, describe, expect, test } from 'bun:test'
import {
  CHATGPT_CODEX_MODEL_OPTIONS,
  clearRemoteChatGPTCodexModelOptions,
  setRemoteChatGPTCodexModelOptions,
} from '../../../../utils/model/chatgptModels.js'
import { resolveChatGPTResponsesReasoningEffort } from '../reasoningEffort.js'

afterEach(() => {
  clearRemoteChatGPTCodexModelOptions()
})

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
    'codex-auto-review',
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
    ['gpt-5.6-sol', 'low'],
    ['gpt-5.6-terra', 'medium'],
    ['gpt-5.6-luna', 'medium'],
    ['gpt-5.5', 'medium'],
    ['gpt-5.4', 'medium'],
    ['gpt-5.4-mini', 'medium'],
    ['codex-auto-review', 'medium'],
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

  test('maps product Ultra to wire Max without forwarding the raw value', () => {
    expect(
      resolveChatGPTResponsesReasoningEffort('gpt-5.6-sol', 'ultra', {}),
    ).toBe('max')
    expect(resolveChatGPTResponsesReasoningEffort('gpt-5.5', 'ultra', {})).toBe(
      'xhigh',
    )
  })

  test('resolves effort metadata from the matching credential scope', () => {
    setRemoteChatGPTCodexModelOptions(
      [
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[3]!,
          value: 'scoped-max-model',
          supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
      'work-account',
    )

    expect(
      resolveChatGPTResponsesReasoningEffort(
        'scoped-max-model',
        'max',
        {},
        'work-account',
      ),
    ).toBe('max')
    expect(
      resolveChatGPTResponsesReasoningEffort(
        'scoped-max-model',
        'max',
        {},
        'personal-account',
      ),
    ).toBe('xhigh')
  })
})
