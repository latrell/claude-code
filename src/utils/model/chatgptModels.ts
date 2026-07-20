/**
 * Reasoning efforts sent on the ChatGPT Responses wire.
 * Codex's product-level `ultra` choice is `max` plus proactive multi-agent
 * delegation, so it remains separate from this raw effort type.
 */
export type ChatGPTCodexEffortLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type ChatGPTCodexModelVisibility = 'list' | 'hide' | 'none'
export type ChatGPTCodexInputModality = 'text' | 'image' | 'audio'
export type ChatGPTCodexVerbosity = 'low' | 'medium' | 'high'
export type ChatGPTCodexReasoningSummary =
  | 'auto'
  | 'concise'
  | 'detailed'
  | 'none'

export type ChatGPTCodexModelOption = {
  value: string
  label: string
  description: string
  /** Reasoning effort Codex selects when the user leaves effort on auto. */
  defaultEffortLevel: ChatGPTCodexEffortLevel
  /** Reasoning efforts accepted by this model, ordered from lowest to highest. */
  supportedEffortLevels: readonly ChatGPTCodexEffortLevel[]
  /** Default Codex product context window, in tokens. */
  contextWindow: number
  /** Largest context window Codex currently advertises for explicit opt-in. */
  maxContextWindow: number
  /** Percentage of the advertised window available to the active turn. */
  effectiveContextWindowPercent?: number
  /** Server-advertised token threshold for automatic compaction. */
  autoCompactTokenLimit?: number
  /** Whether the ChatGPT Codex backend expects the Responses Lite contract. */
  useResponsesLite?: boolean
  /** Whether the model is offered in pickers or retained only for compatibility. */
  visibility: ChatGPTCodexModelVisibility
  /** Server ordering for picker-visible models. Lower values sort first. */
  priority: number
  /** Whether API-key/public Responses auth may use this model. */
  supportedInApi: boolean
  /** User input modalities accepted by this model. */
  inputModalities: readonly ChatGPTCodexInputModality[]
  /** Whether the backend accepts more than one tool call in a turn. */
  supportsParallelToolCalls: boolean
  /** Default text verbosity sent by the official Codex client. */
  defaultVerbosity?: ChatGPTCodexVerbosity
  /** Whether Responses accepts the reasoning.summary request parameter. */
  supportsReasoningSummaryParameter?: boolean
  /** Account catalog default for reasoning.summary. */
  defaultReasoningSummary?: ChatGPTCodexReasoningSummary
  /** Optional tool policy advertised by the Codex model catalog. */
  toolMode?: string
  /** Product-level Ultra support. Ultra is sent as wire-level `max`. */
  supportsUltra?: boolean
  /** Model-driven multi-agent policy version advertised by Codex. */
  multiAgentVersion?: 'v1' | 'v2'
  /** Plans advertised by the account-scoped Codex model catalog. */
  availablePlans?: readonly string[]
  /** Replacement suggested by the server for a hidden/deprecated model. */
  upgradeModel?: string
}

// ---------------------------------------------------------------------------
// Plan-aware context window sizes for ChatGPT Codex
// ---------------------------------------------------------------------------
// Instant-window constants (for docs / tests — not used by runtime resolution):
//   free          27_000
//   go/plus       54_000
//   pro           128_000
//   business      54_000
//   enterprise    128_000
// The actual runtime function below uses the reasoning/coding tier sizes.

export const CHATGPT_CODEX_INSTANT_WINDOW_FREE = 27_000
export const CHATGPT_CODEX_INSTANT_WINDOW_GO_PLUS = 54_000
export const CHATGPT_CODEX_INSTANT_WINDOW_PRO = 128_000
export const CHATGPT_CODEX_INSTANT_WINDOW_ENTERPRISE = 128_000

/** Reasoning/coding tier context windows by plan. */
const REASONING_CODEX_WINDOWS: Record<string, number> = {
  free: 27_000,
  go: 256_000,
  plus: 256_000,
  pro: 400_000,
  team: 256_000,
  business: 256_000,
  enterprise: 256_000,
  edu: 256_000,
}

export const CHATGPT_CODEX_DEFAULT_MODEL = 'gpt-5.6-sol'
export const CHATGPT_CODEX_FAST_MODEL = 'gpt-5.6-luna'
export const CHATGPT_CREDENTIAL_SCOPE_ENV = 'OPENAI_CHATGPT_CREDENTIAL_SCOPE'

/**
 * Public/OpenAI-compatible endpoint settings that must never leak into the
 * ChatGPT subscription transport. ChatGPT OAuth uses the Codex backend's
 * account catalog and request contract; API keys, custom endpoints, public
 * model aliases, and public-API tuning fields belong to a different protocol.
 */
export const CHATGPT_CODEX_INCOMPATIBLE_OPENAI_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_DEFAULT_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL_DESCRIPTION',
  'OPENAI_DEFAULT_HAIKU_MODEL_NAME',
  'OPENAI_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL_DESCRIPTION',
  'OPENAI_DEFAULT_SONNET_MODEL_NAME',
  'OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL_DESCRIPTION',
  'OPENAI_DEFAULT_OPUS_MODEL_NAME',
  'OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'OPENAI_SMALL_FAST_MODEL',
  'OPENAI_ENABLE_THINKING',
  'OPENAI_MAX_TOKENS',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
] as const

/**
 * Resolve the connection-scoped ChatGPT credential selected for this runtime.
 * `default` and an unset value both address the unsuffixed credential file.
 */
export function getChatGPTCredentialScope(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const scope = env[CHATGPT_CREDENTIAL_SCOPE_ENV]?.trim()
  return scope && scope !== 'default' ? scope : undefined
}

const CHATGPT_CODEX_EFFORTS_TO_XHIGH = [
  'low',
  'medium',
  'high',
  'xhigh',
] as const satisfies readonly ChatGPTCodexEffortLevel[]

const CHATGPT_CODEX_EFFORTS_TO_MAX = [
  ...CHATGPT_CODEX_EFFORTS_TO_XHIGH,
  'max',
] as const satisfies readonly ChatGPTCodexEffortLevel[]

/**
 * Curated ChatGPT-authenticated Codex roster.
 *
 * `contextWindow` mirrors the Codex product catalog's `context_window`, not
 * the larger context window that the similarly named public API model may
 * advertise. `maxContextWindow` mirrors the catalog's explicit opt-in cap.
 */
export const CHATGPT_CODEX_MODEL_OPTIONS: ChatGPTCodexModelOption[] = [
  {
    value: 'gpt-5.6-sol',
    label: 'GPT 5.6 Sol',
    description: 'Latest frontier agentic coding model',
    defaultEffortLevel: 'low',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_MAX,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    useResponsesLite: true,
    visibility: 'list',
    priority: 1,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
    supportsUltra: true,
    multiAgentVersion: 'v2',
  },
  {
    value: 'gpt-5.6-terra',
    label: 'GPT 5.6 Terra',
    description: 'Balanced agentic coding model for everyday work',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_MAX,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    useResponsesLite: true,
    visibility: 'list',
    priority: 2,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
    supportsUltra: true,
    multiAgentVersion: 'v2',
  },
  {
    value: 'gpt-5.6-luna',
    label: 'GPT 5.6 Luna',
    description: 'Fast and affordable agentic coding model',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_MAX,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    useResponsesLite: true,
    visibility: 'list',
    priority: 3,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
    multiAgentVersion: 'v1',
  },
  {
    value: 'gpt-5.5',
    label: 'GPT 5.5',
    description:
      'Frontier model for complex coding, research, and real-world work',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    visibility: 'list',
    priority: 7,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
  },
  {
    value: 'gpt-5.4',
    label: 'GPT 5.4',
    description: 'Strong model for everyday coding',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 272_000,
    maxContextWindow: 1_000_000,
    visibility: 'hide',
    priority: 16,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
    upgradeModel: 'gpt-5.6-terra',
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    description:
      'Small, fast, and cost-efficient model for simpler coding tasks',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    visibility: 'hide',
    priority: 23,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'medium',
    upgradeModel: 'gpt-5.6-luna',
  },
  {
    value: 'gpt-5.3-codex-spark',
    label: 'GPT 5.3 Codex Spark',
    description: 'Ultra-fast text-only coding model',
    defaultEffortLevel: 'high',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 128_000,
    maxContextWindow: 128_000,
    visibility: 'list',
    priority: 26,
    supportedInApi: false,
    inputModalities: ['text'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
  },
  {
    value: 'gpt-5.2',
    label: 'GPT 5.2',
    description: 'Optimized for professional work and long-running agents',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 272_000,
    maxContextWindow: 272_000,
    effectiveContextWindowPercent: 95,
    visibility: 'list',
    priority: 29,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
    supportsReasoningSummaryParameter: true,
    defaultReasoningSummary: 'auto',
  },
  {
    value: 'codex-auto-review',
    label: 'Codex Auto Review',
    description: 'Automatic approval review model for Codex',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: CHATGPT_CODEX_EFFORTS_TO_XHIGH,
    contextWindow: 272_000,
    maxContextWindow: 1_000_000,
    visibility: 'hide',
    priority: 43,
    supportedInApi: true,
    inputModalities: ['text', 'image'],
    supportsParallelToolCalls: true,
    defaultVerbosity: 'low',
  },
]

const remoteChatGPTCodexModelOptions = new Map<
  string,
  readonly ChatGPTCodexModelOption[]
>()

function credentialScopeKey(credentialScope?: string): string {
  return credentialScope?.trim() || 'default'
}

/**
 * Replace the fallback catalog with an account-scoped Codex catalog.
 * The official client treats a non-empty remote catalog containing at least
 * one picker-visible model as authoritative for ChatGPT authentication.
 */
export function setRemoteChatGPTCodexModelOptions(
  options: readonly ChatGPTCodexModelOption[] | undefined,
  credentialScope?: string,
): void {
  const scope = credentialScopeKey(credentialScope)
  if (options?.some(option => option.visibility === 'list') === true) {
    remoteChatGPTCodexModelOptions.set(
      scope,
      [...options].sort((a, b) => a.priority - b.priority),
    )
  } else {
    remoteChatGPTCodexModelOptions.delete(scope)
  }
}

/** Active account-scoped catalog, with the bundled roster as offline fallback. */
export function getChatGPTCodexModelOptions(
  credentialScope?: string,
): readonly ChatGPTCodexModelOption[] {
  return (
    remoteChatGPTCodexModelOptions.get(credentialScopeKey(credentialScope)) ??
    CHATGPT_CODEX_MODEL_OPTIONS
  )
}

/**
 * Account-authoritative default: the first picker-visible remote model by
 * server priority. The bundled Sol value is only an offline fallback.
 */
export function getChatGPTCodexDefaultModel(credentialScope?: string): string {
  return (
    getChatGPTCodexModelOptions(credentialScope).find(
      option => option.visibility === 'list',
    )?.value ?? CHATGPT_CODEX_DEFAULT_MODEL
  )
}

/**
 * Prefer the current low-latency Luna model when the account advertises it;
 * otherwise fall back to that account's authoritative default instead of
 * sending a model that may be hidden or unavailable.
 */
export function getChatGPTCodexFastModel(credentialScope?: string): string {
  const visible = getChatGPTCodexModelOptions(credentialScope).filter(
    option => option.visibility === 'list',
  )
  return (
    visible.find(option => option.value === CHATGPT_CODEX_FAST_MODEL)?.value ??
    visible[0]?.value ??
    CHATGPT_CODEX_FAST_MODEL
  )
}

/** Clear every account-scoped remote catalog (used by tests and logout). */
export function clearRemoteChatGPTCodexModelOptions(): void {
  remoteChatGPTCodexModelOptions.clear()
}

const CHATGPT_CODEX_MODEL_ALIASES: Record<string, string> = {
  'gpt-5.6': 'gpt-5.6-sol',
}

function getChatGPTCodexModelOption(
  model: string,
  credentialScope?: string,
): ChatGPTCodexModelOption | undefined {
  const base = model
    .trim()
    .replace(/\[1m\]$/i, '')
    .toLowerCase()
  const canonical = CHATGPT_CODEX_MODEL_ALIASES[base] ?? base
  return getChatGPTCodexModelOptions(credentialScope).find(
    option => option.value.toLowerCase() === canonical,
  )
}

/** Codex's default reasoning effort for a known model or alias. */
export function getChatGPTCodexDefaultEffortLevel(
  model: string,
  credentialScope?: string,
): ChatGPTCodexEffortLevel | undefined {
  return getChatGPTCodexModelOption(model, credentialScope)?.defaultEffortLevel
}

/** Supported Codex reasoning efforts for a known model or alias. */
export function getChatGPTCodexSupportedEffortLevels(
  model: string,
  credentialScope?: string,
): readonly ChatGPTCodexEffortLevel[] | undefined {
  return getChatGPTCodexModelOption(model, credentialScope)
    ?.supportedEffortLevels
}

/** Whether a known Codex model accepts the requested reasoning effort. */
export function chatGPTCodexModelSupportsEffortLevel(
  model: string,
  level: ChatGPTCodexEffortLevel,
  credentialScope?: string,
): boolean {
  return (
    getChatGPTCodexModelOption(
      model,
      credentialScope,
    )?.supportedEffortLevels.includes(level) ?? false
  )
}

/** Whether a known Codex model uses the ChatGPT Responses Lite contract. */
export function chatGPTCodexModelUsesResponsesLite(
  model: string,
  credentialScope?: string,
): boolean {
  return (
    getChatGPTCodexModelOption(model, credentialScope)?.useResponsesLite ??
    false
  )
}

/** Whether a model accepts image inputs (unknown legacy models default to yes). */
export function chatGPTCodexModelSupportsImages(
  model: string,
  credentialScope?: string,
): boolean {
  return (
    getChatGPTCodexModelOption(
      model,
      credentialScope,
    )?.inputModalities.includes('image') ?? true
  )
}

/** Whether a model supports parallel tool calls (unknown models default false). */
export function chatGPTCodexModelSupportsParallelToolCalls(
  model: string,
  credentialScope?: string,
): boolean {
  return (
    getChatGPTCodexModelOption(model, credentialScope)
      ?.supportsParallelToolCalls ?? false
  )
}

/** Default text verbosity advertised by the Codex model catalog. */
export function getChatGPTCodexModelDefaultVerbosity(
  model: string,
  credentialScope?: string,
): ChatGPTCodexVerbosity | undefined {
  return getChatGPTCodexModelOption(model, credentialScope)?.defaultVerbosity
}

/** Whether Codex exposes product-level Ultra for this model. */
export function chatGPTCodexModelSupportsUltra(
  model: string,
  credentialScope?: string,
): boolean {
  return (
    getChatGPTCodexModelOption(model, credentialScope)?.supportsUltra ?? false
  )
}

/** Default Codex product context window for a known model or alias. */
export function getChatGPTCodexModelContextWindow(
  model: string,
  credentialScope?: string,
): number | undefined {
  return getChatGPTCodexModelOption(model, credentialScope)?.contextWindow
}

/** Effective hard context limit used by the official Codex turn runtime. */
export function getChatGPTCodexModelEffectiveContextWindow(
  model: string,
  credentialScope?: string,
): number | undefined {
  const option = getChatGPTCodexModelOption(model, credentialScope)
  if (!option) return undefined
  const rawWindow =
    /\[1m\]$/i.test(model.trim()) && option.maxContextWindow >= 1_000_000
      ? option.maxContextWindow
      : option.contextWindow
  const percent = Math.min(
    100,
    Math.max(1, option.effectiveContextWindowPercent ?? 95),
  )
  return Math.floor((rawWindow * percent) / 100)
}

/** Official Codex auto-compact limit (explicit catalog cap or 90% fallback). */
export function getChatGPTCodexModelAutoCompactTokenLimit(
  model: string,
  credentialScope?: string,
): number | undefined {
  const option = getChatGPTCodexModelOption(model, credentialScope)
  if (!option) return undefined
  const rawWindow =
    /\[1m\]$/i.test(model.trim()) && option.maxContextWindow >= 1_000_000
      ? option.maxContextWindow
      : option.contextWindow
  const fallbackLimit = Math.floor((rawWindow * 9) / 10)
  return option.autoCompactTokenLimit === undefined
    ? fallbackLimit
    : Math.min(option.autoCompactTokenLimit, fallbackLimit)
}

/** Maximum explicitly selectable Codex context window for a known model. */
export function getChatGPTCodexModelMaxContextWindow(
  model: string,
  credentialScope?: string,
): number | undefined {
  return getChatGPTCodexModelOption(model, credentialScope)?.maxContextWindow
}

/** Reasoning-summary mode the official Codex request sends for this model. */
export function getChatGPTCodexModelReasoningSummary(
  model: string,
  credentialScope?: string,
): Exclude<ChatGPTCodexReasoningSummary, 'none'> | undefined {
  const option = getChatGPTCodexModelOption(model, credentialScope)
  if (!option?.supportsReasoningSummaryParameter) return undefined
  const summary = option.defaultReasoningSummary
  return summary && summary !== 'none' ? summary : undefined
}

/** Whether the current subscription may select a known Codex model. */
export function isChatGPTCodexModelAvailable(
  model: string,
  _plan: string | null | undefined,
  credentialScope?: string,
): boolean {
  // The authenticated /codex/models response is already account-scoped. The
  // official client trusts its visibility instead of reproducing plan policy
  // locally from the optional available_in_plans metadata.
  return getChatGPTCodexModelOption(model, credentialScope) !== undefined
}

/** Whether a recognized model belongs in the current account's picker. */
export function isChatGPTCodexModelVisible(
  model: string,
  plan: string | null | undefined,
  credentialScope?: string,
): boolean {
  const option = getChatGPTCodexModelOption(model, credentialScope)
  return (
    option?.visibility === 'list' &&
    isChatGPTCodexModelAvailable(model, plan, credentialScope)
  )
}

/** Whether a recognized roster model is gated for the current plan. */
export function isChatGPTCodexModelUnavailable(
  model: string,
  plan: string | null | undefined,
  credentialScope?: string,
): boolean {
  return (
    isChatGPTCodexModel(model, credentialScope) &&
    !isChatGPTCodexModelAvailable(model, plan, credentialScope)
  )
}

/** Compact, precise context-window label for model pickers. */
export function formatChatGPTCodexContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(2))}M`
  }
  if (tokens >= 1_000) {
    return `${Number((tokens / 1_000).toFixed(1))}K`
  }
  return String(tokens)
}

/**
 * Resolve the effective ChatGPT Codex context window.
 *
 * The account-scoped Codex catalog is already plan-aware, so a known model's
 * advertised window is authoritative. Plan-level sizes remain a fallback for
 * unknown/legacy model ids only.
 */
export function getChatGPTCodexContextWindow(
  plan: string | null | undefined,
  model?: string,
  credentialScope?: string,
): number | undefined {
  const planWindow = plan
    ? REASONING_CODEX_WINDOWS[plan.toLowerCase().trim()]
    : undefined
  const modelWindow = model
    ? getChatGPTCodexModelEffectiveContextWindow(model, credentialScope)
    : undefined

  return modelWindow ?? planWindow
}

export function isChatGPTAuthMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.OPENAI_AUTH_MODE === 'chatgpt'
}

/**
 * Returns a human-readable display label for a ChatGPT Codex model ID, or null
 * if the model is not recognized. The optional `[1m]` suffix is only reflected
 * when the product catalog advertises a 1M opt-in for that model.
 */
export function getChatGPTCodexModelDisplayName(
  model: string,
  credentialScope?: string,
): string | null {
  const option = getChatGPTCodexModelOption(model, credentialScope)
  if (!option) return null
  const hasSupported1m =
    /\[1m\]$/i.test(model.trim()) && option.maxContextWindow >= 1_000_000
  return hasSupported1m ? `${option.label} (1M context)` : option.label
}

export function isChatGPTCodexReasoningModel(
  model: string,
  credentialScope?: string,
): boolean {
  return isChatGPTCodexModel(model, credentialScope)
}

/** Whether an ID is part of the curated Codex roster, regardless of plan. */
export function isChatGPTCodexModel(
  model: string,
  credentialScope?: string,
): boolean {
  return getChatGPTCodexModelOption(model, credentialScope) !== undefined
}
