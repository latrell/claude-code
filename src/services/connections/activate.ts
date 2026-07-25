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
 *   fast slot     → setFastProviderConfigOverride(), consumed by
 *                   getFastProviderRuntimeConfig() for small/fast (HAIKU)
 *                   internal calls (queryHaiku / sideQuery).
 *   sonnet slot   → setSonnetProviderConfigOverride(), consumed by
 *                   getSonnetProviderRuntimeConfig() for internal SONNET-tier
 *                   calls (memory retrieval, poor-mode classifier).
 *
 * Global scope (persists, then applies the session activation too):
 *   main slot     → ccb-provider-auth.json / settings.env credentials,
 *                   settings.modelType, providerModels.<key>.model
 *   subagent slot → settings.subagentProvider, providerModels.<key>.subagentModel
 *   fast slot     → settings.fastProvider, providerModels.<key>.fastModel
 *   sonnet slot   → settings.sonnetProvider, providerModels.<key>.sonnetModel
 *   all           → defaults recorded in ccb-connections.json (UI display)
 */

import { t, tf } from '../../i18n/t.js'
import { hasStoredChatGPTAuth } from '../../services/api/openai/chatgptAuth.js'
import { fetchChatGPTCodexModels } from '../../services/api/openai/codexModels.js'
import { invalidateCodexUsagePublication } from '../../services/api/openai/codexUsage.js'
import { hasStoredCursorOAuth } from '../../services/api/cursor/cursorOAuth.js'
import { clearOAuthTokenCache } from '../../utils/auth.js'
import {
  writeCCBProviderAuthEnv,
  type CCBProvider,
} from '../../utils/ccbProviderAuth.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { apiProviderToSettingsProviderKey } from '../../utils/model/model.js'
import {
  setProviderCliOverride,
  type APIProvider,
} from '../../utils/model/providers.js'
import {
  FAST_CREDENTIAL_SCOPE,
  setFastProviderConfigOverride,
} from '../../utils/model/fastProvider.js'
import {
  SONNET_CREDENTIAL_SCOPE,
  setSonnetProviderConfigOverride,
} from '../../utils/model/sonnetProvider.js'
import {
  SUBAGENT_CREDENTIAL_SCOPE,
  setSubagentProviderConfigOverride,
} from '../../utils/model/subagentProvider.js'
import {
  CHATGPT_CODEX_INCOMPATIBLE_OPENAI_ENV_KEYS,
  CHATGPT_CREDENTIAL_SCOPE_ENV,
  getChatGPTCodexDefaultModel,
  getChatGPTCodexFastModel,
} from '../../utils/model/chatgptModels.js'
import type {
  ProviderLoginConfig,
  SettingsJson,
} from '../../utils/settings/types.js'
import { activateOAuthAccountSlot } from './oauthAccounts.js'
import {
  getSessionAssignment,
  setSessionAssignment,
} from './sessionAssignments.js'
import { setSessionProviderEnvOverlay } from './sessionEnvOverlay.js'
import {
  getDefaultAssignment,
  removeConnection,
  setDefaultAssignment,
  touchConnectionUsage,
} from './store.js'
import { kindToModelType, type AgentSlot, type Connection } from './types.js'

export { getSessionAssignment } from './sessionAssignments.js'

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

export function kindToProviderName(
  kind: Connection['kind'],
): 'anthropic' | 'openai' | 'gemini' | 'grok' | 'cursor' {
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

type ChatGPTCatalogRefresher = (credentialScope?: string) => Promise<unknown>

let _chatGPTCatalogRefresherOverride: ChatGPTCatalogRefresher | null = null

export function _setSettingsWriterForTest(writer: SettingsWriter | null): void {
  _settingsWriterOverride = writer
}

export function _setChatGPTCatalogRefresherForTest(
  refresher: ChatGPTCatalogRefresher | null,
): void {
  _chatGPTCatalogRefresherOverride = refresher
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
  // Model used when the picker selects "Default" (model = null). Without
  // this, getDefaultModel() finds no provider default and falls back to the
  // built-in Anthropic model id (Fable 5), which third-party endpoints
  // reject. An explicitly picked model wins, then the connection's pinned
  // model (the lazy migration in store.ts guarantees legacy connections
  // already carry one, so no tierModels/models[0] fallback chain is needed).
  const connectionDefault = model ?? connection.model ?? undefined

  switch (connection.kind) {
    case 'openai-compat': {
      // Empty string (not undefined): applyConfigEnvironmentVariables →
      // injectCCBProviderAuthEnv only fills keys that are undefined, so a
      // prior global ChatGPT default (OPENAI_AUTH_MODE=chatgpt in
      // ccb-provider-auth.json) would otherwise be re-injected after a
      // session-scoped openai-compat activation and keep showing ChatGPT.
      env.OPENAI_AUTH_MODE = ''
      env[CHATGPT_CREDENTIAL_SCOPE_ENV] = undefined
      env.OPENAI_BASE_URL = connection.baseUrl
      env.OPENAI_API_KEY = connection.apiKey
      // The explicitly picked model travels through the main loop model, so
      // the global OPENAI_MODEL override must not linger and shadow it.
      env.OPENAI_MODEL = undefined
      env.OPENAI_DEFAULT_MODEL = connectionDefault
      env.OPENAI_DEFAULT_HAIKU_MODEL = tiers?.haiku ?? connectionDefault
      env.OPENAI_DEFAULT_SONNET_MODEL = tiers?.sonnet ?? connectionDefault
      env.OPENAI_DEFAULT_OPUS_MODEL = tiers?.opus ?? connectionDefault
      // 'off' pins thinking off for this connection: isOpenAIThinkingEnabled
      // treats an explicit '0' as a hard disable that overrides model
      // auto-detect (deepseek/mimo). Any other effort clears a stale '0'
      // left behind by a previous 'off' activation.
      env.OPENAI_ENABLE_THINKING =
        connection.thinkingEffort === 'off' ? '0' : undefined
      env.OPENAI_TEMPERATURE =
        connection.temperature !== undefined
          ? String(connection.temperature)
          : undefined
      env.OPENAI_MAX_TOKENS =
        connection.maxOutputTokens !== undefined
          ? String(connection.maxOutputTokens)
          : undefined
      env.OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT =
        connection.validateDeepSeekV4Output === true ? '1' : undefined
      break
    }
    case 'chatgpt-oauth': {
      for (const key of CHATGPT_CODEX_INCOMPATIBLE_OPENAI_ENV_KEYS) {
        env[key] = undefined
      }
      env.OPENAI_AUTH_MODE = 'chatgpt'
      env[CHATGPT_CREDENTIAL_SCOPE_ENV] =
        connection.credentialRef && connection.credentialRef !== 'default'
          ? connection.credentialRef
          : undefined
      break
    }
    case 'gemini': {
      env.GEMINI_BASE_URL = connection.baseUrl
      env.GEMINI_API_KEY = connection.apiKey
      env.GEMINI_MODEL = undefined
      env.GEMINI_DEFAULT_MODEL = connectionDefault
      env.GEMINI_DEFAULT_HAIKU_MODEL = tiers?.haiku ?? connectionDefault
      env.GEMINI_DEFAULT_SONNET_MODEL = tiers?.sonnet ?? connectionDefault
      env.GEMINI_DEFAULT_OPUS_MODEL = tiers?.opus ?? connectionDefault
      break
    }
    case 'grok': {
      env.GROK_BASE_URL = connection.baseUrl
      env.GROK_API_KEY = connection.apiKey
      env.GROK_MODEL = undefined
      env.GROK_DEFAULT_MODEL = connectionDefault
      env.GROK_DEFAULT_HAIKU_MODEL = tiers?.haiku
      env.GROK_DEFAULT_SONNET_MODEL = tiers?.sonnet
      env.GROK_DEFAULT_OPUS_MODEL = tiers?.opus
      break
    }
    case 'cursor': {
      // A credentialRef marks an OAuth (browser sign-in) connection: route the
      // client to the scoped cursor-auth.<scope>.json file and clear any manual
      // token so it cannot shadow the refreshed OAuth credential. Otherwise the
      // connection is manual (apiKey/machineId) or IDE-auto (both empty →
      // undefined, falling back to the signed-in Cursor IDE state store).
      if (connection.credentialRef) {
        env.CURSOR_AUTH_MODE = 'oauth'
        env.CURSOR_CREDENTIAL_SCOPE = connection.credentialRef
        env.CURSOR_API_KEY = undefined
        env.CURSOR_MACHINE_ID = undefined
      } else {
        env.CURSOR_AUTH_MODE = undefined
        env.CURSOR_CREDENTIAL_SCOPE = undefined
        env.CURSOR_API_KEY = connection.apiKey || undefined
        env.CURSOR_MACHINE_ID = connection.machineId || undefined
      }
      env.CURSOR_BASE_URL = connection.baseUrl || undefined
      env.CURSOR_MODEL = undefined
      env.CURSOR_DEFAULT_MODEL = connectionDefault
      env.CURSOR_DEFAULT_HAIKU_MODEL = tiers?.haiku
      env.CURSOR_DEFAULT_SONNET_MODEL = tiers?.sonnet
      env.CURSOR_DEFAULT_OPUS_MODEL = tiers?.opus
      break
    }
    case 'anthropic-api': {
      env.ANTHROPIC_BASE_URL = connection.baseUrl
      env.ANTHROPIC_AUTH_TOKEN = connection.apiKey
      env.ANTHROPIC_DEFAULT_MODEL = connectionDefault
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
  try {
    const { clearCursorClientCache } = await import(
      '../../services/api/cursor/client.js'
    )
    clearCursorClientCache()
  } catch (err) {
    logError(err)
  }
}

/**
 * Reset the usage surfaces (status line / /usage fallback) after a main-slot
 * switch and kick off a fresh fetch for the new connection. Without this the
 * provider-usage store and the Anthropic rawUtilization cache keep the
 * previous connection's quota on screen until the next poll/response.
 */
async function refreshUsageStoresForConnection(
  connection: Connection,
): Promise<void> {
  try {
    const { resetProviderUsage } = await import('../providerUsage/store.js')
    resetProviderUsage()
  } catch (err) {
    logError(err)
  }
  try {
    const { resetClaudeAiLimits } = await import('../claudeAiLimits.js')
    resetClaudeAiLimits()
  } catch (err) {
    logError(err)
  }
  // Pull-based usage APIs: refresh immediately so the status line repopulates
  // without waiting for the 5-minute poll (Anthropic/OpenAI-compat refill from
  // response headers on the next request instead).
  if (connection.kind === 'cursor') {
    try {
      const { fetchCursorUsage } = await import('../api/cursor/cursorUsage.js')
      void fetchCursorUsage().catch(() => undefined)
    } catch (err) {
      logError(err)
    }
  } else if (connection.kind === 'chatgpt-oauth') {
    try {
      const { fetchCodexUsage } = await import('../api/openai/codexUsage.js')
      const { fetchChatGPTCodexModels } = await import(
        '../api/openai/codexModels.js'
      )
      const credentialScope =
        connection.credentialRef && connection.credentialRef !== 'default'
          ? connection.credentialRef
          : undefined
      void fetchCodexUsage(undefined, credentialScope).catch(() => undefined)
      void fetchChatGPTCodexModels({ credentialScope, force: true }).catch(
        () => undefined,
      )
    } catch (err) {
      logError(err)
    }
  }
}

/**
 * Verify the credential backing a chatgpt-oauth connection is still readable.
 * The registry entry can outlive the credential file: /login into an
 * OpenAI-compatible endpoint deletes the default openai-chatgpt-auth.json
 * (so ChatGPT auth cannot leak into API-key mode) but leaves the connection
 * registered. Failing activation here keeps the switch honest instead of
 * surfacing "not logged in" on the next API call.
 */
async function checkChatGPTCredential(connection: Connection): Promise<{
  success: boolean
  error?: string
}> {
  const scope = connection.credentialRef ?? 'default'
  if (await hasStoredChatGPTAuth(scope === 'default' ? undefined : scope)) {
    return { success: true }
  }
  return {
    success: false,
    error:
      scope === 'default'
        ? tf(
            'ChatGPT credential for "{label}" is missing. Run /login and select ChatGPT account with subscription to sign in again.',
            { label: connection.label },
          )
        : tf(
            'ChatGPT credential for "{label}" is missing. Delete this connection and add it again via /connect.',
            { label: connection.label },
          ),
  }
}

/**
 * Verify the credential backing a Cursor OAuth connection is still readable.
 * Only OAuth (browser sign-in) cursor connections carry a credentialRef;
 * manual/IDE-auto connections resolve credentials at request time and need no
 * check here. A missing file means the connection was signed out or deleted —
 * fail activation with guidance instead of hitting a 401 on the first request.
 */
async function checkCursorCredential(connection: Connection): Promise<{
  success: boolean
  error?: string
}> {
  if (!connection.credentialRef) return { success: true }
  const scope = connection.credentialRef
  if (await hasStoredCursorOAuth(scope === 'default' ? undefined : scope)) {
    return { success: true }
  }
  return {
    success: false,
    error: tf(
      'Cursor credential for "{label}" is missing. Delete this connection and add it again via /connect.',
      { label: connection.label },
    ),
  }
}

/** Anthropic credential deployment shared by session + global paths. */
async function deployAnthropicOAuth(connection: Connection): Promise<{
  success: boolean
  error?: string
}> {
  if (!connection.credentialRef) {
    return {
      success: false,
      error: t('Connection has no linked OAuth account'),
    }
  }
  const result = activateOAuthAccountSlot(connection.credentialRef)
  if (!result.success) return result
  clearOAuthTokenCache()
  return { success: true }
}

/**
 * Model an activation should deploy: an explicit override wins, then the
 * connection's pinned model (single source of truth; the lazy migration in
 * store.ts backfills it for legacy registries). null = provider default.
 */
function resolveActivationModel(
  connection: Connection,
  model?: string | null,
): string | null {
  return model ?? connection.model ?? null
}

/**
 * A null ChatGPT model means "use this account's server default". Load the
 * account catalog before materializing a scoped runtime or persisted config;
 * otherwise the bundled Sol/Luna fallback becomes pinned before the request-
 * time catalog refresh can select the real account default.
 */
async function refreshChatGPTCatalogForDefault(
  connection: Connection,
  resolvedModel: string | null,
): Promise<void> {
  if (connection.kind !== 'chatgpt-oauth' || resolvedModel !== null) return
  const credentialScope =
    connection.credentialRef && connection.credentialRef !== 'default'
      ? connection.credentialRef
      : undefined
  try {
    if (_chatGPTCatalogRefresherOverride) {
      await _chatGPTCatalogRefresherOverride(credentialScope)
    } else {
      await fetchChatGPTCodexModels({ credentialScope })
    }
  } catch (error) {
    // Keep the bundled catalog as an offline fallback, matching Codex.
    logForDebugging(
      `[connections] ChatGPT Codex model catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
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
  if (slot === 'subagent' || slot === 'fast' || slot === 'sonnet') {
    return activateScopedSlotForSession(connection, slot, model)
  }
  const resolvedModel = resolveActivationModel(connection, model)

  // Credential deployment for OAuth-backed kinds
  if (connection.kind === 'anthropic-oauth') {
    const deployed = await deployAnthropicOAuth(connection)
    if (!deployed.success) return deployed
  } else if (connection.kind === 'chatgpt-oauth') {
    const checked = await checkChatGPTCredential(connection)
    if (!checked.success) return checked
  } else if (connection.kind === 'cursor') {
    const checked = await checkCursorCredential(connection)
    if (!checked.success) return checked
  }

  await refreshChatGPTCatalogForDefault(connection, resolvedModel)

  // Provider/account switches invalidate any older ChatGPT usage request
  // before the new env becomes visible. This covers ChatGPT→ChatGPT as well
  // as ChatGPT→another provider and prevents a slow OAuth refresh from
  // repopulating the previous account's plan/quota after the switch.
  invalidateCodexUsagePublication()
  const env = envForConnection(connection, resolvedModel)
  applyEnvToProcess(env)
  // Record the delta so managedEnv re-applies it after every later config
  // env application — otherwise applyConfigEnvironmentVariables() at trust
  // time restores the global default on top of this activation (settings.env
  // Object.assign overwrites, and injectCCBProviderAuthEnv backfills e.g. a
  // global OPENAI_AUTH_MODE=chatgpt into keys this activation deleted).
  setSessionProviderEnvOverlay(env)
  setProviderCliOverride(kindToProviderName(connection.kind))
  await clearProviderClientCaches()
  await refreshUsageStoresForConnection(connection)
  touchConnectionUsage(connection.id)
  setSessionAssignment('main', {
    connectionId: connection.id,
    model: resolvedModel ?? undefined,
  })

  return {
    success: true,
    mainLoopModel: resolvedModel,
  }
}

/** Scoped slots that deploy via a ProviderLoginConfig override. */
type ScopedSlot = 'subagent' | 'fast' | 'sonnet'

function scopedCredentialScope(slot: ScopedSlot): string {
  if (slot === 'subagent') return SUBAGENT_CREDENTIAL_SCOPE
  if (slot === 'fast') return FAST_CREDENTIAL_SCOPE
  return SONNET_CREDENTIAL_SCOPE
}

function setScopedConfigOverride(
  slot: ScopedSlot,
  config: ProviderLoginConfig | undefined,
): void {
  if (slot === 'subagent') {
    setSubagentProviderConfigOverride(config)
  } else if (slot === 'fast') {
    setFastProviderConfigOverride(config)
  } else {
    setSonnetProviderConfigOverride(config)
  }
}

/**
 * Scoped-slot config for a ChatGPT connection: the credentialScope routes
 * getValidChatGPTAuth() to this connection's openai-chatgpt-auth.<scope>.json
 * file ('default' resolves to the unsuffixed default file).
 */
function chatgptSlotConfig(
  connection: Connection,
  model?: string | null,
  slot: ScopedSlot = 'sonnet',
): ProviderLoginConfig {
  const credentialScope = connection.credentialRef ?? 'default'
  const resolvedModel =
    model ??
    (slot === 'fast'
      ? getChatGPTCodexFastModel(credentialScope)
      : getChatGPTCodexDefaultModel(credentialScope))
  return {
    modelType: 'openai',
    connectionId: connection.id,
    env: {
      OPENAI_AUTH_MODE: 'chatgpt',
      ...(credentialScope !== 'default' && {
        [CHATGPT_CREDENTIAL_SCOPE_ENV]: credentialScope,
      }),
    },
    model: resolvedModel,
    thinkingEffort: connection.thinkingEffort,
    thinkingEffortTransport: connection.thinkingEffortTransport,
    credentialScope,
  }
}

/**
 * Scoped-slot config for an Anthropic OAuth connection. Identity switching
 * would require scoped OAuth credentials in the Anthropic client path, which
 * does not exist yet — scoped slots share the main session's Anthropic
 * credentials (model/thinking-effort still apply).
 */
function anthropicOAuthSlotConfig(
  connection: Connection,
  model: string | null,
  credentialScope: string,
): ProviderLoginConfig {
  return {
    modelType: 'anthropic',
    connectionId: connection.id,
    ...(model && { model }),
    thinkingEffort: connection.thinkingEffort,
    thinkingEffortTransport: connection.thinkingEffortTransport,
    credentialScope,
  }
}

function slotLoginConfig(
  connection: Connection,
  model: string | null | undefined,
  credentialScope: string,
): ProviderLoginConfig {
  const env = envForConnection(connection, model)
  // ProviderLoginConfig.env is Record<string,string>; drop deletion markers.
  // The runtime env override replaces process.env for provider-scoped reads,
  // so unset keys simply fall back to the connection-provided values.
  const cleanEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.length > 0) cleanEnv[key] = value
  }
  return {
    modelType: kindToModelType(connection.kind),
    connectionId: connection.id,
    ...(Object.keys(cleanEnv).length > 0 && { env: cleanEnv }),
    ...(model && { model }),
    // Keep both keys explicit. updateSettingsForSource deep-merges objects;
    // undefined is required to clear values left by a previously active slot.
    thinkingEffort: connection.thinkingEffort,
    thinkingEffortTransport: connection.thinkingEffortTransport,
    credentialScope,
  }
}

/** Build the ProviderLoginConfig deployed for a scoped slot activation. */
function scopedSlotConfig(
  connection: Connection,
  slot: ScopedSlot,
  model: string | null,
): ProviderLoginConfig {
  const credentialScope = scopedCredentialScope(slot)
  if (connection.kind === 'anthropic-oauth') {
    return anthropicOAuthSlotConfig(connection, model, credentialScope)
  }
  if (connection.kind === 'chatgpt-oauth') {
    return chatgptSlotConfig(connection, model, slot)
  }
  return slotLoginConfig(connection, model, credentialScope)
}

async function activateScopedSlotForSession(
  connection: Connection,
  slot: ScopedSlot,
  model?: string | null,
): Promise<ActivationResult> {
  const resolvedModel = resolveActivationModel(connection, model)
  if (connection.kind === 'chatgpt-oauth') {
    const checked = await checkChatGPTCredential(connection)
    if (!checked.success) return checked
  } else if (connection.kind === 'cursor') {
    const checked = await checkCursorCredential(connection)
    if (!checked.success) return checked
  }

  await refreshChatGPTCatalogForDefault(connection, resolvedModel)
  setScopedConfigOverride(
    slot,
    scopedSlotConfig(connection, slot, resolvedModel),
  )
  touchConnectionUsage(connection.id)
  setSessionAssignment(slot, {
    connectionId: connection.id,
    model: resolvedModel ?? undefined,
  })
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
  // Validate OAuth-backed credentials before persisting anything, so a
  // connection whose credential file has been deleted cannot become the
  // (broken) global default.
  if (connection.kind === 'chatgpt-oauth') {
    const checked = await checkChatGPTCredential(connection)
    if (!checked.success) return checked
  } else if (connection.kind === 'cursor') {
    const checked = await checkCursorCredential(connection)
    if (!checked.success) return checked
  }

  const modelType = kindToModelType(connection.kind)
  const providerKey = apiProviderToSettingsProviderKey(
    kindToAPIProvider(connection.kind),
  )
  const resolvedModel = resolveActivationModel(connection, model)

  await refreshChatGPTCatalogForDefault(connection, resolvedModel)

  try {
    if (slot === 'main') {
      // 1. Credentials into the store the boot chain reads
      if (
        connection.kind === 'openai-compat' ||
        connection.kind === 'gemini' ||
        connection.kind === 'grok' ||
        connection.kind === 'cursor'
      ) {
        const env = envForConnection(connection, resolvedModel)
        writeCCBProviderAuthEnv(modelType as CCBProvider, env)
      } else if (connection.kind === 'chatgpt-oauth') {
        writeCCBProviderAuthEnv(
          'openai',
          envForConnection(connection, resolvedModel),
        )
        // settings.env is applied before ccb-provider-auth.json and therefore
        // used to win over the selected ChatGPT account after a restart. Purge
        // the incompatible public-API settings from that higher-precedence
        // store as part of the same global activation.
        const settingsEnv: Record<string, undefined> = {}
        for (const key of CHATGPT_CODEX_INCOMPATIBLE_OPENAI_ENV_KEYS) {
          settingsEnv[key] = undefined
        }
        const { error } = writeUserSettings({
          env: settingsEnv,
        } as unknown as SettingsJson)
        if (error) return { success: false, error: error.message }
      } else if (connection.kind === 'anthropic-api') {
        const env = envForConnection(connection, resolvedModel)
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
          providerModels: {
            [providerKey]: { model: resolvedModel ?? undefined },
          },
        }),
      } as unknown as SettingsJson)
      if (error) return { success: false, error: error.message }
    } else {
      // Scoped slots (subagent/fast/sonnet): persist through the existing
      // ProviderLoginConfig pipeline (settings.subagentProvider /
      // settings.fastProvider / settings.sonnetProvider).
      const scopedConfig = scopedSlotConfig(connection, slot, resolvedModel)
      const scopedSettings: Partial<SettingsJson> =
        slot === 'subagent'
          ? { subagentProvider: scopedConfig }
          : slot === 'fast'
            ? { fastProvider: scopedConfig }
            : { sonnetProvider: scopedConfig }
      const scopedModelField =
        slot === 'subagent'
          ? { subagentModel: resolvedModel ?? undefined }
          : slot === 'fast'
            ? { fastModel: resolvedModel ?? undefined }
            : { sonnetModel: resolvedModel ?? undefined }
      const { error } = writeUserSettings({
        ...scopedSettings,
        ...(providerKey && {
          providerModels: {
            [providerKey]: scopedModelField,
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
    model: resolvedModel ?? undefined,
  })

  // 4. Apply to the running session immediately
  return activateConnectionForSession(connection, slot, resolvedModel)
}

/** Clear the global subagent default (inherit the main provider again). */
export function clearSubagentDefault(): { error: Error | null } {
  setSubagentProviderConfigOverride(undefined)
  setDefaultAssignment('subagent', undefined)
  setSessionAssignment('subagent', undefined)
  return writeUserSettings({
    subagentProvider: undefined,
  } as unknown as SettingsJson)
}

/** Clear the global fast default (HAIKU calls inherit the main provider). */
export function clearFastDefault(): { error: Error | null } {
  setFastProviderConfigOverride(undefined)
  setDefaultAssignment('fast', undefined)
  setSessionAssignment('fast', undefined)
  return writeUserSettings({
    fastProvider: undefined,
  } as unknown as SettingsJson)
}

function clearedSonnetProviderModels(): NonNullable<
  SettingsJson['providerModels']
> {
  return {
    anthropic: { sonnetModel: undefined },
    openai: { sonnetModel: undefined },
    gemini: { sonnetModel: undefined },
    grok: { sonnetModel: undefined },
    cursor: { sonnetModel: undefined },
  }
}

/**
 * Clear the global sonnet default (internal SONNET-tier calls inherit the
 * main provider).
 */
export function clearSonnetDefault(): { error: Error | null } {
  const result = writeUserSettings({
    sonnetProvider: undefined,
    providerModels: clearedSonnetProviderModels(),
  } as unknown as SettingsJson)
  if (result.error) return result

  setSonnetProviderConfigOverride(undefined)
  setDefaultAssignment('sonnet', undefined)
  setSessionAssignment('sonnet', undefined)
  return result
}

/**
 * Remove a connection while also detaching a Sonnet-slot runtime/default that
 * points at it. The registry store can clear dangling display defaults, but
 * only the activation layer owns module overrides and persisted settings.
 */
export function removeConnectionWithRuntimeCleanup(connection: Connection): {
  error: Error | null
} {
  const isSonnetDefault =
    getDefaultAssignment('sonnet')?.connectionId === connection.id
  const isSonnetSession =
    getSessionAssignment('sonnet')?.connectionId === connection.id

  if (isSonnetDefault) {
    const result = writeUserSettings({
      sonnetProvider: undefined,
      providerModels: clearedSonnetProviderModels(),
    } as unknown as SettingsJson)
    if (result.error) return result
    setDefaultAssignment('sonnet', undefined)
  }

  if (isSonnetSession) {
    setSonnetProviderConfigOverride(undefined)
    setSessionAssignment('sonnet', undefined)
  }

  removeConnection(connection.id)
  return { error: null }
}
