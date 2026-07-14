import { describe, expect, test } from 'bun:test'
import { getDefaultAppState } from '../../../state/AppStateStore'
import type { AppState } from '../../../state/AppState'
import { killMonitorMcp, registerMonitorMcpTask } from '../MonitorMcpTask'
import { StopConfirmationError } from '../../../utils/stopConfirmation'

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

  test('rejects an unconfirmed stop without publishing killed when runner settlement hangs', async () => {
    const { getState, setAppState } = createStateHarness()
    const abortController = new AbortController()
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch stuck resource',
      serverName: 'test',
      resourceUri: 'test://stuck-resource',
      abortController,
      settlement: new Promise<void>(() => {}),
    })

    await expect(
      killMonitorMcp(taskId, setAppState, {
        timeoutMs: 1_000,
        abortGraceMs: 10,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(abortController.signal.aborted).toBe(true)
    expect(getState().tasks[taskId]?.status).toBe('running')
  })

  test('publishes failed and releases a settled unconfirmed runner instead of caching a dead retry', async () => {
    const { getState, setAppState } = createStateHarness()
    const abortController = new AbortController()
    let rejectRunner!: (error: unknown) => void
    const settlement = new Promise<void>((_resolve, reject) => {
      rejectRunner = reject
    })
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch unconfirmed resource',
      serverName: 'test',
      resourceUri: 'test://unconfirmed-resource',
      abortController,
      settlement,
    })

    const stopping = killMonitorMcp(taskId, setAppState)
    rejectRunner(new StopConfirmationError('monitor transport still open'))

    await expect(stopping).rejects.toBeInstanceOf(StopConfirmationError)
    expect(getState().tasks[taskId]?.status).toBe('failed')
    expect(
      (getState().tasks[taskId] as { abortController?: AbortController })
        .abortController,
    ).toBeUndefined()
    expect((getState().tasks[taskId] as { error?: string }).error).toBe(
      'monitor transport still open',
    )

    // The settled rejection is no longer retained as a pretend retry handle.
    expect(await killMonitorMcp(taskId, setAppState)).toBe(false)
  })

  test('accepts an ordinary rejected monitor runner as exit proof', async () => {
    const { getState, setAppState } = createStateHarness()
    const abortController = new AbortController()
    let rejectRunner!: (error: unknown) => void
    const settlement = new Promise<void>((_resolve, reject) => {
      rejectRunner = reject
    })
    const taskId = registerMonitorMcpTask(setAppState, {
      description: 'watch ordinary failure',
      serverName: 'test',
      resourceUri: 'test://ordinary-failure',
      abortController,
      settlement,
    })

    const stopping = killMonitorMcp(taskId, setAppState)
    rejectRunner(new Error('subscription exited'))

    expect(await stopping).toBe(true)
    expect(getState().tasks[taskId]?.status).toBe('killed')
  })
})
