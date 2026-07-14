import { describe, expect, test } from 'bun:test'
import { terminateBackgroundProcess } from '../../bg.js'
import type { TerminationSignal } from '../../../utils/processTermination.js'

describe('terminateBackgroundProcess', () => {
  test('stops gracefully without reporting a force kill', async () => {
    const signals: TerminationSignal[] = []
    let alive = true

    const result = await terminateBackgroundProcess(123, false, 0, 0, {
      signalTree: async signal => {
        signals.push(signal)
        alive = false
      },
      isAlive: () => alive,
    })

    expect(result).toEqual({ stopped: true, forced: false })
    expect(signals).toEqual(['SIGTERM'])
  })

  test('escalates and confirms the tree after SIGKILL', async () => {
    const signals: TerminationSignal[] = []
    let alive = true

    const result = await terminateBackgroundProcess(123, true, 0, 0, {
      signalTree: async signal => {
        signals.push(signal)
        if (signal === 'SIGKILL') alive = false
      },
      isAlive: () => alive,
    })

    expect(result).toEqual({ stopped: true, forced: true })
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  test('reports failure while the process tree remains alive', async () => {
    const signals: TerminationSignal[] = []

    const result = await terminateBackgroundProcess(123, true, 0, 0, {
      signalTree: async signal => {
        signals.push(signal)
      },
      isAlive: () => true,
    })

    expect(result).toEqual({ stopped: false, forced: true })
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
  })
})
