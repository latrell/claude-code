import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/task/diskOutput.ts', () => ({
  evictTaskOutput: async () => {},
}))

import type { AppState } from '../../../state/AppState'
import type { AgentId } from '../../../types/ids'
import { killShellTasksForAgent, killTask } from '../killShellTasks'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function makeState(
  killResult: Promise<boolean>,
  options: { shellCommand?: 'present' | 'missing'; agentId?: AgentId } = {},
): {
  getState: () => AppState
  setAppState: (updater: (state: AppState) => AppState) => void
  cleanup: ReturnType<typeof mock>
} {
  const cleanup = mock(() => {})
  const shellCommand =
    options.shellCommand === 'missing'
      ? null
      : {
          kill: mock(() => killResult),
          cleanup,
        }
  let state = {
    tasks: {
      shell: {
        type: 'local_bash',
        status: 'running',
        command: 'sleep 30',
        description: 'sleep',
        shellCommand,
        agentId: options.agentId,
        completionStatusSentInAttachment: false,
        lastReportedTotalLines: 0,
        isBackgrounded: true,
        startTime: Date.now(),
      },
    },
  } as unknown as AppState
  return {
    getState: () => state,
    setAppState(updater) {
      state = updater(state)
    },
    cleanup,
  }
}

describe('killTask', () => {
  test('does not publish killed state before process exit is confirmed', async () => {
    const confirmation = deferred<boolean>()
    const { getState, setAppState, cleanup } = makeState(confirmation.promise)

    const stopping = killTask('shell', setAppState)
    expect(getState().tasks.shell?.status).toBe('running')
    expect(cleanup).not.toHaveBeenCalled()

    confirmation.resolve(true)
    await stopping

    expect(getState().tasks.shell?.status).toBe('killed')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('keeps the task running when termination cannot be confirmed', async () => {
    const { getState, setAppState, cleanup } = makeState(Promise.resolve(false))

    await expect(killTask('shell', setAppState)).rejects.toThrow(
      'could not be confirmed',
    )
    expect(getState().tasks.shell?.status).toBe('running')
    expect(cleanup).not.toHaveBeenCalled()
  })

  test('rejects a matched running task that has no process handle', async () => {
    const { getState, setAppState, cleanup } = makeState(
      Promise.resolve(true),
      { shellCommand: 'missing' },
    )

    await expect(killTask('shell', setAppState)).rejects.toThrow(
      'has no process handle',
    )
    expect(getState().tasks.shell?.status).toBe('running')
    expect(cleanup).not.toHaveBeenCalled()
  })
})

describe('killShellTasksForAgent', () => {
  test('awaits owned shell termination and surfaces unconfirmed exits', async () => {
    const agentId = 'agent@test' as AgentId
    const confirmation = deferred<boolean>()
    const { getState, setAppState } = makeState(confirmation.promise, {
      agentId,
    })

    const stopping = killShellTasksForAgent(agentId, getState, setAppState)
    let settled = false
    void stopping.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(getState().tasks.shell?.status).toBe('running')

    confirmation.resolve(false)
    await expect(stopping).rejects.toThrow('Failed to confirm termination')
    expect(getState().tasks.shell?.status).toBe('running')
  })
})
