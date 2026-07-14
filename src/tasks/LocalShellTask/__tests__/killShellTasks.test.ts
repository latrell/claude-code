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
import { ShellResultSettlementError } from '../../../utils/ShellCommand'
import { StopConfirmationError } from '../../../utils/stopConfirmation'
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
  killResult: Promise<boolean> | (() => Promise<boolean>),
  options: {
    shellCommand?: 'present' | 'missing'
    agentId?: AgentId
    terminationConfirmed?: boolean
    resultSettled?: boolean
  } = {},
): {
  getState: () => AppState
  setAppState: (updater: (state: AppState) => AppState) => void
  cleanup: ReturnType<typeof mock>
  kill: ReturnType<typeof mock>
} {
  const cleanup = mock(() => {})
  const kill = mock(
    typeof killResult === 'function' ? killResult : () => killResult,
  )
  const shellCommand =
    options.shellCommand === 'missing'
      ? null
      : {
          kill,
          cleanup,
          terminationConfirmed: options.terminationConfirmed ?? false,
          resultSettled: options.resultSettled ?? false,
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
    kill,
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

  test('bounds a kill implementation that never settles', async () => {
    const { getState, setAppState, cleanup } = makeState(
      new Promise<boolean>(() => {}),
    )

    await expect(
      killTask('shell', setAppState, {
        timeoutMs: 10,
        abortGraceMs: 5,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(getState().tasks.shell?.status).toBe('running')
    expect(cleanup).not.toHaveBeenCalled()
  })

  test('retains the process handle so a later Stop can retry', async () => {
    let attempts = 0
    const { getState, setAppState, cleanup, kill } = makeState(async () => {
      attempts += 1
      return attempts > 1
    })

    await expect(killTask('shell', setAppState)).rejects.toThrow(
      'could not be confirmed',
    )
    expect(getState().tasks.shell?.status).toBe('running')

    await killTask('shell', setAppState)
    expect(kill).toHaveBeenCalledTimes(2)
    expect(getState().tasks.shell?.status).toBe('killed')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('publishes failed when termination succeeded but result collection stalled', async () => {
    const failure = new ShellResultSettlementError(
      'result collection stalled',
      new Error('stalled'),
    )
    const { getState, setAppState, cleanup } = makeState(
      async () => {
        throw failure
      },
      { terminationConfirmed: true },
    )

    await killTask('shell', setAppState)

    expect(getState().tasks.shell?.status).toBe('failed')
    expect(
      (getState().tasks.shell as { shellCommand?: unknown }).shellCommand,
    ).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(1)
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
