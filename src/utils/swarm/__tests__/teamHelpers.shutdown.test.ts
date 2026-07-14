import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

let paneKillResult = false
let paneKillCalls: Array<{
  paneId: string
  useExternalSession: boolean
}> = []

const stopPane = async (paneId: string) => {
  paneKillCalls.push({ paneId, useExternalSession: true })
  return paneKillResult
}

function createState(taskId: string, status: 'running' | 'completed') {
  const abortController = new AbortController()
  const currentWorkAbortController = new AbortController()
  return {
    abortController,
    currentWorkAbortController,
    state: {
      teamContext: {
        teamName: 'alpha',
        teammates: {
          'worker@alpha': {
            name: 'worker',
          },
        },
      },
      tasks: {
        [taskId]: {
          id: taskId,
          type: 'in_process_teammate' as const,
          status,
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
      inbox: { messages: [] },
    },
  }
}

beforeEach(() => {
  paneKillResult = false
  paneKillCalls = []
})

describe('confirmTeammateShutdown', () => {
  test('waits for the in-process runner before removing membership', async () => {
    const taskId = 'teammate-running'
    const fixture = createState(taskId, 'running')
    let state = fixture.state as any
    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    const { registerInProcessTeammateRunner } = await import(
      '../inProcessLifecycle.js'
    )
    registerInProcessTeammateRunner(taskId, runner)
    const { confirmTeammateShutdown } = await import('../teamHelpers.js')

    let confirmationSettled = false
    const confirmation = confirmTeammateShutdown(
      'worker@alpha',
      updater => {
        state = updater(state)
      },
      undefined,
      'in-process',
    ).then(result => {
      confirmationSettled = true
      return result
    })

    await Promise.resolve()
    expect(fixture.abortController.signal.aborted).toBe(true)
    expect(fixture.currentWorkAbortController.signal.aborted).toBe(true)
    expect(state.tasks[taskId].status).toBe('running')
    expect(state.teamContext.teammates['worker@alpha']).toBeDefined()
    expect(confirmationSettled).toBe(false)

    settleRunner?.()
    const confirmed = await confirmation
    expect(confirmed).toBe(true)
    expect(state.tasks[taskId].status).toBe('killed')
    expect(state.teamContext.teammates['worker@alpha']).toBeUndefined()
  })

  test('preserves state when no runner settlement can be confirmed', async () => {
    const taskId = 'teammate-without-runner'
    const fixture = createState(taskId, 'running')
    let state = fixture.state as any
    const { confirmTeammateShutdown } = await import('../teamHelpers.js')

    const confirmed = await confirmTeammateShutdown(
      'worker@alpha',
      updater => {
        state = updater(state)
      },
      undefined,
      'in-process',
    )

    expect(confirmed).toBe(false)
    expect(state.tasks[taskId].status).toBe('running')
    expect(state.tasks[taskId].stopRequested).toBe(true)
    expect(state.teamContext.teammates['worker@alpha']).toBeDefined()
  })

  test('uses pane identity instead of a historical in-process task', async () => {
    const fixture = createState('historical-task', 'completed')
    let state = fixture.state as any
    const { confirmTeammateShutdown } = await import('../teamHelpers.js')

    expect(
      await confirmTeammateShutdown(
        'worker@alpha',
        updater => {
          state = updater(state)
        },
        '%42',
        'tmux',
        stopPane,
      ),
    ).toBe(false)
    expect(paneKillCalls).toEqual([{ paneId: '%42', useExternalSession: true }])
    expect(state.teamContext.teammates['worker@alpha']).toBeDefined()

    paneKillResult = true
    expect(
      await confirmTeammateShutdown(
        'worker@alpha',
        updater => {
          state = updater(state)
        },
        '%42',
        'tmux',
        stopPane,
      ),
    ).toBe(true)
    expect(paneKillCalls).toHaveLength(2)
  })

  test('does not match an old in-process task by display name', async () => {
    const fixture = createState('historical-task', 'completed')
    let state = fixture.state as any
    const { confirmTeammateShutdown } = await import('../teamHelpers.js')

    const confirmed = await confirmTeammateShutdown('worker', updater => {
      state = updater(state)
    })

    expect(confirmed).toBe(false)
    expect(state.teamContext.teammates['worker@alpha']).toBeDefined()
  })
})
