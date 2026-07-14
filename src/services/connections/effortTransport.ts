import type { EffortValue } from '../../utils/effort.js'
import type {
  Connection,
  ThinkingEffort,
  ThinkingEffortTransport,
} from './types.js'

export const DEFAULT_THINKING_EFFORT_TRANSPORT: ThinkingEffortTransport =
  'compatible'

export type OpenAICompatibleReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

function normalizeReasoningEffort(
  value: unknown,
): OpenAICompatibleReasoningEffort | undefined {
  if (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  ) {
    return value
  }
  // Numeric effort is an Anthropic-internal escape hatch. Chat Completions
  // cannot represent it, so use the highest standard value rather than
  // leaking a number into a string-only field.
  if (typeof value === 'number') return 'high'
  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isInteger(Number(value))
  ) {
    return 'high'
  }
  return undefined
}

export function asThinkingEffortTransport(
  value: unknown,
): ThinkingEffortTransport | undefined {
  return value === 'compatible' || value === 'passthrough' ? value : undefined
}

/**
 * Resolve the exact `reasoning_effort` string sent to an OpenAI-compatible
 * Chat Completions endpoint.
 *
 * An explicit env value has the same precedence as the rest of the API path;
 * auto/unset omits the field. Missing transport means compatible, preserving
 * the historical xhigh/max -> high mapping. Passthrough is an explicit opt-in
 * for relays and third-party models that document extended values.
 */
export function resolveOpenAICompatibleReasoningEffort(
  effortValue: EffortValue | undefined,
  transport: ThinkingEffortTransport | undefined,
  env: Record<string, string | undefined> = process.env,
): OpenAICompatibleReasoningEffort | undefined {
  const envOverride = env.CLAUDE_CODE_EFFORT_LEVEL?.trim().toLowerCase()
  if (envOverride === 'auto' || envOverride === 'unset') return undefined

  const resolved =
    normalizeReasoningEffort(envOverride) ??
    normalizeReasoningEffort(effortValue)
  if (resolved === undefined) return undefined

  if ((transport ?? DEFAULT_THINKING_EFFORT_TRANSPORT) === 'passthrough') {
    return resolved
  }
  return resolved === 'low' || resolved === 'medium' || resolved === 'high'
    ? resolved
    : 'high'
}

export type ThinkingEffortSelection =
  | 'default'
  | Exclude<ThinkingEffort, 'max'>
  | 'max'
  | 'max-compatible'
  | 'max-passthrough'

/** Selection id used by the shared /connect effort picker. */
export function getConnectionThinkingEffortSelection(
  connection: Connection,
): ThinkingEffortSelection {
  if (connection.thinkingEffort === undefined) return 'default'
  if (connection.kind !== 'openai-compat') return connection.thinkingEffort
  if (connection.thinkingEffort !== 'max') return connection.thinkingEffort
  return connection.thinkingEffortTransport === 'passthrough'
    ? 'max-passthrough'
    : 'max-compatible'
}

/** Apply a picker selection without mutating the source connection. */
export function applyConnectionThinkingEffortSelection(
  connection: Connection,
  selection: ThinkingEffortSelection,
): Connection {
  const next: Connection = { ...connection }
  if (selection === 'default') {
    delete next.thinkingEffort
    delete next.thinkingEffortTransport
    return next
  }
  if (selection === 'max-compatible') {
    next.thinkingEffort = 'max'
    next.thinkingEffortTransport = 'compatible'
    return next
  }
  if (selection === 'max-passthrough') {
    next.thinkingEffort = 'max'
    next.thinkingEffortTransport = 'passthrough'
    return next
  }
  next.thinkingEffort = selection
  delete next.thinkingEffortTransport
  return next
}

/** Wire-value preview for an OpenAI-compatible connection profile. */
export function getConnectionReasoningEffortPreview(
  connection: Connection,
): OpenAICompatibleReasoningEffort | undefined {
  if (
    connection.kind !== 'openai-compat' ||
    connection.thinkingEffort === 'off'
  ) {
    return undefined
  }
  return resolveOpenAICompatibleReasoningEffort(
    connection.thinkingEffort,
    connection.thinkingEffortTransport,
    {},
  )
}
