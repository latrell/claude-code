/**
 * CCB provider auth storage — isolated credential file for third-party
 * providers (OpenAI / Gemini / Grok), separate from ~/.claude/settings.json
 * so official Claude Code and CCB can coexist without clobbering each other.
 *
 * File: ~/.claude/ccb-provider-auth.json
 * Schema:
 *   {
 *     "openai"?: { "env": Record<string,string> },
 *     "gemini"?: { "env": Record<string,string> },
 *     "grok"?:  { "env": Record<string,string> }
 *   }
 *
 * Only non-empty string values are persisted.  Read failures (missing file,
 * malformed JSON) are silently degraded to empty — this file is optional and
 * a convenience, not a hard requirement.
 */

import { chmodSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getErrnoCode } from './errors.js'
import { getFsImplementation } from './fsOperations.js'
import { writeFileSyncAndFlush_DEPRECATED } from './file.js'
import { logError } from './log.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported third-party provider keys. */
export type CCBProvider = 'openai' | 'gemini' | 'grok'

/** Per-provider entry in the auth file. */
export type CCBProviderEntry = {
  /** Provider-scoped environment overrides (API key, base URL, model, etc.). */
  env: Record<string, string>
}

/** Top-level shape of the CCB provider auth file. */
export type CCBProviderAuthData = {
  [K in CCBProvider]?: CCBProviderEntry
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getAuthFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'ccb-provider-auth.json')
}

function ensureConfigDir(): void {
  const dir = getClaudeConfigHomeDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code !== 'EEXIST') {
      logError(new Error(`Failed to create CCB config dir: ${dir}`))
    }
  }
}

/**
 * Read the full auth data from disk.  Returns {} on any failure — a missing or
 * corrupted file is non-fatal; the user can always re-run /login.
 */
function _readAuthData(): CCBProviderAuthData {
  const path = getAuthFilePath()
  try {
    const raw = readFileSync(path, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CCBProviderAuthData
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Write (replace) the full auth data atomically via a temp-file rename so a
 * partial write never corrupts the creds.
 */
function _writeAuthData(data: CCBProviderAuthData): void {
  ensureConfigDir()
  const path = getAuthFilePath()
  try {
    writeFileSyncAndFlush_DEPRECATED(path, JSON.stringify(data, null, 2) + '\n')
    try {
      chmodSync(path, 0o600)
    } catch {
      // Best-effort on platforms that don't support chmod
    }
  } catch (e) {
    logError(new Error(`Failed to write CCB provider auth: ${path}`))
    throw e
  }
}

function _sanitizeEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && v.length > 0) {
      out[k] = v
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read provider-scoped env vars for a single provider. */
export function readCCBProviderAuthEnv(
  provider: CCBProvider,
): Record<string, string> {
  const data = _readAuthData()
  const entry = data[provider] as CCBProviderEntry | undefined
  return entry?.env ?? {}
}

/** Read the full auth data (useful for diagnostics). */
export function readCCBProviderAuthData(): CCBProviderAuthData {
  return _readAuthData()
}

/**
 * Persist provider-specific env vars to the CCB auth file.  Only non-empty
 * string values are saved.  Passing an empty object removes the provider entry.
 */
export function writeCCBProviderAuthEnv(
  provider: CCBProvider,
  env: Record<string, string | undefined>,
): void {
  const data = _readAuthData()
  const sanitized = _sanitizeEnv(env)
  if (Object.keys(sanitized).length > 0) {
    data[provider] = { env: sanitized }
  } else {
    delete data[provider]
  }
  _writeAuthData(data)
}

/**
 * Inject CCB provider auth env vars into process.env for the current active
 * provider (determined by settings.modelType).  Only keys that are NOT already
 * present in process.env are injected — explicit env vars and settings.env
 * take priority over the CCB auth file.
 *
 * Call this after settings.env has been applied to process.env, so the
 * effective priority is: process.env > settings.env > CCB provider auth.
 */
export function injectCCBProviderAuthEnv(settingsModelType?: string): void {
  const modelType = settingsModelType
  if (
    modelType !== 'openai' &&
    modelType !== 'gemini' &&
    modelType !== 'grok'
  ) {
    return // Only inject for third-party providers
  }

  const authEnv = readCCBProviderAuthEnv(modelType)
  for (const [key, value] of Object.entries(authEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
