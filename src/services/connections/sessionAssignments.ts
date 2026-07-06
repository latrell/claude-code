/**
 * Session-scoped record of which connection each agent slot currently uses
 * (process memory only — mirrors what activateConnectionForSession applied).
 *
 * Kept in its own dependency-free module so low-level consumers like
 * getContextWindowForModel() can read the active assignment without
 * importing the full activation engine (credential deployment, settings
 * writers, provider caches…).
 */

import type { AgentSlot } from './types.js'

export type SessionAssignment = { connectionId: string; model?: string }

const _sessionAssignments: Partial<Record<AgentSlot, SessionAssignment>> = {}

export function getSessionAssignment(
  slot: AgentSlot,
): SessionAssignment | undefined {
  return _sessionAssignments[slot]
}

export function setSessionAssignment(
  slot: AgentSlot,
  assignment: SessionAssignment | undefined,
): void {
  _sessionAssignments[slot] = assignment
}
