import { describe, expect, test } from 'bun:test'
import type { AppState } from '../AppState.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { stopOrDismissAgent } from '../agentStopAction.js'

function makeTask(status: LocalAgentTaskState['status']): LocalAgentTaskState {
  return {
    id: 'agent-1',
    type: 'local_agent',
    status,
    description: 'test agent',
    startTime: 1,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    agentId: 'agent-1',
    prompt: 'test',
    agentType: 'general-purpose',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  }
}

function makeHarness(task: LocalAgentTaskState): {
  getState: () => AppState
  setAppState: (updater: (prev: AppState) => AppState) => void
} {
  let state = {
    tasks: { [task.id]: task },
    viewingAgentTaskId: undefined,
    viewSelectionMode: 'none',
  } as unknown as AppState
  return {
    getState: () => state,
    setAppState: updater => {
      state = updater(state)
    },
  }
}

describe('stopOrDismissAgent', () => {
  test('uses and awaits the confirmed task kill contract for a running agent', async () => {
    const harness = makeHarness(makeTask('running'))
    let release!: () => void
    const settlement = new Promise<void>(resolve => {
      release = resolve
    })
    let killCalls = 0
    const kill = async () => {
      killCalls++
      await settlement
    }

    let stopped = false
    const stopping = stopOrDismissAgent(
      'agent-1',
      harness.setAppState,
      kill,
    ).then(result => {
      stopped = true
      return result
    })

    await Promise.resolve()
    expect(killCalls).toBe(1)
    expect(stopped).toBe(false)
    expect(harness.getState().tasks['agent-1']?.status).toBe('running')

    release()
    expect(await stopping).toBe('stopped')
    expect(stopped).toBe(true)
  })

  test('propagates an unconfirmed stop and keeps the running row visible', async () => {
    const harness = makeHarness(makeTask('running'))
    const failure = new Error('runner did not settle')

    await expect(
      stopOrDismissAgent('agent-1', harness.setAppState, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(harness.getState().tasks['agent-1']?.status).toBe('running')
    expect(
      (harness.getState().tasks['agent-1'] as LocalAgentTaskState).evictAfter,
    ).toBeUndefined()
  })

  test('dismisses a terminal agent without invoking the kill contract', async () => {
    const harness = makeHarness({
      ...makeTask('completed'),
      retain: true,
      messages: [],
      evictAfter: 123,
    })
    harness.setAppState(prev => ({
      ...prev,
      viewingAgentTaskId: 'agent-1',
      viewSelectionMode: 'viewing-agent',
    }))
    let killCalls = 0

    const result = await stopOrDismissAgent(
      'agent-1',
      harness.setAppState,
      async () => {
        killCalls++
      },
    )

    expect(result).toBe('dismissed')
    expect(killCalls).toBe(0)
    const task = harness.getState().tasks['agent-1'] as LocalAgentTaskState
    expect(task.evictAfter).toBe(0)
    expect(task.retain).toBe(false)
    expect(task.messages).toBeUndefined()
    expect(harness.getState().viewingAgentTaskId).toBeUndefined()
    expect(harness.getState().viewSelectionMode).toBe('none')
  })
})
