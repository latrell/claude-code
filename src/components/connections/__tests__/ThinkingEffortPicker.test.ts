import { describe, expect, test } from 'bun:test'
import { buildThinkingEffortOptions } from '../ThinkingEffortPicker.js'
import type { Connection } from '../../../services/connections/types.js'

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'relay',
    label: 'Relay',
    kind: 'openai-compat',
    model: 'model-a',
    ...overrides,
  }
}

describe('buildThinkingEffortOptions', () => {
  test.each([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
  ])('shows only the two native effort levels for %s', model => {
    const options = buildThinkingEffortOptions(connection({ model }))
    expect(options.map(option => option.value)).toEqual([
      'default',
      'off',
      'high',
      'max-passthrough',
    ])
    expect(
      options.find(option => option.value === 'high')?.description,
    ).toContain('reasoning_effort=high')
    expect(
      options.find(option => option.value === 'max-passthrough')?.description,
    ).toContain('reasoning_effort=max')
  })

  test('marks a legacy DeepSeek medium profile as actual High', () => {
    const options = buildThinkingEffortOptions(
      connection({
        model: 'deepseek-v4-flash',
        thinkingEffort: 'medium',
      }),
    )
    const high = options.find(option => option.value === 'high')
    expect(high?.description).toContain('reasoning_effort=high')
    expect(high?.description).toContain('medium')
    expect(high?.description).toContain('High')
  })

  test('marks a relay-safe DeepSeek Max profile as actual High', () => {
    const options = buildThinkingEffortOptions(
      connection({
        model: 'deepseek-v4-pro',
        thinkingEffort: 'max',
        thinkingEffortTransport: 'compatible',
      }),
    )
    const high = options.find(option => option.value === 'high')
    expect(high?.description).toContain('max (compatible)')
    expect(high?.description).toContain('High')
  })

  test('keeps generic OpenAI-compatible relay choices unchanged', () => {
    expect(
      buildThinkingEffortOptions(connection()).map(option => option.value),
    ).toEqual([
      'default',
      'off',
      'low',
      'medium',
      'high',
      'max-compatible',
      'max-passthrough',
    ])
  })

  test('an explicit non-DeepSeek model wins over a stale DeepSeek preset', () => {
    expect(
      buildThinkingEffortOptions(
        connection({ presetId: 'deepseek', model: 'qwen3.7-plus' }),
      ).map(option => option.value),
    ).toContain('medium')
  })
})
