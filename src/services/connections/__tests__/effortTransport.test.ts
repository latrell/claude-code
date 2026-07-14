import { describe, expect, test } from 'bun:test'
import {
  applyConnectionThinkingEffortSelection,
  getConnectionThinkingEffortSelection,
  resolveOpenAICompatibleReasoningEffort,
} from '../effortTransport.js'
import { ConnectionSchema, type Connection } from '../types.js'

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'relay',
    label: 'Relay',
    kind: 'openai-compat',
    model: 'deepseek-v4-flash',
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
