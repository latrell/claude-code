import { createHash } from 'crypto'
import {
  CHATGPT_CODEX_MODEL_OPTIONS,
  clearRemoteChatGPTCodexModelOptions,
  setRemoteChatGPTCodexModelOptions,
  type ChatGPTCodexEffortLevel,
  type ChatGPTCodexInputModality,
  type ChatGPTCodexModelOption,
  type ChatGPTCodexModelVisibility,
  type ChatGPTCodexReasoningSummary,
  type ChatGPTCodexVerbosity,
  getChatGPTCredentialScope,
} from 'src/utils/model/chatgptModels.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import {
  forceRefreshChatGPTAuth,
  getValidChatGPTAuth,
  type ChatGPTAuth,
} from './chatgptAuth.js'

export const CHATGPT_CODEX_MODELS_URL =
  'https://chatgpt.com/backend-api/codex/models'

/**
 * Audited OpenAI Codex protocol baseline implemented by this compatibility
 * layer. This must not reuse CCB's unrelated application version: the Codex
 * models endpoint compares `client_version` with each model's
 * `minimal_client_version` before advertising it to the client.
 */
export const CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION = '0.144.0'

const DEFAULT_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 300_000

const WIRE_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly ChatGPTCodexEffortLevel[]

type ChatGPTCodexCatalogAuth = ChatGPTAuth & {
  isFedRAMP?: boolean
}

export type FetchChatGPTCodexModelsOptions = {
  credentialScope?: string
  fetchOverride?: typeof fetch
  authOverride?: ChatGPTCodexCatalogAuth
  clientVersion?: string
  timeoutMs?: number
  force?: boolean
  authResolverOverride?: (credentialScope?: string) => Promise<ChatGPTAuth>
  authRefreshOverride?: (
    credentialScope?: string,
    rejectedAccessToken?: string,
    expectedAccountId?: string,
    expectedCredentialId?: string,
  ) => Promise<ChatGPTAuth>
}

type CachedModels = {
  expiresAt: number
  models: readonly ChatGPTCodexModelOption[]
}

const modelsCache = new Map<string, CachedModels>()
const pendingFetches = new Map<
  string,
  Promise<readonly ChatGPTCodexModelOption[]>
>()
const activeIdentityByScope = new Map<string, string>()
const catalogGenerationByScope = new Map<string, number>()

function catalogAuthIdentity(auth: ChatGPTCodexCatalogAuth): string {
  const accountId = auth.accountId?.trim()
  if (accountId) return `account:${accountId}`
  return `token:${createHash('sha256').update(auth.accessToken).digest('hex')}`
}

function reserveCatalogGeneration(scope: string): number {
  const generation = (catalogGenerationByScope.get(scope) ?? 0) + 1
  catalogGenerationByScope.set(scope, generation)
  return generation
}

function activateCatalogIdentity(
  scope: string,
  identity: string,
  generation: number,
): void {
  if (catalogGenerationByScope.get(scope) !== generation) return
  if (activeIdentityByScope.get(scope) === identity) return
  activeIdentityByScope.set(scope, identity)
  // Do not expose the previous account's capabilities while the new catalog
  // is in flight. The bundled roster is the safe offline fallback.
  setRemoteChatGPTCodexModelOptions(undefined, scope)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function asFiniteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined
}

function asPositiveInteger(value: unknown): number | undefined {
  const integer = asFiniteInteger(value)
  return integer !== undefined && integer > 0 ? integer : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map(asNonEmptyString)
    .filter((item): item is string => item !== undefined)
}

function parseVisibility(value: unknown): ChatGPTCodexModelVisibility {
  if (value === 'list' || value === 'hide' || value === 'none') return value
  if (value === 'hidden') return 'hide'
  return 'none'
}

function parseWireEffort(value: unknown): ChatGPTCodexEffortLevel | undefined {
  return WIRE_EFFORTS.find(effort => effort === value)
}

function readReasoningEffort(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  return asNonEmptyString(asRecord(value)?.effort)
}

function parseSupportedEfforts(value: unknown): {
  efforts: ChatGPTCodexEffortLevel[]
  supportsUltra: boolean
} {
  const advertised = Array.isArray(value)
    ? value.map(readReasoningEffort).filter(Boolean)
    : []
  const supportsUltra = advertised.includes('ultra')
  const effortSet = new Set<ChatGPTCodexEffortLevel>()

  for (const value of advertised) {
    const effort = parseWireEffort(value)
    if (effort) effortSet.add(effort)
  }
  if (supportsUltra) effortSet.add('max')

  return {
    efforts: WIRE_EFFORTS.filter(effort => effortSet.has(effort)),
    supportsUltra,
  }
}

function parseInputModalities(
  value: unknown,
  fallback?: readonly ChatGPTCodexInputModality[],
): ChatGPTCodexInputModality[] {
  if (!Array.isArray(value)) {
    return [...(fallback ?? ['text', 'image'])]
  }
  const modalities = value.filter(
    (item): item is ChatGPTCodexInputModality =>
      item === 'text' || item === 'image' || item === 'audio',
  )
  return modalities.length > 0 ? [...new Set(modalities)] : ['text']
}

function parseVerbosity(value: unknown): ChatGPTCodexVerbosity | undefined {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : undefined
}

function parseReasoningSummary(
  value: unknown,
): ChatGPTCodexReasoningSummary | undefined {
  return value === 'auto' ||
    value === 'concise' ||
    value === 'detailed' ||
    value === 'none'
    ? value
    : undefined
}

function parseMultiAgentVersion(
  value: unknown,
): ChatGPTCodexModelOption['multiAgentVersion'] {
  return value === 'v1' || value === 'v2' ? value : undefined
}

function parseAvailablePlans(
  model: Record<string, unknown>,
): string[] | undefined {
  return (
    asStringArray(model.available_in_plans) ??
    asStringArray(model.supported_in_plans) ??
    asStringArray(model.available_plans)
  )
}

function parseUpgradeModel(model: Record<string, unknown>): string | undefined {
  const upgrade = asRecord(model.upgrade)
  return (
    asNonEmptyString(upgrade?.model) ??
    asNonEmptyString(upgrade?.id) ??
    asNonEmptyString(model.upgrade_model)
  )
}

function parseModel(value: unknown): ChatGPTCodexModelOption | undefined {
  const model = asRecord(value)
  const slug = asNonEmptyString(model?.slug)
  if (!model || !slug) return undefined

  const fallback = CHATGPT_CODEX_MODEL_OPTIONS.find(
    option => option.value === slug,
  )
  const supported = parseSupportedEfforts(model.supported_reasoning_levels)
  const rawDefaultEffort = asNonEmptyString(model.default_reasoning_level)
  const advertisedDefault =
    rawDefaultEffort === 'ultra' ? 'max' : parseWireEffort(rawDefaultEffort)
  const defaultEffortLevel =
    advertisedDefault ??
    fallback?.defaultEffortLevel ??
    supported.efforts.find(effort => effort === 'medium') ??
    supported.efforts[0] ??
    'medium'
  const supportedEffortLevels =
    supported.efforts.length > 0
      ? supported.efforts
      : [...(fallback?.supportedEffortLevels ?? [defaultEffortLevel])]
  if (!supportedEffortLevels.includes(defaultEffortLevel)) {
    supportedEffortLevels.push(defaultEffortLevel)
    supportedEffortLevels.sort(
      (left, right) => WIRE_EFFORTS.indexOf(left) - WIRE_EFFORTS.indexOf(right),
    )
  }

  const contextWindow =
    asPositiveInteger(model.context_window) ??
    fallback?.contextWindow ??
    asPositiveInteger(model.max_context_window) ??
    272_000
  const maxContextWindow =
    asPositiveInteger(model.max_context_window) ??
    fallback?.maxContextWindow ??
    contextWindow
  const supportsVerbosity =
    typeof model.support_verbosity === 'boolean'
      ? model.support_verbosity
      : fallback?.defaultVerbosity !== undefined
  const availablePlans = parseAvailablePlans(model)

  return {
    value: slug,
    label: asNonEmptyString(model.display_name) ?? fallback?.label ?? slug,
    description:
      asNonEmptyString(model.description) ?? fallback?.description ?? '',
    defaultEffortLevel,
    supportedEffortLevels,
    contextWindow,
    maxContextWindow,
    effectiveContextWindowPercent:
      asPositiveInteger(model.effective_context_window_percent) ??
      fallback?.effectiveContextWindowPercent ??
      95,
    autoCompactTokenLimit:
      asPositiveInteger(model.auto_compact_token_limit) ??
      fallback?.autoCompactTokenLimit,
    useResponsesLite:
      typeof model.use_responses_lite === 'boolean'
        ? model.use_responses_lite
        : fallback?.useResponsesLite,
    visibility: parseVisibility(model.visibility),
    priority: asFiniteInteger(model.priority) ?? fallback?.priority ?? 1000,
    supportedInApi:
      typeof model.supported_in_api === 'boolean'
        ? model.supported_in_api
        : (fallback?.supportedInApi ?? false),
    inputModalities: parseInputModalities(
      model.input_modalities,
      fallback?.inputModalities,
    ),
    supportsParallelToolCalls:
      typeof model.supports_parallel_tool_calls === 'boolean'
        ? model.supports_parallel_tool_calls
        : (fallback?.supportsParallelToolCalls ?? false),
    defaultVerbosity: supportsVerbosity
      ? (parseVerbosity(model.default_verbosity) ?? fallback?.defaultVerbosity)
      : undefined,
    supportsReasoningSummaryParameter:
      typeof model.supports_reasoning_summary_parameter === 'boolean'
        ? model.supports_reasoning_summary_parameter
        : (fallback?.supportsReasoningSummaryParameter ?? true),
    defaultReasoningSummary:
      parseReasoningSummary(model.default_reasoning_summary) ??
      fallback?.defaultReasoningSummary,
    toolMode: asNonEmptyString(model.tool_mode) ?? fallback?.toolMode,
    supportsUltra:
      supported.supportsUltra || rawDefaultEffort === 'ultra' || undefined,
    multiAgentVersion:
      parseMultiAgentVersion(model.multi_agent_version) ??
      fallback?.multiAgentVersion,
    availablePlans,
    upgradeModel: parseUpgradeModel(model) ?? fallback?.upgradeModel,
  }
}

/** Parse the account-scoped response returned by the Codex `/models` route. */
export function parseChatGPTCodexModels(
  payload: unknown,
): ChatGPTCodexModelOption[] {
  const response = asRecord(payload)
  if (!response || !Array.isArray(response.models)) {
    throw new TypeError('Invalid ChatGPT Codex model catalog response')
  }
  return response.models
    .map(parseModel)
    .filter((model): model is ChatGPTCodexModelOption => model !== undefined)
    .sort((left, right) => left.priority - right.priority)
}

function clientVersion(override?: string): string {
  if (override) return override
  return CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION
}

function applyAuthoritativeCatalog(
  models: readonly ChatGPTCodexModelOption[],
  credentialScope?: string,
): void {
  setRemoteChatGPTCodexModelOptions(models, credentialScope)
}

async function loadChatGPTCodexModels(
  options: FetchChatGPTCodexModelsOptions,
  initialAuth: ChatGPTCodexCatalogAuth,
  allowAuthRefresh: boolean,
): Promise<readonly ChatGPTCodexModelOption[]> {
  let auth = initialAuth
  const resolvedClientVersion = clientVersion(options.clientVersion)
  const createHeaders = (
    currentAuth: ChatGPTCodexCatalogAuth,
  ): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${currentAuth.accessToken}`,
      Accept: 'application/json',
      Origin: 'https://chatgpt.com',
      Referer: 'https://chatgpt.com/',
      originator: 'claude-code-best',
      version: resolvedClientVersion,
    }
    if (currentAuth.accountId) {
      headers['ChatGPT-Account-Id'] = currentAuth.accountId
    }
    if (currentAuth.isFedRAMP) {
      headers['X-OpenAI-Fedramp'] = 'true'
    }
    return headers
  }

  const url = new URL(CHATGPT_CODEX_MODELS_URL)
  url.searchParams.set('client_version', resolvedClientVersion)
  const doFetch = options.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const send = (currentAuth: ChatGPTCodexCatalogAuth): Promise<Response> =>
    doFetch(url, {
      ...getProxyFetchOptions({ forAnthropicAPI: false }),
      method: 'GET',
      headers: createHeaders(currentAuth),
      signal,
    })

  let response = await send(auth)
  if (response.status === 401 && allowAuthRefresh && !signal.aborted) {
    await response.body?.cancel().catch(() => undefined)
    auth = await (options.authRefreshOverride ?? forceRefreshChatGPTAuth)(
      options.credentialScope,
      auth.accessToken,
      auth.accountId,
      auth.credentialId,
    )
    response = await send(auth)
  }
  if (!response.ok) {
    throw new Error(
      `ChatGPT Codex model catalog request failed (${response.status})`,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TypeError('Invalid JSON from ChatGPT Codex model catalog')
  }
  return parseChatGPTCodexModels(payload)
}

/**
 * Fetch the account-scoped Codex model catalog.
 *
 * Results are cached for five minutes per credential scope. Concurrent callers
 * for the same scope share one request. A catalog with at least one visible
 * model becomes authoritative for that credential scope.
 */
export async function fetchChatGPTCodexModels(
  options: FetchChatGPTCodexModelsOptions = {},
): Promise<readonly ChatGPTCodexModelOption[]> {
  const credentialScope = options.credentialScope ?? getChatGPTCredentialScope()
  const scope = credentialScope?.trim() || 'default'
  // Reserve authority before OAuth resolution: token refresh may await the
  // network. An older account whose refresh finishes after a newer switch
  // must never reactivate itself merely because its auth completed last.
  const generation = reserveCatalogGeneration(scope)
  const resolvedOptions = { ...options, credentialScope }
  const auth: ChatGPTCodexCatalogAuth =
    options.authOverride ??
    (await (options.authResolverOverride ?? getValidChatGPTAuth)(
      credentialScope,
    ))
  const identity = catalogAuthIdentity(auth)
  activateCatalogIdentity(scope, identity, generation)
  const cacheKey = `${scope}\u0000${identity}`
  const cached = modelsCache.get(cacheKey)
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    if (
      catalogGenerationByScope.get(scope) === generation &&
      activeIdentityByScope.get(scope) === identity
    ) {
      applyAuthoritativeCatalog(cached.models, scope)
    }
    return cached.models
  }

  const pending = pendingFetches.get(cacheKey)
  if (pending) {
    const models = await pending
    if (
      catalogGenerationByScope.get(scope) === generation &&
      activeIdentityByScope.get(scope) === identity
    ) {
      applyAuthoritativeCatalog(models, scope)
    }
    return models
  }

  const request = loadChatGPTCodexModels(
    resolvedOptions,
    auth,
    options.authOverride === undefined,
  )
    .then(models => {
      modelsCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        models,
      })
      if (
        catalogGenerationByScope.get(scope) === generation &&
        activeIdentityByScope.get(scope) === identity
      ) {
        applyAuthoritativeCatalog(models, scope)
      }
      return models
    })
    .finally(() => {
      if (pendingFetches.get(cacheKey) === request) {
        pendingFetches.delete(cacheKey)
      }
    })
  pendingFetches.set(cacheKey, request)
  return request
}

/** Reset process-local catalog state between unit tests. */
export function clearChatGPTCodexModelsCacheForTests(): void {
  modelsCache.clear()
  pendingFetches.clear()
  activeIdentityByScope.clear()
  catalogGenerationByScope.clear()
  clearRemoteChatGPTCodexModelOptions()
}
