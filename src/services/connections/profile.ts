/**
 * Connection profile helpers — pure transforms over the Connection shape
 * shared by the /connect UI (wizard profile steps, menu edits, duplicate
 * action) and the pickers' profile summaries.
 *
 * A connection is a named profile: credentials + pinned model + thinking
 * effort + context window. These helpers keep the field-update semantics
 * (delete-on-unset, contextWindow sync on model change) in one testable
 * place instead of scattered across the Ink components.
 */

import { t } from '../../i18n/t.js'
import { formatContextWindow } from './contextWindows.js'
import { connectionModelDisplayName } from './modelCatalog.js'
import type { Connection, ConnectionKind, ThinkingEffort } from './types.js'

/**
 * Kinds that cannot run without an explicit model id: key-based third-party
 * endpoints have no provider-side default, so activation without a pinned
 * model would fall back to a built-in Anthropic model id the endpoint
 * rejects. OAuth kinds (anthropic/chatgpt) and Cursor have real provider
 * defaults and may leave `model` unset.
 */
export function connectionRequiresPinnedModel(kind: ConnectionKind): boolean {
  return kind === 'openai-compat' || kind === 'gemini' || kind === 'grok'
}

/**
 * Pin (or clear) the connection's model. Mirrors updateConnectionModel()'s
 * contextWindow semantics without touching the store, so wizard drafts that
 * are not persisted yet get the same behavior: the connection-level window
 * is synced from the per-model map when known, cleared otherwise (a stale
 * window from the previous model must never apply to the new one).
 */
export function withPinnedModel(
  connection: Connection,
  model: string | undefined,
): Connection {
  const next: Connection = { ...connection }
  if (model === undefined) {
    delete next.model
    delete next.contextWindow
    return next
  }
  next.model = model
  const window = connection.modelContextWindows?.[model]
  if (window) {
    next.contextWindow = window.tokens
  } else {
    delete next.contextWindow
  }
  return next
}

/** Set or clear (undefined) the connection's pinned thinking effort. */
export function withThinkingEffort(
  connection: Connection,
  effort: ThinkingEffort | undefined,
): Connection {
  const next: Connection = { ...connection }
  if (effort === undefined) {
    delete next.thinkingEffort
  } else {
    next.thinkingEffort = effort
  }
  return next
}

/** Set or clear (undefined) the connection-level context window. */
export function withContextWindow(
  connection: Connection,
  tokens: number | undefined,
): Connection {
  const next: Connection = { ...connection }
  if (tokens === undefined) {
    delete next.contextWindow
  } else {
    next.contextWindow = tokens
  }
  return next
}

/**
 * Copy a connection into a new profile: credentials (apiKey / baseUrl /
 * machineId / credentialRef), catalogs (models / tierModels / presetId /
 * modelContextWindows) and profile fields (model / thinkingEffort /
 * contextWindow) are carried over; createdAt is reset and lastUsedAt
 * dropped. This is the "same deepseek key, two profiles" entry point.
 */
export function duplicateConnection(
  source: Connection,
  id: string,
  label: string,
  now: string = new Date().toISOString(),
): Connection {
  const copy: Connection = { ...source, id, label, createdAt: now }
  delete copy.lastUsedAt
  return copy
}

/**
 * One-line profile summary: "deepseek-v4-pro · effort max · ctx 1M".
 * Shared by /connect list rows, the connection menu header and the
 * /provider picker so a profile reads the same everywhere.
 */
export function connectionProfileSummary(connection: Connection): string {
  const parts: string[] = [
    connection.model
      ? connectionModelDisplayName(connection, connection.model)
      : t('provider default'),
  ]
  if (connection.thinkingEffort) {
    parts.push(`effort ${connection.thinkingEffort}`)
  }
  if (connection.contextWindow) {
    parts.push(`ctx ${formatContextWindow(connection.contextWindow)}`)
  }
  return parts.join(' · ')
}

function comparableLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Preserve user-authored connection names, but replace legacy names derived
 * directly from a model id (for example DeepSeek-V4-Pro) with the catalog's
 * Claude-style display label (DeepSeek V4 Pro).
 */
export function connectionDisplayName(connection: Connection): string {
  if (!connection.model) return connection.label
  if (comparableLabel(connection.label) !== comparableLabel(connection.model)) {
    return connection.label
  }
  return connectionModelDisplayName(connection, connection.model)
}
