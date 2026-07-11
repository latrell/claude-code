/**
 * Connection-pinned thinking effort resolution.
 *
 * A connection profile may pin a `thinkingEffort` ('off' | 'low' | 'medium' |
 * 'high' | 'max') that applies while the connection is active. This module
 * resolves the effective value for an agent slot (session assignment first,
 * then the global default assignment) and maps it onto the runtime
 * EffortValue consumed by the API layers.
 *
 * Kept light (sessionAssignments + store + types only) — it is read from the
 * query hot path, mirroring getConnectionContextWindow() in contextWindows.ts.
 */

import type { EffortValue } from '../../utils/effort.js'
import { getSessionAssignment } from './sessionAssignments.js'
import { findConnection, getDefaultAssignment } from './store.js'
import type { AgentSlot, ThinkingEffort } from './types.js'

/**
 * Thinking effort pinned to the connection currently active in `slot`.
 * Resolution: session assignment > global default assignment; undefined when
 * no connection is assigned or the connection pins no effort.
 */
export function getConnectionThinkingEffort(
  slot: AgentSlot,
): ThinkingEffort | undefined {
  const assignment = getSessionAssignment(slot) ?? getDefaultAssignment(slot)
  if (!assignment) return undefined
  return findConnection(assignment.connectionId)?.thinkingEffort
}

/**
 * Map a connection ThinkingEffort onto the EffortValue sent to the API.
 * 'off' maps to undefined — thinking suppression is handled separately
 * (thinkingConfig: disabled / OPENAI_ENABLE_THINKING=0), not via effort.
 * Never produces 'xhigh': configureEffortParams' output_config.effort
 * assertion does not include it.
 */
export function mapThinkingEffortToEffortValue(
  effort: ThinkingEffort | undefined,
): EffortValue | undefined {
  switch (effort) {
    case 'low':
    case 'medium':
    case 'high':
    case 'max':
      return effort
    default:
      return undefined
  }
}

/**
 * Runtime validator for thinking-effort values carried through passthrough
 * config objects (e.g. settings.subagentProvider), where the static type is
 * unknown.
 */
export function asThinkingEffort(value: unknown): ThinkingEffort | undefined {
  return value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max'
    ? value
    : undefined
}
