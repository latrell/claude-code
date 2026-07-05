/**
 * Per-connection model catalogs for the /models picker.
 *
 * Static sources (sync): the connection's own model list, its tier mapping,
 * preset catalogs (CHINA_LLM_PROVIDERS), builtin alias sets for Anthropic
 * kinds and the ChatGPT Codex option list.
 *
 * Dynamic source (async): GET {baseUrl}/models for OpenAI-compatible
 * endpoints (openai-compat / grok), merged on top by the UI when it arrives.
 */

import { CHATGPT_CODEX_MODEL_OPTIONS } from '../../utils/model/chatgptModels.js'
import { CHINA_LLM_PROVIDERS } from '../../utils/chinaLlmProviders.js'
import { logForDebugging } from '../../utils/debug.js'
import { t } from '../../i18n/t.js'
import type { Connection } from './types.js'

export type CatalogModel = {
  /** Model id sent to the API. null = provider/connection default. */
  value: string | null
  label: string
  description?: string
}

const ANTHROPIC_ALIAS_MODELS: CatalogModel[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]

function defaultEntry(): CatalogModel {
  return {
    value: null,
    label: t('Default'),
    description: t('Connection default model'),
  }
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
      for (const option of CHATGPT_CODEX_MODEL_OPTIONS) {
        dedupePush(out, seen, {
          value: option.value,
          label: option.label,
          description: t(option.description),
        })
      }
      break
    }
    case 'openai-compat':
    case 'gemini':
    case 'grok': {
      // Preset catalog (pricing/context metadata) when created from a preset
      const preset = connection.presetId
        ? CHINA_LLM_PROVIDERS.find(p => p.id === connection.presetId)
        : undefined
      for (const model of preset?.models ?? []) {
        if (model.deprecated) continue
        const details = [
          model.contextWindow,
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
    dedupePush(out, seen, { value: model, label: model })
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
        description: `${t('Mapped tier')}: ${tier}`,
      })
    }
  }

  return out
}

/**
 * Fetch the live model list from an OpenAI-compatible endpoint
 * (GET {baseUrl}/models). Returns [] on any failure — the static catalog
 * remains usable without network access.
 */
export async function fetchRemoteModelsForConnection(
  connection: Connection,
  options?: { timeoutMs?: number; fetchOverride?: typeof fetch },
): Promise<string[]> {
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
      data?: Array<{ id?: unknown }>
    }
    if (!Array.isArray(body.data)) return []
    return body.data
      .map(entry => (typeof entry.id === 'string' ? entry.id : null))
      .filter((id): id is string => id !== null && id.length > 0)
      .sort()
  } catch (err) {
    logForDebugging(
      `[connections] model list fetch error for ${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return []
  }
}
