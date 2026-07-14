import type {
  BetaToolUnion,
  BetaMessage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type {
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  AssistantMessage,
} from '../../../types/message.js'
import type { Tools } from '../../../Tool.js'
import {
  anthropicMessagesToOpenAI,
  anthropicToolsToOpenAI,
  resolveCursorModel,
} from '@ant/model-provider'
import { normalizeMessagesForAPI } from '../../../utils/messages.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import { toolToAPISchema } from '../../../utils/api.js'
import { logForDebugging } from '../../../utils/debug.js'
import { isAbortError } from '../../../utils/errors.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../../../services/langfuse/convert.js'
import type { Options } from '../claude.js'
import { randomUUID } from 'crypto'
import { t } from '../../../i18n/t.js'
import {
  withCompatRetry,
  hasExhaustedCompatRetries,
  startStreamEagerly,
} from '../compatRetry.js'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../../../utils/messages.js'
import { resolveCursorCredentials } from './auth.js'
import { resolveReasoningEffort, streamCursorChat } from './client.js'
import {
  convertOpenAIMessagesToCursor,
  type OpenAIMessage,
} from './translator.js'
import { adaptCursorFramesToAnthropic } from './streamAdapter.js'
import type { CursorTool } from './protobufSchema.js'

/**
 * Cursor query path. Cursor uses a ConnectRPC/protobuf backend (not
 * OpenAI-compatible), so we reuse the shared Anthropic→OpenAI message/tool
 * converters, translate those into Cursor's conversation shape, encode the
 * protobuf request, and adapt the streamed frames back into Anthropic events.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */
export async function* queryModelCursor(
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
    const cursorModel = resolveCursorModel(options.model, providerEnv)
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    const toolSchemas = await Promise.all(
      tools.map(tool =>
        toolToAPISchema(tool, {
          getToolPermissionContext: options.getToolPermissionContext,
          tools,
          agents: options.agents,
          allowedAgentTypes: options.allowedAgentTypes,
          model: options.model,
        }),
      ),
    )
    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return (
          anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
        )
      },
    )

    const openaiMessages = anthropicMessagesToOpenAI(
      messagesForAPI,
      systemPrompt,
    )
    const openaiTools = anthropicToolsToOpenAI(standardTools)
    const cursorMessages = convertOpenAIMessagesToCursor(
      openaiMessages as unknown as OpenAIMessage[],
    )
    const cursorTools = openaiTools as unknown as CursorTool[]
    // options.effortValue carries the query-level merge (appState /effort ??
    // connection profile thinkingEffort) from query.ts; the env override and
    // clamping live in resolveReasoningEffort.
    const reasoningEffort = resolveReasoningEffort(
      providerEnv,
      options.effortValue,
    )

    if (cursorMessages.length === 0) {
      throw new Error(t('No messages to send to Cursor after conversion.'))
    }

    logForDebugging(
      `[Cursor] Calling model=${cursorModel}, messages=${cursorMessages.length}, tools=${cursorTools.length}`,
    )

    const credentials = await resolveCursorCredentials({
      envOverride: options.providerRuntimeConfig?.env,
    })

    const start = Date.now()

    // Wrap the request + stream adaptation in retry for transient errors.
    // Both generators are lazy — nothing hits the network until the first
    // next() — so the factory must eagerly pull the first event. Otherwise
    // request-level failures (429 rate limit / 5xx, e.g. Auto's transient
    // "Provider Error") surface outside the retry scope and never retry.
    const adaptedStream = yield* withCompatRetry(
      async innerSignal => {
        const frames = streamCursorChat({
          model: cursorModel,
          messages: cursorMessages,
          tools: cursorTools,
          reasoningEffort,
          credentials,
          signal: innerSignal,
          fetchOverride: options.fetchOverride as typeof fetch | undefined,
          envOverride: options.providerRuntimeConfig?.env,
        })
        return startStreamEagerly(
          adaptCursorFramesToAnthropic(frames, cursorModel, cursorTools),
        )
      },
      { signal, provider: 'cursor' },
    )

    const contentBlocks: Record<number, Record<string, unknown>> = {}
    const collectedMessages: AssistantMessage[] = []
    let partialMessage: BetaMessage | null = null
    let ttftMs = 0

    for await (const event of adaptedStream) {
      switch (event.type) {
        case 'message_start': {
          partialMessage = event.message
          ttftMs = Date.now() - start
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
          const idx = event.index
          const block = contentBlocks[idx]
          if (!block || !partialMessage) break

          const m: AssistantMessage = {
            message: {
              ...partialMessage,
              content: normalizeContentFromAPI(
                [block] as unknown as BetaMessage['content'],
                tools,
                options.agentId,
              ),
            } as AssistantMessage['message'],
            requestId: undefined,
            type: 'assistant',
            uuid: randomUUID(),
            timestamp: new Date().toISOString(),
          }
          collectedMessages.push(m)
          yield m
          break
        }
        case 'message_delta':
        case 'message_stop':
          break
      }

      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }

    // Record LLM observation in Langfuse (no-op if not configured).
    recordLLMObservation(options.langfuseTrace ?? null, {
      model: cursorModel,
      provider: 'cursor',
      input: convertMessagesToLangfuse(messagesForAPI, systemPrompt),
      output: convertOutputToLangfuse(collectedMessages),
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      startTime: new Date(start),
      endTime: new Date(),
      completionStartTime: ttftMs > 0 ? new Date(start + ttftMs) : undefined,
      tools: convertToolsToLangfuse(toolSchemas as unknown[]),
    })
  } catch (error) {
    if (signal.aborted) return
    if (isAbortError(error)) throw error

    const msg = error instanceof Error ? error.message : String(error)
    logForDebugging(`[Cursor] Error: ${msg}`, { level: 'error' })

    const prefix = hasExhaustedCompatRetries(error)
      ? 'API Error (retries exhausted):'
      : 'API Error:'
    yield createAssistantAPIErrorMessage({
      content: `${prefix} ${msg}`,
      apiError: 'api_error',
      error: (error instanceof Error
        ? error
        : new Error(String(error))) as unknown as SDKAssistantMessageError,
    })
  }
}
