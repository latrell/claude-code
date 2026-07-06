import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import { cursorTransportOptions, getCursorChatUrl } from '../client.js'

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
