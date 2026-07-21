import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('bun:bundle', () => ({ feature: () => false }))
mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import type { AppState } from '../../../state/AppState'
import type { ExecResult, ShellCommand } from '../../../utils/ShellCommand'
import { resetCommandQueue } from '../../../utils/messageQueueManager'
import {
  backgroundAll,
  failForegroundAfterConfirmedTermination,
  hasForegroundTasks,
  registerForeground,
  retainForegroundAfterUnconfirmedStop,
} from '../LocalShellTask'

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

describe('retainForegroundAfterUnconfirmedStop', () => {
  test('closes a retained running task when the shell result settles later', async () => {
    const lateResult = deferred<ExecResult>()
    const cleanup = mock(() => {})
    const shellCommand = {
      status: 'running',
      terminationConfirmed: false,
      resultSettled: false,
      result: lateResult.promise,
      kill: mock(async () => false),
      cleanup,
      background: mock(() => false),
      taskOutput: { taskId: 'late-foreground-shell' },
    } as unknown as ShellCommand

    let state = {
      tasks: {},
      speculation: { status: 'idle' },
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      state = updater(state)
    }

    const firstId = retainForegroundAfterUnconfirmedStop(
      {
        command: 'sleep 30',
        description: 'sleep',
        shellCommand,
      },
      setAppState,
      'tool-1',
    )
    const secondId = retainForegroundAfterUnconfirmedStop(
      {
        command: 'sleep 30',
        description: 'sleep',
        shellCommand,
      },
      setAppState,
      'tool-1',
      firstId,
    )

    expect(secondId).toBe(firstId)
    expect(state.tasks[firstId]?.status).toBe('running')

    lateResult.resolve({
      stdout: '',
      stderr: '',
      code: 137,
      interrupted: true,
    })
    await lateResult.promise
    await Promise.resolve()

    expect(state.tasks[firstId]?.status).toBe('failed')
    expect(
      (state.tasks[firstId] as { shellCommand?: unknown }).shellCommand,
    ).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(1)
    resetCommandQueue()
  })

  test('marks an existing task failed when only result collection remains stuck', () => {
    const cleanup = mock(() => {})
    const shellCommand = {
      status: 'running',
      terminationConfirmed: true,
      resultSettled: false,
      result: new Promise<ExecResult>(() => {}),
      kill: mock(async () => true),
      cleanup,
      background: mock(() => false),
      taskOutput: { taskId: 'confirmed-foreground-shell' },
    } as unknown as ShellCommand

    let state = {
      tasks: {},
      speculation: { status: 'idle' },
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      state = updater(state)
    }
    const taskId = registerForeground(
      {
        command: 'sleep 30',
        description: 'sleep',
        shellCommand,
      },
      setAppState,
      'tool-2',
    )

    failForegroundAfterConfirmedTermination(taskId, shellCommand, setAppState)

    expect(state.tasks[taskId]?.status).toBe('failed')
    expect(
      (state.tasks[taskId] as { shellCommand?: unknown }).shellCommand,
    ).toBeNull()
    // ShellCommand deliberately keeps local capture resources untouched until
    // its pending result settles; the task no longer owns a retry handle.
    expect(cleanup).toHaveBeenCalledTimes(1)
    resetCommandQueue()
  })
})

describe('foreground backgrounding safety', () => {
  test('does not advertise a running Agent as Ctrl+B-backgroundable', () => {
    const state = {
      tasks: {
        'foreground-agent': {
          id: 'foreground-agent',
          type: 'local_agent',
          status: 'running',
          isBackgrounded: false,
        },
      },
    } as unknown as AppState

    expect(hasForegroundTasks(state)).toBe(false)
  })

  test('backgroundAll leaves Agents untouched while preserving shell handling', () => {
    const shellBackground = mock(() => false)
    const agentController = new AbortController()
    let state = {
      tasks: {
        'foreground-shell': {
          id: 'foreground-shell',
          type: 'local_bash',
          status: 'running',
          description: 'shell',
          isBackgrounded: false,
          shellCommand: { background: shellBackground },
        },
        'foreground-agent': {
          id: 'foreground-agent',
          type: 'local_agent',
          status: 'running',
          isBackgrounded: false,
          abortController: agentController,
        },
      },
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      state = updater(state)
    }

    expect(hasForegroundTasks(state)).toBe(true)
    backgroundAll(() => state, setAppState)

    expect(shellBackground).toHaveBeenCalledTimes(1)
    expect(
      (state.tasks['foreground-agent'] as { isBackgrounded?: boolean })
        .isBackgrounded,
    ).toBe(false)
    expect(
      (state.tasks['foreground-agent'] as { abortController?: AbortController })
        .abortController,
    ).toBe(agentController)
    expect(agentController.signal.aborted).toBe(false)
  })
})
