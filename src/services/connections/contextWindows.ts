/**
 * Per-model context window configuration on top of the connection registry.
 *
 * Values come from three places, in priority order:
 * 1. manual — entered by the user in /connect (never overwritten by auto)
 * 2. auto   — detected from the provider's model-list endpoint
 *             (/v1/models `context_length` & friends, Gemini `inputTokenLimit`)
 * 3. preset — parsed from the static preset catalog (CHINA_LLM_PROVIDERS)
 *
 * getConnectionContextWindow() is the runtime entry point consumed by
 * getContextWindowForModel(), so auto-compact thresholds and context usage
 * display follow the configured window instead of the 200k default.
 *
 * This module must stay light (store + types only) — it is imported from
 * src/utils/context.ts which sits low in the dependency graph.
 */

import { CHINA_LLM_PROVIDERS } from '../../utils/chinaLlmProviders.js'
import { logError } from '../../utils/log.js'
import { getSessionAssignment } from './sessionAssignments.js'
import {
  findConnection,
  loadConnectionsFile,
  upsertConnection,
} from './store.js'
import type { Connection, ModelContextWindow } from './types.js'

const MIN_CONTEXT_WINDOW = 1_000
const MAX_CONTEXT_WINDOW = 100_000_000

/**
 * Parse a user- or preset-supplied context window string.
 * Accepts plain token counts and K/M shorthand: "200000", "128K", "1m",
 * "1.5M". Returns undefined for anything unparseable or out of range.
 */
export function parseContextWindowInput(input: string): number | undefined {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[,_\s]/g, '')
  if (!normalized) return undefined
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(normalized)
  if (!match?.[1]) return undefined
  const base = Number(match[1])
  if (!Number.isFinite(base) || base <= 0) return undefined
  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1
  const tokens = Math.round(base * multiplier)
  if (tokens < MIN_CONTEXT_WINDOW || tokens > MAX_CONTEXT_WINDOW) {
    return undefined
  }
  return tokens
}

/** Compact display form: 200000 → "200K", 1048576 → "1M", 1500000 → "1.5M". */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    const rendered =
      millions >= 10
        ? String(Math.round(millions))
        : millions.toFixed(1).replace(/\.0$/, '')
    return `${rendered}M`
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`
  }
  return String(tokens)
}

export type ResolvedContextWindow = {
  tokens: number
  source: 'auto' | 'manual' | 'preset'
}

function presetContextWindow(
  connection: Connection,
  modelId: string,
): number | undefined {
  if (!connection.presetId) return undefined
  const preset = CHINA_LLM_PROVIDERS.find(p => p.id === connection.presetId)
  const model = preset?.models.find(m => m.id === modelId)
  if (!model?.contextWindow) return undefined
  return parseContextWindowInput(model.contextWindow)
}

/**
 * Context window recorded for a model on a specific connection, falling
 * back to the preset catalog metadata for preset-created connections.
 */
export function getModelContextWindowForConnection(
  connection: Connection,
  modelId: string,
): ResolvedContextWindow | undefined {
  const explicit = connection.modelContextWindows?.[modelId]
  if (explicit) {
    return { tokens: explicit.tokens, source: explicit.source ?? 'auto' }
  }
  const preset = presetContextWindow(connection, modelId)
  if (preset !== undefined) {
    return { tokens: preset, source: 'preset' }
  }
  return undefined
}

/**
 * Runtime lookup for getContextWindowForModel(): the context window
 * configured for `model` on the most relevant connection. Resolution order:
 *
 * 1. The active main-slot connection's own `contextWindow`, when its pinned
 *    `model` matches the queried model (or the query is empty, meaning
 *    "whatever the current connection runs").
 * 2. That connection's per-model window map / preset catalog fallback.
 * 3. Legacy global search: session assignments (main, then subagent),
 *    global default assignments, then the rest of the registry. Model ids
 *    match exactly first, then case-insensitively.
 */
export function getConnectionContextWindow(model: string): number | undefined {
  const file = loadConnectionsFile()
  if (file.connections.length === 0) return undefined

  // ① Connection-level window of the active main-slot connection
  const mainId =
    getSessionAssignment('main')?.connectionId ??
    file.defaults?.main?.connectionId
  const mainConnection = mainId
    ? file.connections.find(c => c.id === mainId)
    : undefined
  if (mainConnection?.contextWindow !== undefined) {
    const pinned = mainConnection.model
    if (!model || (pinned && pinned.toLowerCase() === model.toLowerCase())) {
      return mainConnection.contextWindow
    }
  }
  if (!model) return undefined

  // ② That connection's per-model map (incl. preset catalog fallback)
  if (mainConnection) {
    const resolved = getModelContextWindowForConnection(mainConnection, model)
    if (resolved) return resolved.tokens
  }

  // ③ Legacy global search across the whole registry
  const orderedIds: string[] = []
  for (const slot of ['main', 'subagent'] as const) {
    const session = getSessionAssignment(slot)
    if (session) orderedIds.push(session.connectionId)
    const fallback =
      slot === 'main' ? file.defaults?.main : file.defaults?.subagent
    if (fallback) orderedIds.push(fallback.connectionId)
  }

  const ordered: Connection[] = []
  const seen = new Set<string>()
  for (const id of orderedIds) {
    const connection = file.connections.find(c => c.id === id)
    if (connection && !seen.has(connection.id)) {
      seen.add(connection.id)
      ordered.push(connection)
    }
  }
  for (const connection of file.connections) {
    if (!seen.has(connection.id)) ordered.push(connection)
  }

  const lower = model.toLowerCase()
  for (const connection of ordered) {
    const exact = getModelContextWindowForConnection(connection, model)
    if (exact) return exact.tokens
    const windows = connection.modelContextWindows
    if (!windows) continue
    for (const [id, entry] of Object.entries(windows)) {
      if (id.toLowerCase() === lower) return entry.tokens
    }
  }
  return undefined
}

/**
 * Persist a manually entered context window (source: manual — wins over
 * auto-detection). `tokens: undefined` removes the entry. Best-effort:
 * a failed registry write must not crash the settings UI.
 */
export function setManualContextWindow(
  connectionId: string,
  modelId: string,
  tokens: number | undefined,
): void {
  const connection = findConnection(connectionId)
  if (!connection) return
  const updated: Record<string, ModelContextWindow> = {
    ...(connection.modelContextWindows ?? {}),
  }
  if (tokens === undefined) {
    if (!(modelId in updated)) return
    delete updated[modelId]
  } else {
    const current = updated[modelId]
    if (current?.tokens === tokens && current.source === 'manual') return
    updated[modelId] = { tokens, source: 'manual' }
  }
  try {
    upsertConnection({
      ...connection,
      modelContextWindows:
        Object.keys(updated).length > 0 ? updated : undefined,
    })
  } catch (err) {
    logError(err)
  }
}

/**
 * Record context windows auto-detected from a provider's model list.
 * Never overwrites manual entries; writes only when something changed.
 * Best-effort: persistence failures must never break the model picker.
 */
export function recordAutoDetectedContextWindows(
  connectionId: string,
  models: Array<{ id: string; contextLength?: number }>,
): void {
  const connection = findConnection(connectionId)
  if (!connection) return
  const updated: Record<string, ModelContextWindow> = {
    ...(connection.modelContextWindows ?? {}),
  }
  let changed = false
  for (const model of models) {
    if (
      model.contextLength === undefined ||
      model.contextLength < MIN_CONTEXT_WINDOW ||
      model.contextLength > MAX_CONTEXT_WINDOW
    ) {
      continue
    }
    const current = updated[model.id]
    if (current?.source === 'manual') continue
    if (current?.tokens === model.contextLength) continue
    updated[model.id] = { tokens: model.contextLength, source: 'auto' }
    changed = true
  }
  if (!changed) return
  try {
    upsertConnection({ ...connection, modelContextWindows: updated })
  } catch (err) {
    logError(err)
  }
}
