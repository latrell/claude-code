/**
 * Connection activation engine — "deploys" a connection from the registry
 * into the runtime slots the rest of the CLI already consumes, so the
 * existing provider/model resolution chain works unchanged.
 *
 * Session scope (no disk writes):
 *   main slot     → process.env mutation + setProviderCliOverride()
 *                   + provider client cache invalidation; the caller applies
 *                   the returned mainLoopModel to AppState.
 *   subagent slot → setSubagentProviderConfigOverride() with a full
 *                   ProviderLoginConfig (env + model), consumed by
 *                   getSubagentProviderRuntimeConfig().
 *
 * Global scope (persists, then applies the session activation too):
 *   main slot     → ccb-provider-auth.json / settings.env credentials,
 *                   settings.modelType, providerModels.<key>.model
 *   subagent slot → settings.subagentProvider, providerModels.<key>.subagentModel
 *   both          → defaults recorded in ccb-connections.json (UI display)
 */

import { copyFileSync, existsSync } from 'fs'
import {
  getChatGPTAuthFilePath,
  removeChatGPTAuth,
} from '../../services/api/openai/chatgptAuth.js'
import { clearOAuthTokenCache } from '../../utils/auth.js'
import {
  writeCCBProviderAuthEnv,
  type CCBProvider,
} from '../../utils/ccbProviderAuth.js'
import { logError } from '../../utils/log.js'
import { apiProviderToSettingsProviderKey } from '../../utils/model/model.js'
import {
  setProviderCliOverride,
  type APIProvider,
} from '../../utils/model/providers.js'
import {
  SUBAGENT_CREDENTIAL_SCOPE,
  setSubagentProviderConfigOverride,
} from '../../utils/model/subagentProvider.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import { activateOAuthAccountSlot } from './oauthAccounts.js'
import { setDefaultAssignment, touchConnectionUsage } from './store.js'
import { kindToModelType, type AgentSlot, type Connection } from './types.js'

export type ActivationResult = {
  success: boolean
  error?: string
  /**
   * Model string the caller should apply to the main loop
   * (AppState.mainLoopModel). null = clear to provider default.
   * Only set for slot 'main'.
   */
  mainLoopModel?: string | null
}

// Session-scoped record of which connection each slot currently uses
// (process memory only — mirrors what activateConnectionForSession applied).
const _sessionAssignments: Partial<
  Record<AgentSlot, { connectionId: string; model?: string }>
> = {}

export function getSessionAssignment(
  slot: AgentSlot,
): { connectionId: string; model?: string } | undefined {
  return _sessionAssignments[slot]
}

export function kindToProviderName(
  kind: Connection['kind'],
): 'anthropic' | 'openai' | 'gemini' | 'grok' {
  return kindToModelType(kind)
}

/**
 * Test seam for userSettings writes. The suite cannot rely on the real
 * updateSettingsForSource in cross-file runs (earlier test files register
 * process-global stubs for settings.ts), and mocking settings.ts from the
 * connections tests deadlocks unrelated dynamic imports. Production code
 * never sets this.
 */
type SettingsWriter = (value: SettingsJson) => { error: Error | null }

let _settingsWriterOverride: SettingsWriter | null = null

export function _setSettingsWriterForTest(writer: SettingsWriter | null): void {
  _settingsWriterOverride = writer
}

function writeUserSettings(value: SettingsJson): { error: Error | null } {
  if (_settingsWriterOverride) return _settingsWriterOverride(value)
  // Lazy require instead of a static import: some test files stub
  // settings.ts process-globally without this export, which would turn a
  // static named import into a load-time SyntaxError for every module in
  // this file's graph. Production always resolves the real module.
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const { updateSettingsForSource } =
    require('../../utils/settings/settings.js') as typeof import('../../utils/settings/settings.js')
  return updateSettingsForSource('userSettings', value)
}

export function kindToAPIProvider(kind: Connection['kind']): APIProvider {
  const name = kindToProviderName(kind)
  return name === 'anthropic' ? 'firstParty' : name
}

/**
 * Env delta for a connection: keys to set, `undefined` = keys to delete.
 * Clears stale same-provider-family keys so previous activations (or shell
 * exports, in session scope) cannot shadow the selected credentials.
 */
export function envForConnection(
  connection: Connection,
  model?: string | null,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  const tiers = connection.tierModels

  switch (connection.kind) {
    case 'openai-compat': {
      env.OPENAI_AUTH_MODE = undefined // never inherit ChatGPT auth mode
      env.OPENAI_BASE_URL = connection.baseUrl
      env.OPENAI_API_KEY = connection.apiKey
      // The explicitly picked model travels through the main loop model, so
      // the global OPENAI_MODEL override must not linger and shadow it.
      env.OPENAI_MODEL = undefined
      env.OPENAI_DEFAULT_HAIKU_MODEL = tiers?.haiku ?? model ?? undefined
      env.OPENAI_DEFAULT_SONNET_MODEL = tiers?.sonnet ?? model ?? undefined
      env.OPENAI_DEFAULT_OPUS_MODEL = tiers?.opus ?? model ?? undefined
      break
    }
    case 'chatgpt-oauth': {
      env.OPENAI_AUTH_MODE = 'chatgpt'
      env.OPENAI_BASE_URL = undefined
      env.OPENAI_API_KEY = undefined
      env.OPENAI_MODEL = undefined
      env.OPENAI_DEFAULT_HAIKU_MODEL = tiers?.haiku
      env.OPENAI_DEFAULT_SONNET_MODEL = tiers?.sonnet
      env.OPENAI_DEFAULT_OPUS_MODEL = tiers?.opus
      break
    }
    case 'gemini': {
      env.GEMINI_BASE_URL = connection.baseUrl
      env.GEMINI_API_KEY = connection.apiKey
      env.GEMINI_MODEL = undefined
      env.GEMINI_DEFAULT_HAIKU_MODEL = tiers?.haiku ?? model ?? undefined
      env.GEMINI_DEFAULT_SONNET_MODEL = tiers?.sonnet ?? model ?? undefined
      env.GEMINI_DEFAULT_OPUS_MODEL = tiers?.opus ?? model ?? undefined
      break
    }
    case 'grok': {
      env.GROK_BASE_URL = connection.baseUrl
      env.GROK_API_KEY = connection.apiKey
      env.GROK_MODEL = undefined
      env.GROK_DEFAULT_HAIKU_MODEL = tiers?.haiku
      env.GROK_DEFAULT_SONNET_MODEL = tiers?.sonnet
      env.GROK_DEFAULT_OPUS_MODEL = tiers?.opus
      break
    }
    case 'anthropic-api': {
      env.ANTHROPIC_BASE_URL = connection.baseUrl
      env.ANTHROPIC_AUTH_TOKEN = connection.apiKey
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = tiers?.haiku
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = tiers?.sonnet
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = tiers?.opus
      break
    }
    case 'anthropic-oauth': {
      // OAuth account credentials live in secure storage. Clear custom
      // endpoint overrides so the official API + OAuth token are used.
      env.ANTHROPIC_BASE_URL = undefined
      env.ANTHROPIC_AUTH_TOKEN = undefined
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = undefined
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = undefined
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = undefined
      break
    }
    default: {
      const _exhaustive: never = connection.kind
      void _exhaustive
    }
  }
  return env
}

function applyEnvToProcess(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

/** Drop cached provider SDK clients built from previous env values. */
async function clearProviderClientCaches(): Promise<void> {
  try {
    const { clearOpenAIClientCache } = await import(
      '../../services/api/openai/client.js'
    )
    clearOpenAIClientCache()
  } catch (err) {
    logError(err)
  }
  try {
    const { clearGrokClientCache } = await import(
      '../../services/api/grok/client.js'
    )
    clearGrokClientCache()
  } catch (err) {
    logError(err)
  }
}

/**
 * Switch the ChatGPT credential in the default slot to the connection's
 * scoped credential file. No-op when the connection already uses 'default'.
 */
async function deployChatGPTCredential(connection: Connection): Promise<{
  success: boolean
  error?: string
}> {
  const scope = connection.credentialRef ?? 'default'
  if (scope === 'default') return { success: true }
  const sourcePath = getChatGPTAuthFilePath(scope)
  if (!existsSync(sourcePath)) {
    return {
      success: false,
      error: `ChatGPT credential file missing for connection "${connection.label}"`,
    }
  }
  try {
    // Replace (not merge) the default credential with the scoped one.
    await removeChatGPTAuth()
    copyFileSync(sourcePath, getChatGPTAuthFilePath())
    return { success: true }
  } catch (err) {
    logError(err)
    return { success: false, error: 'Failed to deploy ChatGPT credential' }
  }
}

/** Anthropic credential deployment shared by session + global paths. */
async function deployAnthropicOAuth(connection: Connection): Promise<{
  success: boolean
  error?: string
}> {
  if (!connection.credentialRef) {
    return { success: false, error: 'Connection has no linked OAuth account' }
  }
  const result = activateOAuthAccountSlot(connection.credentialRef)
  if (!result.success) return result
  clearOAuthTokenCache()
  return { success: true }
}

/**
 * Activate a connection for the current session only (no disk writes except
 * OAuth slot mirrors, which by design live in secure storage).
 */
export async function activateConnectionForSession(
  connection: Connection,
  slot: AgentSlot,
  model?: string | null,
): Promise<ActivationResult> {
  if (slot === 'subagent') {
    return activateSubagentForSession(connection, model)
  }

  // Credential deployment for OAuth-backed kinds
  if (connection.kind === 'anthropic-oauth') {
    const deployed = await deployAnthropicOAuth(connection)
    if (!deployed.success) return deployed
  } else if (connection.kind === 'chatgpt-oauth') {
    const deployed = await deployChatGPTCredential(connection)
    if (!deployed.success) return deployed
  }

  applyEnvToProcess(envForConnection(connection, model))
  setProviderCliOverride(kindToProviderName(connection.kind))
  await clearProviderClientCaches()
  touchConnectionUsage(connection.id)
  _sessionAssignments.main = {
    connectionId: connection.id,
    model: model ?? undefined,
  }

  return {
    success: true,
    mainLoopModel: model ?? null,
  }
}

/**
 * Subagent config for a ChatGPT connection: the credentialScope routes
 * getValidChatGPTAuth() to this connection's openai-chatgpt-auth.<scope>.json
 * file ('default' resolves to the unsuffixed default file).
 */
function chatgptSubagentConfig(
  connection: Connection,
  model?: string | null,
): SettingsJson['subagentProvider'] {
  return {
    modelType: 'openai',
    env: { OPENAI_AUTH_MODE: 'chatgpt' },
    ...(model && { model }),
    credentialScope: connection.credentialRef ?? 'default',
  }
}

function subagentLoginConfig(
  connection: Connection,
  model?: string | null,
): SettingsJson['subagentProvider'] {
  const env = envForConnection(connection, model)
  // subagentProvider.env is Record<string,string>; drop deletion markers.
  // The runtime env override replaces process.env for provider-scoped reads,
  // so unset keys simply fall back to the connection-provided values.
  const cleanEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.length > 0) cleanEnv[key] = value
  }
  return {
    modelType: kindToModelType(connection.kind),
    ...(Object.keys(cleanEnv).length > 0 && { env: cleanEnv }),
    ...(model && { model }),
    credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
  }
}

async function activateSubagentForSession(
  connection: Connection,
  model?: string | null,
): Promise<ActivationResult> {
  // Anthropic OAuth subagent identity switching would require scoped OAuth
  // credentials in the Anthropic client path, which does not exist yet —
  // subagents share the main session's Anthropic credentials.
  if (connection.kind === 'anthropic-oauth') {
    setSubagentProviderConfigOverride({
      modelType: 'anthropic',
      ...(model && { model }),
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  } else if (connection.kind === 'chatgpt-oauth') {
    setSubagentProviderConfigOverride(chatgptSubagentConfig(connection, model))
  } else {
    setSubagentProviderConfigOverride(subagentLoginConfig(connection, model))
  }
  touchConnectionUsage(connection.id)
  _sessionAssignments.subagent = {
    connectionId: connection.id,
    model: model ?? undefined,
  }
  return { success: true }
}

/**
 * Persist a connection as the global default for a slot, then apply it to
 * the current session as well.
 */
export async function activateConnectionGlobally(
  connection: Connection,
  slot: AgentSlot,
  model?: string | null,
): Promise<ActivationResult> {
  const modelType = kindToModelType(connection.kind)
  const providerKey = apiProviderToSettingsProviderKey(
    kindToAPIProvider(connection.kind),
  )

  try {
    if (slot === 'main') {
      // 1. Credentials into the store the boot chain reads
      if (
        connection.kind === 'openai-compat' ||
        connection.kind === 'gemini' ||
        connection.kind === 'grok'
      ) {
        const env = envForConnection(connection, model)
        writeCCBProviderAuthEnv(modelType as CCBProvider, env)
      } else if (connection.kind === 'chatgpt-oauth') {
        const deployed = await deployChatGPTCredential(connection)
        if (!deployed.success) return deployed
        writeCCBProviderAuthEnv('openai', { OPENAI_AUTH_MODE: 'chatgpt' })
      } else if (connection.kind === 'anthropic-api') {
        const env = envForConnection(connection, model)
        const settingsEnv: Record<string, string | undefined> = {}
        for (const [key, value] of Object.entries(env)) {
          settingsEnv[key] = value
        }
        const { error } = writeUserSettings({
          env: settingsEnv,
        } as unknown as SettingsJson)
        if (error) return { success: false, error: error.message }
      } else if (connection.kind === 'anthropic-oauth') {
        const deployed = await deployAnthropicOAuth(connection)
        if (!deployed.success) return deployed
        // Clear custom-endpoint keys a previous anthropic-api default wrote.
        const { error } = writeUserSettings({
          env: {
            ANTHROPIC_BASE_URL: undefined,
            ANTHROPIC_AUTH_TOKEN: undefined,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
            ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
            ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
          },
        } as unknown as SettingsJson)
        if (error) return { success: false, error: error.message }
      }

      // 2. Provider selection + per-provider default model
      const { error } = writeUserSettings({
        modelType,
        ...(providerKey && {
          providerModels: { [providerKey]: { model: model ?? undefined } },
        }),
      } as unknown as SettingsJson)
      if (error) return { success: false, error: error.message }
    } else {
      // Subagent slot: persist through the existing subagentProvider pipeline
      const subagentProvider =
        connection.kind === 'anthropic-oauth'
          ? {
              modelType: 'anthropic' as const,
              ...(model && { model }),
              credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
            }
          : connection.kind === 'chatgpt-oauth'
            ? chatgptSubagentConfig(connection, model)
            : subagentLoginConfig(connection, model)
      const { error } = writeUserSettings({
        subagentProvider,
        ...(providerKey && {
          providerModels: {
            [providerKey]: { subagentModel: model ?? undefined },
          },
        }),
      } as unknown as SettingsJson)
      if (error) return { success: false, error: error.message }
    }
  } catch (err) {
    logError(err)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // 3. Record the default in the registry (single source for the UI)
  setDefaultAssignment(slot, {
    connectionId: connection.id,
    model: model ?? undefined,
  })

  // 4. Apply to the running session immediately
  return activateConnectionForSession(connection, slot, model)
}

/** Clear the global subagent default (inherit the main provider again). */
export function clearSubagentDefault(): { error: Error | null } {
  setSubagentProviderConfigOverride(undefined)
  setDefaultAssignment('subagent', undefined)
  _sessionAssignments.subagent = undefined
  return writeUserSettings({
    subagentProvider: undefined,
  } as unknown as SettingsJson)
}
