/**
 * Cursor HTTP client.
 *
 * Sends a ConnectRPC-framed protobuf chat request to Cursor's backend over
 * HTTP/2 (via fetch, which negotiates h2 under Bun) and yields parsed frames
 * incrementally as they arrive.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import memoize from 'lodash-es/memoize.js'
import type * as undici from 'undici'
import { getCACertificates } from 'src/utils/caCerts.js'
import { getMTLSConfig } from 'src/utils/mtls.js'
import {
  getNoProxy,
  getProxyFetchOptions,
  getProxyUrl,
} from 'src/utils/proxy.js'
import { getUndiciTimeoutOptions } from 'src/utils/fetchTimeouts.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../../utils/envUtils.js'
import { logForDebugging } from '../../../utils/debug.js'
import type { EffortValue } from '../../../utils/effort.js'
import type {
  CursorApiCredentials,
  CursorMessage,
  CursorTool,
} from './protobufSchema.js'
import { generateCursorBody, wrapConnectRPCFrame } from './protobuf.js'
import { buildCursorConnectHeaders } from './clientPolicy.js'
import { isCursorMaxModeEnabled } from './models.js'
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
 * Reasoning effort sent as the protobuf THINKING_LEVEL (field 49).
 * Explicit CURSOR_REASONING_EFFORT wins, then the query's effort value
 * (user /effort, CLI --effort, or the connection profile's pinned
 * thinkingEffort merged in query.ts) — mirroring how the other 3P compat
 * layers consume options.effortValue. Cursor only has MEDIUM/HIGH levels:
 * max/xhigh clamp to high, numeric (ant-only) follows the openai layer and
 * maps to high, low maps to null (UNSPECIFIED, the backend default —
 * Cursor has no LOW level). Note effort-suffixed model ids
 * (claude-sonnet-5-thinking-high, gpt-5.5-medium…) encode their own effort;
 * this field mainly affects unsuffixed models such as Auto/default.
 */
export function resolveReasoningEffort(
  env: Record<string, string | undefined>,
  effortValue?: EffortValue,
): string | null {
  const raw = env.CURSOR_REASONING_EFFORT?.trim().toLowerCase()
  if (raw === 'medium' || raw === 'high') return raw
  if (effortValue === 'medium') return 'medium'
  if (
    effortValue === 'high' ||
    effortValue === 'xhigh' ||
    effortValue === 'max' ||
    typeof effortValue === 'number'
  ) {
    return 'high'
  }
  return null
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

/**
 * Node-only undici dispatcher with ALPN h2 enabled. Node's built-in fetch
 * does NOT negotiate HTTP/2 by default (undici requires `allowH2: true`), so
 * without this every request from a Node runtime (e.g. `node dist/cli.js`)
 * hit the ALB as HTTP/1.1 and died with 464. Honors HTTPS_PROXY/NO_PROXY and
 * mTLS/CA settings like getProxyFetchOptions does. Memoized per proxy URL so
 * connections pool across requests. Exported for tests.
 */
export const getNodeH2Dispatcher = memoize(
  (proxyUrl: string | undefined): undici.Dispatcher => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undiciMod = require('undici') as typeof undici
    const mtlsConfig = getMTLSConfig()
    const caCerts = getCACertificates()
    const tlsOpts =
      mtlsConfig || caCerts
        ? {
            ...(mtlsConfig && {
              cert: mtlsConfig.cert,
              key: mtlsConfig.key,
              passphrase: mtlsConfig.passphrase,
            }),
            ...(caCerts && { ca: caCerts }),
          }
        : undefined

    if (proxyUrl) {
      return new undiciMod.EnvHttpProxyAgent({
        httpProxy: proxyUrl,
        httpsProxy: proxyUrl,
        noProxy: getNoProxy(),
        allowH2: true,
        ...(tlsOpts && { connect: tlsOpts, requestTls: tlsOpts }),
        ...getUndiciTimeoutOptions(),
      } as undici.EnvHttpProxyAgent.Options)
    }
    return new undiciMod.Agent({
      allowH2: true,
      ...(tlsOpts && { connect: tlsOpts }),
      ...getUndiciTimeoutOptions(),
    })
  },
  // memoize keys on the first arg; normalize undefined → '' for a stable key
  proxyUrl => proxyUrl ?? '',
)

/**
 * Cursor's api2.cursor.sh backend is a ConnectRPC/gRPC service behind an AWS
 * ALB whose target group only speaks HTTP/2. A plain HTTP/1.1 request is
 * rejected by the load balancer with `464 Incompatible protocol` before it
 * ever reaches the backend, so every runtime must force h2 (negotiated via
 * TLS ALPN):
 *
 * - Bun: per-request `{ protocol: 'http2' }` (Bun-specific fetch option).
 *   Skipped when a proxy is configured — Bun's experimental h2 client can't
 *   CONNECT-tunnel yet, so proxied requests fall back to h1 (and will 464;
 *   route around the proxy with NO_PROXY=api2.cursor.sh if possible).
 * - Node: an undici dispatcher with `allowH2: true`. Node's fetch never
 *   negotiates h2 on its own — before this every request under
 *   `node dist/cli.js` failed with `API Error: [464] Cursor upstream error`.
 *   The dispatcher also carries proxy (CONNECT + ALPN h2 end-to-end works
 *   under undici) and mTLS/CA config, replacing getProxyFetchOptions for
 *   cursor requests on Node.
 *
 * Set CURSOR_HTTP2=0 to opt out of both (e.g. a custom h1 endpoint).
 */
export function cursorTransportOptions(
  env: Record<string, string | undefined> = process.env,
): { protocol?: 'http2'; dispatcher?: undici.Dispatcher } {
  if (isEnvDefinedFalsy(env.CURSOR_HTTP2)) return {}
  if (typeof Bun === 'undefined') {
    return { dispatcher: getNodeH2Dispatcher(getProxyUrl(env)) }
  }
  // Bun's h2 fetch client can't tunnel through an HTTP proxy yet; let the
  // proxied request fall back to h1 rather than throwing HTTP2Unsupported.
  if (getProxyUrl(env)) return {}
  return { protocol: 'http2' }
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
    isCursorMaxModeEnabled(env),
  )
  const compress = shouldCompressRequest(messages.length, env)
  // When we gzip the ConnectRPC envelope we MUST advertise it, or the backend
  // rejects the request with `received compressed envelope, but do not know how
  // to decompress`. This path is hit by every multi-turn (≥3 message) request —
  // i.e. every follow-up after a tool result — so omitting it broke all
  // tool-calling conversations at the second turn.
  if (compress) {
    headers['connect-content-encoding'] = 'gzip'
  }
  const framedBody = wrapConnectRPCFrame(protobufBody, compress)

  logForDebugging(
    `[Cursor] POST ${url} model=${model} messages=${messages.length} tools=${tools.length} compress=${compress}`,
  )

  const response = await doFetch(url, {
    method: 'POST',
    headers,
    body: framedBody as unknown as BodyInit,
    signal,
    // Order matters: cursorTransportOptions must spread last so its h2
    // dispatcher (Node) overrides the generic proxy/mTLS dispatcher from
    // getProxyFetchOptions, which has no ALPN h2 and would 464.
    ...getProxyFetchOptions({ forAnthropicAPI: false }),
    ...cursorTransportOptions(env),
  } as RequestInit)

  if (!response.ok || !response.body) {
    const errorText = await safeReadText(response)
    const { errorType } = mapHttpStatusToError(response.status)
    // 464 = ALB "Incompatible protocol": the request arrived as HTTP/1.1 at
    // an h2-only target group. Tell the user what to check instead of the
    // empty body the ALB returns.
    const message =
      response.status === 464
        ? '[464] Incompatible protocol — the request reached Cursor over HTTP/1.1 instead of HTTP/2. ' +
          'If an HTTP(S) proxy is configured, Bun cannot tunnel h2 through it (try NO_PROXY=api2.cursor.sh); ' +
          'if CURSOR_HTTP2=0 is set, unset it.'
        : `[${response.status}] ${errorText || 'Cursor upstream error'}`
    yield {
      type: 'error',
      message,
      status: response.status,
      errorType,
    }
    return
  }

  const parser = new StreamingFrameParser()
  const reader = response.body.getReader()
  const cancelReaderOnAbort = (): void => {
    // Do not rely solely on fetch() propagating the request signal to an
    // already-open HTTP/2 response body. Some custom fetch/proxy transports
    // leave reader.read() pending after abort unless the reader is cancelled.
    void reader.cancel().catch(() => undefined)
  }

  if (signal?.aborted) cancelReaderOnAbort()
  else signal?.addEventListener('abort', cancelReaderOnAbort, { once: true })
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
    signal?.removeEventListener('abort', cancelReaderOnAbort)
    // Cancel before releasing: if the generator is abandoned early (error
    // frame, consumer break/abort), the response body would otherwise stay
    // half-open on the pooled HTTP/2 connection and poison later requests
    // ("The socket connection was closed unexpectedly"). Cancelling a fully
    // consumed stream is a no-op.
    try {
      await reader.cancel()
    } catch {
      // Already closed/errored — nothing to clean up.
    }
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
