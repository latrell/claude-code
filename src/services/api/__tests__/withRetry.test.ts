/**
 * 流中断错误识别单元测试
 *
 * 验证：
 * 1. TypeError("terminated") 被识别为流中断错误并纳入退避重试
 * 2. 普通未知 TypeError 仍不可重试
 * 3. APIUserAbortError 不被标记为流中断错误
 * 4. isStreamInterruptionError 的 case-insensitive 匹配
 * 5. APIError/APIConnectionError 不被错误识别
 */
import {
  APIError,
  APIConnectionError,
  APIUserAbortError,
} from '@anthropic-ai/sdk'
import { describe, test, expect } from 'bun:test'
import { isStreamInterruptionError } from '../streamErrors.js'

describe('isStreamInterruptionError', () => {
  test('TypeError("terminated") 被识别为流中断', () => {
    const err = new TypeError('terminated')
    expect(isStreamInterruptionError(err)).toBe(true)
  })

  test('TypeError 消息包含 "terminated" 子字符串可被识别（如 undici 扩展消息）', () => {
    const err = new TypeError('fetch terminated by server')
    expect(isStreamInterruptionError(err)).toBe(true)
  })

  test('TypeError("TERMINATED") case-insensitive 匹配', () => {
    const err = new TypeError('TERMINATED')
    expect(isStreamInterruptionError(err)).toBe(true)
  })

  test('APIUserAbortError 不被识别为流中断', () => {
    const err = new APIUserAbortError()
    expect(isStreamInterruptionError(err)).toBe(false)
  })

  test('普通 TypeError 不被识别为流中断', () => {
    const err = new TypeError('something else')
    expect(isStreamInterruptionError(err)).toBe(false)
  })

  test('非 TypeError 的 Error 不被识别', () => {
    const err = new Error('terminated')
    expect(isStreamInterruptionError(err)).toBe(false)
  })

  test('APIError 不被识别为流中断', () => {
    const err = new APIError(
      500,
      { error: { type: 'server_error', message: 'terminated' } },
      'terminated',
      undefined,
    )
    expect(isStreamInterruptionError(err)).toBe(false)
  })

  test('APIConnectionError 不被识别为流中断（走自己的重试逻辑）', () => {
    const err = new APIConnectionError({ message: 'terminated' })
    expect(isStreamInterruptionError(err)).toBe(false)
  })
})
