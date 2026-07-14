/**
 * Cursor model catalog.
 *
 * Two sources:
 *  - CURSOR_MODELS: a curated, current list of the most useful base models
 *    (one canonical entry per family), used as the offline catalog for the
 *    /model picker and as a fallback when the live fetch fails.
 *  - fetchCursorAvailableModels(): the live, complete list from Cursor's
 *    `AiService/AvailableModels` endpoint (152+ entries incl. effort variants),
 *    so the model picker is never stale.
 *
 * Model ids here are Cursor `serverModelName` values (what the chat endpoint
 * accepts), verified live against api2.cursor.sh. Heavy client/auth modules are
 * imported lazily inside the fetch so importing this module (e.g. from the
 * synchronous /model options builder) stays cheap.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import { isEnvDefinedFalsy } from '../../../utils/envUtils.js'
import { logForDebugging } from '../../../utils/debug.js'
import { t } from '../../../i18n/t.js'
// Direct module path (not the '@ant/model-provider' barrel) so importing this
// low-level catalog from context.ts doesn't pull in the heavy converter/stream
// adapter graph the barrel re-exports. modelMapping.ts is a pure function file.
import { resolveCursorModel } from '../../../../packages/@ant/model-provider/src/providers/cursor/modelMapping.js'

export interface CursorModelInfo {
  /** Cursor serverModelName sent to the chat endpoint. */
  id: string
  /** Human-readable label (Cursor clientDisplayName). */
  label: string
  /** Context window in tokens for the non-max request mode. */
  contextWindow?: number
  /** Context window in tokens under Max Mode (the default; often 1M). */
  maxContextWindow?: number
}

/**
 * Curated current Cursor models — one canonical (default-on / non-fast) entry
 * per family, covering every provider Cursor exposes. The pickers also offer a
 * "Custom model…" entry, and the live fetch adds the full effort-variant list.
 *
 * Windows verified live against AvailableModels: `contextWindow` is the default
 * (non-max) window; `maxContextWindow` is the Max Mode window (often 1M).
 */
export const CURSOR_MODELS: CursorModelInfo[] = [
  // Cursor's Auto tier. The chat endpoint only accepts the serverModelName
  // `default` — `auto` is a catalog idAlias that 404s ("AI Model Not Found")
  // if sent verbatim; resolveCursorModel normalizes it for legacy configs.
  { id: 'default', label: t('Auto (Cursor picks)') },
  {
    id: 'composer-2.5',
    label: 'Composer 2.5',
    contextWindow: 200_000,
    maxContextWindow: 200_000,
  },
  {
    id: 'claude-opus-4-8-thinking-high',
    label: 'Opus 4.8',
    contextWindow: 300_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'claude-sonnet-5-thinking-high',
    label: 'Sonnet 5',
    contextWindow: 300_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'claude-fable-5-thinking-high',
    label: 'Fable 5',
    contextWindow: 300_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'claude-4.5-sonnet',
    label: 'Sonnet 4.5',
    contextWindow: 200_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'claude-4.5-haiku',
    label: 'Haiku 4.5',
    contextWindow: 200_000,
    maxContextWindow: 200_000,
  },
  {
    id: 'gpt-5.5-medium',
    label: 'GPT 5.5',
    contextWindow: 272_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'Codex 5.3',
    contextWindow: 272_000,
    maxContextWindow: 272_000,
  },
  {
    id: 'gpt-5.4-medium',
    label: 'GPT 5.4',
    contextWindow: 272_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    contextWindow: 200_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    contextWindow: 1_000_000,
    maxContextWindow: 1_000_000,
  },
  {
    id: 'grok-4.5',
    label: 'Grok 4.5',
    contextWindow: 500_000,
    maxContextWindow: 500_000,
  },
  {
    id: 'grok-4.3',
    label: 'Grok 4.3',
    contextWindow: 200_000,
    maxContextWindow: 1_000_000,
  },
  { id: 'glm-5.2-high', label: 'GLM 5.2' },
  {
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    contextWindow: 262_000,
    maxContextWindow: 262_000,
  },
]

/**
 * Whether Cursor Max Mode (full / up-to-1M context window) is enabled. On by
 * default so large-context models expose their full window; disable with
 * CURSOR_MAX_MODE=0 (Max Mode incurs Cursor's usage-based pricing).
 */
export function isCursorMaxModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isEnvDefinedFalsy(env.CURSOR_MAX_MODE)
}

/**
 * Resolve the effective context window (tokens) for a Cursor model id, honoring
 * Max Mode. Returns undefined for unknown ids so callers fall back to detection
 * or the default. `contextWindow` from the live catalog is the non-max value;
 * Max Mode uses `maxContextWindow` when known.
 */
export function getCursorModelContextWindow(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const entry = CURSOR_MODELS.find(m => m.id === modelId)
  if (!entry) return undefined
  return isCursorMaxModeEnabled(env)
    ? (entry.maxContextWindow ?? entry.contextWindow)
    : entry.contextWindow
}

/**
 * Resolve the context window for a model the CLI is running under, accepting
 * either a Cursor model id or an Anthropic family alias (sonnet/opus/fable/…),
 * which is mapped through resolveCursorModel first. Honors Max Mode. Returns
 * undefined for models not in the curated catalog so callers can fall back to
 * live-detected windows or the default.
 */
export function getCursorContextWindowForModel(
  model: string,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const direct = getCursorModelContextWindow(model, env)
  if (direct !== undefined) return direct
  const cursorId = resolveCursorModel(model, env)
  if (cursorId !== model) return getCursorModelContextWindow(cursorId, env)
  return undefined
}

const DEFAULT_BASE_URL = 'https://api2.cursor.sh'
const AVAILABLE_MODELS_PATH = '/aiserver.v1.AiService/AvailableModels'
const FETCH_TIMEOUT_MS = 8_000

interface AvailableModelShape {
  name?: string
  serverModelName?: string
  clientDisplayName?: string
  supportsAgent?: boolean
  tooltipData?: { markdownContent?: string }
  tooltipDataForMaxMode?: { markdownContent?: string }
}

/**
 * Parse "300k context window" / "1M context window" out of a Cursor tooltip.
 * Returns tokens or undefined.
 */
export function parseContextWindowFromTooltip(
  markdown: string | undefined,
): number | undefined {
  if (!markdown) return undefined
  const match = markdown.match(/([\d.]+)\s*([kKmM])\s*context window/)
  if (!match) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return undefined
  const unit = match[2].toLowerCase()
  const tokens = unit === 'm' ? value * 1_000_000 : value * 1_000
  return Math.round(tokens)
}

/**
 * Convert one AvailableModels entry into CursorModelInfo. `contextWindow`
 * reflects the active request mode (Max Mode window when enabled, else the
 * default non-max window); `maxContextWindow` always carries the Max Mode
 * window so the picker can show a model's ceiling.
 */
export function availableModelToInfo(
  entry: AvailableModelShape,
  maxMode = false,
): CursorModelInfo | null {
  const id = entry.serverModelName ?? entry.name
  if (!id) return null
  const nonMax = parseContextWindowFromTooltip(
    entry.tooltipData?.markdownContent,
  )
  const max =
    parseContextWindowFromTooltip(
      entry.tooltipDataForMaxMode?.markdownContent,
    ) ?? nonMax
  const active = maxMode ? (max ?? nonMax) : nonMax
  return {
    id,
    label: entry.clientDisplayName || id,
    ...(active !== undefined ? { contextWindow: active } : {}),
    ...(max !== undefined ? { maxContextWindow: max } : {}),
  }
}

/**
 * Fetch Cursor's live model catalog. Uses the signed-in Cursor credentials
 * (env / OAuth file / IDE), pinned to HTTP/2 like the chat path. Returns [] on
 * any failure so callers fall back to the curated CURSOR_MODELS list.
 */
export async function fetchCursorAvailableModels(
  env: Record<string, string | undefined> = process.env,
  options?: { timeoutMs?: number; fetchOverride?: typeof fetch },
): Promise<CursorModelInfo[]> {
  try {
    const [
      { resolveCursorCredentials },
      { buildCursorModelsHeaders },
      { cursorTransportOptions },
      { getProxyFetchOptions },
    ] = await Promise.all([
      import('./auth.js'),
      import('./clientPolicy.js'),
      import('./client.js'),
      import('../../../utils/proxy.js'),
    ])

    const credentials = await resolveCursorCredentials({ envOverride: env })
    const base = (env.CURSOR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const headers = {
      ...buildCursorModelsHeaders(credentials, env),
      'content-type': 'application/json',
      'connect-protocol-version': '1',
    }
    const doFetch = options?.fetchOverride ?? fetch

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? FETCH_TIMEOUT_MS,
    )
    try {
      const res = await doFetch(`${base}${AVAILABLE_MODELS_PATH}`, {
        method: 'POST',
        headers,
        body: '{}',
        signal: controller.signal,
        // cursorTransportOptions last: its Node h2 dispatcher must override
        // the generic proxy dispatcher (h1-only → ALB 464).
        ...getProxyFetchOptions({ forAnthropicAPI: false }),
        ...cursorTransportOptions(env),
      } as RequestInit)
      if (!res.ok) {
        logForDebugging(`[cursorModels] AvailableModels HTTP ${res.status}`)
        return []
      }
      const data = (await res.json()) as { models?: AvailableModelShape[] }
      if (!Array.isArray(data.models)) return []
      const maxMode = isCursorMaxModeEnabled(env)
      const out: CursorModelInfo[] = []
      const seen = new Set<string>()
      for (const entry of data.models) {
        // Only agent-capable models are usable by the CLI's tool loop.
        if (entry.supportsAgent === false) continue
        const info = availableModelToInfo(entry, maxMode)
        if (!info || seen.has(info.id)) continue
        seen.add(info.id)
        out.push(info)
      }
      return out
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    logForDebugging(
      `[cursorModels] fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return []
  }
}
