import { describe, expect, mock, test } from 'bun:test'

const rollbackMock = mock(() => Promise.resolve())
mock.module('src/services/autoDream/consolidationLock.ts', () => ({
  rollbackConsolidationLock: rollbackMock,
  readLastConsolidatedAt: () => Promise.resolve(0),
  tryAcquireConsolidationLock: () => Promise.resolve(null),
  listSessionsTouchedSince: () => Promise.resolve([]),
  recordConsolidation: () => Promise.resolve(),
}))

const { DreamTask, completeDreamTask, trackDreamTaskRun } = await import(
  '../DreamTask.js'
)

type DreamState = {
  status: 'running' | 'completed' | 'killed'
  abortController?: AbortController
  lockLease?: { priorMtime: number; ownerToken: string }
  [key: string]: unknown
}
type State = { tasks: Record<string, DreamState> }

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
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
    trackDreamTaskRun('dream', run.promise)

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
    trackDreamTaskRun('dream', run.promise)
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
    trackDreamTaskRun('dream', run.promise)

    const first = DreamTask.kill('dream', setAppState as never)
    const second = DreamTask.kill('dream', setAppState as never)

    run.resolve()
    await Promise.all([first, second])

    expect(rollbackMock).toHaveBeenCalledTimes(1)
  })
})
