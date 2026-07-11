/**
 * CCB connection registry — persistent store for provider/account
 * "connections" (see types.ts). One JSON file holds every configured
 * connection plus the global default assignments for the main and
 * subagent slots.
 *
 * File: ~/.claude/ccb-connections.json (chmod 600 — may contain API keys)
 *
 * Read failures degrade to an empty registry: the file is a convenience
 * layer on top of the existing credential stores, never a hard dependency.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { randomBytes } from 'node:crypto'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import {
  CONNECTIONS_FILE_VERSION,
  ConnectionsFileSchema,
  type AgentSlot,
  type Connection,
  type ConnectionsFile,
  type SlotAssignment,
} from './types.js'

const FILE_NAME = 'ccb-connections.json'

export function getConnectionsFilePath(): string {
  return join(getClaudeConfigHomeDir(), FILE_NAME)
}

// ── Per-process cache ────────────────────────────────────────────────────────

let _cache: ConnectionsFile | null = null

export function _invalidateConnectionsCache(): void {
  _cache = null
}

function emptyFile(): ConnectionsFile {
  return { version: CONNECTIONS_FILE_VERSION, connections: [] }
}

// ── Lazy migration (legacy catalog → pinned-model profile) ──────────────────

/**
 * Derive the pinned model for a legacy connection, in priority order:
 * global main default assignment model (when this connection is the main
 * default) > subagent default assignment model > tierModels.sonnet >
 * first catalog entry. Undefined when no source exists (OAuth kinds may
 * legitimately have no pinned model and follow the provider default).
 */
function deriveConnectionModel(
  connection: Connection,
  defaults: ConnectionsFile['defaults'],
): string | undefined {
  if (defaults?.main?.connectionId === connection.id && defaults.main.model) {
    return defaults.main.model
  }
  if (
    defaults?.subagent?.connectionId === connection.id &&
    defaults.subagent.model
  ) {
    return defaults.subagent.model
  }
  if (connection.tierModels?.sonnet) return connection.tierModels.sonnet
  return connection.models?.[0]
}

/**
 * One-time lazy migration run on load: connections written before the
 * profile fields existed get a pinned `model` (and, when the per-model
 * window map knows it, a `contextWindow`) derived from the legacy fields.
 * Pure and idempotent — returns null when nothing needs to change, so the
 * read path only triggers a single write-back per legacy file.
 */
function migrateConnectionsFile(file: ConnectionsFile): ConnectionsFile | null {
  let changed = false
  const connections = file.connections.map(connection => {
    if (connection.model !== undefined) return connection
    const model = deriveConnectionModel(connection, file.defaults)
    if (model === undefined) return connection
    changed = true
    const migrated: Connection = { ...connection, model }
    const window = connection.modelContextWindows?.[model]
    if (connection.contextWindow === undefined && window) {
      migrated.contextWindow = window.tokens
    }
    return migrated
  })
  return changed ? { ...file, connections } : null
}

/**
 * Load the connection registry from disk (memoized per process).
 * Missing / corrupt / invalid files degrade to an empty registry.
 */
export function loadConnectionsFile(): ConnectionsFile {
  if (_cache !== null) return _cache

  const filePath = getConnectionsFilePath()
  if (!existsSync(filePath)) {
    _cache = emptyFile()
    return _cache
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    if (!raw.trim()) {
      _cache = emptyFile()
      return _cache
    }
    const parsed = JSON.parse(raw) as unknown
    const result = ConnectionsFileSchema.safeParse(parsed)
    if (!result.success) {
      logError(
        new Error(
          `ccb-connections.json failed schema validation: ${result.error.message}`,
        ),
      )
      _cache = emptyFile()
      return _cache
    }
    const migrated = migrateConnectionsFile(result.data)
    if (migrated) {
      try {
        // Persist the migration once (writeConnectionsFile also updates the
        // cache). Best-effort: a read-only filesystem must not break loading —
        // the migrated shape is still served from memory.
        writeConnectionsFile(migrated)
      } catch {
        // logged inside writeConnectionsFile
      }
      _cache = migrated
      return _cache
    }
    _cache = result.data
    return _cache
  } catch (err) {
    logError(
      new Error(
        `Failed to read ccb-connections.json: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )
    _cache = emptyFile()
    return _cache
  }
}

function ensureConfigDir(): void {
  try {
    mkdirSync(getClaudeConfigHomeDir(), { recursive: true })
  } catch (e: unknown) {
    if (getErrnoCode(e) !== 'EEXIST') {
      logError(
        new Error(
          `Failed to create config dir for connections: ${getClaudeConfigHomeDir()}`,
        ),
      )
    }
  }
}

/**
 * Atomically write the registry (tmp file in the same directory + rename,
 * so the rename never crosses devices). chmod 600 best-effort.
 */
function writeConnectionsFile(data: ConnectionsFile): void {
  ensureConfigDir()
  const filePath = getConnectionsFilePath()
  const tmpPath = join(
    getClaudeConfigHomeDir(),
    `.${FILE_NAME}.${randomBytes(6).toString('hex')}.tmp`,
  )
  try {
    writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(tmpPath, filePath)
    try {
      chmodSync(filePath, 0o600)
    } catch {
      // Best-effort on platforms without chmod semantics
    }
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // ignore cleanup failure
    }
    logError(
      new Error(
        `Failed to write ccb-connections.json: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )
    throw err
  }
  _cache = data
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listConnections(): Connection[] {
  return loadConnectionsFile().connections
}

export function findConnection(id: string): Connection | undefined {
  return listConnections().find(c => c.id === id)
}

/** Insert or replace (by id) a connection. */
export function upsertConnection(connection: Connection): void {
  const file = loadConnectionsFile()
  const connections = [...file.connections]
  const idx = connections.findIndex(c => c.id === connection.id)
  if (idx >= 0) {
    connections[idx] = connection
  } else {
    connections.push(connection)
  }
  writeConnectionsFile({ ...file, connections })
}

/**
 * Remove a connection. Any default assignment pointing at it is cleared so
 * the registry never references a dangling connection id.
 */
export function removeConnection(id: string): void {
  const file = loadConnectionsFile()
  const connections = file.connections.filter(c => c.id !== id)
  let defaults = file.defaults
  if (defaults) {
    defaults = { ...defaults }
    if (defaults.main?.connectionId === id) defaults.main = undefined
    if (defaults.subagent?.connectionId === id) defaults.subagent = undefined
    if (!defaults.main && !defaults.subagent) defaults = undefined
  }
  writeConnectionsFile({ ...file, connections, defaults })
}

export function renameConnection(id: string, label: string): void {
  const existing = findConnection(id)
  if (!existing) return
  upsertConnection({ ...existing, label })
}

export function touchConnectionUsage(id: string): void {
  const existing = findConnection(id)
  if (!existing) return
  upsertConnection({ ...existing, lastUsedAt: new Date().toISOString() })
}

/**
 * Pin a connection to a model (entry point for /model writing straight to
 * the connection profile). Syncs the connection-level `contextWindow` from
 * the per-model window map when the model is known there; clears it
 * otherwise so a stale window from the previous model is never applied to
 * the new one. Persists to disk and invalidates the process cache.
 */
export function updateConnectionModel(id: string, model: string): void {
  const existing = findConnection(id)
  if (!existing) return
  const window = existing.modelContextWindows?.[model]
  const updated: Connection = { ...existing, model }
  if (window) {
    updated.contextWindow = window.tokens
  } else {
    delete updated.contextWindow
  }
  upsertConnection(updated)
  _invalidateConnectionsCache()
}

/** Wipe the entire registry (logout). */
export function clearAllConnections(): void {
  writeConnectionsFile(emptyFile())
}

// ── Default slot assignments ─────────────────────────────────────────────────

export function getDefaultAssignment(
  slot: AgentSlot,
): SlotAssignment | undefined {
  const defaults = loadConnectionsFile().defaults
  return slot === 'main' ? defaults?.main : defaults?.subagent
}

export function setDefaultAssignment(
  slot: AgentSlot,
  assignment: SlotAssignment | undefined,
): void {
  const file = loadConnectionsFile()
  const defaults = { ...(file.defaults ?? {}) }
  if (slot === 'main') {
    defaults.main = assignment
  } else {
    defaults.subagent = assignment
  }
  const cleaned =
    !defaults.main && !defaults.subagent
      ? undefined
      : {
          ...(defaults.main && { main: defaults.main }),
          ...(defaults.subagent && { subagent: defaults.subagent }),
        }
  writeConnectionsFile({ ...file, defaults: cleaned })
}

// ── Id generation ────────────────────────────────────────────────────────────

/**
 * Derive a unique kebab-case connection id from a display label.
 * Falls back to 'connection' when the label has no usable characters,
 * appends -2, -3… on collision.
 */
export function generateConnectionId(label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 48) || 'connection'
  const existing = new Set(listConnections().map(c => c.id))
  if (!existing.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!existing.has(candidate)) return candidate
  }
}
