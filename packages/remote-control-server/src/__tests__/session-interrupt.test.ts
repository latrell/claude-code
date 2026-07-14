import { beforeEach, describe, expect, test } from 'bun:test'
import { requestSessionInterrupt } from '../services/session-interrupt'
import { getAllEventBuses, removeEventBus } from '../transport/event-bus'
import {
  closeAllConnections,
  handleWebSocketMessage,
  handleWebSocketOpen,
} from '../transport/ws-handler'

type InterruptRequest = {
  request_id: string
  request: { subtype: string }
  type: string
}

function connectWorker(
  sessionId: string,
  onInterrupt: (request: InterruptRequest, ws: Record<string, unknown>) => void,
) {
  const ws: Record<string, unknown> = {
    readyState: 1,
    send(data: string) {
      for (const line of data.split('\n').filter(Boolean)) {
        const message = JSON.parse(line) as InterruptRequest
        if (
          message.type === 'control_request' &&
          message.request?.subtype === 'interrupt'
        ) {
          onInterrupt(message, ws)
        }
      }
    },
    close() {
      ws.readyState = 3
    },
  }
  handleWebSocketOpen(ws as any, sessionId)
  return ws
}

function acknowledge(
  ws: Record<string, unknown>,
  sessionId: string,
  requestId: string,
  subtype: 'success' | 'error',
) {
  handleWebSocketMessage(
    ws as any,
    sessionId,
    `${JSON.stringify({
      type: 'control_response',
      response: {
        subtype,
        request_id: requestId,
        ...(subtype === 'error' ? { error: 'cannot interrupt' } : {}),
      },
    })}\n`,
  )
}

describe('requestSessionInterrupt', () => {
  beforeEach(() => {
    for (const [sessionId] of getAllEventBuses()) {
      removeEventBus(sessionId)
    }
    closeAllConnections()
  })

  test('waits for the matching success control response', async () => {
    const ws = connectWorker('success', request => {
      acknowledge(ws, 'success', request.request_id, 'success')
    })

    const result = await requestSessionInterrupt('success', 50)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requestId).toBeString()
    }
  })

  test('returns worker_unavailable when no worker transport is live', async () => {
    const result = await requestSessionInterrupt('missing', 50)

    expect(result).toMatchObject({
      ok: false,
      reason: 'worker_unavailable',
    })
  })

  test('returns rejected when the worker sends an error response', async () => {
    const ws = connectWorker('rejected', request => {
      acknowledge(ws, 'rejected', request.request_id, 'error')
    })

    const result = await requestSessionInterrupt('rejected', 50)

    expect(result).toMatchObject({
      ok: false,
      reason: 'rejected',
      message: 'cannot interrupt',
    })
  })

  test('times out instead of confirming cancellation without an acknowledgement', async () => {
    const ws = connectWorker('timeout', () => {
      acknowledge(ws, 'timeout', 'different-request', 'success')
    })

    const result = await requestSessionInterrupt('timeout', 5)

    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
  })
})
