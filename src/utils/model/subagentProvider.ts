import { getInitialSettings } from '../settings/settings.js'
import type { ProviderLoginConfig, SettingsJson } from '../settings/types.js'
import { apiProviderToSettingsProviderKey } from './model.js'
import { getAPIProvider, type APIProvider } from './providers.js'

export const SUBAGENT_CREDENTIAL_SCOPE = 'subagent'

export type ProviderRuntimeConfig = {
  provider: APIProvider
  modelType?: ProviderLoginConfig['modelType']
  env?: Record<string, string | undefined>
  model?: string | null
  credentialScope?: string
}

// Process-level CLI override for --subagent-provider (not persisted to settings)
let _subagentProviderOverride: ProviderLoginConfig | undefined
let _subagentClearOverride = false

/**
 * Apply a CLI --subagent-provider override. The value is process-scoped and
 * takes precedence over settings.json subagentProvider and environment
 * variables. Does NOT persist to disk.
 *
 * Pass 'unset' to force subagents to inherit the main provider (skip any
 * staged subagentProvider in settings or env).
 */
export function setSubagentProviderCliOverride(
  value: 'anthropic' | 'openai' | 'gemini' | 'grok' | 'unset' | undefined,
): void {
  if (value === undefined) {
    _subagentProviderOverride = undefined
    _subagentClearOverride = false
    return
  }
  if (value === 'unset') {
    _subagentProviderOverride = undefined
    _subagentClearOverride = true
    return
  }
  _subagentProviderOverride = {
    modelType: value,
    credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
  }
  _subagentClearOverride = false
}

export function providerFromModelType(
  modelType: ProviderLoginConfig['modelType'] | undefined,
): APIProvider | undefined {
  if (modelType === 'anthropic') return 'firstParty'
  if (modelType === 'openai') return 'openai'
  if (modelType === 'gemini') return 'gemini'
  if (modelType === 'grok') return 'grok'
  return undefined
}

function definedString(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

export function getSubagentProviderFromEnv(
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  const explicitProvider = definedString(
    envSource.CLAUDE_CODE_SUBAGENT_PROVIDER,
  )
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(envSource)) {
    if (!key.startsWith('SUBAGENT_') || value === undefined) continue
    const providerKey = key.slice('SUBAGENT_'.length)
    if (!providerKey) continue
    env[providerKey] = value
  }

  const modelType = explicitProvider?.toLowerCase()
  if (
    modelType === 'anthropic' ||
    modelType === 'openai' ||
    modelType === 'gemini' ||
    modelType === 'grok'
  ) {
    return {
      modelType,
      ...(Object.keys(env).length > 0 && { env }),
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
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
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
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
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
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
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    }
  }

  return {
    modelType: 'anthropic',
    env,
    credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
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
  if (provider === 'firstParty') env.CLAUDE_CODE_SUBAGENT_MODEL = model
  return env
}

export function getSubagentProviderConfig(
  settings: Pick<SettingsJson, 'subagentProvider'> = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderLoginConfig | undefined {
  // 1. CLI --subagent-provider override (highest priority, process-scoped)
  if (_subagentProviderOverride !== undefined) return _subagentProviderOverride

  // 2. If --subagent-provider unset was passed, force inherit main provider
  if (_subagentClearOverride) return undefined

  // 3. Environment variables (SUBAGENT_*)
  return getSubagentProviderFromEnv(envSource) ?? settings.subagentProvider
}

export function getEffectiveSubagentProvider(
  settings: Pick<
    SettingsJson,
    'modelType' | 'subagentProvider'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): APIProvider {
  const subagentProvider = getSubagentProviderConfig(settings, envSource)
  const scopedProvider = providerFromModelType(subagentProvider?.modelType)
  return scopedProvider ?? getAPIProvider(settings, envSource)
}

export function getSubagentProviderRuntimeConfig(
  settings: Pick<
    SettingsJson,
    'modelType' | 'subagentProvider' | 'providerModels'
  > = getInitialSettings(),
  envSource: Record<string, string | undefined> = process.env,
): ProviderRuntimeConfig | undefined {
  const subagentProvider = getSubagentProviderConfig(settings, envSource)
  const provider = getEffectiveSubagentProvider(settings, envSource)
  const providerKey = apiProviderToSettingsProviderKey(provider)
  const providerModel = providerKey
    ? settings.providerModels?.[providerKey]?.subagentModel
    : undefined
  const model = subagentProvider?.model ?? providerModel

  if (!subagentProvider && !model) return undefined

  return {
    provider,
    modelType: subagentProvider?.modelType,
    env: envWithProviderModel(provider, subagentProvider?.env, model),
    model,
    credentialScope:
      subagentProvider?.credentialScope ?? SUBAGENT_CREDENTIAL_SCOPE,
  }
}
