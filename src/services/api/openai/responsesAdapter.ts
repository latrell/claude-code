import { randomUUID } from 'crypto'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  forceRefreshChatGPTAuth,
  getValidChatGPTAuth,
  isChatGPTAuthEnabled,
  type ChatGPTAuth,
} from './chatgptAuth.js'
import {
  hasCodexBaseRateLimitHeaders,
  parseCodexRateLimitEvent,
  parseCodexRateLimitHeaders,
} from '../../providerUsage/adapters/codex.js'
import {
  beginProviderUsagePublication,
  publishProviderBuckets,
  type ProviderUsagePublication,
} from '../../providerUsage/store.js'
import { getProxyFetchOptions } from '../../../utils/proxy.js'
import { formatDuration } from '../../../utils/format.js'
import { getAPIProvider } from '../../../utils/model/providers.js'
import {
  chatGPTCodexModelSupportsImages,
  chatGPTCodexModelSupportsParallelToolCalls,
  chatGPTCodexModelUsesResponsesLite,
  getChatGPTCodexModelDefaultVerbosity,
  getChatGPTCodexModelReasoningSummary,
  getChatGPTCredentialScope,
  type ChatGPTCodexReasoningSummary,
  type ChatGPTCodexVerbosity,
} from '../../../utils/model/chatgptModels.js'
import { CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION } from './codexModels.js'

type ResponsesInputItem = Record<string, unknown>
type ResponsesTool = Record<string, unknown>
export type ResponsesReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

type ResponsesRequest = {
  model: string
  stream: true
  store: false
  input: ResponsesInputItem[]
  instructions?: string
  tools?: ResponsesTool[]
  tool_choice?: unknown
  reasoning?: {
    effort?: ResponsesReasoningEffort
    summary?: Exclude<ChatGPTCodexReasoningSummary, 'none'>
    context?: 'all_turns'
  }
  parallel_tool_calls?: boolean
  include?: ['reasoning.encrypted_content']
  prompt_cache_key?: string
  text?: { verbosity: ChatGPTCodexVerbosity }
  client_metadata?: {
    session_id?: string
    thread_id?: string
  }
}

/**
 * State owned by one Codex user turn. The routing value is captured once from
 * the first successful Responses request and replayed unchanged for every
 * retry or continuation in that turn. A fresh object must be created for the
 * next user turn.
 */
export type ChatGPTCodexTurnSession = {
  turnState?: string
  lastResponseEndTurn?: boolean
}

type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

const IMAGE_CONTENT_OMITTED_PLACEHOLDER =
  'image content omitted because you do not support image input'
export const CHATGPT_CODEX_STREAM_IDLE_TIMEOUT_MS = 300_000
export const CHATGPT_CODEX_TERMINAL_EVENT_GRACE_MS = 60_000

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      if (typeof record.text === 'string') return record.text
      if (typeof record.refusal === 'string') return record.refusal
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function textFromResponsesMessageItem(item: unknown): string {
  if (!item || typeof item !== 'object') return ''
  const record = item as Record<string, unknown>
  if (record.type !== 'message') return ''
  return textFromContent(record.content)
}

function convertUserContent(
  content: unknown,
  supportsImages: boolean,
): Array<Record<string, unknown>> {
  if (typeof content === 'string') {
    return content ? [{ type: 'input_text', text: content }] : []
  }
  if (!Array.isArray(content)) {
    const text = textFromContent(content)
    return text ? [{ type: 'input_text', text }] : []
  }
  const result: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      result.push({ type: 'input_text', text: record.text })
    } else if (record.type === 'image_url') {
      const imageUrl = record.image_url as Record<string, unknown> | undefined
      if (typeof imageUrl?.url === 'string') {
        if (!supportsImages) {
          result.push({
            type: 'input_text',
            text: IMAGE_CONTENT_OMITTED_PLACEHOLDER,
          })
          continue
        }
        if (!imageUrl.url.startsWith('data:')) {
          result.push({
            type: 'input_text',
            text: 'image content omitted because remote image URLs are not supported',
          })
        } else {
          result.push({ type: 'input_image', image_url: imageUrl.url })
        }
      }
    }
  }
  if (result.length > 0) return result
  const text = textFromContent(content)
  return text ? [{ type: 'input_text', text }] : []
}

function convertToolOutput(
  content: unknown,
  supportsImages: boolean,
): string | Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return textFromContent(content)
  const result: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    if (
      (record.type === 'text' || record.type === 'input_text') &&
      typeof record.text === 'string'
    ) {
      result.push({ type: 'input_text', text: record.text })
      continue
    }
    if (record.type !== 'image_url') continue
    const imageUrl = record.image_url as Record<string, unknown> | undefined
    if (typeof imageUrl?.url !== 'string') continue
    if (!supportsImages) {
      result.push({
        type: 'input_text',
        text: IMAGE_CONTENT_OMITTED_PLACEHOLDER,
      })
    } else if (!imageUrl.url.startsWith('data:')) {
      result.push({
        type: 'input_text',
        text: 'image content omitted because remote image URLs are not supported',
      })
    } else {
      result.push({ type: 'input_image', image_url: imageUrl.url })
    }
  }
  return result.length > 0 ? result : textFromContent(content)
}

function convertMessagesToResponsesInput(
  messages: unknown[],
  supportsImages: boolean,
): {
  input: ResponsesInputItem[]
  instructions?: string
} {
  const input: ResponsesInputItem[] = []
  const instructions: string[] = []

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const record = message as Record<string, unknown>
    const role = record.role

    if (role === 'system' || role === 'developer') {
      const text = textFromContent(record.content)
      if (text) instructions.push(text)
      continue
    }

    if (role === 'tool') {
      const callId = record.tool_call_id
      if (typeof callId === 'string') {
        input.push({
          type: 'function_call_output',
          call_id: callId,
          output: convertToolOutput(
            record.responses_output_content ?? record.content,
            supportsImages,
          ),
        })
      }
      continue
    }

    if (role === 'assistant') {
      const reasoningItems = record.responses_reasoning_items
      if (Array.isArray(reasoningItems)) {
        for (const item of reasoningItems) {
          const reasoning = asRecord(item)
          if (
            reasoning?.type === 'reasoning' &&
            typeof reasoning.encrypted_content === 'string'
          ) {
            input.push({
              type: 'reasoning',
              summary: Array.isArray(reasoning.summary)
                ? reasoning.summary
                : [],
              ...(Array.isArray(reasoning.content)
                ? { content: reasoning.content }
                : {}),
              encrypted_content: reasoning.encrypted_content,
            })
          }
        }
      }
      const text = textFromContent(record.content)
      if (text) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      const toolCalls = record.tool_calls
      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          if (!toolCall || typeof toolCall !== 'object') continue
          const tc = toolCall as Record<string, unknown>
          const fn = tc.function as Record<string, unknown> | undefined
          const id = typeof tc.id === 'string' ? tc.id : undefined
          const name = typeof fn?.name === 'string' ? fn.name : undefined
          if (!id || !name) continue
          input.push({
            type: 'function_call',
            call_id: id,
            name,
            arguments: typeof fn?.arguments === 'string' ? fn.arguments : '{}',
          })
        }
      }
      continue
    }

    if (role === 'user') {
      input.push({
        type: 'message',
        role: 'user',
        content: convertUserContent(record.content, supportsImages),
      })
    }
  }

  return {
    input,
    instructions:
      instructions.length > 0 ? instructions.join('\n\n') : undefined,
  }
}

function convertToolsToResponses(tools: unknown[]): ResponsesTool[] {
  const result: ResponsesTool[] = []
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue
    const record = tool as Record<string, unknown>
    const fn = record.function as Record<string, unknown> | undefined
    const name = typeof fn?.name === 'string' ? fn.name : undefined
    if (!name) continue
    result.push({
      type: 'function',
      name,
      description: typeof fn?.description === 'string' ? fn.description : '',
      parameters:
        fn?.parameters && typeof fn.parameters === 'object'
          ? fn.parameters
          : { type: 'object', properties: {} },
      strict: false,
    })
  }
  return result
}

function convertToolChoiceToResponses(toolChoice: unknown): unknown {
  if (toolChoice === 'required') return 'required'
  if (toolChoice === 'auto') return 'auto'
  if (!toolChoice || typeof toolChoice !== 'object') return toolChoice
  const record = toolChoice as Record<string, unknown>
  const fn = record.function as Record<string, unknown> | undefined
  if (record.type === 'function' && typeof fn?.name === 'string') {
    return { type: 'function', name: fn.name }
  }
  return toolChoice
}

export function buildResponsesRequest(params: {
  model: string
  messages: unknown[]
  tools: unknown[]
  toolChoice: unknown
  reasoningEffort?: ResponsesReasoningEffort
  promptCacheKey?: string
  credentialScope?: string
}): ResponsesRequest {
  const usesResponsesLite = chatGPTCodexModelUsesResponsesLite(
    params.model,
    params.credentialScope,
  )
  const supportsImages = chatGPTCodexModelSupportsImages(
    params.model,
    params.credentialScope,
  )
  const verbosity = getChatGPTCodexModelDefaultVerbosity(
    params.model,
    params.credentialScope,
  )
  const reasoningSummary = getChatGPTCodexModelReasoningSummary(
    params.model,
    params.credentialScope,
  )
  const { input, instructions } = convertMessagesToResponsesInput(
    params.messages,
    supportsImages,
  )
  const tools = convertToolsToResponses(params.tools)
  const requestInput = usesResponsesLite
    ? [
        {
          type: 'additional_tools',
          role: 'developer',
          tools,
        },
        ...(instructions
          ? [
              {
                type: 'message',
                role: 'developer',
                content: [{ type: 'input_text', text: instructions }],
              },
            ]
          : []),
        ...input,
      ]
    : input
  return {
    model: params.model,
    stream: true,
    store: false,
    input: requestInput,
    ...(!usesResponsesLite && instructions ? { instructions } : {}),
    ...(!usesResponsesLite && tools.length > 0 ? { tools } : {}),
    ...(usesResponsesLite
      ? { tool_choice: 'auto' }
      : params.toolChoice
        ? { tool_choice: convertToolChoiceToResponses(params.toolChoice) }
        : { tool_choice: 'auto' }),
    ...(params.reasoningEffort || reasoningSummary || usesResponsesLite
      ? {
          reasoning: {
            ...(params.reasoningEffort
              ? { effort: params.reasoningEffort }
              : {}),
            ...(reasoningSummary ? { summary: reasoningSummary } : {}),
            ...(usesResponsesLite ? { context: 'all_turns' as const } : {}),
          },
        }
      : {}),
    parallel_tool_calls:
      !usesResponsesLite &&
      chatGPTCodexModelSupportsParallelToolCalls(
        params.model,
        params.credentialScope,
      ),
    include: ['reasoning.encrypted_content'],
    ...(params.promptCacheKey
      ? {
          prompt_cache_key: params.promptCacheKey,
          client_metadata: {
            session_id: params.promptCacheKey,
            thread_id: params.promptCacheKey,
          },
        }
      : {}),
    ...(verbosity ? { text: { verbosity } } : {}),
  }
}

function parseSSEFrame(frame: string): Record<string, unknown> | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return undefined
  const parsed = JSON.parse(data) as unknown
  return parsed && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>)
    : undefined
}

function isResponsesTerminalEvent(event: Record<string, unknown>): boolean {
  return (
    event.type === 'response.completed' ||
    event.type === 'response.incomplete' ||
    event.type === 'response.failed' ||
    event.type === 'response.error' ||
    event.type === 'error'
  )
}

function isResponsesFinalizedOutputEvent(
  event: Record<string, unknown>,
): boolean {
  const type = event.type
  if (
    type === 'response.output_text.done' ||
    type === 'response.refusal.done' ||
    type === 'response.function_call_arguments.done'
  ) {
    return true
  }
  if (type !== 'response.output_item.done') return false
  const item = event.item
  return !(
    item &&
    typeof item === 'object' &&
    (item as Record<string, unknown>).type === 'reasoning'
  )
}

function isResponsesGenerationProgress(
  event: Record<string, unknown>,
): boolean {
  const type = event.type
  if (typeof type !== 'string') return false
  if (type.endsWith('.added') || type.endsWith('.delta')) {
    return true
  }
  if (
    type.startsWith('response.reasoning_') ||
    (type !== 'response.in_progress' && type.endsWith('.in_progress'))
  ) {
    return true
  }
  if (type !== 'response.output_item.done') return false
  const item = event.item
  return Boolean(
    item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).type === 'reasoning',
  )
}

async function* parseSSE(
  response: Response,
  signal: AbortSignal,
  idleTimeoutMs: number,
  terminalEventGraceMs: number,
): AsyncGenerator<Record<string, unknown>, void> {
  if (!response.body) throw new Error('ChatGPT response did not include a body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // Raw bytes are not semantic progress: proxies may emit SSE comments or
  // arbitrary fragments forever after the server has stopped producing a
  // response. Keep an absolute deadline that only real generation events can
  // refresh so those transports remain bounded.
  let streamProgressDeadline = Date.now() + idleTimeoutMs
  let terminalEventDeadline: number | undefined
  const createStreamIdleTimeoutError = (): ChatGPTResponsesAPIError =>
    new ChatGPTResponsesAPIError(
      `ChatGPT Responses API stream idle timeout after ${formatDuration(idleTimeoutMs, { hideTrailingZeros: true })}`,
      { code: 'server_error' },
    )
  const createTerminalEventTimeoutError = (): ChatGPTResponsesAPIError =>
    new ChatGPTResponsesAPIError(
      `ChatGPT Responses API terminal event timeout after ${formatDuration(terminalEventGraceMs, { hideTrailingZeros: true })}`,
      { code: 'server_error', retryable: true },
    )
  const cancelReaderOnAbort = (): void => {
    // The request signal is passed to fetch(), but also cancel the open SSE
    // reader explicitly so an abort-ignoring custom transport cannot keep the
    // server-side Responses request alive while local consumption has stopped.
    void reader.cancel().catch(() => undefined)
  }

  if (signal.aborted) cancelReaderOnAbort()
  else signal.addEventListener('abort', cancelReaderOnAbort, { once: true })
  try {
    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const now = Date.now()
      const streamProgressRemaining = streamProgressDeadline - now
      const terminalEventRemaining =
        terminalEventDeadline === undefined
          ? undefined
          : terminalEventDeadline - now
      const isTerminalEventTimeout =
        terminalEventRemaining !== undefined &&
        terminalEventRemaining <= streamProgressRemaining
      const timeoutMs = isTerminalEventTimeout
        ? terminalEventRemaining
        : streamProgressRemaining
      if (timeoutMs <= 0) {
        const error = isTerminalEventTimeout
          ? createTerminalEventTimeoutError()
          : createStreamIdleTimeoutError()
        await reader.cancel(error).catch(() => undefined)
        throw error
      }
      const streamTimeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              isTerminalEventTimeout
                ? createTerminalEventTimeoutError()
                : createStreamIdleTimeoutError(),
            ),
          timeoutMs,
        )
      })
      let readResult
      try {
        readResult = await Promise.race([reader.read(), streamTimeout])
      } catch (error) {
        await reader.cancel(error).catch(() => undefined)
        throw error
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
      const { done, value } = readResult
      if (done) {
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let boundary = /\r?\n\r?\n/.exec(buffer)
      while (boundary) {
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const parsed = parseSSEFrame(frame)
        if (parsed) {
          const isTerminalEvent = isResponsesTerminalEvent(parsed)
          if (isTerminalEvent) {
            terminalEventDeadline = undefined
          } else if (isResponsesFinalizedOutputEvent(parsed)) {
            const progressAt = Date.now()
            streamProgressDeadline = progressAt + idleTimeoutMs
            terminalEventDeadline = progressAt + terminalEventGraceMs
          } else if (isResponsesGenerationProgress(parsed)) {
            streamProgressDeadline = Date.now() + idleTimeoutMs
            terminalEventDeadline = undefined
          }
          yield parsed
          // Responses terminal events are authoritative. Do not depend on the
          // HTTP peer closing its body after one has already arrived.
          if (isTerminalEvent) return
        }
        boundary = /\r?\n\r?\n/.exec(buffer)
      }
    }
    if (buffer.trim()) {
      const parsed = parseSSEFrame(buffer)
      if (parsed) yield parsed
    }
  } finally {
    signal.removeEventListener('abort', cancelReaderOnAbort)
    // Ensure early generator termination actively closes the HTTP/SSE body.
    // releaseLock() alone leaves a half-open response consuming server work.
    try {
      await reader.cancel()
    } catch {
      // The AbortSignal may already have closed or errored the stream.
    }
    reader.releaseLock()
  }
}

/**
 * Extract Anthropic-style usage from a ChatGPT Responses API response object.
 * Exported for testing.
 */
export function extractUsage(
  response: Record<string, unknown> | undefined,
): AnthropicUsage {
  const usage = response?.usage as Record<string, unknown> | undefined
  const inputDetails = usage?.input_tokens_details as
    | Record<string, unknown>
    | undefined
  const totalInputTokens =
    typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0
  const cacheReadInputTokens =
    typeof inputDetails?.cached_tokens === 'number'
      ? inputDetails.cached_tokens
      : 0
  const cacheWriteInputTokens =
    typeof inputDetails?.cache_write_tokens === 'number'
      ? inputDetails.cache_write_tokens
      : 0
  return {
    // Responses input_tokens includes cached and newly cached tokens. The
    // Anthropic usage shape consumed downstream stores those three buckets
    // disjointly and adds them, so retain only uncached input here.
    input_tokens: Math.max(
      0,
      totalInputTokens - cacheReadInputTokens - cacheWriteInputTokens,
    ),
    output_tokens:
      typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
    cache_creation_input_tokens: cacheWriteInputTokens,
    cache_read_input_tokens: cacheReadInputTokens,
  }
}

function mapStopReason(
  response: Record<string, unknown> | undefined,
  usedTool: boolean,
): string {
  if (response?.status === 'incomplete') return 'max_tokens'
  return usedTool ? 'tool_use' : 'end_turn'
}

class ChatGPTResponsesAPIError extends Error {
  readonly status: number | undefined
  readonly code: string | undefined
  readonly requestId: string | undefined
  readonly responseId: string | undefined
  readonly retryable: boolean | undefined
  readonly retryAfterMs: number | undefined

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      requestId?: string
      responseId?: string
      retryable?: boolean
      retryAfterMs?: number
    } = {},
  ) {
    super(message)
    this.name = 'ChatGPTResponsesAPIError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.responseId = options.responseId
    this.retryable = options.retryable
    this.retryAfterMs = options.retryAfterMs
  }
}

export function isChatGPTCodexContextLengthError(error: unknown): boolean {
  return asRecord(error)?.code === 'context_length_exceeded'
}

const FATAL_RESPONSES_FAILED_CODES = new Set([
  'context_length_exceeded',
  'insufficient_quota',
  'usage_not_included',
  'cyber_policy',
  'invalid_prompt',
  'bio_policy',
  'server_is_overloaded',
  'slow_down',
])

function parseRateLimitRetryAfter(
  code: string | undefined,
  message: string | undefined,
): number | undefined {
  if (code !== 'rate_limit_exceeded' || !message) return undefined
  const match = /try again in\s*(\d+(?:\.\d+)?)\s*(s|ms|seconds?)/i.exec(
    message,
  )
  if (!match?.[1] || !match[2]) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return undefined
  return match[2].toLowerCase() === 'ms'
    ? Math.trunc(value)
    : Math.round(value * 1000)
}

function parseHTTPRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after')?.trim()
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
  const date = Date.parse(header)
  if (!Number.isFinite(date)) return undefined
  const delay = date - Date.now()
  return delay > 0 ? delay : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function createResponsesStreamError(
  event: Record<string, unknown>,
): ChatGPTResponsesAPIError {
  const type = event.type
  const response = asRecord(event.response)
  const nestedError =
    type === 'response.failed'
      ? asRecord(response?.error)
      : asRecord(event.error)
  const error = nestedError ?? event
  const message =
    typeof error.message === 'string'
      ? error.message
      : type === 'response.failed'
        ? 'ChatGPT Responses API failed'
        : 'ChatGPT Responses API error'
  const providerType =
    typeof error.type === 'string' &&
    !['error', 'response.error', 'response.failed'].includes(error.type)
      ? error.type
      : undefined
  const code =
    typeof error.code === 'string'
      ? error.code
      : (providerType ??
        (/^An error occurred while processing your request\./i.test(message)
          ? 'server_error'
          : undefined))
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof event.status === 'number'
        ? event.status
        : undefined
  const requestIdFromMessage = /request ID\s+([a-z0-9-]+)/i.exec(message)?.[1]
  const requestId =
    typeof error.request_id === 'string'
      ? error.request_id
      : typeof event.request_id === 'string'
        ? event.request_id
        : requestIdFromMessage
  const responseId =
    typeof response?.id === 'string'
      ? response.id
      : typeof event.response_id === 'string'
        ? event.response_id
        : undefined
  const retryable =
    type === 'response.failed'
      ? !FATAL_RESPONSES_FAILED_CODES.has(code ?? '')
      : undefined
  return new ChatGPTResponsesAPIError(message, {
    status,
    code,
    requestId,
    responseId,
    retryable,
    retryAfterMs: parseRateLimitRetryAfter(code, message),
  })
}

function parseHTTPError(
  response: Response,
  text: string,
): ChatGPTResponsesAPIError {
  let body: Record<string, unknown> | undefined
  try {
    body = asRecord(JSON.parse(text) as unknown)
  } catch {
    body = undefined
  }
  const nested = asRecord(body?.error) ?? body
  const providerMessage =
    typeof nested?.message === 'string' ? nested.message : undefined
  const code =
    typeof nested?.code === 'string'
      ? nested.code
      : typeof nested?.type === 'string'
        ? nested.type
        : undefined
  const requestId =
    response.headers.get('x-request-id') ??
    (typeof nested?.request_id === 'string'
      ? nested.request_id
      : typeof body?.request_id === 'string'
        ? body.request_id
        : undefined)
  const detail = providerMessage ?? (text ? text.slice(0, 500) : undefined)
  const requestIdSuffix =
    requestId && !detail?.toLowerCase().includes(requestId.toLowerCase())
      ? ` (request ID ${requestId})`
      : ''
  return new ChatGPTResponsesAPIError(
    `ChatGPT Responses API request failed (${response.status})${detail ? `: ${detail}` : ''}${requestIdSuffix}`,
    {
      status: response.status,
      code,
      requestId,
      retryAfterMs:
        parseHTTPRetryAfter(response) ??
        parseRateLimitRetryAfter(code, providerMessage),
    },
  )
}

export async function* adaptResponsesStreamToAnthropic(
  stream: AsyncIterable<Record<string, unknown>>,
  model: string,
  turnSession?: ChatGPTCodexTurnSession,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  if (turnSession) turnSession.lastResponseEndTurn = undefined
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const pendingFunctionCalls = new Map<
    number,
    {
      name: string
      id: string
      arguments: string
    }
  >()
  const completedFunctionCallIndexes = new Set<number>()
  const pendingReasoning = new Map<
    number,
    {
      summaryText: string
      contentText: string
      summary?: unknown[]
      content?: unknown[]
      signature?: string
    }
  >()
  const responseTextByOutputIndex = new Map<number, string>()
  const emittedTextOutputIndexes = new Set<number>()
  let started = false
  let currentContentIndex = -1
  let textBlockOpen = false
  let hasTextDelta = false
  let pendingTextPrefix = ''
  let latestReasoningOutputIndex = -1

  const ensureStarted = async function* () {
    if (started) return
    started = true
    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    } as unknown as BetaRawMessageStreamEvent
  }

  const getPendingReasoning = (
    outputIndex: number,
  ): {
    summaryText: string
    contentText: string
    summary?: unknown[]
    content?: unknown[]
    signature?: string
  } => {
    const existing = pendingReasoning.get(outputIndex)
    if (existing) return existing
    const created = { summaryText: '', contentText: '' }
    pendingReasoning.set(outputIndex, created)
    return created
  }

  const flushPendingReasoning = async function* () {
    for (const reasoning of pendingReasoning.values()) {
      const thinkingText =
        reasoning.summaryText ||
        reasoning.contentText ||
        textFromContent(reasoning.summary) ||
        textFromContent(reasoning.content)
      if (!thinkingText && !reasoning.signature) continue
      const summary =
        reasoning.summary ??
        (reasoning.summaryText
          ? [{ type: 'summary_text', text: reasoning.summaryText }]
          : [])
      const content =
        reasoning.content ??
        (reasoning.contentText
          ? [{ type: 'reasoning_text', text: reasoning.contentText }]
          : undefined)
      const responsesReasoningItem = reasoning.signature
        ? {
            type: 'reasoning',
            summary,
            ...(content ? { content } : {}),
            encrypted_content: reasoning.signature,
          }
        : undefined
      for await (const startedEvent of ensureStarted()) yield startedEvent
      currentContentIndex++
      yield {
        type: 'content_block_start',
        index: currentContentIndex,
        content_block: {
          type: 'thinking',
          thinking: '',
          signature: '',
          ...(responsesReasoningItem
            ? { responses_reasoning_item: responsesReasoningItem }
            : {}),
        },
      } as BetaRawMessageStreamEvent
      if (thinkingText) {
        yield {
          type: 'content_block_delta',
          index: currentContentIndex,
          delta: { type: 'thinking_delta', thinking: thinkingText },
        } as BetaRawMessageStreamEvent
      }
      if (reasoning.signature) {
        yield {
          type: 'content_block_delta',
          index: currentContentIndex,
          delta: {
            type: 'signature_delta',
            signature: reasoning.signature,
          },
        } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'content_block_stop',
        index: currentContentIndex,
      } as BetaRawMessageStreamEvent
    }
    pendingReasoning.clear()
  }

  for await (const event of stream) {
    const type = event.type

    if (type === 'codex.rate_limits') {
      // Transport metadata is published by createChatGPTResponsesStream,
      // where the credential scope is still available for ownership checks.
      continue
    }

    if (
      type === 'response.output_text.delta' ||
      type === 'response.refusal.delta'
    ) {
      const text = String(event.delta ?? '')
      if (!hasTextDelta && !text.trim()) {
        pendingTextPrefix += text
        continue
      }
      const emittedText = hasTextDelta ? text : pendingTextPrefix + text
      pendingTextPrefix = ''
      hasTextDelta = true
      for await (const reasoningEvent of flushPendingReasoning()) {
        yield reasoningEvent
      }
      for await (const startedEvent of ensureStarted()) yield startedEvent
      if (!textBlockOpen) {
        currentContentIndex++
        textBlockOpen = true
        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: { type: 'text', text: '' },
        } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'content_block_delta',
        index: currentContentIndex,
        delta: { type: 'text_delta', text: emittedText },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (
      type === 'response.reasoning_text.delta' ||
      type === 'response.reasoning_summary_text.delta'
    ) {
      const outputIndex =
        typeof event.output_index === 'number'
          ? event.output_index
          : latestReasoningOutputIndex
      latestReasoningOutputIndex = outputIndex
      const reasoning = getPendingReasoning(outputIndex)
      if (type === 'response.reasoning_summary_text.delta') {
        reasoning.summaryText += String(event.delta ?? '')
      } else {
        reasoning.contentText += String(event.delta ?? '')
      }
      continue
    }

    if (type === 'response.reasoning_summary_part.added') {
      const outputIndex =
        typeof event.output_index === 'number'
          ? event.output_index
          : latestReasoningOutputIndex
      latestReasoningOutputIndex = outputIndex
      const reasoning = getPendingReasoning(outputIndex)
      if (reasoning.summaryText) reasoning.summaryText += '\n\n'
      continue
    }

    if (type === 'response.reasoning_summary_text.done') {
      const outputIndex =
        typeof event.output_index === 'number'
          ? event.output_index
          : latestReasoningOutputIndex
      latestReasoningOutputIndex = outputIndex
      const reasoning = getPendingReasoning(outputIndex)
      const text = typeof event.text === 'string' ? event.text : ''
      if (text && !reasoning.summaryText.endsWith(text)) {
        reasoning.summaryText += text
      }
      continue
    }

    if (type === 'response.output_item.added') {
      const item = event.item as Record<string, unknown> | undefined
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      if (item?.type === 'reasoning' && outputIndex >= 0) {
        latestReasoningOutputIndex = outputIndex
        const reasoning = getPendingReasoning(outputIndex)
        if (Array.isArray(item.summary)) reasoning.summary = item.summary
        if (Array.isArray(item.content)) reasoning.content = item.content
        if (typeof item.encrypted_content === 'string') {
          reasoning.signature = item.encrypted_content
        }
      } else if (item?.type === 'function_call' && outputIndex >= 0) {
        const id = String(item.call_id ?? item.id ?? `call_${outputIndex}`)
        const name = String(item.name ?? '')
        const initialArguments =
          typeof item.arguments === 'string' ? item.arguments : ''
        pendingFunctionCalls.set(outputIndex, {
          name,
          id,
          arguments: initialArguments,
        })
      } else if (outputIndex >= 0) {
        const text = textFromResponsesMessageItem(item)
        if (text.trim()) {
          responseTextByOutputIndex.set(outputIndex, text)
        }
      }
      continue
    }

    if (type === 'response.function_call_arguments.delta') {
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      if (outputIndex < 0) continue
      const pending = pendingFunctionCalls.get(outputIndex) ?? {
        name: '',
        id: `call_${outputIndex}`,
        arguments: '',
      }
      pending.arguments += String(event.delta ?? '')
      pendingFunctionCalls.set(outputIndex, pending)
      continue
    }

    if (type === 'response.output_item.done') {
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      const item = asRecord(event.item)
      if (item?.type === 'reasoning' || pendingReasoning.has(outputIndex)) {
        latestReasoningOutputIndex = outputIndex
        const reasoning = getPendingReasoning(outputIndex)
        if (Array.isArray(item?.summary)) reasoning.summary = item.summary
        if (Array.isArray(item?.content)) reasoning.content = item.content
        const signature =
          typeof item?.encrypted_content === 'string'
            ? item.encrypted_content
            : undefined
        if (signature) reasoning.signature = signature
        continue
      }
      if (
        item?.type === 'function_call' &&
        outputIndex >= 0 &&
        !completedFunctionCallIndexes.has(outputIndex)
      ) {
        if (
          typeof item.call_id !== 'string' ||
          typeof item.name !== 'string' ||
          typeof item.arguments !== 'string'
        ) {
          throw new ChatGPTResponsesAPIError(
            'ChatGPT Responses API returned an incomplete final function call',
            { code: 'server_error', retryable: true },
          )
        }
        const pending = pendingFunctionCalls.get(outputIndex)
        const streamedArguments = pending?.arguments ?? ''
        const finalArguments = item.arguments
        if (!finalArguments.startsWith(streamedArguments)) {
          throw new ChatGPTResponsesAPIError(
            'ChatGPT Responses API returned conflicting final function-call arguments',
            { code: 'server_error', retryable: true },
          )
        }
        const authoritativeArguments = finalArguments
        const id = item.call_id
        const name = item.name
        if (textBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          textBlockOpen = false
        }
        for await (const reasoningEvent of flushPendingReasoning()) {
          yield reasoningEvent
        }
        for await (const startedEvent of ensureStarted()) yield startedEvent
        currentContentIndex++
        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: { type: 'tool_use', id, name, input: {} },
        } as BetaRawMessageStreamEvent
        if (authoritativeArguments) {
          yield {
            type: 'content_block_delta',
            index: currentContentIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: authoritativeArguments,
            },
          } as BetaRawMessageStreamEvent
        }
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        completedFunctionCallIndexes.add(outputIndex)
        pendingFunctionCalls.delete(outputIndex)
      }
      if (item?.type === 'function_call') continue
      if (
        outputIndex >= 0 &&
        !hasTextDelta &&
        !emittedTextOutputIndexes.has(outputIndex)
      ) {
        const text =
          textFromResponsesMessageItem(event.item) ||
          responseTextByOutputIndex.get(outputIndex) ||
          ''
        if (text.trim()) {
          for await (const reasoningEvent of flushPendingReasoning()) {
            yield reasoningEvent
          }
          for await (const startedEvent of ensureStarted()) yield startedEvent
          currentContentIndex++
          emittedTextOutputIndexes.add(outputIndex)
          yield {
            type: 'content_block_start',
            index: currentContentIndex,
            content_block: { type: 'text', text: '' },
          } as BetaRawMessageStreamEvent
          yield {
            type: 'content_block_delta',
            index: currentContentIndex,
            delta: { type: 'text_delta', text },
          } as BetaRawMessageStreamEvent
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
        }
      }
      continue
    }

    if (
      type === 'error' ||
      type === 'response.error' ||
      type === 'response.failed'
    ) {
      throw createResponsesStreamError(event)
    }

    if (type === 'response.completed' || type === 'response.incomplete') {
      const response = asRecord(event.response)
      if (!response) {
        throw new ChatGPTResponsesAPIError(
          'ChatGPT Responses API terminal event did not include a response payload',
          { code: 'server_error' },
        )
      }
      if (type === 'response.incomplete') {
        const details = asRecord(response?.incomplete_details)
        const reason =
          typeof details?.reason === 'string'
            ? details.reason
            : 'response_incomplete'
        throw new ChatGPTResponsesAPIError(
          `ChatGPT Responses API returned an incomplete response (${reason})`,
          {
            code: reason,
            retryable: true,
            responseId:
              typeof response?.id === 'string' ? response.id : undefined,
          },
        )
      }
      if (pendingFunctionCalls.size > 0) {
        throw new ChatGPTResponsesAPIError(
          'ChatGPT Responses API completed before finalizing a function call',
          { code: 'server_error', retryable: true },
        )
      }
      const endTurn =
        typeof response.end_turn === 'boolean' ? response.end_turn : undefined
      if (turnSession && endTurn !== undefined) {
        turnSession.lastResponseEndTurn = endTurn
      }
      if (
        endTurn !== false &&
        !hasTextDelta &&
        emittedTextOutputIndexes.size === 0 &&
        completedFunctionCallIndexes.size === 0
      ) {
        throw new ChatGPTResponsesAPIError(
          'ChatGPT Responses API completed without text or a tool call',
          {
            code: 'server_error',
            retryable: true,
            responseId:
              typeof response.id === 'string' ? response.id : undefined,
          },
        )
      }
      // An empty completion is only valid when the Codex backend explicitly
      // requests another sample with end_turn=false. Do not start on
      // transport-only lifecycle events such as response.created or
      // response.in_progress so failed/empty attempts stay retryable.
      if (textBlockOpen) {
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        textBlockOpen = false
      }
      for await (const reasoningEvent of flushPendingReasoning()) {
        yield reasoningEvent
      }
      for await (const startedEvent of ensureStarted()) yield startedEvent
      yield {
        type: 'message_delta',
        delta: {
          stop_reason: mapStopReason(
            response,
            completedFunctionCallIndexes.size > 0,
          ),
          stop_sequence: null,
        },
        usage: extractUsage(response),
      } as unknown as BetaRawMessageStreamEvent
      yield { type: 'message_stop' } as BetaRawMessageStreamEvent
      return
    }
  }

  throw new TypeError(
    'ChatGPT Responses API stream terminated before a terminal event',
  )
}

function normalizeCredentialScope(scope: string | undefined): string {
  return scope?.trim() || 'default'
}

function canPublishProviderUsage(
  scope: string | undefined,
  publication: ProviderUsagePublication | undefined,
): publication is ProviderUsagePublication {
  return (
    publication !== undefined &&
    getAPIProvider() === 'openai' &&
    isChatGPTAuthEnabled() &&
    normalizeCredentialScope(scope) ===
      normalizeCredentialScope(getChatGPTCredentialScope())
  )
}

function isDefaultCodexRateLimitEvent(event: Record<string, unknown>): boolean {
  const rawLimitId =
    (typeof event.metered_limit_name === 'string'
      ? event.metered_limit_name
      : undefined) ??
    (typeof event.limit_name === 'string' ? event.limit_name : undefined) ??
    'codex'
  return rawLimitId.trim().toLowerCase().replace(/-/g, '_') === 'codex'
}

async function* trackCodexRateLimitEvents(
  stream: AsyncIterable<Record<string, unknown>>,
  credentialScope: string | undefined,
  publication: ProviderUsagePublication | undefined,
): AsyncGenerator<Record<string, unknown>, void> {
  for await (const event of stream) {
    if (
      canPublishProviderUsage(credentialScope, publication) &&
      isDefaultCodexRateLimitEvent(event)
    ) {
      try {
        const buckets = parseCodexRateLimitEvent(event)
        // Plan/credits-only sparse events must not erase the last complete
        // window snapshot. Non-default limit ids are intentionally ignored
        // until the store can merge snapshots by id.
        if (buckets && buckets.length > 0) {
          publishProviderBuckets(publication, 'openai', buckets)
        }
      } catch {
        // Usage metadata must never interrupt the assistant response stream.
      }
    }
    yield event
  }
}

export async function createChatGPTResponsesStream(params: {
  request: ResponsesRequest
  signal: AbortSignal
  fetchOverride?: typeof fetch
  credentialScope?: string
  turnSession?: ChatGPTCodexTurnSession
  /** Test seam; production follows Codex's five-minute stream idle timeout. */
  streamIdleTimeoutMs?: number
  /** Test seam; production allows one minute for a terminal event after output. */
  terminalEventGraceMs?: number
}): Promise<AsyncIterable<Record<string, unknown>>> {
  const providerUsagePublication =
    getAPIProvider() === 'openai' &&
    isChatGPTAuthEnabled() &&
    normalizeCredentialScope(params.credentialScope) ===
      normalizeCredentialScope(getChatGPTCredentialScope())
      ? beginProviderUsagePublication()
      : undefined
  let auth = await getValidChatGPTAuth(params.credentialScope)
  const fetchFn = params.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const createHeaders = (currentAuth: ChatGPTAuth): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${currentAuth.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Origin: 'https://chatgpt.com',
      Referer: 'https://chatgpt.com/',
      originator: 'claude-code-best',
      version: CHATGPT_CODEX_PROTOCOL_CLIENT_VERSION,
    }
    if (
      chatGPTCodexModelUsesResponsesLite(
        params.request.model,
        params.credentialScope,
      )
    ) {
      headers['x-openai-internal-codex-responses-lite'] = 'true'
    }
    if (params.request.prompt_cache_key) {
      headers['session-id'] = params.request.prompt_cache_key
      headers['thread-id'] = params.request.prompt_cache_key
      headers['x-client-request-id'] = params.request.prompt_cache_key
    }
    if (currentAuth.accountId) {
      headers['ChatGPT-Account-Id'] = currentAuth.accountId
    }
    if (currentAuth.isFedRAMP) {
      headers['X-OpenAI-Fedramp'] = 'true'
    }
    if (params.turnSession?.turnState !== undefined) {
      headers['x-codex-turn-state'] = params.turnSession.turnState
    }
    return headers
  }

  const send = (currentAuth: ChatGPTAuth): Promise<Response> =>
    fetchFn('https://chatgpt.com/backend-api/codex/responses', {
      ...getProxyFetchOptions({ forAnthropicAPI: false }),
      method: 'POST',
      headers: createHeaders(currentAuth),
      body: JSON.stringify(params.request),
      signal: params.signal,
    })

  let response = await send(auth)
  if (response.status === 401 && !params.signal.aborted) {
    const firstErrorText = await response.text().catch(() => '')
    try {
      auth = await forceRefreshChatGPTAuth(
        params.credentialScope,
        auth.accessToken,
        auth.accountId,
        auth.credentialId,
      )
    } catch {
      throw parseHTTPError(response, firstErrorText)
    }
    response = await send(auth)
  }

  // Publish the final response's quota headers before handling HTTP errors.
  // A 429 response carries the most important 100%-used snapshot.
  if (
    canPublishProviderUsage(params.credentialScope, providerUsagePublication)
  ) {
    try {
      const codexBuckets = parseCodexRateLimitHeaders(response.headers, {
        baseOnly: true,
      })
      if (
        codexBuckets !== null &&
        hasCodexBaseRateLimitHeaders(response.headers)
      ) {
        // A valid base family is authoritative even when it parses to an
        // explicit empty snapshot. Additional-only families never clear it.
        publishProviderBuckets(providerUsagePublication, 'openai', codexBuckets)
      }
    } catch {
      // Usage tracking must not affect response handling.
    }
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw parseHTTPError(response, text)
  }
  const turnSession = params.turnSession
  if (turnSession && turnSession.turnState === undefined) {
    const turnState = response.headers.get('x-codex-turn-state')
    if (turnState !== null) turnSession.turnState = turnState
  }
  const streamIdleTimeoutMs =
    typeof params.streamIdleTimeoutMs === 'number' &&
    Number.isFinite(params.streamIdleTimeoutMs) &&
    params.streamIdleTimeoutMs > 0
      ? params.streamIdleTimeoutMs
      : CHATGPT_CODEX_STREAM_IDLE_TIMEOUT_MS
  const terminalEventGraceMs =
    typeof params.terminalEventGraceMs === 'number' &&
    Number.isFinite(params.terminalEventGraceMs) &&
    params.terminalEventGraceMs > 0
      ? params.terminalEventGraceMs
      : CHATGPT_CODEX_TERMINAL_EVENT_GRACE_MS
  return trackCodexRateLimitEvents(
    parseSSE(
      response,
      params.signal,
      streamIdleTimeoutMs,
      terminalEventGraceMs,
    ),
    params.credentialScope,
    providerUsagePublication,
  )
}
