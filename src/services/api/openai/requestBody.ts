/**
 * Pure utility functions for building OpenAI request bodies and detecting
 * thinking mode. Extracted from index.ts so tests can import them without
 * triggering heavy module side-effects (OpenAI client, stream adapter, etc.).
 */
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions/completions.mjs'
import { isEnvTruthy, isEnvDefinedFalsy } from '../../../utils/envUtils.js'

export type OpenAICompatibleChatCompletionRequest = Omit<
  ChatCompletionCreateParamsStreaming,
  'reasoning_effort'
> & {
  thinking?: { type: string }
  enable_thinking?: boolean
  chat_template_kwargs?: { thinking: boolean; enable_thinking: boolean }
  /** Third-party endpoints may accept extensions beyond the OpenAI SDK union. */
  reasoning_effort?: string
  /** DeepSeek V4 extension: cap reasoning separately from total output. */
  thinking_token_budget?: number
}

const DEEPSEEK_V4_MAX_DEFAULT_THINKING_TOKEN_BUDGET = 64_000
const DEEPSEEK_V4_MIN_BUDGETED_OUTPUT_TOKENS = 2_048
const DEEPSEEK_V4_THINKING_TEMPERATURE = 1
const DEEPSEEK_V4_SAMPLING_MODEL =
  /(?:^|[/:])deepseek-v4-(?:flash|pro)(?=$|[/:@-])/i

/**
 * Sampling policy is intentionally narrower than effort compatibility.
 * Legacy deepseek-chat / deepseek-reasoner aliases may still point at V3 or
 * R1 on self-hosted endpoints, while canonical V4 derivatives commonly add a
 * deployment suffix such as -DSpark or -Abliterated.
 */
export function usesDeepSeekV4RecommendedSampling(model: string): boolean {
  return DEEPSEEK_V4_SAMPLING_MODEL.test(model)
}

/**
 * Resolve the temperature sent on the wire.
 *
 * Most reasoning APIs own their sampling policy and ignore temperature, so
 * the existing behavior remains to omit it while thinking. DeepSeek V4's
 * self-hosted vLLM path is different: it honors the request value, and greedy
 * decoding can collapse into repeated final-answer loops. Its published model
 * generation config uses sampling with temperature=1.0, so enforce that safe
 * default unless a caller explicitly overrides it.
 */
export function resolveOpenAIRequestTemperature(params: {
  enableThinking: boolean
  isDeepSeekV4: boolean
  temperatureOverride?: number
}): number | undefined {
  const { enableThinking, isDeepSeekV4, temperatureOverride } = params
  if (!enableThinking) return temperatureOverride
  if (!isDeepSeekV4) return undefined
  return temperatureOverride ?? DEEPSEEK_V4_THINKING_TEMPERATURE
}

/**
 * Bound DeepSeek V4's reasoning phase while reserving room for final text or
 * a tool call. Without a separate budget, `reasoning_effort=max` can consume
 * the entire total-output limit and return no user-visible answer.
 *
 * OPENAI_THINKING_TOKEN_BUDGET=-1 explicitly restores the endpoint's
 * unlimited-thinking behavior. Positive integer overrides are passed through.
 */
export function resolveOpenAIThinkingTokenBudget(params: {
  enableThinking: boolean
  isDeepSeekV4: boolean
  maxTokens: number
  maxThinkingTokens?: number
  env?: Record<string, string | undefined>
}): number | undefined {
  const {
    enableThinking,
    isDeepSeekV4,
    maxTokens,
    maxThinkingTokens = DEEPSEEK_V4_MAX_DEFAULT_THINKING_TOKEN_BUDGET,
    env = process.env,
  } = params
  if (!enableThinking || !isDeepSeekV4) return undefined

  const rawOverride = env.OPENAI_THINKING_TOKEN_BUDGET?.trim()
  if (rawOverride) {
    const parsed = Number(rawOverride)
    if (parsed === -1) return -1
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, maxThinkingTokens, maxTokens)
    }
  }

  if (maxTokens < DEEPSEEK_V4_MIN_BUDGETED_OUTPUT_TOKENS) return undefined
  return Math.min(maxThinkingTokens, Math.floor(maxTokens / 2))
}

/**
 * Whether the endpoint/model recognizes the thinking-control request fields
 * (`thinking` / `enable_thinking` / `chat_template_kwargs`), i.e. whether an
 * explicit thinking-disable payload can be sent without tripping a strict
 * endpoint's unknown-field validation. Unlike isOpenAIThinkingEnabled, an
 * explicit OPENAI_ENABLE_THINKING=0 does NOT remove the capability — the
 * endpoint still understands the fields, the user just wants thinking off.
 */
export function openAICompatSupportsThinkingControl(
  model: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isEnvTruthy(env.OPENAI_ENABLE_THINKING)) return true
  const modelLower = model.toLowerCase()
  return modelLower.includes('deepseek') || modelLower.includes('mimo')
}

/**
 * Detect whether thinking mode should be enabled for this model.
 *
 * Enabled when:
 * 1. OPENAI_ENABLE_THINKING=1 is set (explicit enable), OR
 * 2. Model name contains "deepseek" or "mimo" (auto-detect, case-insensitive)
 *
 * Disabled when:
 * - OPENAI_ENABLE_THINKING=0/false/no/off is explicitly set (overrides model detection)
 *
 * @param model - The resolved OpenAI model name
 */
export function isOpenAIThinkingEnabled(
  model: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  // Explicit disable takes priority (overrides model auto-detect)
  if (isEnvDefinedFalsy(env.OPENAI_ENABLE_THINKING)) return false
  // Explicit enable, or auto-detect from model name (DeepSeek and MiMo models
  // support thinking mode). Grok is intentionally excluded — Grok reasoning
  // models reason automatically and do NOT require thinking/enable_thinking
  // request body parameters.
  return openAICompatSupportsThinkingControl(model, env)
}

/**
 * Resolve max output tokens for the OpenAI-compatible path.
 *
 * Override priority:
 * 1. maxOutputTokensOverride (programmatic, from query pipeline)
 * 2. OPENAI_MAX_TOKENS env var (OpenAI-specific, useful for local models
 *    with small context windows, e.g. RTX 3060 12GB running 65536-token models)
 * 3. CLAUDE_CODE_MAX_OUTPUT_TOKENS env var (generic override)
 * 4. provider default supplied by the caller
 */
export function resolveOpenAIMaxTokens(
  providerDefault: number,
  maxOutputTokensOverride?: number,
  env: Record<string, string | undefined> = process.env,
): number {
  return (
    maxOutputTokensOverride ??
    (env.OPENAI_MAX_TOKENS
      ? parseInt(env.OPENAI_MAX_TOKENS, 10) || undefined
      : undefined) ??
    (env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
      ? parseInt(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, 10) || undefined
      : undefined) ??
    providerDefault
  )
}

/**
 * Build the request body for OpenAI chat.completions.create().
 * Extracted for testability — the thinking mode params are injected here.
 *
 * Three thinking-mode formats are sent simultaneously; each endpoint uses the
 * format it recognizes and ignores the others:
 * - Official DeepSeek API:    `thinking: { type: 'enabled' }`
 * - Self-hosted DeepSeek:     `enable_thinking: true` + `chat_template_kwargs: { thinking: true }`
 * - MiMo (Xiaomi):            `chat_template_kwargs: { enable_thinking: true }`
 * OpenAI SDK passes unknown keys through to the HTTP body.
 */
export function buildOpenAIRequestBody(params: {
  model: string
  messages: any[]
  tools: any[]
  toolChoice: any
  enableThinking: boolean
  maxTokens: number
  temperatureOverride?: number
  /** Whether DeepSeek V4's reasoning-mode sampling contract applies. */
  isDeepSeekV4?: boolean
  /**
   * OpenAI-compatible `reasoning_effort` string. The resolver normally emits
   * low/medium/high, but explicit passthrough profiles may carry endpoint-
   * specific extensions such as max. Only sent when defined.
   */
  reasoningEffort?: string
  /** DeepSeek V4 extension; undefined omits the field for other endpoints. */
  thinkingTokenBudget?: number
}): OpenAICompatibleChatCompletionRequest {
  const {
    model,
    messages,
    tools,
    toolChoice,
    enableThinking,
    maxTokens,
    temperatureOverride,
    isDeepSeekV4 = false,
    reasoningEffort,
    thinkingTokenBudget,
  } = params
  const requestTemperature = resolveOpenAIRequestTemperature({
    enableThinking,
    isDeepSeekV4,
    temperatureOverride,
  })
  return {
    model,
    messages,
    max_tokens: maxTokens,
    ...(tools.length > 0 && {
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
    }),
    stream: true,
    stream_options: { include_usage: true },
    // Reasoning effort for endpoints that support it (o-series, DeepSeek,
    // GLM…). Undefined = field omitted entirely.
    ...(reasoningEffort !== undefined && {
      reasoning_effort: reasoningEffort,
    }),
    ...(thinkingTokenBudget !== undefined && {
      thinking_token_budget: thinkingTokenBudget,
    }),
    // Enable chain-of-thought output for DeepSeek and MiMo models. Hosted APIs
    // may own the sampling policy, while self-hosted DeepSeek V4 still honors
    // the explicit temperature resolved above.
    ...(enableThinking && {
      // Official DeepSeek API format
      thinking: { type: 'enabled' },
      // Self-hosted DeepSeek-V3.2 format
      enable_thinking: true,
      // Both DeepSeek self-hosted and MiMo formats in chat_template_kwargs
      chat_template_kwargs: { thinking: true, enable_thinking: true },
    }),
    ...(requestTemperature !== undefined && {
      temperature: requestTemperature,
    }),
  }
}
