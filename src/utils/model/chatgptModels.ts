export type ChatGPTCodexModelOption = {
  value: string
  label: string
  description: string
  /** Default Codex product context window, in tokens. */
  contextWindow: number
  /** Largest context window Codex currently advertises for explicit opt-in. */
  maxContextWindow: number
  /** Subscription required for a gated preview model. */
  requiredPlan?: 'pro'
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
    label: 'GPT-5.6-Sol',
    description: 'Latest frontier agentic coding model',
    contextWindow: 372_000,
    maxContextWindow: 372_000,
  },
  {
    value: 'gpt-5.6-terra',
    label: 'GPT-5.6-Terra',
    description: 'Balanced agentic coding model for everyday work',
    contextWindow: 372_000,
    maxContextWindow: 372_000,
  },
  {
    value: 'gpt-5.6-luna',
    label: 'GPT-5.6-Luna',
    description: 'Fast and affordable agentic coding model',
    contextWindow: 372_000,
    maxContextWindow: 372_000,
  },
  {
    value: 'gpt-5.5',
    label: 'GPT-5.5',
    description:
      'Frontier model for complex coding, research, and real-world work',
    contextWindow: 272_000,
    maxContextWindow: 272_000,
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Strong model for everyday coding',
    contextWindow: 272_000,
    maxContextWindow: 1_000_000,
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4-Mini',
    description:
      'Small, fast, and cost-efficient model for simpler coding tasks',
    contextWindow: 272_000,
    maxContextWindow: 272_000,
  },
  {
    value: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3-Codex-Spark',
    description:
      'Ultra-fast text-only coding model (ChatGPT Pro research preview)',
    contextWindow: 128_000,
    maxContextWindow: 128_000,
    requiredPlan: 'pro',
  },
]

const CHATGPT_CODEX_MODEL_ALIASES: Record<string, string> = {
  'gpt-5.6': 'gpt-5.6-sol',
}

function getChatGPTCodexModelOption(
  model: string,
): ChatGPTCodexModelOption | undefined {
  const base = model
    .trim()
    .replace(/\[1m\]$/i, '')
    .toLowerCase()
  const canonical = CHATGPT_CODEX_MODEL_ALIASES[base] ?? base
  return CHATGPT_CODEX_MODEL_OPTIONS.find(
    option => option.value.toLowerCase() === canonical,
  )
}

/** Default Codex product context window for a known model or alias. */
export function getChatGPTCodexModelContextWindow(
  model: string,
): number | undefined {
  return getChatGPTCodexModelOption(model)?.contextWindow
}

/** Maximum explicitly selectable Codex context window for a known model. */
export function getChatGPTCodexModelMaxContextWindow(
  model: string,
): number | undefined {
  return getChatGPTCodexModelOption(model)?.maxContextWindow
}

/** Whether the current subscription may select a known Codex model. */
export function isChatGPTCodexModelAvailable(
  model: string,
  plan: string | null | undefined,
): boolean {
  const option = getChatGPTCodexModelOption(model)
  if (!option) return false
  if (!option.requiredPlan) return true
  return plan?.trim().toLowerCase() === option.requiredPlan
}

/** Whether a recognized roster model is gated for the current plan. */
export function isChatGPTCodexModelUnavailable(
  model: string,
  plan: string | null | undefined,
): boolean {
  return (
    isChatGPTCodexModel(model) && !isChatGPTCodexModelAvailable(model, plan)
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
 * A known subscription tier caps the model-specific product window. If only
 * one side is known, return that value so the caller can still make a useful
 * decision; if neither is known, return `undefined` for the existing fallback.
 */
export function getChatGPTCodexContextWindow(
  plan: string | null | undefined,
  model?: string,
): number | undefined {
  const planWindow = plan
    ? REASONING_CODEX_WINDOWS[plan.toLowerCase().trim()]
    : undefined
  const modelWindow = model
    ? getChatGPTCodexModelContextWindow(model)
    : undefined

  if (planWindow !== undefined && modelWindow !== undefined) {
    return Math.min(planWindow, modelWindow)
  }
  return modelWindow ?? planWindow
}

export function isChatGPTAuthMode(): boolean {
  return process.env.OPENAI_AUTH_MODE === 'chatgpt'
}

/**
 * Returns a human-readable display label for a ChatGPT Codex model ID, or null
 * if the model is not recognized. The optional `[1m]` suffix is only reflected
 * when the product catalog advertises a 1M opt-in for that model.
 */
export function getChatGPTCodexModelDisplayName(model: string): string | null {
  const option = getChatGPTCodexModelOption(model)
  if (!option) return null
  const hasSupported1m =
    /\[1m\]$/i.test(model.trim()) && option.maxContextWindow >= 1_000_000
  return hasSupported1m ? `${option.label} (1M context)` : option.label
}

export function isChatGPTCodexReasoningModel(model: string): boolean {
  return isChatGPTCodexModel(model)
}

/** Whether an ID is part of the curated Codex roster, regardless of plan. */
export function isChatGPTCodexModel(model: string): boolean {
  return getChatGPTCodexModelOption(model) !== undefined
}
