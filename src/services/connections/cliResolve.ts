/**
 * CLI helpers for --provider / --subagent-provider / `connect`.
 *
 * Resolves a user-supplied connection reference (id, label, or presetId)
 * against the connection registry, and formats the registry for `ccb connect`.
 */

import { t, tf } from '../../i18n/t.js'
import { getSessionAssignment } from './sessionAssignments.js'
import {
  findConnection,
  getDefaultAssignment,
  listConnections,
} from './store.js'
import type { Connection, ConnectionKind } from './types.js'

export type ResolveConnectionOk = { ok: true; connection: Connection }
export type ResolveConnectionErr = {
  ok: false
  error: string
  reason: 'empty' | 'not_found' | 'ambiguous' | 'empty_ref'
}

/**
 * Resolve a CLI connection reference to a registry entry.
 *
 * Match order (first unique hit wins):
 * 1. Exact id
 * 2. Case-insensitive id
 * 3. Case-insensitive label
 * 4. Case-insensitive presetId
 *
 * Ambiguous matches (multiple hits at the winning tier) return an error
 * listing the candidates so the user can disambiguate with the id.
 */
export function resolveConnectionRef(
  ref: string,
): ResolveConnectionOk | ResolveConnectionErr {
  const trimmed = ref.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: t('Connection name is empty'),
      reason: 'empty_ref',
    }
  }

  const exact = findConnection(trimmed)
  if (exact) return { ok: true, connection: exact }

  const connections = listConnections()
  if (connections.length === 0) {
    return {
      ok: false,
      error: t(
        'No connections configured. Use /connect to add one, then pass its name.',
      ),
      reason: 'empty',
    }
  }

  const lower = trimmed.toLowerCase()

  const byId = connections.filter(c => c.id.toLowerCase() === lower)
  if (byId.length === 1) return { ok: true, connection: byId[0]! }
  if (byId.length > 1) {
    return {
      ok: false,
      error: ambiguousError(trimmed, byId),
      reason: 'ambiguous',
    }
  }

  const byLabel = connections.filter(c => c.label.toLowerCase() === lower)
  if (byLabel.length === 1) return { ok: true, connection: byLabel[0]! }
  if (byLabel.length > 1) {
    return {
      ok: false,
      error: ambiguousError(trimmed, byLabel),
      reason: 'ambiguous',
    }
  }

  const byPreset = connections.filter(c => c.presetId?.toLowerCase() === lower)
  if (byPreset.length === 1) return { ok: true, connection: byPreset[0]! }
  if (byPreset.length > 1) {
    return {
      ok: false,
      error: ambiguousError(trimmed, byPreset),
      reason: 'ambiguous',
    }
  }

  return {
    ok: false,
    error: tf(
      'Unknown connection "{ref}". Run `ccb connect` to list configured connections.',
      { ref: trimmed },
    ),
    reason: 'not_found',
  }
}

function ambiguousError(ref: string, matches: Connection[]): string {
  const list = matches.map(c => `  ${c.id}  (${c.label})`).join('\n')
  return tf(
    'Ambiguous connection "{ref}" matches multiple entries. Use the connection id:\n{list}',
    { ref, list },
  )
}

function kindLabel(kind: ConnectionKind): string {
  switch (kind) {
    case 'anthropic-oauth':
      return 'anthropic-oauth'
    case 'anthropic-api':
      return 'anthropic-api'
    case 'chatgpt-oauth':
      return 'chatgpt-oauth'
    case 'openai-compat':
      return 'openai-compat'
    case 'gemini':
      return 'gemini'
    case 'grok':
      return 'grok'
    case 'cursor':
      return 'cursor'
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return String(kind)
    }
  }
}

function connectionFlags(connection: Connection): string[] {
  const flags: string[] = []
  if (getDefaultAssignment('main')?.connectionId === connection.id) {
    flags.push('main-default')
  }
  if (getDefaultAssignment('subagent')?.connectionId === connection.id) {
    flags.push('subagent-default')
  }
  if (getSessionAssignment('main')?.connectionId === connection.id) {
    flags.push('in-use-main')
  }
  if (getSessionAssignment('subagent')?.connectionId === connection.id) {
    flags.push('in-use-subagent')
  }
  return flags
}

/**
 * Human-readable connection list for `ccb connect`.
 * Columns: id, label, kind, optional flags.
 */
export function formatConnectionsList(): string {
  const connections = listConnections()
  if (connections.length === 0) {
    return t(
      'No connections configured. Use /connect in an interactive session to add one.',
    )
  }

  const idWidth = Math.max(2, ...connections.map(c => c.id.length))
  const labelWidth = Math.max(5, ...connections.map(c => c.label.length))
  const kindWidth = Math.max(
    4,
    ...connections.map(c => kindLabel(c.kind).length),
  )

  const header =
    `${'ID'.padEnd(idWidth)}  ` +
    `${'LABEL'.padEnd(labelWidth)}  ` +
    `${'KIND'.padEnd(kindWidth)}  ` +
    'FLAGS'

  const rows = connections.map(c => {
    const flags = connectionFlags(c).join(',')
    return (
      `${c.id.padEnd(idWidth)}  ` +
      `${c.label.padEnd(labelWidth)}  ` +
      `${kindLabel(c.kind).padEnd(kindWidth)}  ` +
      (flags || '-')
    )
  })

  return [header, ...rows].join('\n')
}

/**
 * Model to pass when activating a connection from CLI flags.
 * Prefer an explicit --model, else the registry default for this connection.
 */
export function modelForCliActivation(
  connection: Connection,
  slot: 'main' | 'subagent',
  explicitModel?: string,
): string | undefined {
  if (explicitModel && explicitModel !== 'default') return explicitModel
  const assignment = getDefaultAssignment(slot)
  if (assignment?.connectionId === connection.id && assignment.model) {
    return assignment.model
  }
  return undefined
}
