import { describe, expect, mock, test } from 'bun:test'
import {
  terminateProcessTree,
  type ProcessTreeHandle,
  type ProcessTreeRuntime,
} from '../process-tree.js'

function createHandle(): ProcessTreeHandle {
  return {
    pid: 4242,
    isExited: () => false,
    kill: mock(() => true),
  }
}

describe('terminateProcessTree', () => {
  test('signals the POSIX process group and escalates when it stays alive', async () => {
    const signals: NodeJS.Signals[] = []
    const waits = [false, false, true]
    const runtime: ProcessTreeRuntime = {
      platform: 'linux',
      signalProcessGroup: mock((_pid, signal) => signals.push(signal)),
      taskkill: mock(async () => {}),
      waitForTreeExit: mock(async () => waits.shift() ?? false),
    }

    expect(
      await terminateProcessTree(createHandle(), {
        graceMs: 1,
        forceMs: 1,
        runtime,
      }),
    ).toBe(true)
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  test('uses taskkill tree mode on Windows and confirms completion', async () => {
    const calls: boolean[] = []
    const runtime: ProcessTreeRuntime = {
      platform: 'win32',
      signalProcessGroup: mock(() => {}),
      taskkill: mock(async (_pid, force) => {
        calls.push(force)
      }),
      waitForTreeExit: mock(async (_handle, timeoutMs) => timeoutMs > 0),
    }

    expect(
      await terminateProcessTree(createHandle(), { runtime, graceMs: 1 }),
    ).toBe(true)
    expect(calls).toEqual([false])
  })

  test('does not report success when forceful tree termination is unconfirmed', async () => {
    const runtime: ProcessTreeRuntime = {
      platform: 'linux',
      signalProcessGroup: mock(() => {}),
      taskkill: mock(async () => {}),
      waitForTreeExit: mock(async () => false),
    }

    expect(
      await terminateProcessTree(createHandle(), {
        runtime,
        graceMs: 1,
        forceMs: 1,
      }),
    ).toBe(false)
  })
})
