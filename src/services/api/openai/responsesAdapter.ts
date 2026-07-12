import { randomUUID } from 'crypto'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { getValidChatGPTAuth } from './chatgptAuth.js'
import { openaiAdapter } from '../../providerUsage/adapters/openai.js'
import { updateProviderBuckets } from '../../providerUsage/store.js'
import { getProxyFetchOptions } from '../../../utils/proxy.js'

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
  reasoning?: { effort: ResponsesReasoningEffort }
  parallel_tool_calls?: boolean
}

type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      if (typeof record.text === 'string') return record.text
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

function convertUserContent(content: unknown): unknown {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return textFromContent(content)
  const result: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      result.push({ type: 'input_text', text: record.text })
    } else if (record.type === 'image_url') {
      const imageUrl = record.image_url as Record<string, unknown> | undefined
      if (typeof imageUrl?.url === 'string') {
        result.push({ type: 'input_image', image_url: imageUrl.url })
      }
    }
  }
  return result.length > 0 ? result : textFromContent(content)
}

function convertMessagesToResponsesInput(messages: unknown[]): {
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
          output: textFromContent(record.content),
        })
      }
      continue
    }

    if (role === 'assistant') {
      const text = textFromContent(record.content)
      if (text) {
        input.push({ role: 'assistant', content: text })
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
        role: 'user',
        content: convertUserContent(record.content),
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
}): ResponsesRequest {
  const { input, instructions } = convertMessagesToResponsesInput(
    params.messages,
  )
  const tools = convertToolsToResponses(params.tools)
  return {
    model: params.model,
    stream: true,
    store: false,
    input,
    ...(instructions ? { instructions } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(params.toolChoice
      ? { tool_choice: convertToolChoiceToResponses(params.toolChoice) }
      : {}),
    ...(params.reasoningEffort
      ? { reasoning: { effort: params.reasoningEffort } }
      : {}),
    parallel_tool_calls: true,
  }
}

async function* parseSSE(
  response: Response,
): AsyncGenerator<Record<string, unknown>, void> {
  if (!response.body) throw new Error('ChatGPT response did not include a body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let splitAt = buffer.indexOf('\n\n')
      while (splitAt >= 0) {
        const frame = buffer.slice(0, splitAt)
        buffer = buffer.slice(splitAt + 2)
        const data = frame
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (data && data !== '[DONE]') {
          const parsed = JSON.parse(data) as unknown
          if (parsed && typeof parsed === 'object') {
            yield parsed as Record<string, unknown>
          }
        }
        splitAt = buffer.indexOf('\n\n')
      }
    }
  } finally {
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
  return {
    input_tokens:
      typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
    output_tokens:
      typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens:
      typeof inputDetails?.cached_tokens === 'number'
        ? inputDetails.cached_tokens
        : 0,
  }
}

function mapStopReason(response: Record<string, unknown> | undefined): string {
  if (response?.status === 'incomplete') return 'max_tokens'
  return 'end_turn'
}

class ChatGPTResponsesAPIError extends Error {
  readonly status: number | undefined
  readonly code: string | undefined

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message)
    this.name = 'ChatGPTResponsesAPIError'
    this.status = options.status
    this.code = options.code
  }
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
  const code = typeof error.code === 'string' ? error.code : undefined
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof event.status === 'number'
        ? event.status
        : undefined
  return new ChatGPTResponsesAPIError(message, { status, code })
}

export async function* adaptResponsesStreamToAnthropic(
  stream: AsyncIterable<Record<string, unknown>>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const toolBlocks = new Map<
    number,
    { contentIndex: number; open: boolean; name: string; id: string }
  >()
  const responseTextByOutputIndex = new Map<number, string>()
  const emittedTextOutputIndexes = new Set<number>()
  let started = false
  let currentContentIndex = -1
  let textBlockOpen = false
  let thinkingBlockOpen = false
  let hasTextDelta = false

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

  for await (const event of stream) {
    const type = event.type

    if (type === 'response.output_text.delta') {
      for await (const startedEvent of ensureStarted()) yield startedEvent
      if (!textBlockOpen) {
        if (thinkingBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          thinkingBlockOpen = false
        }
        currentContentIndex++
        textBlockOpen = true
        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: { type: 'text', text: '' },
        } as BetaRawMessageStreamEvent
      }
      const text = String(event.delta ?? '')
      if (text) hasTextDelta = true
      yield {
        type: 'content_block_delta',
        index: currentContentIndex,
        delta: { type: 'text_delta', text },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (type === 'response.reasoning_text.delta') {
      for await (const startedEvent of ensureStarted()) yield startedEvent
      if (!thinkingBlockOpen) {
        if (textBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          textBlockOpen = false
        }
        currentContentIndex++
        thinkingBlockOpen = true
        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'content_block_delta',
        index: currentContentIndex,
        delta: { type: 'thinking_delta', thinking: String(event.delta ?? '') },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (type === 'response.output_item.added') {
      const item = event.item as Record<string, unknown> | undefined
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      if (item?.type === 'function_call' && outputIndex >= 0) {
        for await (const startedEvent of ensureStarted()) yield startedEvent
        if (textBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          textBlockOpen = false
        }
        if (thinkingBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          thinkingBlockOpen = false
        }
        currentContentIndex++
        const id = String(item.call_id ?? item.id ?? `call_${outputIndex}`)
        const name = String(item.name ?? '')
        toolBlocks.set(outputIndex, {
          contentIndex: currentContentIndex,
          open: true,
          name,
          id,
        })
        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: { type: 'tool_use', id, name, input: {} },
        } as BetaRawMessageStreamEvent
      } else if (outputIndex >= 0) {
        const text = textFromResponsesMessageItem(item)
        if (text) {
          responseTextByOutputIndex.set(outputIndex, text)
        }
      }
      continue
    }

    if (type === 'response.function_call_arguments.delta') {
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      const block = toolBlocks.get(outputIndex)
      if (block) {
        for await (const startedEvent of ensureStarted()) yield startedEvent
        yield {
          type: 'content_block_delta',
          index: block.contentIndex,
          delta: {
            type: 'input_json_delta',
            partial_json: String(event.delta ?? ''),
          },
        } as BetaRawMessageStreamEvent
      }
      continue
    }

    if (type === 'response.output_item.done') {
      const outputIndex =
        typeof event.output_index === 'number' ? event.output_index : -1
      const block = toolBlocks.get(outputIndex)
      if (block?.open) {
        yield {
          type: 'content_block_stop',
          index: block.contentIndex,
        } as BetaRawMessageStreamEvent
        block.open = false
      }
      if (
        outputIndex >= 0 &&
        !hasTextDelta &&
        !emittedTextOutputIndexes.has(outputIndex)
      ) {
        const text =
          textFromResponsesMessageItem(event.item) ||
          responseTextByOutputIndex.get(outputIndex) ||
          ''
        if (text) {
          for await (const startedEvent of ensureStarted()) yield startedEvent
          if (thinkingBlockOpen) {
            yield {
              type: 'content_block_stop',
              index: currentContentIndex,
            } as BetaRawMessageStreamEvent
            thinkingBlockOpen = false
          }
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
      // A completion without content is still a valid assistant message. Start
      // it here, but do not start on transport-only lifecycle events such as
      // response.created/response.in_progress: a disconnect after those events
      // must remain inside startStreamEagerly's retry scope.
      for await (const startedEvent of ensureStarted()) yield startedEvent
      if (textBlockOpen) {
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        textBlockOpen = false
      }
      if (thinkingBlockOpen) {
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        thinkingBlockOpen = false
      }
      const response = event.response as Record<string, unknown> | undefined
      yield {
        type: 'message_delta',
        delta: { stop_reason: mapStopReason(response), stop_sequence: null },
        usage: extractUsage(response),
      } as unknown as BetaRawMessageStreamEvent
      yield { type: 'message_stop' } as BetaRawMessageStreamEvent
    }
  }
}

export async function createChatGPTResponsesStream(params: {
  request: ResponsesRequest
  signal: AbortSignal
  fetchOverride?: typeof fetch
  credentialScope?: string
}): Promise<AsyncIterable<Record<string, unknown>>> {
  const auth = await getValidChatGPTAuth(params.credentialScope)
  const fetchFn = params.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    Origin: 'https://chatgpt.com',
    Referer: 'https://chatgpt.com/',
    originator: 'claude-code-best',
  }
  if (auth.accountId) {
    headers['ChatGPT-Account-Id'] = auth.accountId
  }
  const response = await fetchFn(
    'https://chatgpt.com/backend-api/codex/responses',
    {
      ...getProxyFetchOptions({ forAnthropicAPI: false }),
      method: 'POST',
      headers,
      body: JSON.stringify(params.request),
      signal: params.signal,
    },
  )
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ChatGPTResponsesAPIError(
      `ChatGPT Responses API request failed (${response.status})${text ? `: ${text.slice(0, 500)}` : ''}`,
      { status: response.status },
    )
  }
  // Feed response headers into the provider usage store so the status-line
  // can display rate-limit buckets for compatible providers. Only update when
  // headers carry usable data – the ChatGPT Codex backend does not return
  // x-ratelimit-* headers; usage data comes from fetchCodexUsage instead.
  try {
    const buckets = openaiAdapter.parseHeaders(response.headers)
    if (buckets.length > 0) {
      updateProviderBuckets('openai', buckets)
    }
  } catch {
    // Ignore — usage tracking must not break the stream.
  }
  return parseSSE(response)
}
