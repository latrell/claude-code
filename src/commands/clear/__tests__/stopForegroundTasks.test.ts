import { describe, expect, mock, test } from 'bun:test'
import type { AppState } from '../../../state/AppState'
import { stopForegroundTasksBeforeClear } from '../stopForegroundTasks'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function createState() {
  let state = {
    tasks: {
      foreground: {
        id: 'foreground',
        type: 'local_bash',
        status: 'running',
        isBackgrounded: false,
      },
      background: {
        id: 'background',
        type: 'local_bash',
        status: 'running',
        isBackgrounded: true,
      },
    },
  } as unknown as AppState
  return {
    getAppState: () => state,
    setAppState(updater: (previous: AppState) => AppState) {
      state = updater(state)
    },
  }
}

describe('stopForegroundTasksBeforeClear', () => {
  test('does not confirm removal until the foreground runner settles', async () => {
    const state = createState()
    const settlement = deferred()
    let finished = false
    const stopping = stopForegroundTasksBeforeClear({
      ...state,
      stopTask: async taskId => {
        await settlement.promise
        state.setAppState(previous => ({
          ...previous,
          tasks: {
            ...previous.tasks,
            [taskId]: {
              ...previous.tasks[taskId]!,
              status: 'killed',
            },
          },
        }))
      },
    }).then(ids => {
      finished = true
      return ids
    })

    await Promise.resolve()
    expect(finished).toBe(false)
    settlement.resolve()

    expect(await stopping).toEqual(new Set(['foreground']))
    expect(state.getAppState().tasks.background?.status).toBe('running')
  })

  test('rejects when a Stop call returns without terminal proof', async () => {
    const state = createState()
    const stopTask = mock(async () => {})

    await expect(
      stopForegroundTasksBeforeClear({ ...state, stopTask }),
    ).rejects.toThrow('Could not confirm foreground task termination')
    expect(stopTask).toHaveBeenCalledTimes(1)
    expect(state.getAppState().tasks.foreground?.status).toBe('running')
  })
})
