import { beforeEach, describe, expect, test } from 'bun:test'
import { asAgentId } from '../../../types/ids.js'
import type { Message } from '../../../types/message.js'
import type {
  CacheSafeParams,
  ForkedAgentResult,
} from '../../../utils/forkedAgent.js'
import { StopConfirmationError } from '../../../utils/stopConfirmation.js'
import {
  type AgentSummaryDependencies,
  type AgentSummaryHandle,
  AgentSummaryScope,
  startAgentSummarization,
} from '../agentSummary.js'

const transcriptMessages = [
  { type: 'user', message: { content: 'start' }, uuid: 'u1' },
  {
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'working' }] },
    uuid: 'a1',
  },
  { type: 'user', message: { content: 'continue' }, uuid: 'u2' },
] as unknown as Message[]

type ForkCall = {
  cacheSafeParams: CacheSafeParams
  overrides?: { abortController?: AbortController }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('startAgentSummarization', () => {
  let scheduled: (() => void | Promise<void>) | undefined
  let handle: AgentSummaryHandle | undefined
  let forkCalls: ForkCall[]
  let updateCalls: Array<{ taskId: string; summary: string }>
  let transcriptMessagesForTest: Message[]
  let debugLogs: string[]
  let loggedErrors: Error[]
  let clearedHandles: unknown[]
  let scheduledCount: number
  let lastTimerHandle: unknown
  let parentAbortController: AbortController

  function startTestSummarization(
    dependencies: AgentSummaryDependencies = {},
  ): AgentSummaryHandle {
    return startAgentSummarization(
      'task-1',
      asAgentId('a0000000000000000'),
      {
        forkContextMessages: [
          { type: 'user', message: { content: 'stale' }, uuid: 'old' },
        ],
        model: 'claude-test',
        toolUseContext: { abortController: parentAbortController },
      } as unknown as CacheSafeParams,
      () => undefined,
      {
        clearTimeout: ((timeoutId: unknown) => {
          clearedHandles.push(timeoutId)
        }) as typeof clearTimeout,
        getAgentTranscript: async () => ({
          messages: transcriptMessagesForTest,
          contentReplacements: [],
        }),
        isPoorModeActive: () => false,
        logError: error => {
          loggedErrors.push(
            error instanceof Error ? error : new Error(String(error)),
          )
        },
        logForDebugging: message => {
          debugLogs.push(message)
        },
        runForkedAgent: async (args: ForkCall) => {
          forkCalls.push(args)
          return {
            messages: [
              {
                type: 'assistant',
                message: {
                  content: [{ type: 'text', text: 'Reading udsClient.ts' }],
                },
              },
            ],
          } as unknown as ForkedAgentResult
        },
        setTimeout: ((callback: TimerHandler) => {
          if (typeof callback !== 'function') {
            throw new Error('Expected timer callback')
          }
          scheduledCount += 1
          scheduled = callback as () => void | Promise<void>
          lastTimerHandle = { id: scheduledCount }
          return lastTimerHandle as ReturnType<typeof setTimeout>
        }) as unknown as typeof setTimeout,
        updateAgentSummary: (taskId: string, summary: string) => {
          updateCalls.push({ taskId, summary })
        },
        ...dependencies,
      },
    )
  }

  beforeEach(() => {
    forkCalls = []
    updateCalls = []
    scheduled = undefined
    handle = undefined
    transcriptMessagesForTest = transcriptMessages
    debugLogs = []
    loggedErrors = []
    clearedHandles = []
    scheduledCount = 0
    lastTimerHandle = undefined
    parentAbortController = new AbortController()
  })

  function expectDebugLogContaining(fragment: string): void {
    expect(debugLogs.some(message => message.includes(fragment))).toBe(true)
  }

  test('summarizes bounded transcript once and skips unchanged fingerprints', async () => {
    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toHaveLength(1)
    expect(updateCalls).toEqual([
      { taskId: 'task-1', summary: 'Reading udsClient.ts' },
    ])

    const forkContext = forkCalls[0].cacheSafeParams.forkContextMessages ?? []
    expect(forkContext.map(message => String(message.uuid))).toEqual([
      'u1',
      'a1',
      'u2',
    ])
    expect(forkContext.some(message => String(message.uuid) === 'old')).toBe(
      false,
    )

    await scheduled!()

    expect(forkCalls).toHaveLength(1)
    expect(updateCalls).toHaveLength(1)
    expect(loggedErrors).toEqual([])
  })

  test('skips summarization when filtering leaves too little bounded context', async () => {
    transcriptMessagesForTest = [
      { type: 'user', message: { content: 'start' }, uuid: 'u1' },
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          content: [{ type: 'tool_use', id: 'missing', name: 'Read' }],
        },
      },
      { type: 'user', message: { content: 'continue' }, uuid: 'u2' },
    ] as unknown as Message[]

    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining(
      '[AgentSummary] Skipping summary for task-1: no bounded context available',
    )
  })

  test('skips summarization before building context when transcript is too short', async () => {
    transcriptMessagesForTest = transcriptMessages.slice(0, 2)
    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining(
      '[AgentSummary] Skipping summary for task-1: not enough messages (2)',
    )
  })

  test('skips and reschedules while poor mode is active', async () => {
    handle = startTestSummarization({
      isPoorModeActive: () => true,
    })

    expect(typeof scheduled).toBe('function')
    const initialScheduledCount = scheduledCount
    const initialTimerHandle = lastTimerHandle
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining(
      '[AgentSummary] Skipping summary — poor mode active',
    )
    expect(scheduledCount).toBe(initialScheduledCount + 1)
    expect(lastTimerHandle).not.toBe(initialTimerHandle)
  })

  test('logs summary errors and schedules the next timer', async () => {
    const error = new Error('fork failed')
    handle = startTestSummarization({
      runForkedAgent: async () => {
        throw error
      },
    })

    expect(typeof scheduled).toBe('function')
    const initialScheduledCount = scheduledCount
    const initialTimerHandle = lastTimerHandle
    await scheduled!()

    expect(loggedErrors).toEqual([error])
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(initialScheduledCount + 1)
    expect(lastTimerHandle).not.toBe(initialTimerHandle)
  })

  test('stop clears the pending summary timer', async () => {
    handle = startTestSummarization()
    const pendingHandle = lastTimerHandle

    await handle.stop()

    expectDebugLogContaining('[AgentSummary] Stopping summarization for task-1')
    expect(clearedHandles).toEqual([pendingHandle])
  })

  test('in-flight stop reports settled when the summary run unwinds', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    let summarySignal: AbortSignal | undefined
    handle = startTestSummarization({
      runForkedAgent: async args => {
        summarySignal = args.overrides?.abortController?.signal
        forkStarted.resolve()
        return forkResult.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise

    const stopPromise = handle.stop()
    let stopSettled = false
    void stopPromise.then(() => {
      stopSettled = true
    })
    await Promise.resolve()

    expect(summarySignal?.aborted).toBe(true)
    expect(stopSettled).toBe(false)

    forkResult.resolve({ messages: [] } as unknown as ForkedAgentResult)
    expect(await stopPromise).toBe('settled')
    await runPromise

    expect(stopSettled).toBe(true)
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)
  })

  test('in-flight stop times out when the summary run ignores abort', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    const timeout = deferred<void>()
    let summarySignal: AbortSignal | undefined
    let timeoutMs: number | undefined
    handle = startTestSummarization({
      runForkedAgent: async args => {
        summarySignal = args.overrides?.abortController?.signal
        forkStarted.resolve()
        return forkResult.promise
      },
      waitForStopSettlement: async (run, ms) => {
        timeoutMs = ms
        return Promise.race([
          run.then(
            () => 'settled' as const,
            () => 'settled' as const,
          ),
          timeout.promise.then(() => 'timed_out' as const),
        ])
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise

    const stopPromise = handle.stop()
    expect(summarySignal?.aborted).toBe(true)
    expect(timeoutMs).toBe(5_000)

    timeout.resolve()
    expect(await stopPromise).toBe('timed_out')
    const exactStop = handle.stopExactly()
    let exactSettled = false
    void exactStop.then(() => {
      exactSettled = true
    })
    await Promise.resolve()
    expect(exactSettled).toBe(false)
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)

    // Let the intentionally abort-ignoring fake unwind so the test does not
    // leave a pending run behind. Its late result must remain suppressed.
    forkResult.resolve({ messages: [] } as unknown as ForkedAgentResult)
    await runPromise
    await exactStop
    expect(exactSettled).toBe(true)
  })

  test('does not swallow an unconfirmed provider cancellation', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    handle = startTestSummarization({
      runForkedAgent: async () => {
        forkStarted.resolve()
        return forkResult.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise
    parentAbortController.abort('parent stopped')
    const stopPromise = handle.stop()
    forkResult.reject(
      new StopConfirmationError('provider stream remained active'),
    )

    expect(await stopPromise).toBe('timed_out')
    await expect(runPromise).rejects.toBeInstanceOf(StopConfirmationError)
  })

  test('parent agent abort immediately reaches an in-flight summary request', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    let summarySignal: AbortSignal | undefined
    handle = startTestSummarization({
      runForkedAgent: async args => {
        summarySignal = args.overrides?.abortController?.signal
        forkStarted.resolve()
        return forkResult.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise
    parentAbortController.abort('parent stopped')

    expect(summarySignal?.aborted).toBe(true)
    expect(summarySignal?.reason).toBe('parent stopped')

    const stopPromise = handle.stop()
    forkResult.resolve({ messages: [] } as unknown as ForkedAgentResult)
    await Promise.all([stopPromise, runPromise])
    expect(scheduledCount).toBe(1)
  })

  test('parent abort suppresses a late result from an abort-ignoring summary adapter', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    handle = startTestSummarization({
      runForkedAgent: async () => {
        forkStarted.resolve()
        return forkResult.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise
    parentAbortController.abort('parent stopped')
    forkResult.resolve({
      messages: [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'late summary' }],
          },
        },
      ],
    } as unknown as ForkedAgentResult)
    await runPromise

    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)
    await handle.stop()
  })

  test('stop before the first timer prevents a stale callback from starting', async () => {
    handle = startTestSummarization()
    const staleTimerCallback = scheduled

    await handle.stop()
    await staleTimerCallback!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)
  })

  test('stop between timer dispatch and run start waits without launching work', async () => {
    handle = startTestSummarization()

    const timerRun = Promise.resolve(scheduled!())
    const stopPromise = handle.stop()
    await Promise.all([timerRun, stopPromise])

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)
  })

  test('concurrent stop calls share the same settlement promise', async () => {
    const forkResult = deferred<ForkedAgentResult>()
    const forkStarted = deferred<void>()
    handle = startTestSummarization({
      runForkedAgent: async () => {
        forkStarted.resolve()
        return forkResult.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await forkStarted.promise
    const firstStop = handle.stop()
    const secondStop = handle.stop()

    expect(secondStop).toBe(firstStop)
    forkResult.resolve({ messages: [] } as unknown as ForkedAgentResult)
    await Promise.all([firstStop, secondStop, runPromise])
    expect(
      debugLogs.filter(message =>
        message.includes('[AgentSummary] Stopping summarization for task-1'),
      ),
    ).toHaveLength(1)
  })

  test('stop during transcript loading suppresses a late summary update', async () => {
    const transcript = deferred<{
      messages: Message[]
      contentReplacements: never[]
    }>()
    const transcriptStarted = deferred<void>()
    handle = startTestSummarization({
      getAgentTranscript: async () => {
        transcriptStarted.resolve()
        return transcript.promise
      },
    })

    const runPromise = Promise.resolve(scheduled!())
    await transcriptStarted.promise
    const stopPromise = handle.stop()
    transcript.resolve({
      messages: transcriptMessagesForTest,
      contentReplacements: [],
    })
    await Promise.all([stopPromise, runPromise])

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(1)
  })
})

describe('AgentSummaryScope', () => {
  test('stops every unique handle and preserves a timed out result', async () => {
    const scope = new AgentSummaryScope()
    let settledStops = 0
    let timedOutStops = 0
    const settledHandle: AgentSummaryHandle = {
      stop: async () => {
        settledStops += 1
        return 'settled'
      },
      stopExactly: async () => {},
    }
    const timedOutHandle: AgentSummaryHandle = {
      stop: async () => {
        timedOutStops += 1
        return 'timed_out'
      },
      stopExactly: async () => {},
    }

    scope.add(settledHandle)
    scope.add(settledHandle)
    scope.add(timedOutHandle)

    const firstStop = scope.stopAll()
    const secondStop = scope.stopAll()
    expect(secondStop).toBe(firstStop)
    expect(await firstStop).toBe('timed_out')
    expect(settledStops).toBe(1)
    expect(timedOutStops).toBe(1)
  })

  test('returns settled and immediately stops handles added after shutdown', async () => {
    const scope = new AgentSummaryScope()
    expect(await scope.stopAll()).toBe('settled')

    let lateStops = 0
    scope.add({
      stop: async () => 'settled',
      stopExactly: async () => {
        lateStops += 1
      },
    })

    expect(lateStops).toBe(1)
    expect(await scope.stopAll()).toBe('settled')
  })
})
