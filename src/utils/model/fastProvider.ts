import {
  asThinkingEffort,
  getConnectionThinkingEffort,
  getConnectionThinkingEffortTransport,
} from '../../services/connections/thinkingEffort.js'
import { asThinkingEffortTransport } from '../../services/connections/effortTransport.js'
import { getInitialSettings } from '../settings/settings.js'
import type { ProviderLoginConfig, SettingsJson } from '../settings/types.js'
import { apiProviderToSettingsProviderKey, getSmallFastModel } from './model.js'
import { getAPIProvider, type APIProvider } from './providers.js'
import type { ProviderRuntimeConfig } from './subagentProvider.js'
import { providerFromModelType } from './subagentProvider.js'

export const FAST_CREDENTIAL_SCOPE = 'fast'

// Process-level CLI override for --fast-provider (not persisted to settings)
let _fastProviderOverride: ProviderLoginConfig | undefined
let _fastClearOverride = false

/**
 * Apply a CLI --fast-provider override. The value is process-scoped and
 * takes precedence over settings.json fastProvider and environment
 * variables. Does NOT persist to disk.
 *
 * Pass 'unset' to force small/fast (HAIKU) calls to inherit the main
 * provider (skip any staged fastProvider in settings or env).
 */
export function setFastProviderCliOverride(
  value:
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'grok'
    | 'cursor'
    | 'unset'
    | undefined,
): void {
  if (value === undefined) {
    _fastProviderOverride = undefined
    _fastClearOverride = false
    return
  }
  if (value === 'unset') {
    _fastProviderOverride = undefined
    _fastClearOverride = true
    return
  }
  _fastProviderOverride = {
    modelType: value,
    credentialScope: FAST_CREDENTIAL_SCOPE,
  }
  _fastClearOverride = false
}

/**
 * Apply a full session-scoped fast provider config (connection registry
 * activation path). Unlike setFastProviderCliOverride this carries env
 * and model so HAIKU calls can run against a different account without any
 * settings.json write. Pass undefined to clear (falls back to env/settings).
 */
export function setFastProviderConfigOverride(
  config: ProviderLoginConfig | undefined,
): void {
  _fastProviderOverride = config
  _fastClearOverride = false
}

function definedString(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

export function getFastProviderFromEnv(
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  const explicitProvider = definedString(envSource.CLAUDE_CODE_FAST_PROVIDER)
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(envSource)) {
    if (!key.startsWith('FAST_') || value === undefined) continue
    const providerKey = key.slice('FAST_'.length)
    if (!providerKey) continue
    env[providerKey] = value
  }

  const modelType = explicitProvider?.toLowerCase()
  if (
    modelType === 'anthropic' ||
    modelType === 'openai' ||
    modelType === 'gemini' ||
    modelType === 'grok' ||
    modelType === 'cursor'
  ) {
    return {
      modelType,
      ...(Object.keys(env).length > 0 && { env }),
      credentialScope: FAST_CREDENTIAL_SCOPE,
    }
  }

  if (Object.keys(env).length === 0) return undefined

  if (
    env.CLAUDE_CODE_USE_GEMINI ||
    env.GEMINI_API_KEY ||
    env.GEMINI_BASE_URL ||
    env.GEMINI_MODEL
  ) {
    return {
      modelType: 'gemini',
      env,
      credentialScope: FAST_CREDENTIAL_SCOPE,
    }
  }
  if (
    env.CLAUDE_CODE_USE_GROK ||
    env.GROK_API_KEY ||
    env.XAI_API_KEY ||
    env.GROK_BASE_URL ||
    env.GROK_MODEL
  ) {
    return {
      modelType: 'grok',
      env,
      credentialScope: FAST_CREDENTIAL_SCOPE,
    }
  }
  if (
    env.CLAUDE_CODE_USE_OPENAI ||
    env.OPENAI_API_KEY ||
    env.OPENAI_BASE_URL ||
    env.OPENAI_MODEL ||
    env.OPENAI_AUTH_MODE
  ) {
    return {
      modelType: 'openai',
      env,
      credentialScope: FAST_CREDENTIAL_SCOPE,
    }
  }
  if (
    env.CLAUDE_CODE_USE_CURSOR ||
    env.CURSOR_API_KEY ||
    env.CURSOR_ACCESS_TOKEN ||
    env.CURSOR_MODEL
  ) {
    return {
      modelType: 'cursor',
      env,
      credentialScope: FAST_CREDENTIAL_SCOPE,
    }
  }

  return {
    modelType: 'anthropic',
    env,
    credentialScope: FAST_CREDENTIAL_SCOPE,
  }
}

function envWithProviderModel(
  provider: APIProvider,
  baseEnv: Record<string, string | undefined> | undefined,
  model: string | null | undefined,
): Record<string, string | undefined> | undefined {
  if (!model) return baseEnv
  const env = { ...(baseEnv ?? {}) }
  if (provider === 'openai') env.OPENAI_MODEL = model
  if (provider === 'gemini') env.GEMINI_MODEL = model
  if (provider === 'grok') env.GROK_MODEL = model
  if (provider === 'cursor') env.CURSOR_MODEL = model
  if (provider === 'firstParty') env.CLAUDE_CODE_FAST_MODEL = model
  return env
}

export function getFastProviderConfig(
  settings: Pick<SettingsJson, 'fastProvider'> = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  // 1. CLI --fast-provider override (highest priority, process-scoped)
  if (_fastProviderOverride !== undefined) return _fastProviderOverride

  // 2. If --fast-provider unset was passed, force inherit main provider
  if (_fastClearOverride) return undefined

  // 3. Environment variables (FAST_*)
  return getFastProviderFromEnv(envSource) ?? settings.fastProvider
}

export function getEffectiveFastProvider(
  settings: Pick<
    SettingsJson,
    'modelType' | 'fastProvider'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): APIProvider {
  const fastProvider = getFastProviderConfig(settings, envSource)
  const scopedProvider = providerFromModelType(fastProvider?.modelType)
  return scopedProvider ?? getAPIProvider(settings, envSource)
}

export function getFastProviderRuntimeConfig(
  settings: Pick<
    SettingsJson,
    'modelType' | 'fastProvider' | 'providerModels'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderRuntimeConfig | undefined {
  // --fast-provider unset = fully inherit the main connection. Without this
  // early return, a stale providerModels.<key>.fastModel from a previous
  // global default would still be packaged into a runtime config and applied
  // to the session's connection.
  if (_fastClearOverride) return undefined

  const fastProvider = getFastProviderConfig(settings, envSource)
  const provider = getEffectiveFastProvider(settings, envSource)
  const providerKey = apiProviderToSettingsProviderKey(provider)
  const providerModel = providerKey
    ? settings.providerModels?.[providerKey]?.fastModel
    : undefined
  const model = fastProvider?.model ?? providerModel

  if (!fastProvider && !model) return undefined

  // Thinking effort: a value carried on the override config (connection
  // activation stuffs connection.thinkingEffort into it — passthrough field,
  // hence the runtime validation) wins over the fast-slot connection
  // registry lookup.
  const thinkingEffort =
    asThinkingEffort(
      (fastProvider as Record<string, unknown> | undefined)?.['thinkingEffort'],
    ) ?? getConnectionThinkingEffort('fast')
  const thinkingEffortTransport =
    asThinkingEffortTransport(
      (fastProvider as Record<string, unknown> | undefined)?.[
        'thinkingEffortTransport'
      ],
    ) ?? getConnectionThinkingEffortTransport('fast')

  return {
    provider,
    modelType: fastProvider?.modelType,
    env: envWithProviderModel(provider, fastProvider?.env, model),
    model,
    credentialScope: fastProvider?.credentialScope ?? FAST_CREDENTIAL_SCOPE,
    ...(fastProvider?.connectionId && {
      connectionId: fastProvider.connectionId,
    }),
    ...(thinkingEffort && { thinkingEffort }),
    ...(thinkingEffortTransport && { thinkingEffortTransport }),
  }
}

/**
 * Model + runtime config for a small/fast (HAIKU) API call. When a fast
 * provider is configured the pinned model and its ProviderRuntimeConfig are
 * returned together; otherwise the main provider's small fast model with no
 * runtime override (current behaviour).
 */
export function getFastModelAndRuntime(): {
  model: string
  runtime?: ProviderRuntimeConfig
} {
  const runtime = getFastProviderRuntimeConfig()
  if (!runtime) return { model: getSmallFastModel() }
  return {
    model: runtime.model ?? getSmallFastModel(),
    runtime,
  }
}
