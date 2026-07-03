/**
 * 兼容层（OpenAI / Gemini / Grok）网络/API 错误自动重试 helper。
 *
 * 背景：
 * firstParty 路径（claude.ts 第 1885 行）通过 withRetry() 提供了全套重试+恢复机制：
 * 指数退避、ECONNRESET/EPIPE 陈旧连接重连、stream terminated 恢复、429/5xx/529
 * 重试、non-streaming fallback 等。但 OpenAI/Gemini/Grok adapter 是直接的一次
 * try/catch，任何 fetch failed 或瞬态错误都会立即以 "API Error: ..." 退出。
 *
 * 本模块为三个兼容层提供统一的重试包装，覆盖最常见的瞬态错误场景。
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
import { errorMessage } from 'src/utils/errors.js'
import { sleep } from 'src/utils/sleep.js'

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
 *
 * 不重试的：
 * - APIUserAbortError（用户中断）/ AbortError
 * - 4xx 客户端错误（认证、权限、参数错误）
 * - 非瞬态的未知错误
 */
export function isRetryableCompatError(error: unknown): boolean {
  // --- Abort signals ---
  if (error instanceof Error && error.name === 'AbortError') return false

  // --- OpenAI SDK error hierarchy ---
  // 使用运行时 duck-type 检测，避免对 openai 包的硬依赖（此模块也会被
  // Gemini adapter import，而 Gemini 不使用 OpenAI SDK）。
  const err = error as Record<string, unknown> | null | undefined
  if (err && typeof err === 'object') {
    // APIConnectionError extends APIError<undefined, undefined, undefined>
    // → status === undefined 且 "APIConnectionError" in name/constructor
    const ctorName =
      (err.constructor as { name?: string } | undefined)?.name ?? ''
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

    // Generic APIError: check status
    if ('status' in err) {
      const status = err.status as number | undefined
      if (status === 429) return true
      if (status !== undefined && status >= 500 && status < 600) return true
      if (status === 408 || status === 409) return true
    }

    // APIUserAbortError: never retry
    if (ctorName === 'APIUserAbortError') return false
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
      content: `[${provider}] Retry ${attempt}/${maxRetries} in ${Math.round(delayMs / 1000)}s: ${msg}`,
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
  },
): AsyncGenerator<SystemAPIErrorMessage, T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal.aborted) {
      throw new Error('Request was aborted.')
    }

    try {
      const result = await createStream(options.signal)
      return result
    } catch (error: unknown) {
      lastError = error

      logForDebugging(
        `[${options.provider}] API error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage(error)}`,
        { level: 'error' },
      )

      if (!isRetryableCompatError(error)) {
        throw error
      }

      if (attempt >= maxRetries) {
        // All retries exhausted
        break
      }

      const delayMs = getRetryDelay(attempt + 1)

      logForDebugging(
        `[${options.provider}] Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`,
      )

      yield createRetryProgressMessage(
        error,
        delayMs,
        attempt + 1,
        maxRetries + 1,
        options.provider,
      )

      await sleep(delayMs, options.signal, {
        abortError: () => new Error('Request was aborted.'),
      })
    }
  }

  throw lastError
}
