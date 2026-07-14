import { describe, expect, test } from 'bun:test'
import type { SDKControlResponse } from '../../entrypoints/sdk/controlTypes.js'
import { SessionsWebSocket } from '../SessionsWebSocket.js'

type SocketHarness = {
  ws: { close: () => void; send: (data: string) => void } | null
  state: 'connecting' | 'connected' | 'closed'
  handleMessage: (data: string) => void
  flushQueuedControlRequests: () => void
}

function makeSocket(): SessionsWebSocket {
  return new SessionsWebSocket('session-1', 'org-1', () => 'token', {
    onMessage: () => {},
  })
}

describe('SessionsWebSocket control requests', () => {
  test('resolves only after the matching control_response arrives', async () => {
    const socket = makeSocket()
    const sent: string[] = []
    const harness = socket as unknown as SocketHarness
    harness.state = 'connected'
    harness.ws = { close: () => {}, send: data => sent.push(data) }

    const responsePromise = socket.sendControlRequest({ subtype: 'interrupt' })
    const request = JSON.parse(sent[0]!) as { request_id: string }
    const response: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: request.request_id,
      },
    }
    harness.handleMessage(JSON.stringify(response))

    expect(await responsePromise).toEqual(response)
  })

  test('queues an interrupt during reconnect instead of dropping it', async () => {
    const socket = makeSocket()
    const sent: string[] = []
    const harness = socket as unknown as SocketHarness
    harness.state = 'connecting'

    const responsePromise = socket.sendControlRequest({ subtype: 'interrupt' })
    expect(sent).toHaveLength(0)

    harness.ws = { close: () => {}, send: data => sent.push(data) }
    harness.state = 'connected'
    harness.flushQueuedControlRequests()
    const request = JSON.parse(sent[0]!) as { request_id: string }
    harness.handleMessage(
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
        },
      }),
    )

    expect((await responsePromise).response.subtype).toBe('success')
  })

  test('rejects an unacknowledged interrupt when the socket closes', async () => {
    const socket = makeSocket()
    const harness = socket as unknown as SocketHarness
    harness.state = 'connecting'
    const responsePromise = socket.sendControlRequest({ subtype: 'interrupt' })

    socket.close()

    expect(responsePromise).rejects.toThrow('before control acknowledgement')
    await responsePromise.catch(() => {})
  })
})
