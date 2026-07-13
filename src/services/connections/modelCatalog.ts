/**
 * Per-connection model catalogs for the connection model pickers.
 *
 * Static sources (sync): the connection's own model list, its tier mapping,
 * preset catalogs (CHINA_LLM_PROVIDERS), builtin alias sets for Anthropic
 * kinds and the ChatGPT Codex option list.
 *
 * Dynamic source (async): GET {baseUrl}/models for OpenAI-compatible
 * endpoints (openai-compat / grok) and the Gemini ListModels API, merged
 * on top by the UI when it arrives. Where the endpoint reports a context
 * window (context_length, max_model_len, Gemini inputTokenLimit, …) it is
 * captured so it can be recorded on the connection.
 */

import { getChatGPTSubscriptionPlan } from '../../bootstrap/state.js'
import { t } from '../../i18n/t.js'
import { CHINA_LLM_PROVIDERS } from '../../utils/chinaLlmProviders.js'
import { logForDebugging } from '../../utils/debug.js'
import { getKnownModelDisplayName } from '../../utils/model/display.js'
import {
  CHATGPT_CODEX_MODEL_OPTIONS,
  getChatGPTCodexContextWindow,
  isChatGPTCodexModelAvailable,
} from '../../utils/model/chatgptModels.js'
import { CURSOR_MODELS } from '../api/cursor/models.js'
import {
  formatContextWindow,
  recordAutoDetectedContextWindows,
} from './contextWindows.js'
import type { Connection } from './types.js'

export type CatalogModel = {
  /** Model id sent to the API. null = provider/connection default. */
  value: string | null
  label: string
  description?: string
}

/** A model advertised by the provider's model-list endpoint. */
export type RemoteModel = {
  id: string
  /** Context window in tokens, when the endpoint reports one. */
  contextLength?: number
}

const ANTHROPIC_ALIAS_MODELS: CatalogModel[] = [
  { value: 'opus', label: t('Opus') },
  { value: 'sonnet', label: t('Sonnet') },
  { value: 'haiku', label: t('Haiku') },
]

/**
 * Curated Cursor models for the static catalog, derived from the shared
 * cursor/models.ts list (kept current against Cursor's real AvailableModels).
 * The live list is merged on top by the picker (see supportsRemoteModelList);
 * the "Custom model…" entry still accepts any id the account can use.
 */
const CURSOR_CATALOG_MODELS: CatalogModel[] = CURSOR_MODELS.map(m => ({
  value: m.id,
  label: m.label,
  ...(m.id === 'default'
    ? { description: t('Cursor auto-selects a model') }
    : {}),
}))

function defaultEntry(): CatalogModel {
  return {
    value: null,
    label: t('Default'),
    description: t('Connection default model'),
  }
}

function presetForConnection(connection: Connection) {
  const byId = connection.presetId
    ? CHINA_LLM_PROVIDERS.find(preset => preset.id === connection.presetId)
    : undefined
  if (byId || !connection.baseUrl) return byId

  const baseUrl = connection.baseUrl.replace(/\/+$/, '').toLowerCase()
  return CHINA_LLM_PROVIDERS.find(preset => {
    const urls = [preset.baseURL, preset.codingPlan?.baseURL].filter(
      (url): url is string => url !== undefined,
    )
    return urls.some(url => {
      const normalized = url.replace(/\/+$/, '').toLowerCase()
      return baseUrl === normalized || baseUrl.startsWith(`${normalized}/`)
    })
  })
}

function dedupePush(
  list: CatalogModel[],
  seen: Set<string>,
  entry: CatalogModel,
): void {
  const key = entry.value ?? '\u0000default'
  if (seen.has(key)) return
  seen.add(key)
  list.push(entry)
}

/** "ctx 1M" annotation for a model with a recorded context window. */
function ctxAnnotation(
  connection: Connection,
  modelId: string,
): string | undefined {
  const entry = connection.modelContextWindows?.[modelId]
  if (!entry) return undefined
  return `ctx ${formatContextWindow(entry.tokens)}`
}

function withCtx(
  connection: Connection,
  modelId: string,
  description?: string,
): string | undefined {
  const ctx = ctxAnnotation(connection, modelId)
  if (!ctx) return description
  return description ? `${description} · ${ctx}` : ctx
}

/**
 * Synchronous model catalog for a connection. Always non-empty: every
 * catalog at least offers the "Default" entry so the picker can select
 * "use this connection with its default model".
 */
export function getStaticModelsForConnection(
  connection: Connection,
): CatalogModel[] {
  const out: CatalogModel[] = []
  const seen = new Set<string>()

  dedupePush(out, seen, defaultEntry())

  switch (connection.kind) {
    case 'anthropic-oauth':
    case 'anthropic-api': {
      for (const alias of ANTHROPIC_ALIAS_MODELS) {
        dedupePush(out, seen, alias)
      }
      break
    }
    case 'chatgpt-oauth': {
      const plan = getChatGPTSubscriptionPlan()
      for (const option of CHATGPT_CODEX_MODEL_OPTIONS) {
        if (!isChatGPTCodexModelAvailable(option.value, plan)) continue
        const contextWindow =
          getChatGPTCodexContextWindow(plan, option.value) ??
          option.contextWindow
        dedupePush(out, seen, {
          value: option.value,
          label: option.label,
          description: `${t(option.description)} · ctx ${formatContextWindow(contextWindow)}`,
        })
      }
      break
    }
    case 'cursor': {
      for (const model of CURSOR_CATALOG_MODELS) {
        dedupePush(out, seen, {
          value: model.value,
          label: model.label,
          description: withCtx(
            connection,
            model.value ?? '',
            model.description,
          ),
        })
      }
      break
    }
    case 'openai-compat':
    case 'gemini':
    case 'grok': {
      // Preset catalog (pricing/context metadata) when created from a preset
      const preset = presetForConnection(connection)
      for (const model of preset?.models ?? []) {
        if (model.deprecated) continue
        // A recorded window (auto-detected or manual) supersedes the
        // preset's static context string.
        const recorded = connection.modelContextWindows?.[model.id]
        const details = [
          recorded
            ? `ctx ${formatContextWindow(recorded.tokens)}`
            : model.contextWindow,
          model.free
            ? t('Free')
            : `¥${model.inputPricePerMTok}/${model.outputPricePerMTok} per MTok`,
          ...(model.tags ?? []),
        ]
        dedupePush(out, seen, {
          value: model.id,
          label: model.label,
          description: details.join(' · '),
        })
      }
      break
    }
    default: {
      const _exhaustive: never = connection.kind
      void _exhaustive
    }
  }

  // Connection's explicit model list
  for (const model of connection.models ?? []) {
    dedupePush(out, seen, {
      value: model,
      label: model,
      description: withCtx(connection, model),
    })
  }

  // Tier mapping values are also selectable directly
  const tiers = connection.tierModels
  for (const [tier, model] of [
    ['opus', tiers?.opus],
    ['sonnet', tiers?.sonnet],
    ['haiku', tiers?.haiku],
  ] as const) {
    if (model) {
      dedupePush(out, seen, {
        value: model,
        label: model,
        description: withCtx(connection, model, `${t('Mapped tier')}: ${tier}`),
      })
    }
  }

  return out
}

/**
 * Resolve the user-facing label for a model id in this connection's catalog.
 * Preset and provider catalogs often expose a friendlier alias than the raw
 * API id. Custom or remotely discovered ids safely fall back to themselves.
 */
export function connectionModelDisplayName(
  connection: Connection,
  modelId: string,
): string {
  return (
    getStaticModelsForConnection(connection).find(
      model => model.value === modelId,
    )?.label ??
    getKnownModelDisplayName(modelId) ??
    modelId
  )
}

/**
 * Models offered by the picker UIs for a connection: the static catalog with
 * the live remote list merged on top. For key-based third-party kinds
 * without a tier mapping the "Default" entry is dropped — an explicit model
 * id is required for the endpoint to work.
 */
export function pickerModelsForConnection(
  connection: Connection,
  remoteModels: RemoteModel[],
): CatalogModel[] {
  let models = getStaticModelsForConnection(connection)
  const needsExplicitModel =
    (connection.kind === 'openai-compat' ||
      connection.kind === 'gemini' ||
      connection.kind === 'grok') &&
    !connection.tierModels?.sonnet
  if (needsExplicitModel) {
    models = models.filter(m => m.value !== null)
  }
  const seen = new Set(models.map(m => m.value ?? ''))
  for (const model of remoteModels) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    models.push({
      value: model.id,
      label: model.id,
      description:
        model.contextLength !== undefined
          ? `ctx ${formatContextWindow(model.contextLength)}`
          : undefined,
    })
  }
  return models
}

/** Kinds whose live model list can be fetched from the provider. */
export function supportsRemoteModelList(kind: Connection['kind']): boolean {
  return (
    kind === 'openai-compat' ||
    kind === 'grok' ||
    kind === 'gemini' ||
    kind === 'cursor'
  )
}

/**
 * Context window field names used across OpenAI-compatible ecosystems.
 * The official OpenAI /v1/models response has none of these, but most
 * self-hosted / aggregator endpoints report one.
 */
const CONTEXT_LENGTH_KEYS = [
  'context_length', // OpenRouter, Together, SiliconFlow
  'max_model_len', // vLLM
  'max_context_length', // LM Studio
  'context_window', // various gateways
  'max_input_tokens', // various gateways
] as const

function extractContextLength(
  entry: Record<string, unknown>,
): number | undefined {
  for (const key of CONTEXT_LENGTH_KEYS) {
    const value = entry[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1_000) {
      return Math.round(value)
    }
  }
  return undefined
}

const DEFAULT_GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta'

type FetchOptions = { timeoutMs?: number; fetchOverride?: typeof fetch }

/**
 * Gemini ListModels: GET {base}/models. Reports inputTokenLimit per model.
 * Only generateContent-capable models are offered (filters out embedding
 * and other non-chat models).
 */
async function fetchGeminiModels(
  connection: Connection,
  options?: FetchOptions,
): Promise<RemoteModel[]> {
  const baseUrl = (connection.baseUrl ?? DEFAULT_GEMINI_BASE_URL).replace(
    /\/+$/,
    '',
  )
  const url = `${baseUrl}/models?pageSize=1000`
  const doFetch = options?.fetchOverride ?? fetch
  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers: connection.apiKey ? { 'x-goog-api-key': connection.apiKey } : {},
      signal: AbortSignal.timeout(options?.timeoutMs ?? 5000),
    })
    if (!response.ok) {
      logForDebugging(
        `[connections] gemini model list fetch failed (${response.status}) for ${connection.id}`,
      )
      return []
    }
    const body = (await response.json()) as {
      models?: Array<Record<string, unknown>>
    }
    if (!Array.isArray(body.models)) return []
    const out: RemoteModel[] = []
    for (const entry of body.models) {
      const name = typeof entry.name === 'string' ? entry.name : null
      if (!name) continue
      const methods = Array.isArray(entry.supportedGenerationMethods)
        ? (entry.supportedGenerationMethods as unknown[])
        : undefined
      if (methods && !methods.includes('generateContent')) continue
      const id = name.replace(/^models\//, '')
      if (!id) continue
      const inputTokenLimit = entry.inputTokenLimit
      out.push({
        id,
        contextLength:
          typeof inputTokenLimit === 'number' && inputTokenLimit >= 1_000
            ? Math.round(inputTokenLimit)
            : undefined,
      })
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  } catch (err) {
    logForDebugging(
      `[connections] gemini model list fetch error for ${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return []
  }
}

/**
 * Fetch the live model list for a connection. OpenAI-compatible endpoints
 * (openai-compat / grok) use GET {baseUrl}/models; gemini uses ListModels.
 * Returns [] on any failure — the static catalog remains usable without
 * network access.
 */
export async function fetchRemoteModelsForConnection(
  connection: Connection,
  options?: FetchOptions,
): Promise<RemoteModel[]> {
  if (connection.kind === 'gemini') {
    return fetchGeminiModels(connection, options)
  }
  if (connection.kind === 'cursor') {
    return fetchCursorModels(connection, options)
  }
  if (connection.kind !== 'openai-compat' && connection.kind !== 'grok') {
    return []
  }
  const baseUrl =
    connection.baseUrl ??
    (connection.kind === 'grok' ? 'https://api.x.ai/v1' : undefined)
  if (!baseUrl) return []

  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const doFetch = options?.fetchOverride ?? fetch
  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers: connection.apiKey
        ? { Authorization: `Bearer ${connection.apiKey}` }
        : {},
      signal: AbortSignal.timeout(options?.timeoutMs ?? 5000),
    })
    if (!response.ok) {
      logForDebugging(
        `[connections] model list fetch failed (${response.status}) for ${connection.id}`,
      )
      return []
    }
    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>
    }
    if (!Array.isArray(body.data)) return []
    return body.data
      .map((entry): RemoteModel | null => {
        const id = typeof entry.id === 'string' ? entry.id : null
        if (!id || id.length === 0) return null
        return { id, contextLength: extractContextLength(entry) }
      })
      .filter((model): model is RemoteModel => model !== null)
      .sort((a, b) => a.id.localeCompare(b.id))
  } catch (err) {
    logForDebugging(
      `[connections] model list fetch error for ${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return []
  }
}

/**
 * Cursor live model list via AiService/AvailableModels. Credentials come from
 * the signed-in Cursor session (env / OAuth file / IDE), not connection.apiKey,
 * so this ignores the generic auth path and delegates to the Cursor client.
 */
async function fetchCursorModels(
  _connection: Connection,
  options?: FetchOptions,
): Promise<RemoteModel[]> {
  const { fetchCursorAvailableModels } = await import('../api/cursor/models.js')
  const models = await fetchCursorAvailableModels(process.env, {
    ...(options?.timeoutMs !== undefined
      ? { timeoutMs: options.timeoutMs }
      : {}),
    ...(options?.fetchOverride ? { fetchOverride: options.fetchOverride } : {}),
  })
  return models.map(m => ({
    id: m.id,
    ...(m.contextWindow !== undefined
      ? { contextLength: m.contextWindow }
      : {}),
  }))
}

/**
 * Fetch the live model list and persist any auto-detected context windows
 * onto the connection (source: auto, never overwriting manual entries).
 * UI entry point — keeps fetchRemoteModelsForConnection itself pure.
 */
export async function fetchAndRecordRemoteModels(
  connection: Connection,
  options?: FetchOptions,
): Promise<RemoteModel[]> {
  const models = await fetchRemoteModelsForConnection(connection, options)
  if (models.some(model => model.contextLength !== undefined)) {
    recordAutoDetectedContextWindows(connection.id, models)
  }
  return models
}
