// This suite runs in a child process because AgentTool dependencies install
// process-wide module mocks in several other test files.
import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../../../tests/mocks/debug'
import { logMock } from '../../../../../../tests/mocks/log'
import { AbortSettlementTimeoutError } from 'src/utils/abortSettlement.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO ??= {
  VERSION: '0.0.0-test',
}

const { runForegroundExecutionFinalizers } = await import('../AgentTool.js')
const { initializeAgentMcpServers, settleAgentCleanupSteps } = await import(
  '../runAgent.js'
)

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('foreground Agent finalization', () => {
  test('settles execution after unregister throws and still attempts the SDK event', () => {
    const order: string[] = []

    expect(() =>
      runForegroundExecutionFinalizers(
        [
          {
            operation: 'unregister',
            finalize: () => {
              order.push('unregister')
              throw new Error('unregister failed')
            },
          },
          {
            operation: 'SDK event',
            finalize: () => {
              order.push('sdk')
            },
          },
        ],
        () => order.push('settle'),
        false,
      ),
    ).toThrow('unregister failed')

    expect(order).toEqual(['unregister', 'sdk', 'settle'])
  })

  test('records finalizer failure without replacing an existing lifecycle error', () => {
    let settled = false

    expect(() =>
      runForegroundExecutionFinalizers(
        [
          {
            operation: 'SDK event',
            finalize: () => {
              throw new Error('SDK event failed')
            },
          },
        ],
        () => {
          settled = true
        },
        true,
      ),
    ).not.toThrow()

    expect(settled).toBe(true)
  })
})

describe('runAgent cleanup settlement', () => {
  test('schedules every cleanup despite a synchronous failure and awaits all promises', async () => {
    const workflow = deferred()
    const monitor = deferred()
    const order: string[] = []
    let finished = false

    const waiting = settleAgentCleanupSteps(
      [
        {
          operation: 'workflow',
          cleanup: () => {
            order.push('workflow')
            return workflow.promise
          },
        },
        {
          operation: 'MCP',
          cleanup: () => {
            order.push('mcp')
            throw new Error('MCP require failed')
          },
        },
        {
          operation: 'shell',
          cleanup: () => {
            order.push('shell')
            return Promise.resolve()
          },
        },
        {
          operation: 'monitor',
          cleanup: () => {
            order.push('monitor')
            return monitor.promise
          },
        },
      ],
      new AbortController().signal,
      { timeoutMs: 100, abortGraceMs: 10 },
    ).then(failures => {
      finished = true
      return failures
    })

    expect(order).toEqual(['workflow', 'mcp', 'shell', 'monitor'])
    await Promise.resolve()
    expect(finished).toBe(false)

    workflow.resolve()
    monitor.resolve()
    const failures = await waiting
    expect(failures).toHaveLength(1)
    expect(failures[0]).toBeInstanceOf(Error)
  })

  test('returns a bounded failure when asynchronous cleanup never settles', async () => {
    const failures = await settleAgentCleanupSteps(
      [
        {
          operation: 'hung cleanup',
          cleanup: () => new Promise<void>(() => {}),
        },
      ],
      new AbortController().signal,
      { timeoutMs: 10, abortGraceMs: 5 },
    )

    expect(failures).toHaveLength(1)
    expect(failures[0]).toBeInstanceOf(AbortSettlementTimeoutError)
  })

  test('cleans acquired resources when initialization fails midway', async () => {
    const cleanup = mock(async () => {})
    const initializationFailure = new Error('second MCP failed')
    let connectionAttempt = 0

    const initialization = initializeAgentMcpServers(
      {
        agentType: 'lifecycle-test',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => '',
        mcpServers: [
          { first: { type: 'stdio', command: 'first' } },
          { second: { type: 'stdio', command: 'second' } },
        ],
      } as any,
      [],
      undefined,
      {
        connectToServer: mock(async (name: string) => {
          connectionAttempt++
          if (connectionAttempt === 1) {
            return { type: 'connected', name, cleanup } as any
          }
          throw initializationFailure
        }),
        fetchToolsForClient: mock(async () => []),
        getMcpConfigByName: () => null,
      } as any,
    )

    await expect(initialization).rejects.toBe(initializationFailure)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('prioritizes stop confirmation when initialization rollback fails', async () => {
    const initializationFailure = new Error('second MCP failed')
    const cleanupFailure = new Error('first MCP cleanup failed')
    let connectionAttempt = 0

    try {
      await initializeAgentMcpServers(
        {
          agentType: 'lifecycle-test',
          source: 'built-in',
          baseDir: 'built-in',
          getSystemPrompt: () => '',
          mcpServers: [
            { first: { type: 'stdio', command: 'first' } },
            { second: { type: 'stdio', command: 'second' } },
          ],
        } as any,
        [],
        undefined,
        {
          connectToServer: mock(async (name: string) => {
            connectionAttempt++
            if (connectionAttempt === 1) {
              return {
                type: 'connected',
                name,
                cleanup: async () => {
                  throw cleanupFailure
                },
              } as any
            }
            throw initializationFailure
          }),
          fetchToolsForClient: mock(async () => []),
          getMcpConfigByName: () => null,
        } as any,
      )
      throw new Error('Expected MCP initialization to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(StopConfirmationError)
      expect((error as StopConfirmationError).failures).toEqual([
        initializationFailure,
        cleanupFailure,
      ])
    }
  })

  test('bounds cancellation when MCP connection initialization never settles', async () => {
    const abortController = new AbortController()
    let markConnectionStarted!: () => void
    const connectionStarted = new Promise<void>(resolve => {
      markConnectionStarted = resolve
    })
    const initialization = initializeAgentMcpServers(
      {
        agentType: 'lifecycle-test',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => '',
        mcpServers: [{ stuck: { type: 'stdio', command: 'stuck' } }],
      } as any,
      [],
      abortController.signal,
      {
        connectToServer: mock(() => {
          markConnectionStarted()
          return new Promise(() => {})
        }),
        fetchToolsForClient: mock(async () => []),
        getMcpConfigByName: () => null,
      } as any,
      { abortGraceMs: 5 },
    )

    await connectionStarted
    abortController.abort('test-stop')

    await expect(initialization).rejects.toBeInstanceOf(StopConfirmationError)
  })

  test('rolls back an acquired MCP client when tool discovery ignores abort', async () => {
    const abortController = new AbortController()
    const cleanup = mock(async () => {})
    let markDiscoveryStarted!: () => void
    const discoveryStarted = new Promise<void>(resolve => {
      markDiscoveryStarted = resolve
    })
    const initialization = initializeAgentMcpServers(
      {
        agentType: 'lifecycle-test',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => '',
        mcpServers: [{ stuck: { type: 'stdio', command: 'stuck' } }],
      } as any,
      [],
      abortController.signal,
      {
        connectToServer: mock(async (name: string) => ({
          type: 'connected',
          name,
          cleanup,
        })),
        fetchToolsForClient: mock(() => {
          markDiscoveryStarted()
          return new Promise(() => {})
        }),
        getMcpConfigByName: () => null,
      } as any,
      { abortGraceMs: 5 },
    )

    await discoveryStarted
    abortController.abort('test-stop')

    await expect(initialization).rejects.toBeInstanceOf(StopConfirmationError)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('cleans an inline MCP client that resolves after cancellation was unconfirmed', async () => {
    const abortController = new AbortController()
    const cleanup = mock(async () => {})
    let resolveConnection!: (client: unknown) => void
    const connection = new Promise(resolve => {
      resolveConnection = resolve
    })
    let markConnectionStarted!: () => void
    const connectionStarted = new Promise<void>(resolve => {
      markConnectionStarted = resolve
    })
    const initialization = initializeAgentMcpServers(
      {
        agentType: 'lifecycle-test',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => '',
        mcpServers: [{ late: { type: 'stdio', command: 'late' } }],
      } as any,
      [],
      abortController.signal,
      {
        connectToServer: mock(() => {
          markConnectionStarted()
          return connection
        }),
        fetchToolsForClient: mock(async () => []),
        getMcpConfigByName: () => null,
      } as any,
      { abortGraceMs: 5 },
    )

    await connectionStarted
    abortController.abort('test-stop')
    await expect(initialization).rejects.toBeInstanceOf(StopConfirmationError)

    resolveConnection({ type: 'connected', name: 'late', cleanup })
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
