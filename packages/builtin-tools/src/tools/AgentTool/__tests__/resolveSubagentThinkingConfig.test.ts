import { describe, expect, test } from 'bun:test'
import type { ProviderRuntimeConfig } from 'src/utils/model/subagentProvider.js'
import { resolveSubagentThinkingConfig } from '../resolveSubagentThinkingConfig.js'

const parentEnabled = { type: 'enabled', budgetTokens: 8192 } as const
const parentAdaptive = { type: 'adaptive' } as const

function runtimeConfig(
  overrides: Partial<ProviderRuntimeConfig> = {},
): ProviderRuntimeConfig {
  return { provider: 'openai', ...overrides }
}

describe('resolveSubagentThinkingConfig', () => {
  test('thinkingEffort off disables thinking for regular subagents', () => {
    expect(
      resolveSubagentThinkingConfig({
        useExactTools: false,
        parentThinkingConfig: parentEnabled,
        providerRuntimeConfig: runtimeConfig({ thinkingEffort: 'off' }),
      }),
    ).toEqual({ type: 'disabled' })
  })

  test('non-off efforts keep the parent thinking config', () => {
    for (const effort of ['low', 'medium', 'high', 'max'] as const) {
      expect(
        resolveSubagentThinkingConfig({
          useExactTools: false,
          parentThinkingConfig: parentAdaptive,
          providerRuntimeConfig: runtimeConfig({ thinkingEffort: effort }),
        }),
      ).toBe(parentAdaptive)
    }
  })

  test('runtime config without pinned effort keeps the parent config', () => {
    expect(
      resolveSubagentThinkingConfig({
        useExactTools: false,
        parentThinkingConfig: parentEnabled,
        providerRuntimeConfig: runtimeConfig(),
      }),
    ).toBe(parentEnabled)
  })

  test('no subagent runtime config inherits the parent config', () => {
    expect(
      resolveSubagentThinkingConfig({
        useExactTools: false,
        parentThinkingConfig: parentAdaptive,
        providerRuntimeConfig: undefined,
      }),
    ).toBe(parentAdaptive)
  })

  test('fork children always inherit the parent config, even when off', () => {
    expect(
      resolveSubagentThinkingConfig({
        useExactTools: true,
        parentThinkingConfig: parentEnabled,
        providerRuntimeConfig: runtimeConfig({ thinkingEffort: 'off' }),
      }),
    ).toBe(parentEnabled)
  })
})
