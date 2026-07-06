/**
 * Cursor HTTP client.
 *
 * Sends a ConnectRPC-framed protobuf chat request to Cursor's backend over
 * HTTP/2 (via fetch, which negotiates h2 under Bun) and yields parsed frames
 * incrementally as they arrive.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import { getProxyFetchOptions } from 'src/utils/proxy.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { logForDebugging } from '../../../utils/debug.js'
import type {
  CursorApiCredentials,
  CursorMessage,
  CursorTool,
} from './protobufSchema.js'
import { generateCursorBody, wrapConnectRPCFrame } from './protobuf.js'
import { buildCursorConnectHeaders } from './clientPolicy.js'
import { StreamingFrameParser, type FrameResult } from './streamParser.js'
import { clearCursorCredentialsCache } from './auth.js'

const DEFAULT_BASE_URL = 'https://api2.cursor.sh'
const DEFAULT_CHAT_PATH = '/aiserver.v1.ChatService/StreamUnifiedChatWithTools'

/** Clear cached Cursor state (currently: resolved credentials). */
export function clearCursorClientCache(): void {
  clearCursorCredentialsCache()
}

export function getCursorChatUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const baseUrl = (env.CURSOR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const chatPath = env.CURSOR_CHAT_PATH || DEFAULT_CHAT_PATH
  return `${baseUrl}${chatPath}`
}

/**
 * Decide whether to gzip-compress the request payload. Mirrors the reference
 * implementation (compress once the conversation has ≥3 messages); overridable
 * via CURSOR_COMPRESS_REQUESTS (1/0).
 */
function shouldCompressRequest(
  messageCount: number,
  env: Record<string, string | undefined>,
): boolean {
  const override = env.CURSOR_COMPRESS_REQUESTS
  if (override !== undefined) return isEnvTruthy(override)
  return messageCount >= 3
}

function mapHttpStatusToError(status: number): {
  errorType: string
} {
  if (status === 429) return { errorType: 'rate_limit_error' }
  if (status === 401) return { errorType: 'authentication_error' }
  if (status === 403) return { errorType: 'permission_error' }
  return { errorType: status >= 500 ? 'server_error' : 'api_error' }
}

export interface StreamCursorChatParams {
  model: string
  messages: CursorMessage[]
  tools?: CursorTool[]
  reasoningEffort?: string | null
  credentials: CursorApiCredentials
  signal?: AbortSignal
  fetchOverride?: typeof fetch
  envOverride?: Record<string, string | undefined>
}

/**
 * Stream a Cursor chat completion. Yields FrameResult objects (text/thinking/
 * toolCall/error) as they are parsed from the response.
 */
export async function* streamCursorChat(
  params: StreamCursorChatParams,
): AsyncGenerator<FrameResult, void> {
  const {
    model,
    messages,
    tools = [],
    reasoningEffort = null,
    credentials,
    signal,
  } = params
  const env = params.envOverride ?? process.env
  const doFetch = params.fetchOverride ?? fetch

  const url = getCursorChatUrl(env)
  const headers = buildCursorConnectHeaders(credentials, env)

  const protobufBody = generateCursorBody(
    messages,
    model,
    tools,
    reasoningEffort,
  )
  const compress = shouldCompressRequest(messages.length, env)
  const framedBody = wrapConnectRPCFrame(protobufBody, compress)

  logForDebugging(
    `[Cursor] POST ${url} model=${model} messages=${messages.length} tools=${tools.length} compress=${compress}`,
  )

  const response = await doFetch(url, {
    method: 'POST',
    headers,
    body: framedBody as unknown as BodyInit,
    signal,
    ...getProxyFetchOptions({ forAnthropicAPI: false }),
  })

  if (!response.ok || !response.body) {
    const errorText = await safeReadText(response)
    const { errorType } = mapHttpStatusToError(response.status)
    yield {
      type: 'error',
      message: `[${response.status}] ${errorText || 'Cursor upstream error'}`,
      status: response.status,
      errorType,
    }
    return
  }

  const parser = new StreamingFrameParser()
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      for (const frame of parser.push(Buffer.from(value))) {
        yield frame
        if (frame.type === 'error') return
      }
    }
    for (const frame of parser.finish()) {
      yield frame
    }
  } finally {
    reader.releaseLock?.()
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500)
  } catch {
    return ''
  }
}
