export type ChatGPTCodexModelOption = {
  value: string
  label: string
  description: string
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

/** Reasoning/coding tier context windows by plan (the integration default). */
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

/**
 * Resolve a ChatGPT Codex context window from the current subscription plan.
 * Plan strings are matched case-insensitively. Unknown or missing plans return
 * `undefined` so the existing fallback logic can apply.
 */
export function getChatGPTCodexContextWindow(
  plan: string | null | undefined,
): number | undefined {
  if (!plan) return undefined
  const key = plan.toLowerCase().trim()
  return REASONING_CODEX_WINDOWS[key]
}

export const CHATGPT_CODEX_DEFAULT_MODEL = 'gpt-5.5'
export const CHATGPT_CODEX_FAST_MODEL = 'gpt-5.4-mini'

export const CHATGPT_CODEX_MODEL_OPTIONS: ChatGPTCodexModelOption[] = [
  {
    value: 'gpt-5.5',
    label: 'GPT-5.5',
    description:
      'Frontier model for complex coding, research, and real-world work',
  },
  {
    value: 'gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    description:
      'Smarter, more precise responses for the most demanding reasoning tasks',
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Strong model for everyday coding',
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4-Mini',
    description:
      'Small, fast, and cost-efficient model for simpler coding tasks',
  },
  {
    value: 'gpt-5.4-nano',
    label: 'GPT-5.4-Nano',
    description:
      'Ultra-low-latency, lowest-cost model for classification, extraction, and high-volume subagents',
  },
  {
    value: 'gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description: 'Coding-optimized model',
  },
  {
    value: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3-Codex-Spark',
    description: 'Ultra-fast coding model',
  },
  {
    value: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'Optimized for professional work and long-running agents',
  },
]

export function isChatGPTAuthMode(): boolean {
  return process.env.OPENAI_AUTH_MODE === 'chatgpt'
}

/**
 * Returns a human-readable display label for a ChatGPT Codex model ID, or null
 * if the model is not recognized. Strips optional `[1m]` suffix before lookup
 * and appends `(1M context)` to the label when the suffix is present.
 */
export function getChatGPTCodexModelDisplayName(model: string): string | null {
  const base = model.replace(/\[1m\]$/i, '')
  const option = CHATGPT_CODEX_MODEL_OPTIONS.find(o => o.value === base)
  if (!option) return null
  const has1m = /\[1m\]$/i.test(model)
  return has1m ? `${option.label} (1M context)` : option.label
}

export function isChatGPTCodexReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase().replace(/\[1m\]$/, '')
  return CHATGPT_CODEX_MODEL_OPTIONS.some(
    option => option.value.toLowerCase() === normalized,
  )
}
