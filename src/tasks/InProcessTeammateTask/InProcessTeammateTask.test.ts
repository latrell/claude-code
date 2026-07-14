import { describe, expect, test } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import { InProcessTeammateTask } from './InProcessTeammateTask.js'
import { registerInProcessTeammateRunner } from '../../utils/swarm/inProcessLifecycle.js'

describe('InProcessTeammateTask.kill', () => {
  test('rejects and preserves a running task when runner termination is unconfirmed', async () => {
    const abortController = new AbortController()
    const currentWorkAbortController = new AbortController()
    let state = getDefaultAppState() as any
    state = {
      ...state,
      tasks: {
        ...state.tasks,
        teammate_task: {
          id: 'teammate_task',
          type: 'in_process_teammate',
          status: 'running',
          description: 'worker',
          startTime: 0,
          outputFile: '',
          outputOffset: 0,
          notified: false,
          identity: {
            agentId: 'worker@alpha',
            agentName: 'worker',
            teamName: 'alpha',
            planModeRequired: false,
            parentSessionId: 'session',
          },
          abortController,
          currentWorkAbortController,
          pendingUserMessages: [],
          onIdleCallbacks: [],
          messages: [],
        },
      },
    }

    await expect(
      InProcessTeammateTask.kill('teammate_task', updater => {
        state = updater(state)
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    expect(abortController.signal.aborted).toBe(true)
    expect(currentWorkAbortController.signal.aborted).toBe(true)
    expect(state.tasks.teammate_task.status).toBe('running')
    expect(state.tasks.teammate_task.stopRequested).toBe(true)
  })

  test('marks an already-settled StopConfirmation runner failed and clears runtime handles', async () => {
    const abortController = new AbortController()
    const currentWorkAbortController = new AbortController()
    let state = getDefaultAppState() as any
    state = {
      ...state,
      tasks: {
        ...state.tasks,
        teammate_failed: {
          id: 'teammate_failed',
          type: 'in_process_teammate',
          status: 'running',
          description: 'worker',
          startTime: 0,
          outputFile: '',
          outputOffset: 0,
          notified: false,
          identity: {
            agentId: 'failed@alpha',
            agentName: 'failed',
            teamName: 'alpha',
            planModeRequired: false,
            parentSessionId: 'session',
          },
          abortController,
          currentWorkAbortController,
          pendingUserMessages: [],
          onIdleCallbacks: [],
          messages: [],
        },
      },
    }
    registerInProcessTeammateRunner(
      'teammate_failed',
      Promise.reject(new StopConfirmationError('remote stream still active')),
      () => true,
    )

    await expect(
      InProcessTeammateTask.kill('teammate_failed', updater => {
        state = updater(state)
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    expect(state.tasks.teammate_failed.status).toBe('failed')
    expect(state.tasks.teammate_failed.error).toBe('remote stream still active')
    expect(state.tasks.teammate_failed.abortController).toBeUndefined()
    expect(
      state.tasks.teammate_failed.currentWorkAbortController,
    ).toBeUndefined()
    expect(state.tasks.teammate_failed.stopRequested).toBeUndefined()
  })
})
