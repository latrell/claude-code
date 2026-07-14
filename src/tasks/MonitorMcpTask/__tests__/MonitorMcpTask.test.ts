import { describe, expect, test } from 'bun:test'
import { getDefaultAppState } from '../../../state/AppStateStore'
import type { AppState } from '../../../state/AppState'
import { killMonitorMcp, registerMonitorMcpTask } from '../MonitorMcpTask'

function createStateHarness(): {
  getState: () => AppState
  setAppState: (updater: (state: AppState) => AppState) => void
} {
  let state = getDefaultAppState()
  return {
    getState: () => state,
    setAppState(updater) {
      state = updater(state)
    },
  }
}

describe('MonitorMcpTask cancellation', () => {
  test('waits for runner settlement before publishing killed', async () => {
    const { getState, setAppState } = createStateHarness()
    const abortController = new AbortController()
    let settle: (() => void) | undefined
    const settlement = new Promise<void>(resolve => {
      settle = resolve
    })
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch resource',
      serverName: 'test',
      resourceUri: 'test://resource',
      abortController,
      settlement,
    })

    const stopping = killMonitorMcp(taskId, setAppState)
    expect(abortController.signal.aborted).toBe(true)
    expect(getState().tasks[taskId]?.status).toBe('running')

    settle?.()
    expect(await stopping).toBe(true)
    expect(getState().tasks[taskId]?.status).toBe('killed')
  })

  test('does not claim killed with a live controller but no settlement', async () => {
    const { getState, setAppState } = createStateHarness()
    const abortController = new AbortController()
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch resource',
      serverName: 'test',
      resourceUri: 'test://resource',
      abortController,
    })

    expect(await killMonitorMcp(taskId, setAppState)).toBe(false)
    expect(abortController.signal.aborted).toBe(true)
    expect(getState().tasks[taskId]?.status).toBe('running')
  })

  test('does not treat a missing controller as proof of runner exit', async () => {
    const { getState, setAppState } = createStateHarness()
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch resource',
      serverName: 'test',
      resourceUri: 'test://resource',
    })

    expect(await killMonitorMcp(taskId, setAppState)).toBe(false)
    expect(getState().tasks[taskId]?.status).toBe('running')
  })
})
