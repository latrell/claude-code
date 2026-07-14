import { describe, expect, mock, test } from 'bun:test'
import type { SDKControlResponse } from '../../entrypoints/sdk/controlTypes.js'
import { debugMock } from '../../../tests/mocks/debug.js'
import { logMock } from '../../../tests/mocks/log.js'
import type { RemoteSessionManager as RemoteSessionManagerType } from '../RemoteSessionManager.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const { RemoteSessionManager } = await import('../RemoteSessionManager.js')

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function successResponse(): SDKControlResponse {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: 'interrupt-request',
    },
  }
}

type ManagerHarness = {
  websocket: {
    sendControlRequest: () => Promise<SDKControlResponse>
    close?: () => void
  } | null
  pendingSends: Set<Promise<boolean>>
}

type SendEvent = (
  sessionId: string,
  content: string | Array<{ type: string; [key: string]: unknown }>,
  opts?: { uuid?: string; signal?: AbortSignal },
) => Promise<boolean>

function makeManager(
  pendingSendCancelWaitMs = 20,
  {
    viewerOnly = false,
    sendEvent,
  }: { viewerOnly?: boolean; sendEvent?: SendEvent } = {},
): RemoteSessionManagerType {
  return new RemoteSessionManager(
    {
      sessionId: 'session-1',
      getAccessToken: () => 'token',
      orgUuid: 'org-1',
      viewerOnly,
    },
    {
      onMessage: () => {},
      onPermissionRequest: () => {},
    },
    { pendingSendCancelWaitMs, sendEvent },
  )
}

describe('RemoteSessionManager.cancelSession', () => {
  test('reports success only after an acknowledged interrupt', async () => {
    const manager = makeManager()
    const harness = manager as unknown as ManagerHarness
    harness.websocket = {
      sendControlRequest: async () => successResponse(),
    }

    await expect(manager.cancelSession()).resolves.toBe(true)
  })

  test('returns false on a pending-send timeout and retries after late settlement', async () => {
    const manager = makeManager(10)
    const harness = manager as unknown as ManagerHarness
    const pendingSend = deferred<boolean>()
    const lateInterrupt = deferred<void>()
    let interruptCount = 0
    harness.pendingSends.add(pendingSend.promise)
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        if (interruptCount === 2) lateInterrupt.resolve()
        return successResponse()
      },
    }

    await expect(manager.cancelSession()).resolves.toBe(false)
    expect(interruptCount).toBe(1)

    pendingSend.resolve(true)
    await lateInterrupt.promise
    expect(interruptCount).toBe(2)
  })

  test('uses the final post-send acknowledgement as the success result', async () => {
    const manager = makeManager()
    const harness = manager as unknown as ManagerHarness
    harness.pendingSends.add(Promise.resolve(true))
    let interruptCount = 0
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        if (interruptCount === 1) return successResponse()
        return {
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id: 'final-interrupt',
            error: 'not stopped',
          },
        }
      },
    }

    await expect(manager.cancelSession()).resolves.toBe(false)
    expect(interruptCount).toBe(2)
  })

  test('does not abort an older POST before the causal final interrupt', async () => {
    const post = deferred<boolean>()
    const postStarted = deferred<void>()
    let sendSignal: AbortSignal | undefined
    const manager = makeManager(50, {
      sendEvent: async (_sessionId, _content, opts) => {
        sendSignal = opts?.signal
        postStarted.resolve()
        return post.promise
      },
    })
    const harness = manager as unknown as ManagerHarness
    let interruptCount = 0
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        return successResponse()
      },
    }

    const send = manager.sendMessage('hello')
    await postStarted.promise
    const cancellation = manager.cancelSession()
    await Promise.resolve()

    expect(sendSignal?.aborted).toBe(false)
    expect(interruptCount).toBe(1)
    post.resolve(true)
    await expect(send).resolves.toBe(true)
    await expect(cancellation).resolves.toBe(true)
    expect(interruptCount).toBe(2)
  })
})

describe('RemoteSessionManager.disconnect', () => {
  test('aborts an owned POST, waits for settlement, then sends a final interrupt', async () => {
    const post = deferred<boolean>()
    const postStarted = deferred<void>()
    let sendSignal: AbortSignal | undefined
    const manager = makeManager(50, {
      sendEvent: async (_sessionId, _content, opts) => {
        sendSignal = opts?.signal
        postStarted.resolve()
        // Deliberately ignore abort to verify disconnect retains ownership.
        return post.promise
      },
    })
    const harness = manager as unknown as ManagerHarness
    let interruptCount = 0
    let closeCount = 0
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        return successResponse()
      },
      close: () => {
        closeCount++
      },
    }

    const send = manager.sendMessage('hello')
    await postStarted.promise
    let disconnected = false
    const disconnect = manager.disconnect().then(result => {
      disconnected = true
      return result
    })
    await Promise.resolve()

    expect(sendSignal?.aborted).toBe(true)
    expect(interruptCount).toBe(1)
    expect(disconnected).toBe(false)
    expect(closeCount).toBe(0)

    post.resolve(false)
    await expect(send).resolves.toBe(false)
    await expect(disconnect).resolves.toBe(true)
    expect(interruptCount).toBe(2)
    expect(closeCount).toBe(1)
  })

  test('viewer-only disconnect aborts its POST without interrupting the agent', async () => {
    const postStarted = deferred<void>()
    let sendSignal: AbortSignal | undefined
    const manager = makeManager(50, {
      viewerOnly: true,
      sendEvent: async (_sessionId, _content, opts) => {
        const signal = opts?.signal
        sendSignal = signal
        postStarted.resolve()
        return new Promise<boolean>(resolve => {
          if (signal?.aborted) resolve(false)
          else
            signal?.addEventListener('abort', () => resolve(false), {
              once: true,
            })
        })
      },
    })
    const harness = manager as unknown as ManagerHarness
    let interruptCount = 0
    let closeCount = 0
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        return successResponse()
      },
      close: () => {
        closeCount++
      },
    }

    const send = manager.sendMessage('viewer message')
    await postStarted.promise
    const disconnect = manager.disconnect()

    expect(sendSignal?.aborted).toBe(true)
    await expect(send).resolves.toBe(false)
    await expect(disconnect).resolves.toBe(true)
    expect(interruptCount).toBe(0)
    expect(closeCount).toBe(1)
  })

  test('retains the causal interrupt latch and retries after a negative ACK', async () => {
    const post = deferred<boolean>()
    const postStarted = deferred<void>()
    const manager = makeManager(50, {
      sendEvent: async () => {
        postStarted.resolve()
        return post.promise
      },
    })
    const harness = manager as unknown as ManagerHarness
    let interruptCount = 0
    let closeCount = 0
    harness.websocket = {
      sendControlRequest: async () => {
        interruptCount++
        if (interruptCount === 2) {
          return {
            type: 'control_response',
            response: {
              subtype: 'error',
              request_id: 'final-interrupt',
              error: 'not stopped',
            },
          }
        }
        return successResponse()
      },
      close: () => {
        closeCount++
      },
    }

    const send = manager.sendMessage('hello')
    await postStarted.promise
    const firstDisconnect = manager.disconnect()
    post.resolve(false)
    await send

    await expect(firstDisconnect).resolves.toBe(false)
    expect(interruptCount).toBe(2)
    expect(closeCount).toBe(0)

    await expect(manager.disconnect()).resolves.toBe(true)
    expect(interruptCount).toBe(3)
    expect(closeCount).toBe(1)
  })
})
