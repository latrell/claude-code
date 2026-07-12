import {
  chatGPTCodexModelSupportsEffortLevel,
  getChatGPTCodexDefaultEffortLevel,
} from '../../../utils/model/chatgptModels.js'
import type { ResponsesReasoningEffort } from './responsesAdapter.js'

function normalizeResponsesReasoningEffort(
  model: string,
  value: unknown,
): ResponsesReasoningEffort | undefined {
  if (value === 'low') return 'low'
  if (value === 'medium') return 'medium'
  if (value === 'high') return 'high'
  if (value === 'xhigh') return 'xhigh'
  if (value === 'max') {
    return chatGPTCodexModelSupportsEffortLevel(model, 'max') ? 'max' : 'xhigh'
  }
  if (typeof value === 'number') return 'high'
  return undefined
}

/**
 * Resolve the reasoning effort sent to the ChatGPT Codex Responses backend.
 *
 * Precedence matches the existing OpenAI path: scoped env override, explicit
 * query effort, then the model's Codex default. `auto` and `unset` explicitly
 * omit the field so the backend may choose its own default. Older and unknown
 * models do not accept `max`, so it remains a compatibility alias for
 * `xhigh`; the GPT-5.6 family accepts `max` directly.
 */
export function resolveChatGPTResponsesReasoningEffort(
  model: string,
  effortValue: unknown,
  env: Record<string, string | undefined> = process.env,
): ResponsesReasoningEffort | undefined {
  const envOverride = env.CLAUDE_CODE_EFFORT_LEVEL?.trim().toLowerCase()
  if (envOverride === 'auto' || envOverride === 'unset') return undefined

  return (
    normalizeResponsesReasoningEffort(model, envOverride) ??
    normalizeResponsesReasoningEffort(model, effortValue) ??
    normalizeResponsesReasoningEffort(
      model,
      getChatGPTCodexDefaultEffortLevel(model),
    ) ??
    'medium'
  )
}
