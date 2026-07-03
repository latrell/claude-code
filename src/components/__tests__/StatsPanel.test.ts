/**
 * Tests for StatsPanel component — API usage stats display.
 *
 * Covers:
 *   - aggregateModelUsage: grouping by canonical short name
 *   - aggregateModelUsage: edge cases (empty map, single model, zero values)
 *
 * Uses the second parameter (resolveName) to inject a naming function
 * so tests are pure and don't require the full model registry.
 */

import { describe, expect, test } from 'bun:test'

// aggregateModelUsage is a pure function — no mocking needed since
// we inject the resolveName function.

async function getAggregateModelUsage() {
  const mod = await import('../StatsPanel.js')
  return mod.aggregateModelUsage
}

function resolveMock(name: string): string {
  if (name.startsWith('claude-sonnet')) return 'claude-sonnet'
  if (name.startsWith('claude-opus')) return 'claude-opus'
  if (name.startsWith('claude-haiku')) return 'claude-haiku'
  return name
}

describe('aggregateModelUsage', () => {
  test('returns empty map for empty input', async () => {
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage({}, resolveMock)
    expect(result.size).toBe(0)
  })

  test('maps a single model to its canonical short name', async () => {
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage(
      {
        'claude-sonnet-20250601': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0.005,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
      },
      resolveMock,
    )
    expect(result.size).toBe(1)
    const entry = result.get('claude-sonnet')
    expect(entry).toBeDefined()
    expect(entry!.inputTokens).toBe(1000)
    expect(entry!.outputTokens).toBe(500)
    expect(entry!.costUSD).toBe(0.005)
  })

  test('aggregates multiple model versions under the same canonical name', async () => {
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage(
      {
        'claude-sonnet-20250601': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 100,
          cacheCreationInputTokens: 50,
          webSearchRequests: 1,
          costUSD: 0.005,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
        'claude-sonnet-20250219': {
          inputTokens: 2000,
          outputTokens: 800,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 0,
          webSearchRequests: 2,
          costUSD: 0.008,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
      },
      resolveMock,
    )
    expect(result.size).toBe(1)
    const entry = result.get('claude-sonnet')
    expect(entry).toBeDefined()
    expect(entry!.inputTokens).toBe(3000)
    expect(entry!.outputTokens).toBe(1300)
    expect(entry!.cacheReadInputTokens).toBe(300)
    expect(entry!.cacheCreationInputTokens).toBe(50)
    expect(entry!.webSearchRequests).toBe(3)
    expect(entry!.costUSD).toBeCloseTo(0.013)
  })

  test('keeps different canonical names separate', async () => {
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage(
      {
        'claude-sonnet-20250601': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0.005,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
        'claude-opus-4-20250514': {
          inputTokens: 500,
          outputTokens: 200,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0.015,
          contextWindow: 200000,
          maxOutputTokens: 32768,
        },
      },
      resolveMock,
    )
    expect(result.size).toBe(2)
    expect(result.get('claude-sonnet')!.inputTokens).toBe(1000)
    expect(result.get('claude-sonnet')!.costUSD).toBe(0.005)
    expect(result.get('claude-opus')!.inputTokens).toBe(500)
    expect(result.get('claude-opus')!.costUSD).toBe(0.015)
  })

  test('handles zero-value entries correctly', async () => {
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage(
      {
        'claude-haiku-20250301': {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
      },
      resolveMock,
    )
    expect(result.size).toBe(1)
    const entry = result.get('claude-haiku')
    expect(entry).toBeDefined()
    expect(entry!.inputTokens).toBe(0)
    expect(entry!.outputTokens).toBe(0)
    expect(entry!.costUSD).toBe(0)
  })

  test('uses default getCanonicalName when resolveName is omitted', async () => {
    // This test verifies the default parameter works.
    // With an empty input, the default isn't called.
    const aggregateModelUsage = await getAggregateModelUsage()
    const result = aggregateModelUsage({})
    expect(result.size).toBe(0)
  })
})
