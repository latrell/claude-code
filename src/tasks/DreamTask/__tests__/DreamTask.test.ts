import { describe, expect, mock, test } from 'bun:test'

const rollbackMock = mock(() => Promise.resolve())
mock.module('src/services/autoDream/consolidationLock.ts', () => ({
  rollbackConsolidationLock: rollbackMock,
  readLastConsolidatedAt: () => Promise.resolve(0),
  tryAcquireConsolidationLock: () => Promise.resolve(null),
  listSessionsTouchedSince: () => Promise.resolve([]),
  recordConsolidation: () => Promise.resolve(),
}))

const { DreamTask, completeDreamTask, stopDreamTask, trackDreamTaskRun } =
  await import('../DreamTask.js')
const { StopConfirmationError } = await import(
  '../../../utils/stopConfirmation.js'
)

type DreamState = {
  status: 'running' | 'completed' | 'failed' | 'killed'
  abortController?: AbortController
  lockLease?: { priorMtime: number; ownerToken: string }
  error?: string
  [key: string]: unknown
}
type State = { tasks: Record<string, DreamState> }

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolve = (): void => {}
  let reject = (_error: unknown): void => {}
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function createState() {
  const controller = new AbortController()
  let state: State = {
    tasks: {
      dream: {
        id: 'dream',
        type: 'dream',
        status: 'running',
        description: 'dreaming',
        startTime: Date.now(),
        outputFile: '',
        outputOffset: 0,
        notified: false,
        phase: 'starting',
        sessionsReviewing: 1,
        filesTouched: [],
        turns: [],
        abortController: controller,
        lockLease: { priorMtime: 123, ownerToken: 'owner-1' },
      },
    },
  }
  return {
    controller,
    getState: () => state,
    setAppState: (update: (current: State) => State) => {
      state = update(state)
    },
  }
}

describe('DreamTask cancellation', () => {
  test('waits for the forked request to settle before reporting killed or releasing the lock', async () => {
    rollbackMock.mockClear()
    const run = deferred()
    const { controller, getState, setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)

    let stopped = false
    const stop = DreamTask.kill('dream', setAppState as never).then(() => {
      stopped = true
    })

    expect(controller.signal.aborted).toBe(true)
    expect(getState().tasks.dream!.status).toBe('running')
    expect(stopped).toBe(false)
    expect(rollbackMock).not.toHaveBeenCalled()

    run.resolve()
    await stop

    expect(getState().tasks.dream!.status).toBe('killed')
    expect(rollbackMock).toHaveBeenCalledWith({
      priorMtime: 123,
      ownerToken: 'owner-1',
    })
  })

  test('late completion cannot overwrite a requested stop', async () => {
    const run = deferred()
    const { getState, setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)
    const stop = DreamTask.kill('dream', setAppState as never)

    completeDreamTask('dream', setAppState as never)
    expect(getState().tasks.dream!.status).toBe('running')

    run.resolve()
    await stop
    expect(getState().tasks.dream!.status).toBe('killed')
  })

  test('deduplicates concurrent stop requests and rolls back exactly once', async () => {
    rollbackMock.mockClear()
    const run = deferred()
    const { setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)

    const first = DreamTask.kill('dream', setAppState as never)
    const second = DreamTask.kill('dream', setAppState as never)

    run.resolve()
    await Promise.all([first, second])

    expect(rollbackMock).toHaveBeenCalledTimes(1)
  })

  test('keeps the task non-terminal and rejects when the forked request ignores cancellation', async () => {
    rollbackMock.mockClear()
    const run = deferred()
    const { controller, getState, setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)

    await expect(
      stopDreamTask('dream', setAppState as never, {
        timeoutMs: 1_000,
        abortGraceMs: 10,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(controller.signal.aborted).toBe(true)
    expect(getState().tasks.dream!.status).toBe('running')
    expect(rollbackMock).not.toHaveBeenCalled()

    run.resolve()
    await stopDreamTask('dream', setAppState as never, {
      timeoutMs: 1_000,
      abortGraceMs: 10,
    })
    expect(getState().tasks.dream!.status).toBe('killed')
  })

  test('does not turn an unconfirmed runner rejection into a confirmed kill', async () => {
    rollbackMock.mockClear()
    const run = deferred()
    const { controller, getState, setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)

    const stopping = DreamTask.kill('dream', setAppState as never)
    run.reject(new StopConfirmationError('provider still running'))

    await expect(stopping).rejects.toBeInstanceOf(StopConfirmationError)
    expect(controller.signal.aborted).toBe(true)
    expect(getState().tasks.dream!.status).toBe('failed')
    expect(getState().tasks.dream!.abortController).toBeUndefined()
    expect(getState().tasks.dream!.error).toBe('provider still running')
    expect(rollbackMock).not.toHaveBeenCalled()

    // The rejected runner is terminal evidence, not a retry handle. A later
    // direct Stop cannot get trapped replaying the same rejected promise.
    await stopDreamTask('dream', setAppState as never)
    expect(getState().tasks.dream!.status).toBe('failed')
  })

  test('treats an ordinary rejected runner as settled cancellation proof', async () => {
    rollbackMock.mockClear()
    const run = deferred()
    const { getState, setAppState } = createState()
    trackDreamTaskRun('dream', run.promise, setAppState as never)

    const stopping = DreamTask.kill('dream', setAppState as never)
    run.reject(new Error('local runner exited during abort'))

    await stopping
    expect(getState().tasks.dream!.status).toBe('killed')
    expect(rollbackMock).toHaveBeenCalledTimes(1)
  })
})
