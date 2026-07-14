import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import { DirectConnectSessionManager } from '../directConnectManager'

type Listener = (event: { data?: string }) => void

class FakeWebSocket {
  static readonly OPEN = 1
  readonly sent: string[] = []
  readyState = FakeWebSocket.OPEN
  private readonly listeners = new Map<string, Listener[]>()

  constructor(_url: string, _options?: unknown) {
    sockets.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  emit(type: string, data?: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data })
    }
  }
}

const sockets: FakeWebSocket[] = []
const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  sockets.length = 0
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: FakeWebSocket,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: originalWebSocket,
  })
})

function createManager(): DirectConnectSessionManager {
  return new DirectConnectSessionManager(
    {
      serverUrl: 'http://localhost',
      sessionId: 'session',
      wsUrl: 'ws://localhost/session',
    },
    {
      onMessage() {},
      onPermissionRequest() {},
    },
  )
}

describe('DirectConnectSessionManager interrupt', () => {
  test('resolves only after the matching control response', async () => {
    const manager = createManager()
    manager.connect()
    const socket = sockets[0]!
    socket.emit('open')

    const interrupt = manager.sendInterrupt()
    const request = JSON.parse(socket.sent[0]!) as { request_id: string }
    let settled = false
    void interrupt.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    socket.emit(
      'message',
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
          response: {},
        },
      }),
    )

    expect(await interrupt).toBe(true)
    manager.disconnect()
  })

  test('does not send a new turn before interrupt acknowledgement', async () => {
    const manager = createManager()
    manager.connect()
    const socket = sockets[0]!
    socket.emit('open')

    const interrupt = manager.sendInterrupt()
    const request = JSON.parse(socket.sent[0]!) as { request_id: string }
    const nextMessage = manager.sendMessage('next turn')
    await Promise.resolve()
    expect(socket.sent).toHaveLength(1)

    socket.emit(
      'message',
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
          response: {},
        },
      }),
    )

    expect(await interrupt).toBe(true)
    expect(await nextMessage).toBe(true)
    expect(socket.sent[1]).toContain('next turn')
    manager.disconnect()
  })

  test('fails an unacknowledged interrupt when disconnected', async () => {
    const manager = createManager()
    manager.connect()
    const socket = sockets[0]!
    socket.emit('open')

    const interrupt = manager.sendInterrupt()
    manager.disconnect()

    expect(await interrupt).toBe(false)
  })
})
