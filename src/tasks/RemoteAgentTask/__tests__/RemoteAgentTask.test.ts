import { afterEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'
import { StopConfirmationError } from '../../../utils/stopConfirmation.js'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

let stopResult = true
const stopRemoteSessionMock = mock(async (_sessionId: string) => stopResult)
mock.module('src/utils/teleport.tsx', () => ({
  stopRemoteSession: stopRemoteSessionMock,
  checkOutTeleportedSessionBranch: async () => {},
  pollRemoteSessionEvents: async () => ({ events: [], nextCursor: null }),
  processMessagesForTeleportResume: (messages: unknown[]) => messages,
  teleportFromSessionsAPI: async () => null,
  teleportResumeCodeSession: async () => null,
  teleportToRemote: async () => null,
  teleportToRemoteWithErrorHandling: async () => null,
  validateGitState: async () => {},
  validateSessionRepository: async () => ({ valid: true }),
}))

const terminatedTaskIds: string[] = []
mock.module('src/utils/sdkEventQueue.ts', () => ({
  emitTaskTerminatedSdk: (taskId: string) => {
    terminatedTaskIds.push(taskId)
  },
  enqueueSdkEvent: () => {},
}))

const { RemoteAgentTask, registerCompletionHook } = await import(
  '../RemoteAgentTask.js'
)

type AppStateLike = { tasks: Record<string, any> }

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function createState() {
  let state: AppStateLike = {
    tasks: {
      rtest: {
        id: 'rtest',
        type: 'remote_agent',
        status: 'running',
        description: 'remote work',
        toolUseId: 'tool-1',
        startTime: Date.now(),
        outputFile: '/tmp/rtest.output',
        outputOffset: 0,
        notified: false,
        sessionId: 'session-1',
        remoteTaskType: 'autofix-pr',
        remoteTaskMetadata: { monitorTaskId: 'rtest' },
      },
    },
  }
  return {
    getState: () => state,
    setAppState: (updater: (prev: AppStateLike) => AppStateLike) => {
      state = updater(state)
    },
  }
}

afterEach(() => {
  stopResult = true
  stopRemoteSessionMock.mockClear()
  terminatedTaskIds.length = 0
})

describe('RemoteAgentTask.kill', () => {
  test('awaits remote interrupt and archive acknowledgement before marking the task killed', async () => {
    const { getState, setAppState } = createState()
    let acknowledgeArchive: (archived: boolean) => void = () => {}
    stopRemoteSessionMock.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          acknowledgeArchive = resolve
        }),
    )

    const killPromise = RemoteAgentTask.kill('rtest', setAppState as any)

    expect(stopRemoteSessionMock).toHaveBeenCalledWith('session-1')
    expect(getState().tasks.rtest.status).toBe('running')
    expect(terminatedTaskIds).toEqual([])

    acknowledgeArchive(true)
    await killPromise

    expect(getState().tasks.rtest.status).toBe('killed')
    expect(getState().tasks.rtest.notified).toBe(true)
    expect(terminatedTaskIds).toEqual(['rtest'])
  })

  test('keeps the task running and rejects when the remote stop is not acknowledged', async () => {
    stopResult = false
    const { getState, setAppState } = createState()

    const error = await RemoteAgentTask.kill('rtest', setAppState as any).catch(
      caught => caught,
    )

    expect(error).toBeInstanceOf(StopConfirmationError)
    expect(error.message).toContain('did not acknowledge interrupt and archive')

    expect(getState().tasks.rtest.status).toBe('running')
    expect(getState().tasks.rtest.notified).toBe(false)
    expect(terminatedTaskIds).toEqual([])
  })

  test('wraps a rejected remote stop as unconfirmed and leaves the task running', async () => {
    stopRemoteSessionMock.mockImplementationOnce(async () => {
      throw new Error('injected stop deadline')
    })
    const { getState, setAppState } = createState()

    await expect(
      RemoteAgentTask.kill('rtest', setAppState as any),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    expect(getState().tasks.rtest.status).toBe('running')
    expect(getState().tasks.rtest.notified).toBe(false)
    expect(terminatedTaskIds).toEqual([])
  })

  test('shares one archive request between concurrent stop callers', async () => {
    const { getState, setAppState } = createState()
    let acknowledgeArchive: (archived: boolean) => void = () => {}
    stopRemoteSessionMock.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          acknowledgeArchive = resolve
        }),
    )

    const firstStop = RemoteAgentTask.kill('rtest', setAppState as any)
    const secondStop = RemoteAgentTask.kill('rtest', setAppState as any)

    expect(stopRemoteSessionMock).toHaveBeenCalledTimes(1)
    acknowledgeArchive(true)
    await Promise.all([firstStop, secondStop])

    expect(getState().tasks.rtest.status).toBe('killed')
    expect(terminatedTaskIds).toEqual(['rtest'])
  })

  test('does not reuse a pending stop after the local task id is rebound to another session', async () => {
    const { getState, setAppState } = createState()
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    stopRemoteSessionMock.mockImplementation(sessionId =>
      sessionId === 'session-1' ? first.promise : second.promise,
    )

    const firstStop = RemoteAgentTask.kill('rtest', setAppState as any)
    setAppState(previous => ({
      ...previous,
      tasks: {
        ...previous.tasks,
        rtest: {
          ...previous.tasks.rtest,
          status: 'running',
          sessionId: 'session-2',
        },
      },
    }))
    const secondStop = RemoteAgentTask.kill('rtest', setAppState as any)

    expect(stopRemoteSessionMock).toHaveBeenCalledTimes(2)
    expect(stopRemoteSessionMock).toHaveBeenCalledWith('session-1')
    expect(stopRemoteSessionMock).toHaveBeenCalledWith('session-2')

    second.resolve(true)
    await secondStop
    expect(getState().tasks.rtest.sessionId).toBe('session-2')
    expect(getState().tasks.rtest.status).toBe('killed')

    first.resolve(true)
    await firstStop
    expect(getState().tasks.rtest.sessionId).toBe('session-2')
    expect(terminatedTaskIds).toEqual(['rtest'])
  })

  test('runs the registered completion hook after an acknowledged TaskStop', async () => {
    const { setAppState } = createState()
    const completionHook = mock<(taskId: string, metadata?: unknown) => void>(
      () => {},
    )
    registerCompletionHook('autofix-pr', completionHook)

    await RemoteAgentTask.kill('rtest', setAppState as any)

    expect(completionHook).toHaveBeenCalledTimes(1)
    expect(completionHook.mock.calls[0]?.[0]).toBe('rtest')
    expect(completionHook.mock.calls[0]?.[1]).toEqual({
      monitorTaskId: 'rtest',
    })
  })
})
