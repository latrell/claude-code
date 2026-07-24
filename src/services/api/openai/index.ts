import type {
  BetaToolUnion,
  BetaMessage,
  BetaUsage,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions/completions.mjs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type {
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  AssistantMessage,
  UserMessage,
} from '../../../types/message.js'
import type { AgentId } from '../../../types/ids.js'
import type { Tools } from '../../../Tool.js'
import { getOpenAIClient } from './client.js'
import { updateOpenAIUsage } from './openaiShared.js'
import {
  anthropicMessagesToOpenAI,
  resolveOpenAIModel,
  adaptOpenAIStreamToAnthropic,
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
} from '@ant/model-provider'
import { isChatGPTAuthEnabled } from './chatgptAuth.js'
import { fetchChatGPTCodexModels } from './codexModels.js'
import { getChatGPTCredentialScope } from '../../../utils/model/chatgptModels.js'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  createChatGPTResponsesStream,
  isChatGPTCodexContextLengthError,
} from './responsesAdapter.js'
import { PROMPT_TOO_LONG_ERROR_MESSAGE } from '../errors.js'
import { resolveChatGPTResponsesReasoningEffort } from './reasoningEffort.js'
import {
  isDeepSeekV4ReasoningModel,
  resolveOpenAICompatibleReasoningEffort,
} from '../../connections/effortTransport.js'
import { mapThinkingEffortToEffortValue } from '../../connections/thinkingEffort.js'
import { normalizeMessagesForAPI } from '../../../utils/messages.js'
import { toolToAPISchema } from '../../../utils/api.js'
import {
  getEmptyToolPermissionContext,
  toolMatchesName,
} from '../../../Tool.js'
import { logForDebugging } from '../../../utils/debug.js'
import { isAbortError } from '../../../utils/errors.js'
import { StopConfirmationError } from '../../../utils/stopConfirmation.js'
import { addToTotalSessionCost } from '../../../cost-tracker.js'
import { calculateUSDCost } from '../../../utils/modelCost.js'
import {
  isOpenAIThinkingEnabled,
  resolveOpenAIMaxTokens,
  resolveOpenAIRequestTemperature,
  resolveOpenAIThinkingTokenBudget,
  usesDeepSeekV4RecommendedSampling,
  buildOpenAIRequestBody,
} from './requestBody.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../../../services/langfuse/convert.js'
import {
  withCompatRetry,
  hasExhaustedCompatRetries,
  startStreamEagerly,
} from '../compatRetry.js'
import { isDeepSeekV4SemanticEmptyError } from '../compatErrors.js'
import {
  localizedAPIErrorDetail,
  localizedAPIErrorPrefix,
} from '../../../i18n/apiError.js'
import {
  EmptyOpenAICompletionError,
  holdUntilObservableOpenAIOutput,
} from './observableOutputGuard.js'
export {
  isOpenAIThinkingEnabled,
  resolveOpenAIMaxTokens,
  resolveOpenAIRequestTemperature,
  resolveOpenAIThinkingTokenBudget,
  usesDeepSeekV4RecommendedSampling,
  buildOpenAIRequestBody,
}
import { getModelMaxOutputTokens } from '../../../utils/context.js'
import { findChinaProviderModel } from '../../../utils/chinaLlmProviders.js'
import type { Options } from '../claude.js'
import { randomUUID } from 'crypto'
import { getSessionId } from '../../../bootstrap/state.js'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
  normalizeContentFromAPI,
} from '../../../utils/messages.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import {
  isSearchExtraToolsEnabled,
  isDeferredToolsDeltaEnabled,
} from '../../../utils/searchExtraTools.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  SEARCH_EXTRA_TOOLS_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/SearchExtraToolsTool/prompt.js'

/**
 * Mirrors the Anthropic request path's deferred-tool announcement for OpenAI.
 *
 * OpenAI-compatible endpoints cannot consume Anthropic's `defer_loading` or
 * `tool_reference` beta payloads directly, so the model needs the same textual
 * list of deferred MCP tool names that Anthropic receives before it can ask
 * SearchExtraToolsTool to load their full schemas.
 */
function prependDeferredToolListIfNeeded(
  messages: (AssistantMessage | UserMessage)[],
  tools: Tools,
  deferredToolNames: Set<string>,
  useSearchExtraTools: boolean,
): (AssistantMessage | UserMessage)[] {
  if (!useSearchExtraTools || isDeferredToolsDeltaEnabled()) return messages

  const deferredToolList = tools
    .filter(tool => deferredToolNames.has(tool.name))
    .map(formatDeferredToolLine)
    .sort()
    .join('\n')

  if (!deferredToolList) return messages

  return [
    createUserMessage({
      content: `<available-deferred-tools>\n${deferredToolList}\n</available-deferred-tools>`,
      isMeta: true,
    }),
    ...messages,
  ]
}

function isOpenAIConvertibleMessage(
  msg: Message,
): msg is AssistantMessage | UserMessage {
  return msg.type === 'assistant' || msg.type === 'user'
}

function isInvalidOpenAIStreamError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  if (error instanceof EmptyOpenAICompletionError) return true
  if (isDeepSeekV4SemanticEmptyError(error)) return true
  return (
    error.message.includes('terminal event') &&
    (error.message.includes('finish_reason') ||
      error.message.includes('message_stop'))
  )
}

/** Resolve the wire model without crossing the API-key/ChatGPT boundary. */
export function resolveOpenAITransportModel(
  model: string,
  env: Record<string, string | undefined>,
): string {
  return isChatGPTAuthEnabled(env)
    ? model.replace(/\[1m\]$/i, '')
    : resolveOpenAIModel(model, env)
}

/**
 * Assemble the final AssistantMessage (and optional max_tokens error) from
 * accumulated stream state after the authoritative `message_stop` event.
 */
function assembleFinalAssistantOutputs(params: {
  partialMessage: BetaMessage | null
  contentBlocks: Record<number, Record<string, unknown>>
  tools: Tools
  agentId: string | undefined
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  stopReason: string | null
  maxTokens: number
}): (AssistantMessage | SystemAPIErrorMessage)[] {
  const {
    partialMessage,
    contentBlocks,
    tools,
    agentId,
    usage,
    stopReason,
    maxTokens,
  } = params
  const outputs: (AssistantMessage | SystemAPIErrorMessage)[] = []

  const allBlocks = Object.keys(contentBlocks)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => contentBlocks[Number(k)])
    .filter(Boolean)

  if (partialMessage) {
    outputs.push({
      message: {
        ...partialMessage,
        content: normalizeContentFromAPI(
          allBlocks as unknown as BetaMessage['content'],
          tools,
          agentId as AgentId | undefined,
        ),
        usage,
        stop_reason: stopReason,
        stop_sequence: null,
      } as AssistantMessage['message'],
      requestId: undefined,
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
    } as AssistantMessage)
  }

  if (stopReason === 'max_tokens') {
    outputs.push(
      createAssistantAPIErrorMessage({
        content:
          `Output truncated: response exceeded the ${maxTokens} token limit. ` +
          `Set OPENAI_MAX_TOKENS or CLAUDE_CODE_MAX_OUTPUT_TOKENS to override.`,
        apiError: 'max_output_tokens',
        error: 'max_output_tokens',
      }),
    )
  }

  return outputs
}

/**
 * OpenAI-compatible query path. Converts Anthropic-format messages/tools to
 * OpenAI format, calls the OpenAI-compatible endpoint, and converts the
 * SSE stream back to Anthropic BetaRawMessageStreamEvent for consumption
 * by the existing query pipeline.
 */
export async function* queryModelOpenAI(
  messages: Message[],
  systemPrompt: SystemPrompt,
  tools: Tools,
  signal: AbortSignal,
  options: Options,
): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  try {
    const providerEnv = options.providerRuntimeConfig?.env ?? process.env

    // 1. Load the account-authoritative catalog before resolving a default
    // model. Scoped connections keep their original credential file instead
    // of copying rotating OAuth credentials into the default slot.
    const credentialScope =
      options.providerRuntimeConfig?.credentialScope ??
      getChatGPTCredentialScope(providerEnv)
    const usesChatGPTCodex = isChatGPTAuthEnabled(providerEnv)
    if (usesChatGPTCodex && !options.fetchOverride) {
      await fetchChatGPTCodexModels({ credentialScope }).catch(error => {
        logForDebugging(
          `[OpenAI] ChatGPT Codex model catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }
    // ChatGPT subscription model IDs are already resolved from the
    // account-authoritative Codex catalog upstream. Never pass them through
    // the public/OpenAI-compatible mapping, where a stale OPENAI_MODEL or
    // OPENAI_DEFAULT_* setting could silently route to the wrong protocol.
    const openaiModel = resolveOpenAITransportModel(options.model, providerEnv)

    // 2. Normalize messages using shared preprocessing
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    // 3. Check if tool search is enabled (similar to Anthropic path)
    const useSearchExtraTools = await isSearchExtraToolsEnabled(
      options.model,
      tools,
      options.getToolPermissionContext ||
        (async () => getEmptyToolPermissionContext()),
      options.agents || [],
      options.querySource,
      options.providerRuntimeConfig,
    )

    // 4. Build deferred tools set (similar to Anthropic path)
    const deferredToolNames = new Set<string>()
    if (useSearchExtraTools) {
      for (const t of tools) {
        if (isDeferredTool(t)) deferredToolNames.add(t.name)
      }
    }

    // 5. Filter tools (similar to Anthropic path)
    // Never include deferred tools in the API tools array — they are invoked
    // via ExecuteExtraTool which looks them up from the global tool registry
    // at runtime. Keeping the tools array stable preserves the prompt cache.
    let filteredTools = tools
    if (useSearchExtraTools && deferredToolNames.size > 0) {
      filteredTools = tools.filter(tool => {
        // Always include non-deferred tools
        if (!deferredToolNames.has(tool.name)) return true
        // Always include SearchExtraToolsTool (so it can discover more tools)
        if (toolMatchesName(tool, SEARCH_EXTRA_TOOLS_TOOL_NAME)) return true
        // All other deferred tools are excluded — use ExecuteExtraTool instead
        return false
      })
    }

    // 6. Build tool schemas with deferLoading flag
    const toolSchemas = await Promise.all(
      filteredTools.map(tool =>
        toolToAPISchema(tool, {
          getToolPermissionContext: options.getToolPermissionContext,
          tools,
          agents: options.agents,
          allowedAgentTypes: options.allowedAgentTypes,
          model: options.model,
          deferLoading: useSearchExtraTools && deferredToolNames.has(tool.name),
        }),
      ),
    )

    // 7. Filter out non-standard tools (server tools like advisor)
    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return (
          anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
        )
      },
    )

    // 8. Convert messages and tools to OpenAI format
    const enableThinking = isOpenAIThinkingEnabled(openaiModel, providerEnv)
    const isDeepSeekV4 = isDeepSeekV4ReasoningModel(openaiModel)
    const useDeepSeekV4Sampling = usesDeepSeekV4RecommendedSampling(openaiModel)
    const openAIConvertibleMessages = messagesForAPI.filter(
      isOpenAIConvertibleMessage,
    )
    const messagesWithDeferredToolList = prependDeferredToolListIfNeeded(
      openAIConvertibleMessages,
      tools,
      deferredToolNames,
      useSearchExtraTools,
    )
    const openaiMessages = anthropicMessagesToOpenAI(
      messagesWithDeferredToolList,
      systemPrompt,
      {
        enableThinking,
        preserveResponsesReasoning: usesChatGPTCodex,
      },
    )
    const openaiTools = anthropicToolsToOpenAI(standardTools)
    const openaiToolChoice = anthropicToolChoiceToOpenAI(options.toolChoice)
    const queryEffortValue =
      options.effortValue ??
      mapThinkingEffortToEffortValue(
        options.providerRuntimeConfig?.thinkingEffort,
      )
    const responsesReasoningEffort = resolveChatGPTResponsesReasoningEffort(
      openaiModel,
      queryEffortValue,
      providerEnv,
      credentialScope,
    )
    const chatCompletionsReasoningEffort =
      resolveOpenAICompatibleReasoningEffort(
        queryEffortValue,
        options.thinkingEffortTransport ??
          options.providerRuntimeConfig?.thinkingEffortTransport,
        providerEnv,
        openaiModel,
      )

    // 9. Log tool filtering details
    if (useSearchExtraTools) {
      const includedDeferredTools = filteredTools.filter(t =>
        deferredToolNames.has(t.name),
      ).length
      logForDebugging(
        `[OpenAI] Tool search enabled: ${includedDeferredTools}/${deferredToolNames.size} deferred tools included, total tools=${openaiTools.length}`,
      )
    } else {
      logForDebugging(
        `[OpenAI] Tool search disabled, total tools=${openaiTools.length}`,
      )
    }

    // 10. Compute max_tokens — required by most OpenAI-compatible endpoints.
    //     Without this the server uses a tiny default, and when
    //     thinking is enabled the thinking phase consumes the entire budget
    //     leaving no tokens for the final response.
    //
    //     Keep the provider's full upper limit. A slow local endpoint is allowed
    //     to run for a long time as long as it keeps making semantic progress;
    //     DeepSeek's reasoning phase is bounded separately below so it cannot
    //     consume all output room before producing a final answer.
    //
    //     Override priority:
    //     1. options.maxOutputTokensOverride (programmatic)
    //     2. OPENAI_MAX_TOKENS env var (OpenAI-specific, useful for local models
    //        with small context windows, e.g. RTX 3060 12GB running 65536-token models)
    //     3. CLAUDE_CODE_MAX_OUTPUT_TOKENS env var (generic override)
    //     4. upperLimit default
    const { upperLimit } = getModelMaxOutputTokens(openaiModel)
    const maxTokens = resolveOpenAIMaxTokens(
      upperLimit,
      options.maxOutputTokensOverride,
      providerEnv,
    )
    const providerModel = findChinaProviderModel(openaiModel)
    const thinkingTokenBudget = resolveOpenAIThinkingTokenBudget({
      enableThinking,
      isDeepSeekV4,
      maxTokens,
      maxThinkingTokens: providerModel?.maxThinkingTokens,
      // Connection-scoped env owns credentials/routing, while process env may
      // still provide request-control overrides such as the thinking budget.
      env: { ...process.env, ...providerEnv },
    })

    logForDebugging(
      `[OpenAI] Calling model=${openaiModel}, messages=${openaiMessages.length}, tools=${openaiTools.length}, thinking=${enableThinking}`,
    )

    // 11. Call OpenAI API with streaming, wrapped in retry for transient errors
    // (fetch failed, 429, 5xx, ECONNRESET/EPIPE, stream terminated, etc.).
    // ChatGPT subscription auth uses the Codex Responses backend;
    // API-key/OpenAI-compatible auth keeps the existing Chat Completions adapter.
    // startStreamEagerly pulls the first adapted event inside the factory so
    // "connection established, died before the model spoke" disconnects are
    // retried too (see the helper's doc comment).
    let adaptedStream: AsyncIterable<BetaRawMessageStreamEvent>
    if (usesChatGPTCodex) {
      // The downstream Anthropic-style stream is append-only: once a delta is
      // published it cannot be rolled back safely. Buffer each Codex sampling
      // attempt through its terminal event so a retry after text/reasoning/tool
      // deltas can discard the failed attempt instead of duplicating content or
      // executing an incomplete tool. This is the compatibility equivalent of
      // Codex's item-aware sampling retry loop.
      const bufferedEvents = yield* withCompatRetry(
        async innerSignal => {
          const events: BetaRawMessageStreamEvent[] = []
          const stream = adaptResponsesStreamToAnthropic(
            await createChatGPTResponsesStream({
              request: buildResponsesRequest({
                model: openaiModel,
                messages: openaiMessages,
                tools: openaiTools,
                toolChoice: openaiToolChoice,
                reasoningEffort: responsesReasoningEffort,
                promptCacheKey: getSessionId(),
                credentialScope,
              }),
              signal: innerSignal,
              fetchOverride: options.fetchOverride as unknown as typeof fetch,
              credentialScope,
              turnSession: options.chatGPTCodexTurnSession,
            }),
            openaiModel,
            options.chatGPTCodexTurnSession,
          )
          for await (const event of stream) events.push(event)
          return events
        },
        { signal, provider: 'openai', maxRetries: 5 },
      )
      adaptedStream = (async function* () {
        yield* bufferedEvents
      })()
    } else {
      adaptedStream = yield* withCompatRetry(
        async innerSignal =>
          startStreamEagerly(
            holdUntilObservableOpenAIOutput(
              adaptOpenAIStreamToAnthropic(
                await getOpenAIClient({
                  maxRetries: 0,
                  fetchOverride:
                    options.fetchOverride as unknown as typeof fetch,
                  source: options.querySource,
                  envOverride: options.providerRuntimeConfig?.env,
                }).chat.completions.create(
                  buildOpenAIRequestBody({
                    model: openaiModel,
                    messages: openaiMessages,
                    tools: openaiTools,
                    toolChoice: openaiToolChoice,
                    enableThinking,
                    maxTokens,
                    temperatureOverride: options.temperatureOverride,
                    isDeepSeekV4: useDeepSeekV4Sampling,
                    reasoningEffort: chatCompletionsReasoningEffort,
                    thinkingTokenBudget,
                  }) as unknown as ChatCompletionCreateParamsStreaming,
                  { signal: innerSignal },
                ),
                openaiModel,
              ),
            ),
          ),
        { signal, provider: 'openai' },
      )
    }

    // 12. Convert OpenAI stream to Anthropic events, then process into
    //     AssistantMessage + StreamEvent (matching the Anthropic path behavior)

    // Accumulate content blocks and usage, same as the Anthropic path in claude.ts
    const contentBlocks: Record<number, Record<string, unknown>> = {}
    const collectedMessages: AssistantMessage[] = []
    let partialMessage: BetaMessage | null = null
    let receivedMessageStop = false
    let stopReason: string | null = null
    let usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    let ttftMs = 0
    const start = Date.now()

    for await (const event of adaptedStream) {
      switch (event.type) {
        case 'message_start': {
          partialMessage = event.message
          ttftMs = Date.now() - start
          if (event.message.usage) {
            usage = {
              ...usage,
              ...(event.message.usage as unknown as typeof usage),
            }
          }
          break
        }
        case 'content_block_start': {
          const idx = event.index
          const cb = event.content_block
          if (cb.type === 'tool_use') {
            contentBlocks[idx] = { ...cb, input: '' }
          } else if (cb.type === 'text') {
            contentBlocks[idx] = { ...cb, text: '' }
          } else if (cb.type === 'thinking') {
            contentBlocks[idx] = { ...cb, thinking: '', signature: '' }
          } else {
            contentBlocks[idx] = { ...cb }
          }
          break
        }
        case 'content_block_delta': {
          const idx = event.index
          const delta = event.delta
          const block = contentBlocks[idx]
          if (!block) break
          if (delta.type === 'text_delta') {
            block.text = ((block.text as string | undefined) || '') + delta.text
          } else if (delta.type === 'input_json_delta') {
            block.input =
              ((block.input as string | undefined) || '') + delta.partial_json
          } else if (delta.type === 'thinking_delta') {
            block.thinking =
              ((block.thinking as string | undefined) || '') + delta.thinking
          } else if (delta.type === 'signature_delta') {
            block.signature = delta.signature
          }
          break
        }
        case 'content_block_stop': {
          // Block accumulation is complete; assembly happens at message_stop.
          break
        }
        case 'message_delta': {
          const deltaUsage = event.usage
          if (deltaUsage) {
            usage = updateOpenAIUsage(
              usage,
              deltaUsage as unknown as Parameters<typeof updateOpenAIUsage>[1],
            )
          }
          if (event.delta.stop_reason != null) {
            stopReason = event.delta.stop_reason
          }
          break
        }
        case 'message_stop': {
          receivedMessageStop = true
          // Assemble ONE AssistantMessage with ALL content blocks, matching the
          // Anthropic SDK path. Real usage (input + output tokens) is available
          // here and injected so tokenCountWithEstimation() can read it.
          if (partialMessage) {
            for (const output of assembleFinalAssistantOutputs({
              partialMessage,
              contentBlocks,
              tools,
              agentId: options.agentId,
              usage,
              stopReason,
              maxTokens,
            })) {
              if (output.type === 'assistant') {
                collectedMessages.push(output)
              }
              yield output
            }
            // A terminal event can only publish this response once.
            partialMessage = null
          }
          // Track cost and token usage
          if (usage.input_tokens + usage.output_tokens > 0) {
            const costUSD = calculateUSDCost(
              openaiModel,
              usage as unknown as BetaUsage,
            )
            addToTotalSessionCost(
              costUSD,
              usage as unknown as BetaUsage,
              openaiModel,
              options.providerRuntimeConfig,
            )
          }
          break
        }
      }

      // Also yield as StreamEvent for real-time display (matching Anthropic path)
      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }

    // Never promote streamed fragments to a successful AssistantMessage. A
    // provider EOF is only authoritative after message_stop; without it text,
    // reasoning, or tool arguments may all be truncated.
    if (!receivedMessageStop) {
      throw new TypeError(
        'OpenAI API stream ended before receiving a message_stop terminal event; the response may be incomplete, please retry',
      )
    }

    // Record LLM observation in Langfuse (no-op if not configured)
    recordLLMObservation(options.langfuseTrace ?? null, {
      model: openaiModel,
      provider: 'openai',
      input: convertMessagesToLangfuse(openaiMessages),
      output: convertOutputToLangfuse(collectedMessages),
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
      },
      startTime: new Date(start),
      endTime: new Date(),
      completionStartTime: ttftMs > 0 ? new Date(start + ttftMs) : undefined,
      tools: convertToolsToLangfuse(toolSchemas as unknown[]),
      ...(enableThinking && { thinking: { type: 'enabled' } }),
    })
  } catch (error) {
    if (error instanceof StopConfirmationError) throw error
    if (signal.aborted) return
    if (isAbortError(error)) throw error

    const msg = error instanceof Error ? error.message : String(error)
    const invalidStreamError = isInvalidOpenAIStreamError(error)
    logForDebugging(`[OpenAI] Error: ${msg}`, { level: 'error' })

    if (isChatGPTCodexContextLengthError(error)) {
      yield createAssistantAPIErrorMessage({
        content: PROMPT_TOO_LONG_ERROR_MESSAGE,
        error: 'invalid_request',
        errorDetails: msg,
      })
      return
    }

    // Distinguish "retries exhausted" from truly unretryable errors
    const retriesExhausted = hasExhaustedCompatRetries(error)
    const prefix = localizedAPIErrorPrefix(retriesExhausted)
    const displayMessage = localizedAPIErrorDetail(
      error,
      retriesExhausted ? 'retries_exhausted' : 'failed',
      msg,
    )
    yield createAssistantAPIErrorMessage({
      content: `${prefix}: ${displayMessage}`,
      apiError: 'api_error',
      error: invalidStreamError
        ? 'server_error'
        : ((error instanceof Error
            ? error
            : new Error(String(error))) as unknown as SDKAssistantMessageError),
      ...(invalidStreamError ? { errorDetails: msg } : undefined),
    })
  }
}
