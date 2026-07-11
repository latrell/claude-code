/**
 * Slot-switch helpers shared by /provider, /subagent-provider and the
 * ConnectionPicker UI: resolve a user-supplied connection reference, activate
 * it for an agent slot (session or global scope) and build the user-facing
 * confirmation message.
 *
 * The model deployed is always the connection's pinned `model` (single source
 * of truth) — activateConnection* resolve it internally when no explicit
 * model is passed.
 */

import { t, tf } from '../../i18n/t.js'
import {
  activateConnectionForSession,
  activateConnectionGlobally,
} from './activate.js'
import { formatConnectionsList, resolveConnectionRef } from './cliResolve.js'
import { importLegacyConnections } from './migrate.js'
import type { AgentSlot, Connection } from './types.js'

export type SlotSwitchScope = 'session' | 'global'

export type SlotSwitchResult =
  | {
      success: true
      message: string
      /** Model to apply to AppState.mainLoopModel (slot 'main' only). */
      mainLoopModel?: string | null
    }
  | { success: false; error: string }

/**
 * Parse "<connection ref…> [global]" command arguments. The connection
 * reference may contain spaces (labels), so only a trailing standalone
 * "global" token selects the global scope. A ref that IS the single word
 * "global" still resolves as a session switch to that connection.
 */
export function parseConnectionSwitchArgs(args: string): {
  ref: string
  scope: SlotSwitchScope
} {
  const trimmed = args.trim()
  const match = /^(.*\S)\s+global$/i.exec(trimmed)
  if (match?.[1]) return { ref: match[1], scope: 'global' }
  return { ref: trimmed, scope: 'session' }
}

/** "Label (model, effort high)" summary used in switch confirmations. */
export function connectionSummary(connection: Connection): string {
  const parts: string[] = [connection.model ?? t('provider default')]
  if (connection.thinkingEffort) {
    parts.push(`effort ${connection.thinkingEffort}`)
  }
  return `${connection.label} (${parts.join(', ')})`
}

function slotSwitchMessage(
  connection: Connection,
  slot: AgentSlot,
  scope: SlotSwitchScope,
): string {
  const target = connectionSummary(connection)
  if (slot === 'main') {
    return scope === 'global'
      ? tf('Switched main agent to {target} and set it as the global default', {
          target,
        })
      : tf('Switched main agent to {target} for this session', { target })
  }
  if (slot === 'fast') {
    return scope === 'global'
      ? tf(
          'Switched fast (HAIKU) calls to {target} and set it as the global default',
          { target },
        )
      : tf('Switched fast (HAIKU) calls to {target} for this session', {
          target,
        })
  }
  return scope === 'global'
    ? tf('Switched subagents to {target} and set it as the global default', {
        target,
      })
    : tf('Switched subagents to {target} for this session', { target })
}

/** Activate a resolved connection for a slot and build the result message. */
export async function switchSlotToConnection(
  connection: Connection,
  slot: AgentSlot,
  scope: SlotSwitchScope,
): Promise<SlotSwitchResult> {
  const result =
    scope === 'global'
      ? await activateConnectionGlobally(connection, slot)
      : await activateConnectionForSession(connection, slot)
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? t('Failed to switch connection.'),
    }
  }
  return {
    success: true,
    message: slotSwitchMessage(connection, slot, scope),
    ...(slot === 'main' && { mainLoopModel: result.mainLoopModel ?? null }),
  }
}

/**
 * Resolve a connection reference (id > case-insensitive id > label >
 * presetId) and activate it. Unknown refs get the configured-connections
 * table appended so the user can pick a valid name.
 */
export async function switchSlotByRef(
  ref: string,
  slot: AgentSlot,
  scope: SlotSwitchScope,
): Promise<SlotSwitchResult> {
  importLegacyConnections()
  const resolved = resolveConnectionRef(ref)
  if (!resolved.ok) {
    const error =
      resolved.reason === 'not_found'
        ? `${resolved.error}\n${formatConnectionsList()}`
        : resolved.error
    return { success: false, error }
  }
  return switchSlotToConnection(resolved.connection, slot, scope)
}
