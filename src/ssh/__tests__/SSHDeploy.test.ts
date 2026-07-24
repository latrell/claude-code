import { describe, expect, mock, test } from 'bun:test'
import { formatDuration } from '../../utils/format.js'
import type { Subprocess } from 'bun'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import { waitForSSHProcessExit } from '../SSHDeploy'

function createMockProcess(): {
  proc: Subprocess
  exit: (code?: number) => void
} {
  let exitCode: number | null = null
  let resolveExit!: (code: number) => void
  const exited = new Promise<number>(resolve => {
    resolveExit = resolve
  })
  const proc = {
    pid: 45678,
    get exitCode() {
      return exitCode
    },
    exited,
  } as unknown as Subprocess

  return {
    proc,
    exit(code = 143) {
      exitCode = code
      resolveExit(code)
    },
  }
}

describe('waitForSSHProcessExit', () => {
  test('returns a natural exit without invoking termination', async () => {
    const { proc, exit } = createMockProcess()
    const terminate = mock(async () => true)
    setTimeout(() => exit(0), 1)

    expect(await waitForSSHProcessExit(proc, 100, terminate)).toBe(0)
    expect(terminate).not.toHaveBeenCalled()
  })

  test('waits for process exit after confirmed timeout termination', async () => {
    const { proc, exit } = createMockProcess()
    const terminate = mock(async () => {
      exit()
      return true
    })

    await expect(waitForSSHProcessExit(proc, 1, terminate)).rejects.toThrow(
      `SSH process timed out after ${formatDuration(1, { hideTrailingZeros: true })}`,
    )
    expect(terminate).toHaveBeenCalledWith(proc)
  })

  test('does not report completion when timeout termination is unconfirmed', async () => {
    const { proc } = createMockProcess()
    const terminate = mock(async () => false)

    await expect(waitForSSHProcessExit(proc, 1, terminate)).rejects.toThrow(
      'process-tree termination could not be confirmed',
    )
    expect(terminate).toHaveBeenCalledWith(proc)
  })
})
