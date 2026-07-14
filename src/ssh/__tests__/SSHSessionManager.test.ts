import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import { SSHSessionManagerImpl } from '../SSHSessionManager'
import type { SSHSessionManagerOptions } from '../SSHSessionManager'
import type { Subprocess } from 'bun'

function createMockSubprocess(options?: {
  exitCode?: number | null
  stdoutLines?: string[]
  pid?: number
  onStdoutCancel?: () => void | Promise<void>
}): {
  proc: Subprocess
  writeToStdout: (data: string) => void
  readStdin: () => string
  simulateExit: (code?: number) => void
} {
  let stdoutController: ReadableStreamDefaultController<Uint8Array>
  const exitResolvers: Array<(code: number) => void> = []
  let exitCode: number | null = options?.exitCode ?? null

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller
      if (options?.stdoutLines) {
        const encoder = new TextEncoder()
        for (const line of options.stdoutLines) {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    cancel() {
      return options?.onStdoutCancel?.()
    },
  })

  const stdinChunks: Uint8Array[] = []
  const stdin = {
    write(d: Uint8Array) {
      stdinChunks.push(d)
      return d.length
    },
    flush() {},
    end() {},
  }

  const exited = new Promise<number>(resolve => {
    exitResolvers.push(resolve)
    if (exitCode !== null) resolve(exitCode)
  })

  const proc = {
    stdout,
    stdin,
    stderr: null,
    get exitCode() {
      return exitCode
    },
    exited,
    kill: mock(() => {}),
    pid: options?.pid ?? 12345,
    killed: false,
    signalCode: null,
    ref: () => {},
    unref: () => {},
  } as unknown as Subprocess

  return {
    proc,
    writeToStdout(data: string) {
      const encoder = new TextEncoder()
      stdoutController.enqueue(encoder.encode(data + '\n'))
    },
    readStdin() {
      return new TextDecoder().decode(
        Uint8Array.from(stdinChunks.flatMap(chunk => [...chunk])),
      )
    },
    simulateExit(code = 0) {
      exitCode = code
      try {
        stdoutController.close()
      } catch {
        // may already be closed
      }
      for (const resolve of exitResolvers) resolve(code)
    },
  }
}

interface MockState {
  messages: unknown[]
  permissionRequests: Array<{ request: unknown; requestId: string }>
  reconnectingCalls: Array<{ attempt: number; max: number }>
  connectedCount: number
  disconnectedCount: number
  errors: Error[]
}

function createMockOptions(
  overrides?: Partial<SSHSessionManagerOptions>,
): SSHSessionManagerOptions & { state: MockState } {
  const state: MockState = {
    messages: [],
    permissionRequests: [],
    reconnectingCalls: [],
    connectedCount: 0,
    disconnectedCount: 0,
    errors: [],
  }

  return {
    state,
    onMessage: msg => {
      state.messages.push(msg)
    },
    onPermissionRequest: (request, requestId) => {
      state.permissionRequests.push({ request, requestId })
    },
    onConnected: () => {
      state.connectedCount++
    },
    onReconnecting: (attempt, max) => {
      state.reconnectingCalls.push({ attempt, max })
    },
    onDisconnected: () => {
      state.disconnectedCount++
    },
    onError: err => {
      state.errors.push(err)
    },
    ...overrides,
  }
}

describe('SSHSessionManagerImpl', () => {
  test('connect() sets connected state and calls onConnected', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()

    expect(manager.isConnected()).toBe(true)
    expect(opts.state.connectedCount).toBe(1)
  })

  test('connect() is idempotent', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.connect()

    expect(opts.state.connectedCount).toBe(1)
  })

  test('disconnect() waits for confirmed process-tree termination', async () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    let resolveTermination!: (confirmed: boolean) => void
    const terminationSettlement = new Promise<boolean>(resolve => {
      resolveTermination = resolve
    })
    const terminate = mock(() => terminationSettlement)
    const manager = new SSHSessionManagerImpl(proc, opts, terminate)

    manager.connect()
    let settled = false
    const disconnect = manager.disconnect().then(confirmed => {
      settled = true
      return confirmed
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(manager.isConnected()).toBe(false)
    expect(settled).toBe(false)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith(proc)

    resolveTermination(true)
    expect(await disconnect).toBe(true)
    expect(proc.kill as ReturnType<typeof mock>).not.toHaveBeenCalled()
  })

  test('concurrent disconnect() calls share one termination attempt', async () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const terminate = mock(async () => true)
    const manager = new SSHSessionManagerImpl(proc, opts, terminate)

    manager.connect()
    const first = manager.disconnect()
    const second = manager.disconnect()

    expect(first).toBe(second)
    expect(await first).toBe(true)
    expect(await manager.disconnect()).toBe(true)
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  test('failed termination remains retryable and is not reported as complete', async () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const outcomes = [false, true]
    const terminate = mock(async () => outcomes.shift() ?? false)
    const manager = new SSHSessionManagerImpl(proc, opts, terminate)

    manager.connect()
    expect(await manager.disconnect()).toBe(false)
    expect(opts.state.errors.at(-1)?.message).toContain('process tree')

    expect(await manager.disconnect()).toBe(true)
    expect(terminate).toHaveBeenCalledTimes(2)
  })

  test('disconnect waits for stdout cancellation before confirming', async () => {
    let releaseCancel!: () => void
    const cancelSettlement = new Promise<void>(resolve => {
      releaseCancel = resolve
    })
    const { proc } = createMockSubprocess({
      onStdoutCancel: () => cancelSettlement,
    })
    const terminate = mock(async () => true)
    const manager = new SSHSessionManagerImpl(
      proc,
      createMockOptions(),
      terminate,
    )
    manager.connect()

    let settled = false
    const disconnect = manager.disconnect().then(result => {
      settled = true
      return result
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(terminate).toHaveBeenCalledTimes(1)

    releaseCancel()
    expect(await disconnect).toBe(true)
  })

  test('processLine routes SDK messages to onMessage', async () => {
    const sdkMessage = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: 'hello' },
    })

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(sdkMessage)

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(1)
    expect((opts.state.messages[0] as Record<string, unknown>).type).toBe(
      'assistant',
    )
  })

  test('processLine filters noise types', async () => {
    const noiseTypes = [
      'control_response',
      'keep_alive',
      'control_cancel_request',
      'streamlined_text',
      'streamlined_tool_use_summary',
    ]

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()

    for (const type of noiseTypes) {
      writeToStdout(JSON.stringify({ type }))
    }
    writeToStdout(
      JSON.stringify({ type: 'system', subtype: 'post_turn_summary' }),
    )

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(0)
  })

  test('processLine routes control_request to onPermissionRequest', async () => {
    const controlRequest = JSON.stringify({
      type: 'control_request',
      request_id: 'req-123',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'tool-456',
        input: { command: 'ls' },
      },
    })

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(controlRequest)

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.permissionRequests.length).toBe(1)
    expect(opts.state.permissionRequests[0]!.requestId).toBe('req-123')
  })

  test('sendMessage writes NDJSON to stdin', async () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    const result = await manager.sendMessage('hello world')

    expect(result).toBe(true)
  })

  test('sendInterrupt waits for the matching acknowledgement', async () => {
    const { proc, writeToStdout, readStdin } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts, async () => true)

    manager.connect()
    const interrupt = manager.sendInterrupt()
    const request = JSON.parse(readStdin().trim()) as {
      request_id: string
      request: { subtype: string }
    }

    expect(request.request.subtype).toBe('interrupt')
    writeToStdout(
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
    await manager.disconnect()
  })

  test('a new message cannot overtake an unacknowledged interrupt', async () => {
    const { proc, writeToStdout, readStdin } = createMockSubprocess()
    const manager = new SSHSessionManagerImpl(
      proc,
      createMockOptions(),
      async () => true,
    )
    manager.connect()

    const interrupt = manager.sendInterrupt()
    const request = JSON.parse(readStdin().trim()) as { request_id: string }
    const nextMessage = manager.sendMessage('next turn')
    await Promise.resolve()
    expect(readStdin()).not.toContain('next turn')

    writeToStdout(
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
    expect(readStdin()).toContain('next turn')
    await manager.disconnect()
  })

  test('respondToPermissionRequest sends allow response', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts, async () => true)

    manager.connect()
    manager.respondToPermissionRequest('req-123', {
      behavior: 'allow',
      updatedInput: { command: 'ls -la' },
    })
  })

  test('respondToPermissionRequest sends deny response', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.respondToPermissionRequest('req-123', {
      behavior: 'deny',
      message: 'User denied',
    })
  })

  test('process exit without reconnect calls onDisconnected', async () => {
    const { proc, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 100))

    expect(opts.state.disconnectedCount).toBe(1)
    expect(manager.isConnected()).toBe(false)
  })

  test('user disconnect does not trigger reconnect', async () => {
    let reconnectCalled = false
    const { proc } = createMockSubprocess()
    const opts = createMockOptions({
      reconnect: async () => {
        reconnectCalled = true
        return createMockSubprocess().proc
      },
      maxReconnectAttempts: 3,
    })
    const manager = new SSHSessionManagerImpl(proc, opts, async () => true)

    manager.connect()
    await manager.disconnect()

    await new Promise(r => setTimeout(r, 200))

    expect(reconnectCalled).toBe(false)
    expect(opts.state.reconnectingCalls.length).toBe(0)
  })

  test('disconnect waits for an in-flight reconnect and stops its late process', async () => {
    const { proc: firstProc, simulateExit } = createMockSubprocess({ pid: 101 })
    const { proc: lateProc } = createMockSubprocess({ pid: 202 })
    let resolveReconnect!: (proc: Subprocess) => void
    const reconnect = mock(
      () =>
        new Promise<Subprocess>(resolve => {
          resolveReconnect = resolve
        }),
    )
    const opts = createMockOptions({ reconnect, maxReconnectAttempts: 1 })
    const terminate = mock(async () => true)
    const manager = new SSHSessionManagerImpl(firstProc, opts, terminate)
    manager.connect()
    simulateExit(1)

    await new Promise(resolve => setTimeout(resolve, 2_100))
    expect(reconnect).toHaveBeenCalledTimes(1)

    const disconnect = manager.disconnect()
    await Promise.resolve()
    resolveReconnect(lateProc)

    expect(await disconnect).toBe(true)
    expect(terminate).toHaveBeenCalledWith(firstProc)
    expect(terminate).toHaveBeenCalledWith(lateProc)
  })

  test('invalid JSON lines are silently skipped', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout('not valid json')
    writeToStdout('{also: broken')
    writeToStdout(
      JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }),
    )

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(1)
    expect(opts.state.errors.length).toBe(0)
  })

  test('non-StdoutMessage objects are skipped', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(JSON.stringify({ noTypeField: true }))
    writeToStdout(JSON.stringify([1, 2, 3]))
    writeToStdout(JSON.stringify('string'))

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(0)
  })

  test('process exit with reconnect factory attempts reconnection', async () => {
    const { proc: proc1, simulateExit } = createMockSubprocess()
    const { proc: proc2 } = createMockSubprocess()

    const opts = createMockOptions({
      reconnect: mock(async () => proc2),
      maxReconnectAttempts: 3,
    })
    const manager = new SSHSessionManagerImpl(proc1, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 3000))

    expect(opts.state.reconnectingCalls.length).toBeGreaterThanOrEqual(1)
    expect(opts.state.reconnectingCalls[0]!.attempt).toBe(1)
    expect(opts.state.reconnectingCalls[0]!.max).toBe(3)
  })

  test('reconnect failure exhausts attempts then disconnects', async () => {
    const { proc, simulateExit } = createMockSubprocess()

    const opts = createMockOptions({
      reconnect: mock(async () => {
        throw new Error('SSH connection refused')
      }),
      maxReconnectAttempts: 2,
    })
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 12000))

    expect(opts.state.reconnectingCalls.length).toBe(2)
    expect(opts.state.disconnectedCount).toBe(1)
    expect(manager.isConnected()).toBe(false)
  }, 15000)
})
