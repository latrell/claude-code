import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { getInitialSettings } from '../settings/settings.js'
import type { SettingsJson } from '../settings/types.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'grok'

// Process-level CLI override for --provider (not persisted to settings)
let _cliProviderOverride: APIProvider | undefined
let _cliProviderUnset = false

/**
 * Apply a CLI --provider override. The value is process-scoped and takes
 * precedence over settings.json modelType. Does NOT persist to disk.
 *
 * Accepts the human-readable name ('anthropic', 'openai', etc.) or 'unset'
 * to clear any settings.modelType effect for this process.
 */
export function setProviderCliOverride(
  value:
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'grok'
    | 'bedrock'
    | 'vertex'
    | 'foundry'
    | 'unset'
    | undefined,
): void {
  if (value === undefined) {
    _cliProviderOverride = undefined
    _cliProviderUnset = false
    return
  }
  if (value === 'unset') {
    _cliProviderOverride = undefined
    _cliProviderUnset = true
    return
  }
  _cliProviderOverride = providerNameToAPIProvider(value)
  _cliProviderUnset = false
}

function providerNameToAPIProvider(name: string): APIProvider {
  switch (name) {
    case 'anthropic':
      return 'firstParty'
    case 'openai':
      return 'openai'
    case 'gemini':
      return 'gemini'
    case 'grok':
      return 'grok'
    case 'bedrock':
      return 'bedrock'
    case 'vertex':
      return 'vertex'
    case 'foundry':
      return 'foundry'
    default:
      return 'firstParty'
  }
}

export function getAPIProvider(
  settings: Pick<SettingsJson, 'modelType'> = getInitialSettings(),
  env: Record<string, string | undefined> = process.env,
): APIProvider {
  // 1. CLI --provider override (highest priority, process-scoped)
  if (_cliProviderOverride !== undefined) return _cliProviderOverride

  // 2. If --provider unset was passed, skip settings.modelType
  if (!_cliProviderUnset) {
    const modelType = settings.modelType
    if (modelType === 'openai') return 'openai'
    if (modelType === 'gemini') return 'gemini'
    if (modelType === 'grok') return 'grok'
  }

  // 3. Environment variables
  if (isEnvTruthy(env.CLAUDE_CODE_USE_BEDROCK)) return 'bedrock'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_VERTEX)) return 'vertex'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_FOUNDRY)) return 'foundry'

  if (isEnvTruthy(env.CLAUDE_CODE_USE_OPENAI)) return 'openai'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_GEMINI)) return 'gemini'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_GROK)) return 'grok'

  // 4. Default
  return 'firstParty'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  // TODO: 这里会有问题, 只配置了 openai 协议的用户, 按理说会为 true 导致问题
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
