import { describe, expect, test } from 'bun:test'
import {
  applyConnectionThinkingEffortSelection,
  getConnectionThinkingEffortSelection,
  isDeepSeekV4Connection,
  isDeepSeekV4ReasoningModel,
  resolveOpenAICompatibleReasoningEffort,
} from '../effortTransport.js'
import { ConnectionSchema, type Connection } from '../types.js'

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'relay',
    label: 'Relay',
    kind: 'openai-compat',
    model: 'model-a',
    ...overrides,
  }
}

describe('resolveOpenAICompatibleReasoningEffort', () => {
  test.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
    ['xhigh', 'high'],
    ['max', 'high'],
  ] as const)('compatible maps %s to %s', (input, expected) => {
    expect(
      resolveOpenAICompatibleReasoningEffort(input, 'compatible', {}),
    ).toBe(expected)
    expect(resolveOpenAICompatibleReasoningEffort(input, undefined, {})).toBe(
      expected,
    )
  })

  test.each([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const)('passthrough preserves %s', input => {
    expect(
      resolveOpenAICompatibleReasoningEffort(input, 'passthrough', {}),
    ).toBe(input)
  })

  test('env override has priority and auto/unset omit the field', () => {
    expect(
      resolveOpenAICompatibleReasoningEffort('max', 'passthrough', {
        CLAUDE_CODE_EFFORT_LEVEL: 'medium',
      }),
    ).toBe('medium')
    expect(
      resolveOpenAICompatibleReasoningEffort('max', 'passthrough', {
        CLAUDE_CODE_EFFORT_LEVEL: 'auto',
      }),
    ).toBeUndefined()
    expect(
      resolveOpenAICompatibleReasoningEffort('max', 'passthrough', {
        CLAUDE_CODE_EFFORT_LEVEL: 'unset',
      }),
    ).toBeUndefined()
    expect(
      resolveOpenAICompatibleReasoningEffort('low', 'passthrough', {
        CLAUDE_CODE_EFFORT_LEVEL: '42',
      }),
    ).toBe('high')
  })

  test('undefined effort omits the field', () => {
    expect(
      resolveOpenAICompatibleReasoningEffort(undefined, 'compatible', {}),
    ).toBeUndefined()
  })

  test.each([
    ['low', 'high'],
    ['medium', 'high'],
    ['high', 'high'],
    ['xhigh', 'max'],
    ['max', 'max'],
  ] as const)('DeepSeek passthrough canonicalizes %s to native %s', (input, expected) => {
    expect(
      resolveOpenAICompatibleReasoningEffort(
        input,
        'passthrough',
        {},
        'deepseek-v4-flash',
      ),
    ).toBe(expected)
  })

  test.each([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const)('DeepSeek compatible keeps %s relay-safe at high', input => {
    expect(
      resolveOpenAICompatibleReasoningEffort(
        input,
        'compatible',
        {},
        'deepseek-v4-pro',
      ),
    ).toBe('high')
  })

  test('DeepSeek env override is normalized against the resolved model', () => {
    expect(
      resolveOpenAICompatibleReasoningEffort(
        'high',
        'passthrough',
        { CLAUDE_CODE_EFFORT_LEVEL: 'medium' },
        'deepseek-v4-pro',
      ),
    ).toBe('high')
    expect(
      resolveOpenAICompatibleReasoningEffort(
        'high',
        'passthrough',
        { CLAUDE_CODE_EFFORT_LEVEL: 'xhigh' },
        'deepseek-v4-pro',
      ),
    ).toBe('max')
  })
})

describe('DeepSeek V4 effort detection', () => {
  test.each([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'OpenRouter/DeepSeek/deepseek-v4-flash',
    'DEEPSEEK-V4-PRO:latest',
    'deepseek-chat',
    'deepseek-reasoner',
  ])('recognizes %s', model => {
    expect(isDeepSeekV4ReasoningModel(model)).toBe(true)
  })

  test.each([
    'deepseek-r1',
    'deepseek-v3.2',
    'my-deepseek-v4-proxy',
    'qwen3.7-plus',
  ])('does not overclaim V4 effort support for %s', model => {
    expect(isDeepSeekV4ReasoningModel(model)).toBe(false)
  })

  test('uses preset or official host only when no explicit model is pinned', () => {
    expect(
      isDeepSeekV4Connection(
        connection({ model: undefined, presetId: 'deepseek' }),
      ),
    ).toBe(true)
    expect(
      isDeepSeekV4Connection(
        connection({
          model: undefined,
          baseUrl: 'https://api.deepseek.com/v1',
        }),
      ),
    ).toBe(true)
    expect(
      isDeepSeekV4Connection(
        connection({ model: 'qwen3.7-plus', presetId: 'deepseek' }),
      ),
    ).toBe(false)
    expect(
      isDeepSeekV4Connection(
        connection({ label: 'DeepSeek relay', model: 'model-a' }),
      ),
    ).toBe(false)
  })
})

describe('connection effort selection', () => {
  test('distinguishes compatible max from exact max', () => {
    const compatible = applyConnectionThinkingEffortSelection(
      connection(),
      'max-compatible',
    )
    expect(compatible.thinkingEffort).toBe('max')
    expect(compatible.thinkingEffortTransport).toBe('compatible')
    expect(getConnectionThinkingEffortSelection(compatible)).toBe(
      'max-compatible',
    )

    const exact = applyConnectionThinkingEffortSelection(
      compatible,
      'max-passthrough',
    )
    expect(exact.thinkingEffort).toBe('max')
    expect(exact.thinkingEffortTransport).toBe('passthrough')
    expect(getConnectionThinkingEffortSelection(exact)).toBe('max-passthrough')
  })

  test('default clears both fields without mutating the source', () => {
    const source = connection({
      thinkingEffort: 'max',
      thinkingEffortTransport: 'passthrough',
    })
    const cleared = applyConnectionThinkingEffortSelection(source, 'default')
    expect(cleared.thinkingEffort).toBeUndefined()
    expect(cleared.thinkingEffortTransport).toBeUndefined()
    expect(source.thinkingEffortTransport).toBe('passthrough')
  })

  test('DeepSeek legacy values focus their actual level and exact Max remains distinct', () => {
    expect(
      getConnectionThinkingEffortSelection(
        connection({ model: 'deepseek-v4-flash', thinkingEffort: 'medium' }),
      ),
    ).toBe('high')
    expect(
      getConnectionThinkingEffortSelection(
        connection({ model: 'deepseek-v4-pro', thinkingEffort: 'max' }),
      ),
    ).toBe('high')
    expect(
      getConnectionThinkingEffortSelection(
        connection({
          model: 'deepseek-v4-pro',
          thinkingEffort: 'max',
          thinkingEffortTransport: 'passthrough',
        }),
      ),
    ).toBe('max-passthrough')
  })
})

describe('ConnectionSchema thinkingEffortTransport', () => {
  test('accepts passthrough and keeps legacy profiles compatible by omission', () => {
    expect(
      ConnectionSchema.parse(
        connection({ thinkingEffortTransport: 'passthrough' }),
      ).thinkingEffortTransport,
    ).toBe('passthrough')
    expect(
      ConnectionSchema.parse(connection()).thinkingEffortTransport,
    ).toBeUndefined()
  })

  test('rejects an unknown transport', () => {
    expect(() =>
      ConnectionSchema.parse({
        ...connection(),
        thinkingEffortTransport: 'guess-from-model-name',
      }),
    ).toThrow()
  })
})
