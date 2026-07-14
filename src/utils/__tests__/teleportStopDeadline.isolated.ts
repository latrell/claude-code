// This suite is launched in a child process because teleport.tsx is commonly
// mocked process-wide by unrelated command and task suites.
import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO ??= {
  VERSION: '0.0.0-test',
}

const {
  archiveRemoteSession,
  interruptRemoteSession,
  RemoteStopDeadlineError,
  stopRemoteSession,
  withRemoteStopDeadline,
} = await import('../teleport.js')

const authDependencies = {
  getAccessToken: () => 'token',
  getOrganizationUUID: async () => 'org-1',
}

describe('remote stop hard deadlines', () => {
  test('uses a referenced deadline and aborts work that never settles', async () => {
    let signal: AbortSignal | undefined
    const waiting = withRemoteStopDeadline(
      'hung remote stop',
      10,
      abortSignal => {
        signal = abortSignal
        return new Promise<never>(() => {})
      },
    )

    await expect(waiting).rejects.toBeInstanceOf(RemoteStopDeadlineError)
    expect(signal?.aborted).toBe(true)
  })

  test('bounds a socket connect that never settles', async () => {
    let closeCount = 0
    let interruptCount = 0
    const stopped = await interruptRemoteSession('session-connect-hung', 10, {
      ...authDependencies,
      createSocket: async () => ({
        connect: () => new Promise<void>(() => {}),
        close: () => {
          closeCount++
        },
        sendControlRequest: async () => {
          interruptCount++
          return { response: { subtype: 'success' } }
        },
      }),
    })

    expect(stopped).toBe(false)
    expect(interruptCount).toBe(0)
    expect(closeCount).toBeGreaterThan(0)
  })

  test('bounds an interrupt acknowledgement that never settles', async () => {
    let closeCount = 0
    let interruptCount = 0
    const stopped = await interruptRemoteSession('session-ack-hung', 10, {
      ...authDependencies,
      createSocket: async callbacks => ({
        connect: async () => callbacks.onConnected(),
        close: () => {
          closeCount++
        },
        sendControlRequest: () => {
          interruptCount++
          return new Promise<never>(() => {})
        },
      }),
    })

    expect(stopped).toBe(false)
    expect(interruptCount).toBe(1)
    expect(closeCount).toBeGreaterThan(0)
  })

  test('returns true only for a successful interrupt acknowledgement', async () => {
    const stopped = await interruptRemoteSession('session-acknowledged', 50, {
      ...authDependencies,
      createSocket: async callbacks => ({
        connect: async () => callbacks.onConnected(),
        close: () => {},
        sendControlRequest: async () => ({
          response: { subtype: 'success' },
        }),
      }),
    })

    expect(stopped).toBe(true)
  })

  test('bounds archive and aborts its HTTP request signal', async () => {
    let requestSignal: AbortSignal | undefined
    const archived = await archiveRemoteSession('session-archive-hung', 10, {
      ...authDependencies,
      postArchive: async (_url, _headers, _timeout, signal) => {
        requestSignal = signal
        return new Promise<never>(() => {})
      },
    })

    expect(archived).toBe(false)
    expect(requestSignal?.aborted).toBe(true)
  })

  test('requires both interrupt acknowledgement and archive confirmation', async () => {
    let archiveCount = 0
    const common = {
      interruptTimeoutMs: 50,
      archiveTimeoutMs: 50,
      interruptDependencies: {
        ...authDependencies,
        createSocket: async (callbacks: { onConnected: () => void }) => ({
          connect: async () => callbacks.onConnected(),
          close: () => {},
          sendControlRequest: async () => ({
            response: { subtype: 'success' },
          }),
        }),
      },
      archiveDependencies: {
        ...authDependencies,
        postArchive: async () => {
          archiveCount++
          return { status: 200, data: {} }
        },
      },
    }

    await expect(stopRemoteSession('session-stop', common)).resolves.toBe(true)
    expect(archiveCount).toBe(1)
  })

  test('does not archive or report success when interrupt is rejected', async () => {
    let archiveCount = 0
    const stopped = await stopRemoteSession('session-interrupt-rejected', {
      interruptTimeoutMs: 50,
      archiveTimeoutMs: 50,
      interruptDependencies: {
        ...authDependencies,
        createSocket: async callbacks => ({
          connect: async () => callbacks.onConnected(),
          close: () => {},
          sendControlRequest: async () => ({
            response: { subtype: 'error' },
          }),
        }),
      },
      archiveDependencies: {
        ...authDependencies,
        postArchive: async () => {
          archiveCount++
          return { status: 200, data: {} }
        },
      },
    })

    expect(stopped).toBe(false)
    expect(archiveCount).toBe(0)
  })
})
