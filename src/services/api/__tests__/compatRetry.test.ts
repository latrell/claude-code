/**
 * 兼容层重试逻辑单元测试
 *
 * 验证：
 * 1. isRetryableCompatError 对各种错误类型的正确分类
 * 2. withCompatRetry 在成功时返回结果
 * 3. withCompatRetry 在可重试错误上重试并在最终失败时抛出
 * 4. withCompatRetry 在不可重试错误上立即抛出（不重试）
 * 5. AbortSignal 中断时停止重试
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, test, expect } from 'bun:test'
import type { SystemAPIErrorMessage } from 'src/types/message.js'
import { isRetryableCompatError, withCompatRetry } from '../compatRetry.js'

// ---------------------------------------------------------------------------
// Mock OpenAI SDK error classes (避免对 openai 包的硬依赖)
// ---------------------------------------------------------------------------
class MockOpenAIError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'OpenAIError'
  }
}

class MockAPIError extends MockOpenAIError {
  status: number | undefined
  headers: Headers | undefined
  code: string | null | undefined
  constructor(status?: number, message?: string, headers?: Headers) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.headers = headers
    this.code = null
  }
}

class MockAPIConnectionError extends MockAPIError {
  constructor(message?: string) {
    super(undefined, message)
    this.name = 'APIConnectionError'
  }
}

class MockRateLimitError extends MockAPIError {
  constructor(message?: string) {
    super(429, message)
    this.name = 'RateLimitError'
  }
}

class MockInternalServerError extends MockAPIError {
  constructor(message?: string) {
    super(500, message)
    this.name = 'InternalServerError'
  }
}

class MockAPIUserAbortError extends MockAPIError {
  constructor(message?: string) {
    super(undefined, message)
    this.name = 'APIUserAbortError'
  }
}

class MockAuthenticationError extends MockAPIError {
  constructor(message?: string) {
    super(401, message)
    this.name = 'AuthenticationError'
  }
}

class MockBadRequestError extends MockAPIError {
  constructor(message?: string) {
    super(400, message)
    this.name = 'BadRequestError'
  }
}

// ---------------------------------------------------------------------------
// isRetryableCompatError
// ---------------------------------------------------------------------------

describe('isRetryableCompatError', () => {
  // --- 可重试 ---

  test('APIConnectionError 可重试', () => {
    expect(
      isRetryableCompatError(new MockAPIConnectionError('fetch failed')),
    ).toBe(true)
  })

  test('RateLimitError 可重试', () => {
    expect(
      isRetryableCompatError(new MockRateLimitError('Rate limit reached')),
    ).toBe(true)
  })

  test('InternalServerError 可重试', () => {
    expect(
      isRetryableCompatError(new MockInternalServerError('Internal error')),
    ).toBe(true)
  })

  test('generic APIError with 429 status 可重试', () => {
    expect(isRetryableCompatError(new MockAPIError(429, 'Rate limited'))).toBe(
      true,
    )
  })

  test('generic APIError with 500+ status 可重试', () => {
    expect(
      isRetryableCompatError(new MockAPIError(503, 'Service unavailable')),
    ).toBe(true)
    expect(isRetryableCompatError(new MockAPIError(502, 'Bad gateway'))).toBe(
      true,
    )
  })

  test('generic APIError with 408 status 可重试', () => {
    expect(isRetryableCompatError(new MockAPIError(408, 'Timeout'))).toBe(true)
  })

  test('generic APIError with 409 status 可重试', () => {
    expect(isRetryableCompatError(new MockAPIError(409, 'Conflict'))).toBe(true)
  })

  test('Error 消息包含 fetch failed 可重试', () => {
    expect(isRetryableCompatError(new Error('fetch failed'))).toBe(true)
  })

  test('Error 消息包含 ECONNRESET 可重试', () => {
    expect(isRetryableCompatError(new Error('ECONNRESET'))).toBe(true)
    expect(isRetryableCompatError(new Error('read ECONNRESET'))).toBe(true)
  })

  test('Error 消息包含 EPIPE 可重试', () => {
    expect(isRetryableCompatError(new Error('EPIPE'))).toBe(true)
  })

  test('Error 消息包含 ECONNREFUSED 可重试', () => {
    expect(isRetryableCompatError(new Error('ECONNREFUSED'))).toBe(true)
  })

  test('Error 消息包含 ENETUNREACH 可重试', () => {
    expect(isRetryableCompatError(new Error('ENETUNREACH'))).toBe(true)
  })

  test('Error 消息包含 ETIMEDOUT 可重试', () => {
    expect(isRetryableCompatError(new Error('ETIMEDOUT'))).toBe(true)
  })

  test('TypeError("terminated") 可重试', () => {
    expect(isRetryableCompatError(new TypeError('terminated'))).toBe(true)
  })

  test('Error 消息包含 terminated 子字符串可重试', () => {
    expect(
      isRetryableCompatError(new Error('stream terminated by server')),
    ).toBe(true)
  })

  test('Gemini HTTP 429 可重试', () => {
    expect(
      isRetryableCompatError(
        new Error('Gemini API request failed (429): rate limit'),
      ),
    ).toBe(true)
  })

  test('Gemini HTTP 503 可重试', () => {
    expect(
      isRetryableCompatError(
        new Error('Gemini API request failed (503): overloaded'),
      ),
    ).toBe(true)
  })

  // --- 不可重试 ---

  test('AbortError 不可重试', () => {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    expect(isRetryableCompatError(err)).toBe(false)
  })

  test('APIUserAbortError 不可重试', () => {
    expect(isRetryableCompatError(new MockAPIUserAbortError('aborted'))).toBe(
      false,
    )
  })

  test('AuthenticationError (401) 不可重试', () => {
    expect(isRetryableCompatError(new MockAuthenticationError())).toBe(false)
  })

  test('BadRequestError (400) 不可重试', () => {
    expect(isRetryableCompatError(new MockBadRequestError())).toBe(false)
  })

  test('generic APIError with 404 不可重试', () => {
    expect(isRetryableCompatError(new MockAPIError(404, 'Not found'))).toBe(
      false,
    )
  })

  test('generic APIError with 403 不可重试', () => {
    expect(isRetryableCompatError(new MockAPIError(403, 'Forbidden'))).toBe(
      false,
    )
  })

  test('Gemini HTTP 400 不可重试', () => {
    expect(
      isRetryableCompatError(
        new Error('Gemini API request failed (400): bad request'),
      ),
    ).toBe(false)
  })

  test('Gemini HTTP 401 不可重试', () => {
    expect(
      isRetryableCompatError(
        new Error('Gemini API request failed (401): unauthorized'),
      ),
    ).toBe(false)
  })

  test('Gemini HTTP 404 不可重试', () => {
    expect(
      isRetryableCompatError(
        new Error('Gemini API request failed (404): not found'),
      ),
    ).toBe(false)
  })

  test('普通 Error 不可重试', () => {
    expect(isRetryableCompatError(new Error('some other error'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// withCompatRetry
// ---------------------------------------------------------------------------

describe('withCompatRetry', () => {
  test('成功时返回结果', async () => {
    const signal = new AbortController().signal
    const gen = withCompatRetry(async () => 'success', {
      signal,
      provider: 'test',
    })
    const result = await gen.next()
    expect(result.done).toBe(true)
    expect(result.value).toBe('success')
  })

  test('可重试错误先 yield progress 再在重试耗尽时抛出', async () => {
    const signal = new AbortController().signal
    let callCount = 0
    const gen = withCompatRetry(
      async () => {
        callCount++
        throw new MockAPIConnectionError('fetch failed')
      },
      { maxRetries: 2, signal, provider: 'test' },
    )

    // First attempt fails → should yield progress and retry
    let e = await gen.next()
    expect(e.done).toBe(false)
    expect(e.value).toBeDefined()
    expect((e.value as SystemAPIErrorMessage).type).toBe('system')
    expect(e.value.subtype).toBe('api_error')

    // Second attempt also fails → another progress
    e = await gen.next()
    expect(e.done).toBe(false)
    expect((e.value as SystemAPIErrorMessage).type).toBe('system')

    // Third attempt also fails → maxRetries=2 means 3 total attempts, then throw
    try {
      await gen.next()
      // Should have thrown
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(MockAPIConnectionError)
    }

    // Should have been called 3 times (initial + 2 retries)
    expect(callCount).toBe(3)
  })

  test('不可重试错误立即抛出', async () => {
    const signal = new AbortController().signal
    let callCount = 0
    const gen = withCompatRetry(
      async () => {
        callCount++
        throw new MockAuthenticationError('invalid key')
      },
      { signal, provider: 'test' },
    )

    try {
      await gen.next()
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(MockAuthenticationError)
    }
    expect(callCount).toBe(1)
  })

  test('重试后成功返回结果', async () => {
    const signal = new AbortController().signal
    let callCount = 0
    const gen = withCompatRetry(
      async () => {
        callCount++
        if (callCount < 2) {
          throw new MockAPIConnectionError('fetch failed')
        }
        return 'recovered'
      },
      { maxRetries: 3, signal, provider: 'test' },
    )

    // First attempt fails → progress
    let e = await gen.next()
    expect(e.done).toBe(false)
    expect((e.value as SystemAPIErrorMessage).type).toBe('system')

    // Second attempt succeeds
    e = await gen.next()
    expect(e.done).toBe(true)
    expect(e.value).toBe('recovered')
    expect(callCount).toBe(2)
  })

  test('AbortSignal 中断时立即停止', async () => {
    const controller = new AbortController()
    let callCount = 0
    const gen = withCompatRetry(
      async () => {
        callCount++
        throw new MockAPIConnectionError('fetch failed')
      },
      { maxRetries: 5, signal: controller.signal, provider: 'test' },
    )

    // First attempt fails → progress
    const e = await gen.next()
    expect(e.done).toBe(false)
    expect((e.value as SystemAPIErrorMessage).type).toBe('system')

    // Abort before next retry
    controller.abort()

    try {
      await gen.next()
      expect(true).toBe(false)
    } catch (err) {
      expect((err as Error).message).toBe('Request was aborted.')
    }
    expect(callCount).toBe(1)
  })

  test('maxRetries=0 时失败立即抛出', async () => {
    const signal = new AbortController().signal
    let callCount = 0
    const gen = withCompatRetry(
      async () => {
        callCount++
        throw new MockAPIConnectionError('fetch failed')
      },
      { maxRetries: 0, signal, provider: 'test' },
    )

    try {
      await gen.next()
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(MockAPIConnectionError)
    }
    expect(callCount).toBe(1)
  })
})
