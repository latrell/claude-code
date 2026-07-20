import type Anthropic from '@anthropic-ai/sdk'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages.js'
import { randomUUID } from 'crypto'
import {
  getLastApiCompletionTimestamp,
  getSessionId,
  setLastApiCompletionTimestamp,
} from '../bootstrap/state.js'
import { STRUCTURED_OUTPUTS_BETA_HEADER } from '../constants/betas.js'
import type { QuerySource } from '../constants/querySource.js'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../constants/system.js'
import { logEvent } from '../services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/metadata.js'
import { getAPIMetadata } from '../services/api/claude.js'
import { getAnthropicClient } from '../services/api/client.js'
import {
  createTrace,
  createChildSpan,
  endTrace,
  recordLLMObservation,
} from '../services/langfuse/index.js'
import type { LangfuseSpan } from '../services/langfuse/index.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../services/langfuse/convert.js'
import { getModelBetas, modelSupportsStructuredOutputs } from './betas.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { getAPIProvider } from './model/providers.js'
import { getProxyFetchOptions } from './proxy.js'
import { normalizeModelStringForAPI } from './model/model.js'
import { getChatGPTCredentialScope } from './model/chatgptModels.js'
import { getOpenAIClient } from '../services/api/openai/client.js'
import { openAICompatSupportsThinkingControl } from '../services/api/openai/requestBody.js'
import { getGrokClient } from '../services/api/grok/client.js'
import { isChatGPTAuthEnabled } from '../services/api/openai/chatgptAuth.js'
import { fetchChatGPTCodexModels } from '../services/api/openai/codexModels.js'
import { resolveChatGPTResponsesReasoningEffort } from '../services/api/openai/reasoningEffort.js'
import { resolveOpenAICompatibleReasoningEffort } from '../services/connections/effortTransport.js'
import {
  mapThinkingEffortToEffortValue,
  resolveQueryThinkingEffort,
  resolveQueryThinkingEffortTransport,
} from '../services/connections/thinkingEffort.js'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  createChatGPTResponsesStream,
  type ChatGPTCodexTurnSession,
} from '../services/api/openai/responsesAdapter.js'
import { MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS } from '../services/api/openai/serverContinuation.js'
import {
  startStreamEagerly,
  withCompatRetry,
} from '../services/api/compatRetry.js'
import {
  guardProviderStreamCancellation,
  type ProviderStreamGuardOptions,
  waitForProviderAbortSettlement,
} from '../services/api/providerCancellation.js'
import { resolveCursorCredentials } from '../services/api/cursor/auth.js'
import {
  resolveReasoningEffort,
  streamCursorChat,
} from '../services/api/cursor/client.js'
import { adaptCursorFramesToAnthropic } from '../services/api/cursor/streamAdapter.js'
import {
  convertOpenAIMessagesToCursor,
  type OpenAIMessage,
} from '../services/api/cursor/translator.js'
import type { CursorTool } from '../services/api/cursor/protobufSchema.js'
import {
  anthropicMessagesToOpenAI,
  resolveOpenAIModel,
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
  resolveGrokModel,
  resolveGeminiModel,
  anthropicToolsToGemini,
  anthropicToolChoiceToGemini,
  resolveCursorModel,
} from '@ant/model-provider'
import type { ProviderRuntimeConfig } from './model/subagentProvider.js'
import type { SystemPrompt } from './systemPromptType.js'
import { isKnownAdaptiveThinkingModel } from './thinking.js'

type MessageParam = Anthropic.MessageParam
type TextBlockParam = Anthropic.TextBlockParam
type Tool = Anthropic.Tool
type ToolChoice = Anthropic.ToolChoice
type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type BetaJSONOutputFormat = Anthropic.Beta.Messages.BetaJSONOutputFormat
type BetaThinkingConfigParam = Anthropic.Beta.Messages.BetaThinkingConfigParam

export type SideQueryOptions = {
  /** Model to use for the query */
  model: string
  /**
   * System prompt - string or array of text blocks (will be prefixed with CLI attribution).
   *
   * The attribution header is always placed in its own TextBlockParam block to ensure
   * server-side parsing correctly extracts the cc_entrypoint value without including
   * system prompt content.
   */
  system?: string | TextBlockParam[]
  /** Messages to send (supports cache_control on content blocks) */
  messages: MessageParam[]
  /** Optional tools (supports both standard Tool[] and BetaToolUnion[] for custom tool types) */
  tools?: Tool[] | BetaToolUnion[]
  /** Optional tool choice (use { type: 'tool', name: 'x' } for forced output) */
  tool_choice?: ToolChoice
  /** Optional JSON output format for structured responses */
  output_format?: BetaJSONOutputFormat
  /** Max tokens (default: 1024) */
  max_tokens?: number
  /** Max retries (default: 2) */
  maxRetries?: number
  /** Abort signal */
  signal?: AbortSignal
  /** Skip CLI system prompt prefix (keeps attribution header for OAuth). For internal classifiers that provide their own prompt. */
  skipSystemPromptPrefix?: boolean
  /** Temperature override */
  temperature?: number
  /** Thinking budget (enables thinking), or `false` to send `{ type: 'disabled' }`. */
  thinking?: number | false
  /** Stop sequences — generation stops when any of these strings is emitted */
  stop_sequences?: string[]
  /** Attributes this call in tengu_api_success for COGS joining against reporting.sampling_calls. */
  querySource: QuerySource
  /**
   * Scoped provider runtime (fast slot / --fast-provider): overrides the
   * provider routing, credentials env and (for ChatGPT) the credentialScope.
   * When set, `env` is used as a whole in place of process.env for
   * provider-scoped reads — same semantics as queryModelOpenAI/Gemini/Grok.
   */
  providerRuntimeConfig?: ProviderRuntimeConfig
  /** Parent Langfuse span to nest this side query under the main agent trace. */
  parentSpan?: LangfuseSpan | null
  /** When true, API failures are recorded as WARNING instead of ERROR in Langfuse.
   *  Use for optional/best-effort queries where failure is expected and handled gracefully. */
  optional?: boolean
}

/**
 * Extract system prompt text from the `system` option.
 */
function extractSystemText(system?: string | TextBlockParam[]): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system
    .filter((b): b is { type: 'text'; text: string } => 'text' in b && !!b.text)
    .map(b => b.text)
    .join('\n\n')
}

/**
 * Convert Anthropic MessageParam[] to a list of {role, content} objects
 * suitable for OpenAI-compatible chat.completions APIs.
 */
function messageParamsToOpenAIRoleContent(
  messages: MessageParam[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              )
              .map(b => b.text)
              .join('\n')
          : ''
    if (text) {
      result.push({ role: m.role as 'user' | 'assistant', content: text })
    }
  }
  return result
}

/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization (strips [1m] suffix for API)
 * - Third-party provider routing (OpenAI, Grok, Gemini)
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
export async function sideQuery(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences,
  } = opts

  const provider = opts.providerRuntimeConfig?.provider ?? getAPIProvider()
  if (provider === 'openai' || provider === 'grok') {
    return sideQueryViaOpenAICompatible(opts)
  }
  if (provider === 'gemini') {
    return sideQueryViaGemini(opts)
  }
  if (provider === 'cursor') {
    return sideQueryViaCursor(opts)
  }

  const requestSignal = signal ?? new AbortController().signal
  const client = await waitForProviderAbortSettlement(
    getAnthropicClient({
      // Anthropic SDK retry backoff does not observe the request AbortSignal.
      // Keep SDK retries disabled and use the abort-aware retry helper below.
      maxRetries: 0,
      model,
      source: 'side_query',
      // Scoped ANTHROPIC_* credentials (fast slot with an anthropic-api
      // connection). Absent env (e.g. anthropic-oauth profile) shares the
      // main session's Anthropic credentials by design.
      envOverride: opts.providerRuntimeConfig?.env,
    }),
    requestSignal,
    `Side query ${provider} client initialization`,
  )
  // Known dark corner: getModelBetas reads main-session globals
  // (getAPIProvider/isClaudeAISubscriber) — a scoped anthropic-api runtime
  // under a subscriber main session still carries the oauth beta header.
  // Same pre-existing behaviour as the subagent runtime path.
  const betas = [...getModelBetas(model)]
  // Add structured-outputs beta if using output_format and provider supports it
  if (
    output_format &&
    modelSupportsStructuredOutputs(model) &&
    !betas.includes(STRUCTURED_OUTPUTS_BETA_HEADER)
  ) {
    betas.push(STRUCTURED_OUTPUTS_BETA_HEADER)
  }

  const attributionHeader = getAttributionHeader()

  // Build system as array to keep attribution header in its own block
  // (prevents server-side parsing from including system content in cc_entrypoint)
  const systemBlocks: TextBlockParam[] = [
    attributionHeader ? { type: 'text', text: attributionHeader } : null,
    // Skip CLI system prompt prefix for internal classifiers that provide their own prompt
    ...(skipSystemPromptPrefix
      ? []
      : [
          {
            type: 'text' as const,
            text: getCLISyspromptPrefix({
              isNonInteractive: false,
              hasAppendSystemPrompt: false,
            }),
          },
        ]),
    ...(Array.isArray(system)
      ? system
      : system
        ? [{ type: 'text' as const, text: system }]
        : []),
  ].filter((block): block is TextBlockParam => block !== null)

  let thinkingConfig: BetaThinkingConfigParam | undefined
  if (thinking === false) {
    // Adaptive-thinking models (fable-5, opus-4-6+, sonnet-4-6+) reject an
    // explicit { type: 'disabled' } with a 400 ("not supported for this
    // model. Thinking defaults to adaptive mode when not specified") — omit
    // the field for those so the server falls back to adaptive mode. This
    // kept the auto-mode classifier permanently unavailable on such models.
    thinkingConfig = isKnownAdaptiveThinkingModel(model)
      ? undefined
      : { type: 'disabled' }
  } else if (thinking !== undefined) {
    thinkingConfig = {
      type: 'enabled',
      budget_tokens: Math.min(thinking, max_tokens - 1),
    }
  }

  const normalizedModel = normalizeModelStringForAPI(model)
  const start = Date.now()
  const traceName = `side-query:${opts.querySource}`

  // When parentSpan is provided, create a child span nested under the
  // main agent trace; otherwise create a standalone root trace.
  const _ps = opts.parentSpan
  // eslint-disable-next-line no-constant-condition
  if (opts.querySource === 'auto_mode') {
    logForDebugging(
      `[sideQuery] auto_mode parentSpan=${_ps ? `id=${(_ps as unknown as Record<string, unknown>).id ?? 'present'}` : 'null/undefined'} querySource=${opts.querySource}`,
    )
  }
  // When parentSpan is provided, create a child span nested under the
  // main agent trace. For auto_mode queries, we must always nest under
  // a parent span — never create a standalone root trace (agent type),
  // as auto_mode observations should appear as spans within the parent.
  // For other query sources without a parent, create a standalone trace.
  const langfuseTrace = _ps
    ? createChildSpan(_ps, {
        name: traceName,
        sessionId: getSessionId(),
        model: normalizedModel,
        provider,
        querySource: opts.querySource,
      })
    : opts.querySource === 'auto_mode'
      ? null
      : createTrace({
          sessionId: getSessionId(),
          model: normalizedModel,
          provider,
          name: traceName,
          querySource: opts.querySource,
        })

  let response: BetaMessage
  try {
    response = await createRetriedSideQueryStream(
      innerSignal =>
        client.beta.messages.create(
          {
            model: normalizedModel,
            max_tokens,
            system: systemBlocks,
            messages,
            ...(tools && { tools }),
            ...(tool_choice && { tool_choice }),
            ...(output_format && { output_config: { format: output_format } }),
            ...(temperature !== undefined && { temperature }),
            ...(stop_sequences && { stop_sequences }),
            ...(thinkingConfig && { thinking: thinkingConfig }),
            ...(betas.length > 0 && { betas }),
            metadata: getAPIMetadata(),
          },
          { signal: innerSignal },
        ),
      {
        signal: requestSignal,
        provider,
        maxRetries,
      },
    )
  } catch (error) {
    endTrace(
      langfuseTrace,
      { error: errorMessage(error) },
      opts.optional ? 'interrupted' : 'error',
    )
    throw error
  }

  const requestId =
    (response as { _request_id?: string | null })._request_id ?? undefined
  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      normalizedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  // Record LLM observation in Langfuse (no-op if not configured).
  // Wrap SDK types into the internal message format expected by converters.
  const wrappedInput = messages.map(m => ({
    type: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    message: { role: m.role, content: m.content },
  })) as unknown as Parameters<typeof convertMessagesToLangfuse>[0]
  const wrappedOutput = [
    {
      type: 'assistant' as const,
      message: { role: 'assistant' as const, content: response.content },
    },
  ] as unknown as Parameters<typeof convertOutputToLangfuse>[0]
  recordLLMObservation(langfuseTrace, {
    model: normalizedModel,
    provider,
    input: convertMessagesToLangfuse(
      wrappedInput,
      systemBlocks.length > 0 ? systemBlocks.map(b => b.text) : undefined,
    ),
    output: convertOutputToLangfuse(wrappedOutput),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? undefined,
      cache_read_input_tokens:
        response.usage.cache_read_input_tokens ?? undefined,
    },
    startTime: new Date(start),
    endTime: new Date(),
    ...(tools && { tools: convertToolsToLangfuse(tools as unknown[]) }),
    ...(thinkingConfig &&
      thinkingConfig.type !== 'disabled' && {
        thinking: {
          type: thinkingConfig.type,
          ...(thinkingConfig.type === 'enabled' && {
            budgetTokens: thinkingConfig.budget_tokens,
          }),
        },
      }),
  })
  endTrace(langfuseTrace)

  return response
}

type SideQueryContentBlock = Record<string, unknown>
type SideQueryUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}
type SideQueryUsageDelta = Partial<{
  input_tokens: number | null
  output_tokens: number | null
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
}>

type ChatGPTContinuationMessage = {
  role: 'assistant'
  content: string
  responses_reasoning_items?: Array<Record<string, unknown>>
}

function toChatGPTContinuationMessage(
  response: BetaMessage,
): ChatGPTContinuationMessage {
  const text = response.content
    .filter(
      (
        block,
      ): block is Extract<BetaMessage['content'][number], { type: 'text' }> =>
        block.type === 'text',
    )
    .map(block => block.text)
    .join('')
  const reasoningItems = response.content.flatMap(block => {
    if (block.type !== 'thinking') return []
    const blockRecord = block as unknown as Record<string, unknown>
    const original = blockRecord.responses_reasoning_item as
      | Record<string, unknown>
      | undefined
    if (
      original?.type === 'reasoning' &&
      typeof original.encrypted_content === 'string'
    ) {
      return [
        {
          type: 'reasoning',
          summary: Array.isArray(original.summary) ? original.summary : [],
          ...(Array.isArray(original.content)
            ? { content: original.content }
            : {}),
          encrypted_content: original.encrypted_content,
        },
      ]
    }
    if (!block.signature) return []
    return [
      {
        type: 'reasoning',
        summary: [],
        encrypted_content: block.signature,
      },
    ]
  })
  return {
    role: 'assistant',
    content: text,
    ...(reasoningItems.length > 0
      ? { responses_reasoning_items: reasoningItems }
      : {}),
  }
}

function combineSideQueryResponses(
  responses: readonly BetaMessage[],
): BetaMessage {
  const last = responses.at(-1)
  if (!last) throw new Error('ChatGPT Codex returned no response')
  const sumUsage = (key: keyof SideQueryUsage): number =>
    responses.reduce((total, response) => {
      const value = response.usage[key]
      return total + (typeof value === 'number' ? value : 0)
    }, 0)
  return {
    ...last,
    content: responses.flatMap(response => response.content),
    usage: {
      ...last.usage,
      input_tokens: sumUsage('input_tokens'),
      output_tokens: sumUsage('output_tokens'),
      cache_creation_input_tokens: sumUsage('cache_creation_input_tokens'),
      cache_read_input_tokens: sumUsage('cache_read_input_tokens'),
    },
  } as BetaMessage
}

function parseToolInput(input: unknown): unknown {
  if (typeof input !== 'string') return input ?? {}
  if (input.trim() === '') return {}
  try {
    return JSON.parse(input) as unknown
  } catch {
    return {}
  }
}

function updateSideQueryUsage(
  usage: SideQueryUsage,
  delta: SideQueryUsageDelta,
): SideQueryUsage {
  return {
    input_tokens: delta.input_tokens ?? usage.input_tokens,
    output_tokens: delta.output_tokens ?? usage.output_tokens,
    cache_creation_input_tokens:
      delta.cache_creation_input_tokens ?? usage.cache_creation_input_tokens,
    cache_read_input_tokens:
      delta.cache_read_input_tokens ?? usage.cache_read_input_tokens,
  }
}

export async function collectAnthropicStreamToBetaMessage(
  stream: AsyncIterable<BetaRawMessageStreamEvent>,
  fallbackModel: string,
  signal: AbortSignal,
  guardOptions?: ProviderStreamGuardOptions,
): Promise<BetaMessage> {
  const contentBlocks: Record<number, SideQueryContentBlock> = {}
  let partialMessage: BetaMessage | null = null
  let stopReason: BetaMessage['stop_reason'] = null
  let stopSequence: string | null = null
  let usage: SideQueryUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  for await (const event of guardProviderStreamCancellation(stream, signal, {
    operation: 'Side query provider stream',
    ...guardOptions,
  })) {
    switch (event.type) {
      case 'message_start': {
        partialMessage = event.message as BetaMessage
        usage = updateSideQueryUsage(usage, partialMessage.usage)
        break
      }
      case 'content_block_start': {
        const block = event.content_block as unknown as SideQueryContentBlock
        if (block.type === 'tool_use') {
          contentBlocks[event.index] = { ...block, input: '' }
        } else if (block.type === 'text') {
          contentBlocks[event.index] = { ...block, text: '' }
        } else if (block.type === 'thinking') {
          contentBlocks[event.index] = {
            ...block,
            thinking: '',
            signature: '',
          }
        } else {
          contentBlocks[event.index] = { ...block }
        }
        break
      }
      case 'content_block_delta': {
        const block = contentBlocks[event.index]
        if (!block) break
        const delta = event.delta as unknown as Record<string, unknown>
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = `${typeof block.text === 'string' ? block.text : ''}${delta.text}`
        } else if (
          delta.type === 'input_json_delta' &&
          typeof delta.partial_json === 'string'
        ) {
          block.input = `${typeof block.input === 'string' ? block.input : ''}${delta.partial_json}`
        } else if (
          delta.type === 'thinking_delta' &&
          typeof delta.thinking === 'string'
        ) {
          block.thinking = `${typeof block.thinking === 'string' ? block.thinking : ''}${delta.thinking}`
        } else if (
          delta.type === 'signature_delta' &&
          typeof delta.signature === 'string'
        ) {
          block.signature = delta.signature
        }
        break
      }
      case 'message_delta': {
        if (event.usage) {
          usage = updateSideQueryUsage(
            usage,
            event.usage as SideQueryUsageDelta,
          )
        }
        if (event.delta.stop_reason !== undefined) {
          stopReason = event.delta.stop_reason as BetaMessage['stop_reason']
        }
        if (event.delta.stop_sequence !== undefined) {
          stopSequence = event.delta.stop_sequence
        }
        break
      }
      case 'message_stop':
      case 'content_block_stop':
        break
    }
  }

  const content = Object.entries(contentBlocks)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, block]) => {
      if (block.type === 'tool_use') {
        return { ...block, input: parseToolInput(block.input) }
      }
      return block
    }) as unknown as BetaMessage['content']

  return {
    id: partialMessage?.id ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: partialMessage?.model ?? fallbackModel,
    stop_reason: stopReason ?? partialMessage?.stop_reason ?? 'end_turn',
    stop_sequence: stopSequence ?? partialMessage?.stop_sequence ?? null,
    usage: usage as BetaMessage['usage'],
  } as BetaMessage
}

/**
 * Run a side-query request/stream factory inside the shared abort-aware retry
 * policy and discard retry-progress transcript messages. sideQuery callers
 * only consume the final result, so progress remains debug/telemetry state
 * rather than leaking into the caller's conversation.
 */
async function createRetriedSideQueryStream<T>(
  createStream: (signal: AbortSignal) => Promise<T>,
  options: {
    signal: AbortSignal
    provider: string
    maxRetries: number
  },
): Promise<T> {
  const retry = withCompatRetry(createStream, options)
  let next = await retry.next()
  while (!next.done) {
    next = await retry.next()
  }
  return next.value
}

function cursorForcedToolSchema(
  tools: SideQueryOptions['tools'],
  forcedToolName: string,
): string {
  const forcedTool = tools?.find(tool => {
    const candidate = tool as unknown as Record<string, unknown>
    return candidate['name'] === forcedToolName
  }) as unknown as Record<string, unknown> | undefined
  const schema = forcedTool?.['input_schema'] ?? {
    type: 'object',
    properties: {},
  }
  try {
    return JSON.stringify(schema)
  } catch {
    return '{"type":"object","properties":{}}'
  }
}

/**
 * Cursor's agent-tuned models can ignore custom MCP tools. When a forced-tool
 * prompt returns one strict JSON object instead, synthesize the equivalent
 * Anthropic tool_use block. Callers still validate the input with their own
 * schema/Zod parser; loose JSON extraction and Markdown fences are rejected.
 */
function synthesizeCursorForcedToolUse(
  response: BetaMessage,
  forcedToolName: string,
): BetaMessage {
  const hasRequestedTool = response.content.some(
    block => block.type === 'tool_use' && block.name === forcedToolName,
  )
  const hasOtherTool = response.content.some(block => block.type === 'tool_use')
  if (hasRequestedTool || hasOtherTool) return response

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
  if (!text) return response

  let input: unknown
  try {
    input = JSON.parse(text) as unknown
  } catch {
    return response
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return response
  }

  const nonTextContent = response.content.filter(block => block.type !== 'text')
  return {
    ...response,
    content: [
      ...nonTextContent,
      {
        type: 'tool_use',
        id: `toolu_cursor_forced_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        name: forcedToolName,
        input,
      },
    ] as BetaMessage['content'],
    stop_reason: 'tool_use',
  }
}

/**
 * Cursor side query. Cursor's API is ConnectRPC/protobuf rather than an
 * Anthropic or OpenAI endpoint, so use the same translation and stream
 * adapter as the main Cursor query path, then collect it into the BetaMessage
 * shape expected by side-query callers.
 */
async function sideQueryViaCursor(
  opts: SideQueryOptions,
): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    signal = new AbortController().signal,
    thinking,
  } = opts
  const runtime = opts.providerRuntimeConfig
  const scopedEnv = runtime?.env ?? process.env
  const cursorModel = resolveCursorModel(
    normalizeModelStringForAPI(model),
    scopedEnv,
  )

  const forcedToolName =
    tool_choice?.type === 'tool' ? tool_choice.name : undefined
  const forcedToolInstruction = forcedToolName
    ? `Call the ${forcedToolName} tool exactly once. If this model cannot call that custom tool, return exactly one raw JSON object matching this input schema instead: ${cursorForcedToolSchema(tools, forcedToolName)}. Do not use Markdown fences or include any text before or after the JSON.`
    : ''
  const systemText = [extractSystemText(system), forcedToolInstruction]
    .filter(Boolean)
    .join('\n\n')
  const openaiMessages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> = []
  if (systemText) openaiMessages.push({ role: 'system', content: systemText })
  openaiMessages.push(...messageParamsToOpenAIRoleContent(messages))

  const cursorMessages = convertOpenAIMessagesToCursor(
    openaiMessages as OpenAIMessage[],
  )
  if (cursorMessages.length === 0) {
    throw new Error('No messages to send to Cursor after conversion.')
  }
  const cursorTools = (tools && tools.length > 0
    ? anthropicToolsToOpenAI(tools as BetaToolUnion[])
    : []) as unknown as CursorTool[]
  const effort =
    thinking === false
      ? undefined
      : typeof thinking === 'number'
        ? thinking
        : runtime?.thinkingEffort === 'off'
          ? undefined
          : runtime?.thinkingEffort
  const reasoningEffort =
    thinking === false ? null : resolveReasoningEffort(scopedEnv, effort)
  const credentials = await waitForProviderAbortSettlement(
    resolveCursorCredentials({
      envOverride: runtime?.env,
    }),
    signal,
    'Side query Cursor credential resolution',
  )
  const start = Date.now()
  const adaptedStream = await createRetriedSideQueryStream(
    async innerSignal => {
      const frames = streamCursorChat({
        model: cursorModel,
        messages: cursorMessages,
        tools: cursorTools,
        reasoningEffort,
        credentials,
        signal: innerSignal,
        envOverride: runtime?.env,
      })
      return startStreamEagerly(
        adaptCursorFramesToAnthropic(frames, cursorModel, cursorTools),
      )
    },
    {
      signal,
      provider: 'cursor',
      maxRetries: opts.maxRetries ?? 2,
    },
  )
  const collectedResponse = await collectAnthropicStreamToBetaMessage(
    adaptedStream,
    cursorModel,
    signal,
  )
  const response = forcedToolName
    ? synthesizeCursorForcedToolUse(collectedResponse, forcedToolName)
    : collectedResponse

  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      response.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      cursorModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: response.usage.input_tokens,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)
  return response
}

/**
 * OpenAI-compatible side query for OpenAI and Grok providers.
 * Both use the OpenAI SDK with different base URLs.
 *
 * Converts Anthropic-format params to OpenAI Chat Completions, sends a
 * non-streaming request, and wraps the response back into a BetaMessage
 * shape so callers remain provider-agnostic.
 *
 * Supports tools and tool_choice for structured output (e.g. yoloClassifier,
 * permissionExplainer).
 */
async function sideQueryViaOpenAICompatible(
  opts: SideQueryOptions,
): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    max_tokens = 1024,
    temperature,
    thinking,
    signal,
  } = opts

  const runtime = opts.providerRuntimeConfig
  const provider = runtime?.provider ?? getAPIProvider()
  const normalizedModel = normalizeModelStringForAPI(model)
  // Whole-object fallback (not per-key): a runtime env replaces process.env
  // for provider-scoped reads; a runtime without env inherits the main
  // session's env — same semantics as queryModelOpenAI/Gemini/Grok.
  const scopedEnv = runtime?.env ?? process.env
  const credentialScope =
    runtime?.credentialScope ?? getChatGPTCredentialScope(scopedEnv)
  const connectionThinkingEffort = resolveQueryThinkingEffort(runtime)
  const thinkingDisabled =
    thinking === false || connectionThinkingEffort === 'off'
  const effortValue = thinkingDisabled
    ? undefined
    : typeof thinking === 'number'
      ? thinking
      : mapThinkingEffortToEffortValue(connectionThinkingEffort)
  const effortTransport = resolveQueryThinkingEffortTransport(runtime)

  const usesChatGPTCodex =
    provider === 'openai' && isChatGPTAuthEnabled(scopedEnv)
  if (usesChatGPTCodex) {
    await fetchChatGPTCodexModels({
      credentialScope,
    }).catch(error => {
      logForDebugging(
        `[sideQuery] ChatGPT Codex model catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }

  // Resolve the model after the ChatGPT account catalog is available so
  // provider defaults follow the server's visible priority ordering.
  const openaiModel =
    provider === 'grok'
      ? resolveGrokModel(normalizedModel, scopedEnv)
      : usesChatGPTCodex
        ? normalizedModel.replace(/\[1m\]$/i, '')
        : resolveOpenAIModel(normalizedModel, scopedEnv)

  // Build system prompt text
  const systemText = extractSystemText(system)

  // Build OpenAI messages: system first, then user/assistant
  const openaiMessages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> = []
  if (systemText) {
    openaiMessages.push({ role: 'system', content: systemText })
  }
  openaiMessages.push(...messageParamsToOpenAIRoleContent(messages))

  // Convert tools and tool_choice if provided
  const openaiTools =
    tools && tools.length > 0
      ? anthropicToolsToOpenAI(tools as BetaToolUnion[])
      : undefined
  const openaiToolChoice = tool_choice
    ? anthropicToolChoiceToOpenAI(tool_choice)
    : undefined

  const start = Date.now()

  const requestParams: Record<string, unknown> = {
    model: openaiModel,
    messages: openaiMessages,
    max_tokens,
  }
  if (temperature !== undefined) requestParams.temperature = temperature
  if (openaiTools && openaiTools.length > 0) {
    requestParams.tools = openaiTools
    if (openaiToolChoice) requestParams.tool_choice = openaiToolChoice
  }
  // Callers like the auto-mode classifier pass `thinking: false` to request a
  // text/tool-only response. DeepSeek v4 endpoints default to thinking mode
  // server-side even when no thinking field is sent, and thinking mode
  // rejects forced/named tool_choice with a 400 ("Thinking mode does not
  // support this tool_choice") — which made the classifier permanently
  // unavailable when the fast slot pointed at DeepSeek. Send an explicit
  // disable in all three endpoint formats (mirrors buildOpenAIRequestBody's
  // enable formats; unrecognized fields are ignored by each endpoint). Only
  // sent when the endpoint is known to understand thinking-control fields —
  // strict OpenAI-compatible endpoints would otherwise reject unknown params.
  if (
    thinkingDisabled &&
    openAICompatSupportsThinkingControl(openaiModel, scopedEnv)
  ) {
    requestParams.thinking = { type: 'disabled' }
    requestParams.enable_thinking = false
    requestParams.chat_template_kwargs = {
      thinking: false,
      enable_thinking: false,
    }
  }

  if (usesChatGPTCodex) {
    const reasoningEffort = thinkingDisabled
      ? undefined
      : resolveChatGPTResponsesReasoningEffort(
          openaiModel,
          effortValue,
          scopedEnv,
          credentialScope,
        )
    const requestSignal = signal ?? new AbortController().signal
    const turnSession: ChatGPTCodexTurnSession = {}
    const continuationMessages: Array<
      (typeof openaiMessages)[number] | ChatGPTContinuationMessage
    > = [...openaiMessages]
    const responses: BetaMessage[] = []
    for (
      let continuation = 0;
      continuation <= MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS;
      continuation += 1
    ) {
      const bufferedEvents = await createRetriedSideQueryStream(
        async innerSignal => {
          const events: BetaRawMessageStreamEvent[] = []
          const stream = adaptResponsesStreamToAnthropic(
            await createChatGPTResponsesStream({
              request: buildResponsesRequest({
                model: openaiModel,
                messages: continuationMessages,
                tools: openaiTools ?? [],
                toolChoice: openaiToolChoice,
                reasoningEffort,
                promptCacheKey: getSessionId(),
                credentialScope,
              }),
              signal: innerSignal,
              credentialScope,
              turnSession,
            }),
            openaiModel,
            turnSession,
          )
          for await (const event of stream) events.push(event)
          return events
        },
        {
          signal: requestSignal,
          provider: 'chatgpt',
          maxRetries: opts.maxRetries ?? 5,
        },
      )
      const adaptedStream = (async function* () {
        yield* bufferedEvents
      })()
      const segment = await collectAnthropicStreamToBetaMessage(
        adaptedStream,
        openaiModel,
        requestSignal,
      )
      responses.push(segment)
      const hasToolUse = segment.content.some(
        block => block.type === 'tool_use',
      )
      if (turnSession.lastResponseEndTurn !== false || hasToolUse) break
      if (continuation === MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS) {
        throw new Error(
          `ChatGPT Codex exceeded ${MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS} server continuations`,
        )
      }
      continuationMessages.push(toChatGPTContinuationMessage(segment))
    }
    const response = combineSideQueryResponses(responses)

    const now = Date.now()
    const requestId = response.id
    const lastCompletion = getLastApiCompletionTimestamp()
    logEvent('tengu_api_success', {
      requestId:
        requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      querySource:
        opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      model:
        openaiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
      uncachedInputTokens: response.usage.input_tokens,
      durationMsIncludingRetries: now - start,
      timeSinceLastApiCallMs:
        lastCompletion !== null ? now - lastCompletion : undefined,
    })
    setLastApiCompletionTimestamp(now)

    return response
  }

  const reasoningEffort = thinkingDisabled
    ? undefined
    : resolveOpenAICompatibleReasoningEffort(
        effortValue,
        provider === 'openai' ? effortTransport : 'compatible',
        scopedEnv,
        openaiModel,
      )
  if (reasoningEffort !== undefined) {
    requestParams.reasoning_effort = reasoningEffort
  }

  const client =
    provider === 'grok'
      ? getGrokClient({
          // SDK retry sleeps ignore AbortSignal; retry outside the SDK.
          maxRetries: 0,
          envOverride: runtime?.env,
        })
      : getOpenAIClient({
          maxRetries: 0,
          envOverride: runtime?.env,
        })
  const requestSignal = signal ?? new AbortController().signal
  const response = await createRetriedSideQueryStream(
    innerSignal =>
      client.chat.completions.create(
        requestParams as unknown as import('openai/resources/chat/completions/completions.mjs').ChatCompletionCreateParamsNonStreaming,
        { signal: innerSignal },
      ),
    {
      signal: requestSignal,
      provider,
      maxRetries: opts.maxRetries ?? 2,
    },
  )

  const choice = response.choices[0]
  const message = choice?.message

  // Build content blocks for BetaMessage
  const contentBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = []

  if (message?.content) {
    contentBlocks.push({ type: 'text', text: message.content })
  }

  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      // ChatCompletionMessageToolCall is a union — only function-type has .function
      if (tc.type === 'function' && 'function' in tc) {
        const fn = (tc as { function: { name: string; arguments: string } })
          .function
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id ?? `toolu_${Date.now()}`,
          name: fn.name,
          input: JSON.parse(fn.arguments || '{}'),
        })
      }
    }
  }

  const now = Date.now()
  const requestId = response.id
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      openaiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    cachedInputTokens: 0,
    uncachedInputTokens: response.usage?.prompt_tokens ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  const stopReason =
    choice?.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice?.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn'

  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    content: contentBlocks as BetaMessage['content'],
    model: openaiModel,
    stop_reason: stopReason as BetaMessage['stop_reason'],
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  } as BetaMessage
}

/**
 * Gemini side query. Converts Anthropic-format params to Gemini
 * generateContent format, sends a non-streaming request via fetch,
 * and wraps the response back into a BetaMessage shape.
 */
async function sideQueryViaGemini(
  opts: SideQueryOptions,
): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    max_tokens = 1024,
    temperature,
    signal,
  } = opts

  const runtime = opts.providerRuntimeConfig
  // Whole-object fallback — same semantics as sideQueryViaOpenAICompatible.
  const scopedEnv = runtime?.env ?? process.env
  const normalizedModel = normalizeModelStringForAPI(model)
  const geminiModel = resolveGeminiModel(normalizedModel, scopedEnv)

  // Build Gemini contents from Anthropic MessageParam[]
  const contents: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }> = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              )
              .map(b => b.text)
              .join('\n')
          : ''
    if (text) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      })
    }
  }

  // Build system instruction
  const systemText = extractSystemText(system)
  const systemInstruction = systemText
    ? { parts: [{ text: systemText }] }
    : undefined

  // Convert tools and tool_choice
  const geminiTools =
    tools && tools.length > 0
      ? anthropicToolsToGemini(tools as BetaToolUnion[])
      : undefined
  const geminiToolConfig = tool_choice
    ? anthropicToolChoiceToGemini(tool_choice)
    : undefined

  const baseUrl = (
    scopedEnv.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '')
  const modelPath = geminiModel.startsWith('models/')
    ? geminiModel
    : `models/${geminiModel}`
  const url = `${baseUrl}/${modelPath}:generateContent`

  const body: Record<string, unknown> = {
    contents,
    ...(systemInstruction && { systemInstruction }),
    ...(geminiTools && geminiTools.length > 0 && { tools: geminiTools }),
    ...(geminiToolConfig && {
      toolConfig: { functionCallingConfig: geminiToolConfig },
    }),
    ...(temperature !== undefined && {
      generationConfig: { temperature },
    }),
    ...(max_tokens !== undefined && {
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        maxOutputTokens: max_tokens,
      },
    }),
  }

  // Merge generationConfig if both temperature and max_tokens are set
  if (temperature !== undefined && max_tokens !== undefined) {
    body.generationConfig = { temperature, maxOutputTokens: max_tokens }
  }

  const start = Date.now()

  type GeminiSideQueryResponse = {
    candidates?: Array<{
      content?: {
        role?: string
        parts?: Array<{
          text?: string
          functionCall?: { name?: string; args?: Record<string, unknown> }
        }>
      }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
    id?: string
  }
  const requestSignal = signal ?? new AbortController().signal
  const geminiResponse = await createRetriedSideQueryStream(
    async innerSignal => {
      const res = await fetch(url, {
        ...getProxyFetchOptions({ forAnthropicAPI: false }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': scopedEnv.GEMINI_API_KEY || '',
        },
        body: JSON.stringify(body),
        signal: innerSignal,
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '')
        throw new Error(
          `Gemini API request failed (${res.status} ${res.statusText}): ${errorBody || 'empty response body'}`,
        )
      }

      return (await res.json()) as GeminiSideQueryResponse
    },
    {
      signal: requestSignal,
      provider: 'gemini',
      maxRetries: opts.maxRetries ?? 2,
    },
  )

  // Build content blocks from Gemini response
  const contentBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = []

  const candidate = geminiResponse.candidates?.[0]
  const parts = candidate?.content?.parts
  if (parts) {
    for (const part of parts) {
      if (part.text) {
        contentBlocks.push({ type: 'text', text: part.text })
      }
      if (part.functionCall) {
        contentBlocks.push({
          type: 'tool_use',
          id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name ?? '',
          input: part.functionCall.args ?? {},
        })
      }
    }
  }

  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId: (geminiResponse.id ??
      '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      geminiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: geminiResponse.usageMetadata?.candidatesTokenCount ?? 0,
    cachedInputTokens: 0,
    uncachedInputTokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  const stopReason =
    candidate?.finishReason === 'STOP'
      ? 'end_turn'
      : candidate?.finishReason === 'MAX_TOKENS'
        ? 'max_tokens'
        : 'end_turn'

  return {
    id: geminiResponse.id ?? `gemini_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: contentBlocks as BetaMessage['content'],
    model: geminiModel,
    stop_reason: stopReason as BetaMessage['stop_reason'],
    stop_sequence: null,
    usage: {
      input_tokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount ?? 0,
    },
  } as BetaMessage
}
