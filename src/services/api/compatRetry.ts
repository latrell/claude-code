/**
 * 兼容层（OpenAI / Gemini / Grok）网络/API 错误自动重试 helper。
 *
 * 背景：
 * firstParty 路径（claude.ts 第 1885 行）通过 withRetry() 提供了全套重试+恢复机制：
 * 指数退避、ECONNRESET/EPIPE 陈旧连接重连、stream terminated 恢复、429/5xx/529
 * 重试、non-streaming fallback 等。但 OpenAI/Gemini/Grok adapter 是直接的一次
 * try/catch，任何 fetch failed 或瞬态错误都会立即以 "API Error: ..." 退出。
 *
 * 本模块为四个兼容层（OpenAI/Gemini/Grok/Cursor）提供统一的重试包装，
 * 覆盖最常见的瞬态错误场景。
 * 设计上不与 firstParty 路径产生耦合——firstParty 仍独立使用 withRetry()。
 *
 * 为什么用独立的 compatRetry 而不是复用 withRetry：
 * - withRetry 深度依赖 Anthropic SDK 的 APIError/APIConnectionError 类型
 * - withRetry 有大量 Anthropic 专属逻辑（OAuth 刷新、529 fallback、fast mode 等）
 * - 兼容层应保持轻量、独立，便于维护
 */

import type { SystemAPIErrorMessage } from 'src/types/message.js'
import { randomUUID } from 'crypto'
import { logForDebugging } from 'src/utils/debug.js'
import { AbortError, errorMessage } from 'src/utils/errors.js'
import { disableKeepAlive } from 'src/utils/proxy.js'
import { sleep } from 'src/utils/sleep.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'
import { waitForProviderAbortSettlement } from './providerCancellation.js'

// ---------------------------------------------------------------------------
// 常量 — 比 firstParty（DEFAULT_MAX_RETRIES=10）保守，避免在第三方 API 上产生
// 过多重试放大。可根据实际运维经验调整。
// ---------------------------------------------------------------------------
const DEFAULT_MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 32_000

// ---------------------------------------------------------------------------
// 退避计算 — 与 firstParty 的 getRetryDelay 同款算法（指数退避 + 25% jitter）
// ---------------------------------------------------------------------------
function getRetryDelay(attempt: number): number {
  const baseDelay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

function getErrorRecord(error: unknown): Record<string, unknown> | undefined {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : undefined
}

function getStringField(
  record: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = record?.[field]
  return typeof value === 'string' ? value : undefined
}

function getConstructorName(error: unknown): string {
  const record = getErrorRecord(error)
  return (record?.constructor as { name?: string } | undefined)?.name ?? ''
}

function getErrorName(error: unknown): string | undefined {
  return error instanceof Error
    ? error.name
    : getStringField(getErrorRecord(error), 'name')
}

const MAX_ERROR_CAUSE_DEPTH = 8

const STALE_CONNECTION_CODES = new Set([
  'connectionclosed',
  'econnreset',
  'epipe',
  'und_err_socket',
])

const REACHABILITY_CONNECTION_CODES = new Set([
  'connectionrefused',
  'failedtoopensocket',
  'etimedout',
  'econnrefused',
  'enetunreach',
  'enotfound',
  'eai_again',
  'und_err_connect_timeout',
  'und_err_headers_timeout',
  'und_err_body_timeout',
])

const RETRYABLE_NETWORK_CODES = new Set([
  ...STALE_CONNECTION_CODES,
  ...REACHABILITY_CONNECTION_CODES,
])

const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  'server_error',
  'rate_limit_exceeded',
  'vector_store_timeout',
])

function getErrorCodes(error: unknown): string[] {
  const seen = new Set<object>()
  const codes: string[] = []
  let current = getErrorRecord(error)

  for (let depth = 0; current && depth < MAX_ERROR_CAUSE_DEPTH; depth++) {
    if (seen.has(current)) break
    seen.add(current)

    const code = getStringField(current, 'code')
    const errno = getStringField(current, 'errno')
    if (code !== undefined) codes.push(code.toLowerCase())
    if (errno !== undefined && errno !== code) codes.push(errno.toLowerCase())

    current = getErrorRecord(current.cause)
  }

  return codes
}

function getErrorStatus(error: unknown): number | undefined {
  const status = getErrorRecord(error)?.status
  return typeof status === 'number' ? status : undefined
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getErrorCauseMessage(error: unknown): string | undefined {
  return getStringField(getErrorRecord(getErrorRecord(error)?.cause), 'message')
}

/**
 * Stale pooled-socket failures where retrying should also stop reusing
 * keep-alive connections. Reachability failures such as DNS lookup errors,
 * connection refusal, and timeouts remain retryable but must not permanently
 * change the process-wide connection policy.
 */
export function isCompatConnectionInterruptionError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false

  const name = getErrorName(error)
  const ctorName = getConstructorName(error)
  if (name === 'APIUserAbortError' || ctorName === 'APIUserAbortError') {
    return false
  }
  if (getErrorStatus(error) !== undefined) return false

  const codes = getErrorCodes(error)
  if (codes.some(code => STALE_CONNECTION_CODES.has(code))) return true
  if (codes.some(code => REACHABILITY_CONNECTION_CODES.has(code))) return false

  const msg =
    `${getErrorMessage(error)} ${getErrorCauseMessage(error) ?? ''}`.toLowerCase()
  if (
    msg.includes('terminated') ||
    msg.includes('fetch failed') ||
    msg.includes('socket connection was closed') ||
    msg.includes('econnreset') ||
    msg.includes('epipe') ||
    msg.includes('und_err_socket') ||
    msg.includes('connectionclosed') ||
    msg.includes('connection reset by peer') ||
    msg.includes('broken pipe')
  ) {
    return true
  }

  return false
}

/**
 * 判定某个错误是否应该在兼容层中重试。
 *
 * 覆盖的错误类型（横跨 OpenAI SDK / fetch / Gemini 原生 HTTP 三种来源）：
 * 1. OpenAI SDK 的 APIConnectionError（网络不通、DNS 失败、fetch failed）
 * 2. OpenAI SDK 的 RateLimitError（429）
 * 3. OpenAI SDK 的 InternalServerError（5xx）
 * 4. 任意带有 429 / 5xx status 的 OpenAI SDK APIError
 * 5. 原生 fetch() 抛出的 ECONNRESET / EPIPE / ECONNREFUSED / ETIMEDOUT 等
 * 6. undici stream "terminated" TypeError
 * 7. Gemini 客户端的 HTTP 错误（429 / 5xx）
 * 8. Bun fetch 的 socket 层错误（"The socket connection was closed
 *    unexpectedly" / error.code ConnectionClosed 等）——HTTP/2 keep-alive
 *    连接被服务端/LB 闲置关闭后复用时触发，性质同 ECONNRESET
 *
 * 不重试的：
 * - APIUserAbortError（用户中断）/ AbortError
 * - 4xx 客户端错误（认证、权限、参数错误）
 * - 非瞬态的未知错误
 */
export function isRetryableCompatError(error: unknown): boolean {
  // --- Abort signals ---
  const errorName = getErrorName(error)
  const ctorName = getConstructorName(error)
  if (
    errorName === 'AbortError' ||
    errorName === 'APIUserAbortError' ||
    ctorName === 'APIUserAbortError'
  ) {
    return false
  }

  // An explicit HTTP client-error status is authoritative. In particular,
  // a nested ECONNRESET or a provider-style `server_error` code must not
  // turn a rejected request (400/401/403/etc.) into a retryable operation.
  const status = getErrorStatus(error)
  if (status === 408 || status === 409 || status === 429) return true
  if (status !== undefined && status >= 500 && status < 600) return true
  if (status !== undefined && status >= 400 && status < 500) return false

  if (
    typeof error === 'object' &&
    error !== null &&
    explicitlyRetryableCompatErrors.has(error)
  ) {
    return true
  }

  // --- OpenAI SDK error hierarchy ---
  // 使用运行时 duck-type 检测，避免对 openai 包的硬依赖（此模块也会被
  // Gemini adapter import，而 Gemini 不使用 OpenAI SDK）。
  const err = error as Record<string, unknown> | null | undefined
  if (err && typeof err === 'object') {
    // APIConnectionError extends APIError<undefined, undefined, undefined>
    // → status === undefined 且 "APIConnectionError" in name/constructor
    if (
      ctorName === 'APIConnectionError' ||
      ctorName === 'APIConnectionTimeoutError' ||
      (typeof (err.message as string | undefined) === 'string' &&
        (err.message as string).toLowerCase().includes('connection error'))
    ) {
      return true
    }

    // RateLimitError extends APIError<429>
    if (ctorName === 'RateLimitError') return true

    // InternalServerError extends APIError<number>
    if (ctorName === 'InternalServerError') return true

    const errorCodes = getErrorCodes(error)
    if (
      errorCodes.some(
        code =>
          RETRYABLE_NETWORK_CODES.has(code) ||
          RETRYABLE_PROVIDER_ERROR_CODES.has(code),
      )
    ) {
      return true
    }
  }

  // --- String-based heuristics (fetch / Gemini / undici) ---
  if (error instanceof Error) {
    const message = error.message

    // undici stream termination
    if (message.toLowerCase() === 'terminated') return true
    if (message.toLowerCase().includes('terminated')) return true

    const msg = message.toLowerCase()

    // Common Node.js network error codes
    if (
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('epipe') ||
      msg.includes('econnrefused') ||
      msg.includes('enetunreach') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound')
    ) {
      return true
    }

    // Bun fetch socket-layer failures ("The socket connection was closed
    // unexpectedly. For more information, pass `verbose: true` ..."). Seen
    // when an idle HTTP/2 connection is reused after the server/LB closed it.
    if (msg.includes('socket connection was closed')) return true

    // Gemini HTTP errors with retryable status codes
    if (msg.includes('gemini api request failed')) {
      const m = msg.match(/failed \((\d+)/)
      if (m && m[1]) {
        const status = parseInt(m[1], 10)
        if (status === 429 || (status >= 500 && status < 600)) return true
      }
      return false
    }
  }

  if (isCompatConnectionInterruptionError(error)) return true

  return false
}

// ---------------------------------------------------------------------------
// 生成 Retry Progress Message
// ---------------------------------------------------------------------------

function createRetryProgressMessage(
  error: unknown,
  delayMs: number,
  attempt: number,
  maxRetries: number,
  provider: string,
): SystemAPIErrorMessage {
  const msg = error instanceof Error ? error.message : String(error)
  return {
    type: 'system',
    subtype: 'api_error',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: `[${provider}] 第 ${attempt}/${maxRetries} 次重试，${Math.round(delayMs / 1000)}s 后重试：${msg}`,
    },
    retryInMs: delayMs,
    retryAttempt: attempt,
    maxRetries,
    error: error instanceof Error ? error : new Error(String(error)),
  } as unknown as SystemAPIErrorMessage
}

// ---------------------------------------------------------------------------
// 重试包装器
// ---------------------------------------------------------------------------

// 记录哪些错误是 withCompatRetry 真正重试耗尽后抛出的。用 WeakSet 而非
// 在错误对象上挂属性，避免改写（可能被冻结的）第三方错误实例。
const exhaustedRetryErrors = new WeakSet<object>()

const explicitlyRetryableCompatErrors = new WeakSet<object>()

export function createRetryableCompatError(message: string): Error {
  const error = new Error(message)
  explicitlyRetryableCompatErrors.add(error)
  return error
}

/**
 * 判断错误是否由 withCompatRetry 重试耗尽后抛出。
 *
 * 与 isRetryableCompatError 的区别：可重试类型的错误也可能在重试作用域
 * 之外发生（如流中途断连，此时从未重试过）。adapter 的 catch 块用本函数
 * 决定是否给用户显示 "(retries exhausted)"，避免误导。
 */
export function hasExhaustedCompatRetries(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    exhaustedRetryErrors.has(error)
  )
}

/**
 * Re-attach an eagerly-consumed first event to the rest of its stream.
 *
 * 适用场景：完全惰性的流水线（如 Cursor 的 streamCursorChat → 流适配器），
 * 在 withCompatRetry 的工厂里不会发出任何网络请求，请求级错误（429/5xx）
 * 会逃逸到重试作用域之外。工厂内先 `await stream.next()` 强制建立请求，
 * 再用本函数把消费掉的首个事件拼回流头，交还下游正常消费。
 */
export async function* prependFirstEvent<T>(
  first: IteratorResult<T, void>,
  rest: AsyncGenerator<T, void>,
): AsyncGenerator<T, void> {
  if (first.done) return
  yield first.value
  yield* rest
}

/**
 * 在 withCompatRetry 的工厂末尾调用：主动拉取适配流的首个事件，再拼回流头。
 *
 * 所有兼容层适配器都是惰性 async generator，message_start 要等第一个网络
 * chunk 到达才发出。不拉首事件的话，"请求已建立、模型开口前"的断连（LB 空闲
 * 超时掐 keep-alive 连接、undici TypeError("terminated") 的典型场景）会发生
 * 在下游 for-await 循环里、重试作用域之外——一次重试都不走就以
 * "API Error: terminated" 终结整轮。对完全惰性的客户端（Gemini 的
 * streamGeminiGenerateContent），不拉首事件甚至连 429/5xx 都从不重试。
 *
 * 首事件之后的断连仍然不重试（保持现状）：此时内容已 yield 给下游进入
 * UI/会话历史，盲目整包重试会导致内容与工具调用重复。
 */
export async function startStreamEagerly<T>(
  stream: AsyncGenerator<T, void>,
): Promise<AsyncGenerator<T, void>> {
  const first = await stream.next()
  if (first.done) {
    throw createRetryableCompatError(
      'Stream ended before receiving any semantic events',
    )
  }
  return prependFirstEvent(first, stream)
}

/**
 * 对兼容层的一次 API 流式请求进行自动重试。
 *
 * @param createStream - 创建流式响应的异步工厂函数。
 *   每次重试都会调用，传入当前的 AbortSignal。
 *   应返回适配后的 AsyncIterable（如 adaptOpenAIStreamToAnthropic 的返回值）。
 * @param options.signal - 外部 AbortSignal；用户中断时立即停止重试。
 * @param options.maxRetries - 最大重试次数，默认 3。
 * @param options.provider - provider 标识，用于日志。
 *
 * @yields SystemAPIErrorMessage — 每次重试等待期间输出进度消息。
 * @returns 成功时返回 createStream 的结果（AsyncIterable）。
 * @throws 重试耗尽后抛出最后一次错误；用户中断时抛出 APIUserAbortError-like 错误。
 */
export async function* withCompatRetry<T>(
  createStream: (signal: AbortSignal) => Promise<T>,
  options: {
    maxRetries?: number
    signal: AbortSignal
    provider: string
    abortSettlementGraceMs?: number
  },
): AsyncGenerator<SystemAPIErrorMessage, T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal.aborted) {
      throw new AbortError('Request was aborted.')
    }

    try {
      // The promise returned by the factory may include eager consumption of
      // a lazy stream's first event. Guard the whole promise so an adapter that
      // ignores AbortSignal cannot leave retry orchestration pending forever.
      const result = await waitForProviderAbortSettlement(
        Promise.resolve().then(() => createStream(options.signal)),
        options.signal,
        `${options.provider} stream factory`,
        options.abortSettlementGraceMs,
      )
      return result
    } catch (error: unknown) {
      // A cancellation settlement timeout is stronger than the signal's
      // generic aborted state. Preserve it so callers cannot claim Stop was
      // confirmed, and never retry an unconfirmed still-live request.
      if (error instanceof StopConfirmationError) {
        throw error
      }
      // Fetch/SDK implementations do not agree on the error shape produced by
      // AbortSignal (AbortError, APIUserAbortError, or even a socket error).
      // The signal is authoritative: normalize immediately so a user cancel
      // can never be logged, surfaced as an API error, or retried.
      if (options.signal.aborted) {
        throw new AbortError('Request was aborted.')
      }

      lastError = error

      const retryable = isRetryableCompatError(error)
      const connectionInterruption =
        retryable && isCompatConnectionInterruptionError(error)

      logForDebugging(
        `[${options.provider}] API error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage(error)}`,
        { level: 'error' },
      )

      if (!retryable) {
        throw error
      }

      if (connectionInterruption) {
        logForDebugging(
          `[${options.provider}] Connection interruption detected — disabling keep-alive for subsequent compatible provider requests`,
        )
        disableKeepAlive()
      }

      if (attempt >= maxRetries) {
        // All retries exhausted
        break
      }

      const delayMs = getRetryDelay(attempt + 1)

      logForDebugging(
        `[${options.provider}] 第 ${attempt + 1}/${maxRetries} 次重试，${Math.round(delayMs / 1000)}s 后重试`,
      )

      yield createRetryProgressMessage(
        error,
        delayMs,
        attempt + 1,
        maxRetries + 1,
        options.provider,
      )

      await sleep(delayMs, options.signal, {
        abortError: () => new AbortError('Request was aborted.'),
      })
    }
  }

  if (typeof lastError === 'object' && lastError !== null) {
    exhaustedRetryErrors.add(lastError)
  }
  throw lastError
}
