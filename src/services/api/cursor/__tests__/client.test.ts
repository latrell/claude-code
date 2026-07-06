import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  cursorTransportOptions,
  getCursorChatUrl,
  getNodeH2Dispatcher,
  streamCursorChat,
} from '../client.js'

describe('getCursorChatUrl', () => {
  test('defaults to api2.cursor.sh StreamUnifiedChatWithTools', () => {
    expect(getCursorChatUrl({})).toBe(
      'https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools',
    )
  })

  test('honours CURSOR_BASE_URL and CURSOR_CHAT_PATH overrides', () => {
    expect(
      getCursorChatUrl({
        CURSOR_BASE_URL: 'https://proxy.example.com/',
        CURSOR_CHAT_PATH: '/custom/path',
      }),
    ).toBe('https://proxy.example.com/custom/path')
  })
})

describe('cursorTransportOptions', () => {
  // These run under `bun test`, so `typeof Bun !== 'undefined'`.
  test('pins HTTP/2 by default so the ALB does not reject with 464', () => {
    expect(cursorTransportOptions({})).toEqual({ protocol: 'http2' })
  })

  test('opts out when CURSOR_HTTP2 is explicitly falsy', () => {
    expect(cursorTransportOptions({ CURSOR_HTTP2: '0' })).toEqual({})
    expect(cursorTransportOptions({ CURSOR_HTTP2: 'false' })).toEqual({})
  })

  test('does not pin HTTP/2 when a proxy is configured (no h2 CONNECT yet)', () => {
    expect(
      cursorTransportOptions({ HTTPS_PROXY: 'http://127.0.0.1:8080' }),
    ).toEqual({})
    expect(
      cursorTransportOptions({ https_proxy: 'http://127.0.0.1:8080' }),
    ).toEqual({})
  })
})

describe('getNodeH2Dispatcher', () => {
  // The Node branch of cursorTransportOptions can't be reached under `bun
  // test` (and Bun shims the undici package), so only the construction and
  // memoization contract is asserted here. Real ALPN-h2 behaviour is covered
  // by running the built CLI under Node against the live endpoint.
  test('constructs and memoizes one dispatcher per proxy URL', () => {
    const direct = getNodeH2Dispatcher(undefined)
    expect(direct).toBeDefined()
    // Same instance on repeat call → pooled connections are reused.
    expect(getNodeH2Dispatcher(undefined)).toBe(direct)

    const proxied = getNodeH2Dispatcher('http://127.0.0.1:8080')
    expect(proxied).toBeDefined()
    expect(proxied).not.toBe(direct)
    expect(getNodeH2Dispatcher('http://127.0.0.1:8080')).toBe(proxied)
  })
})

describe('streamCursorChat HTTP error mapping', () => {
  const credentials = { accessToken: 'token', machineId: 'machine' }

  const collectFrames = async (status: number) => {
    const fetchOverride = (async () =>
      new Response('', { status })) as unknown as typeof fetch
    const frames = []
    for await (const frame of streamCursorChat({
      model: 'default',
      messages: [{ role: 'user', content: 'hi' }],
      credentials,
      fetchOverride,
      envOverride: {},
    })) {
      frames.push(frame)
    }
    return frames
  }

  test('maps ALB 464 to an actionable protocol error message', async () => {
    const frames = await collectFrames(464)
    expect(frames).toHaveLength(1)
    const frame = frames[0]!
    expect(frame.type).toBe('error')
    if (frame.type === 'error') {
      expect(frame.status).toBe(464)
      expect(frame.message).toContain('Incompatible protocol')
      expect(frame.message).toContain('HTTP/2')
    }
  })

  test('keeps the generic message for other upstream errors', async () => {
    const frames = await collectFrames(502)
    const frame = frames[0]!
    expect(frame.type).toBe('error')
    if (frame.type === 'error') {
      expect(frame.status).toBe(502)
      expect(frame.message).toBe('[502] Cursor upstream error')
    }
  })
})
