import {
  asThinkingEffort,
  getConnectionThinkingEffort,
  getConnectionThinkingEffortTransport,
} from '../../services/connections/thinkingEffort.js'
import { asThinkingEffortTransport } from '../../services/connections/effortTransport.js'
import { getInitialSettings } from '../settings/settings.js'
import type { ProviderLoginConfig, SettingsJson } from '../settings/types.js'
import {
  apiProviderToSettingsProviderKey,
  getDefaultSonnetModel,
  getDefaultSonnetModelForProvider,
} from './model.js'
import { getAPIProvider, type APIProvider } from './providers.js'
import type { ProviderRuntimeConfig } from './subagentProvider.js'
import { providerFromModelType } from './subagentProvider.js'

export const SONNET_CREDENTIAL_SCOPE = 'sonnet'

// Process-level CLI override for --sonnet-provider (not persisted to settings)
let _sonnetProviderOverride: ProviderLoginConfig | undefined
let _sonnetClearOverride = false

/**
 * Apply a CLI --sonnet-provider override. The value is process-scoped and
 * takes precedence over settings.json sonnetProvider and environment
 * variables. Does NOT persist to disk.
 *
 * Pass 'unset' to force internal SONNET-tier calls to inherit the main
 * provider (skip any staged sonnetProvider in settings or env).
 */
export function setSonnetProviderCliOverride(
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
    _sonnetProviderOverride = undefined
    _sonnetClearOverride = false
    return
  }
  if (value === 'unset') {
    _sonnetProviderOverride = undefined
    _sonnetClearOverride = true
    return
  }
  _sonnetProviderOverride = {
    modelType: value,
    credentialScope: SONNET_CREDENTIAL_SCOPE,
  }
  _sonnetClearOverride = false
}

/**
 * Apply a full session-scoped sonnet provider config (connection registry
 * activation path). Unlike setSonnetProviderCliOverride this carries env
 * and model so SONNET-tier calls can run against a different account without
 * any settings.json write. Pass undefined to clear (falls back to
 * env/settings).
 */
export function setSonnetProviderConfigOverride(
  config: ProviderLoginConfig | undefined,
): void {
  _sonnetProviderOverride = config
  _sonnetClearOverride = false
}

function definedString(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

export function getSonnetProviderFromEnv(
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  const explicitProvider = definedString(envSource.CLAUDE_CODE_SONNET_PROVIDER)
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(envSource)) {
    if (!key.startsWith('SONNET_') || value === undefined) continue
    const providerKey = key.slice('SONNET_'.length)
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
      credentialScope: SONNET_CREDENTIAL_SCOPE,
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
      credentialScope: SONNET_CREDENTIAL_SCOPE,
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
      credentialScope: SONNET_CREDENTIAL_SCOPE,
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
      credentialScope: SONNET_CREDENTIAL_SCOPE,
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
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    }
  }

  return {
    modelType: 'anthropic',
    env,
    credentialScope: SONNET_CREDENTIAL_SCOPE,
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
  if (provider === 'firstParty') env.CLAUDE_CODE_SONNET_MODEL = model
  return env
}

export function getSonnetProviderConfig(
  settings: Pick<SettingsJson, 'sonnetProvider'> = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  // 1. CLI --sonnet-provider override (highest priority, process-scoped)
  if (_sonnetProviderOverride !== undefined) return _sonnetProviderOverride

  // 2. If --sonnet-provider unset was passed, force inherit main provider
  if (_sonnetClearOverride) return undefined

  // 3. Environment variables (SONNET_*)
  return getSonnetProviderFromEnv(envSource) ?? settings.sonnetProvider
}

export function getEffectiveSonnetProvider(
  settings: Pick<
    SettingsJson,
    'modelType' | 'sonnetProvider'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): APIProvider {
  const sonnetProvider = getSonnetProviderConfig(settings, envSource)
  const scopedProvider = providerFromModelType(sonnetProvider?.modelType)
  return scopedProvider ?? getAPIProvider(settings, envSource)
}

export function getSonnetProviderRuntimeConfig(
  settings: Pick<
    SettingsJson,
    'modelType' | 'sonnetProvider' | 'providerModels'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderRuntimeConfig | undefined {
  // --sonnet-provider unset = fully inherit the main connection. Without
  // this early return, a stale providerModels.<key>.sonnetModel from a
  // previous global default would still be packaged into a runtime config
  // and applied to the session's connection.
  if (_sonnetClearOverride) return undefined

  const sonnetProvider = getSonnetProviderConfig(settings, envSource)
  const provider = getEffectiveSonnetProvider(settings, envSource)
  const providerKey = apiProviderToSettingsProviderKey(provider)
  const providerModel = providerKey
    ? settings.providerModels?.[providerKey]?.sonnetModel
    : undefined
  const model = sonnetProvider?.model ?? providerModel

  if (!sonnetProvider && !model) return undefined

  // Thinking effort: a value carried on the override config (connection
  // activation stuffs connection.thinkingEffort into it — passthrough field,
  // hence the runtime validation) wins over the sonnet-slot connection
  // registry lookup.
  const thinkingEffort =
    asThinkingEffort(
      (sonnetProvider as Record<string, unknown> | undefined)?.[
        'thinkingEffort'
      ],
    ) ?? getConnectionThinkingEffort('sonnet')
  const thinkingEffortTransport =
    asThinkingEffortTransport(
      (sonnetProvider as Record<string, unknown> | undefined)?.[
        'thinkingEffortTransport'
      ],
    ) ?? getConnectionThinkingEffortTransport('sonnet')

  return {
    provider,
    modelType: sonnetProvider?.modelType,
    env: envWithProviderModel(provider, sonnetProvider?.env, model),
    model,
    credentialScope: sonnetProvider?.credentialScope ?? SONNET_CREDENTIAL_SCOPE,
    ...(sonnetProvider?.connectionId && {
      connectionId: sonnetProvider.connectionId,
    }),
    ...(thinkingEffort && { thinkingEffort }),
    ...(thinkingEffortTransport && { thinkingEffortTransport }),
  }
}

/**
 * Model + runtime config for an internal SONNET-tier API call (memory
 * retrieval, poor-mode classifier). When a sonnet provider is configured the
 * pinned model and its ProviderRuntimeConfig are returned together; otherwise
 * the main provider's default Sonnet model with no runtime override (current
 * behaviour).
 */
export function getSonnetModelAndRuntime(): {
  model: string
  runtime?: ProviderRuntimeConfig
} {
  const runtime = getSonnetProviderRuntimeConfig()
  if (!runtime) return { model: getDefaultSonnetModel() }
  return {
    model:
      runtime.model ??
      getDefaultSonnetModelForProvider(
        runtime.provider,
        runtime.env ?? process.env,
      ),
    runtime,
  }
}
