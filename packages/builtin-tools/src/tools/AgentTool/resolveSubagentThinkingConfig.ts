/**
 * Thinking config for a spawned subagent, following the subagent connection
 * profile's pinned thinkingEffort:
 *
 * - Fork children (useExactTools) always inherit the parent's config so the
 *   API request prefix matches for prompt cache hits — even when the profile
 *   pins 'off'.
 * - thinkingEffort 'off' disables thinking.
 * - Any other effort (low/medium/high/max) or none keeps the parent/default
 *   config, letting the downstream effortValue → budget/output_config.effort
 *   mapping apply — the same default behavior as the main agent.
 *
 * Kept as a dependency-free module so tests can import it without pulling in
 * runAgent.ts's module graph.
 */

import type { ProviderRuntimeConfig } from 'src/utils/model/subagentProvider.js'
import type { ThinkingConfig } from 'src/utils/thinking.js'

export function resolveSubagentThinkingConfig(params: {
  useExactTools: boolean | undefined
  parentThinkingConfig: ThinkingConfig
  providerRuntimeConfig: ProviderRuntimeConfig | undefined
}): ThinkingConfig {
  const { useExactTools, parentThinkingConfig, providerRuntimeConfig } = params
  if (useExactTools) return parentThinkingConfig
  if (providerRuntimeConfig?.thinkingEffort === 'off') {
    return { type: 'disabled' }
  }
  return parentThinkingConfig
}
