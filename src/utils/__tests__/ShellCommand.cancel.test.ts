import { describe, expect, mock, test } from 'bun:test'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { TaskOutput } from '../task/TaskOutput.js'
import type { ShellCommand } from '../ShellCommand.js'
import {
  ShellResultSettlementError,
  waitForForegroundShellResult,
  wrapSpawn,
} from '../ShellCommand.js'
import { StopConfirmationError } from '../stopConfirmation.js'

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

describe('ShellCommand cancellation', () => {
  test('foreground Stop rejects within a deadline when kill never settles', async () => {
    const controller = new AbortController()
    const kill = mock(() => new Promise<boolean>(() => {}))
    const command = {
      status: 'running',
      result: new Promise<never>(() => {}),
      kill,
      taskOutput: { taskId: 'stuck-foreground' },
    } as unknown as ShellCommand

    const result = waitForForegroundShellResult(command, controller.signal, {
      timeoutMs: 10,
      abortGraceMs: 5,
      operation: 'stuck foreground shell Stop',
    })
    controller.abort('user-cancel')

    await expect(result).rejects.toBeInstanceOf(StopConfirmationError)
    expect(kill).toHaveBeenCalledTimes(1)
    expect(command.status).toBe('running')
  })

  test('does not publish a raw result when process-tree termination is unconfirmed', async () => {
    const controller = new AbortController()
    const rawResult = deferred<{
      stdout: string
      stderr: string
      code: number
      interrupted: boolean
    }>()
    const kill = mock(async () => false)
    const command = {
      status: 'running',
      result: rawResult.promise,
      kill,
      taskOutput: { taskId: 'unconfirmed-foreground' },
    } as unknown as ShellCommand

    const result = waitForForegroundShellResult(command, controller.signal, {
      timeoutMs: 100,
      abortGraceMs: 5,
    })
    controller.abort('user-cancel')
    rawResult.resolve({
      stdout: '',
      stderr: '',
      code: 137,
      interrupted: true,
    })

    await expect(result).rejects.toBeInstanceOf(StopConfirmationError)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  test('waits for the captured result after termination is confirmed', async () => {
    const controller = new AbortController()
    const rawResult = deferred<{
      stdout: string
      stderr: string
      code: number
      interrupted: boolean
    }>()
    const kill = mock(async () => true)
    const command = {
      status: 'running',
      result: rawResult.promise,
      kill,
      taskOutput: { taskId: 'confirmed-foreground' },
    } as unknown as ShellCommand

    const result = waitForForegroundShellResult(command, controller.signal, {
      timeoutMs: 100,
      abortGraceMs: 5,
    })
    controller.abort('user-cancel')
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    rawResult.resolve({
      stdout: 'done',
      stderr: '',
      code: 137,
      interrupted: true,
    })
    expect((await result).stdout).toBe('done')
  })

  test('does not report unconfirmed Stop when only result collection failed', async () => {
    const controller = new AbortController()
    const terminalFailure = new ShellResultSettlementError(
      'result capture stalled',
      new Error('stalled'),
    )
    const kill = mock(async () => {
      throw terminalFailure
    })
    const command = {
      status: 'running',
      terminationConfirmed: true,
      resultSettled: false,
      result: new Promise<never>(() => {}),
      kill,
      taskOutput: { taskId: 'result-capture-stalled' },
    } as unknown as ShellCommand

    const result = waitForForegroundShellResult(command, controller.signal, {
      timeoutMs: 100,
      abortGraceMs: 5,
    })
    controller.abort('user-cancel')

    await expect(result).rejects.toBe(terminalFailure)
    await expect(result).rejects.not.toBeInstanceOf(StopConfirmationError)
  })

  test('interrupt backgrounding does not dispatch process termination', async () => {
    const controller = new AbortController()
    const rawResult = deferred<{
      stdout: string
      stderr: string
      code: number
      interrupted: boolean
    }>()
    const kill = mock(async () => true)
    const command = {
      status: 'running',
      result: rawResult.promise,
      kill,
      taskOutput: { taskId: 'interrupt-background' },
    } as unknown as ShellCommand

    const result = waitForForegroundShellResult(command, controller.signal)
    controller.abort('interrupt')
    rawResult.resolve({
      stdout: '',
      stderr: '',
      code: 0,
      interrupted: false,
    })

    expect((await result).code).toBe(0)
    expect(kill).not.toHaveBeenCalled()
  })

  test('kill waits for process exit and result output capture', async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 30_000)'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    const taskOutput = new TaskOutput(`shell_cancel_${randomUUID()}`, null)
    const outputCaptureStarted = deferred<void>()
    const releaseOutputCapture = deferred<void>()
    const mutableOutput = taskOutput as unknown as {
      getStdout: () => Promise<string>
    }
    mutableOutput.getStdout = async () => {
      outputCaptureStarted.resolve()
      await releaseOutputCapture.promise
      return ''
    }
    const command = wrapSpawn(
      child,
      new AbortController().signal,
      60_000,
      taskOutput,
    )

    const stopping = command.kill()
    await outputCaptureStarted.promise
    let stopSettled = false
    void stopping.then(() => {
      stopSettled = true
    })
    await Promise.resolve()
    expect(stopSettled).toBe(false)

    releaseOutputCapture.resolve()
    expect(await stopping).toBe(true)
    expect((await command.result).interrupted).toBe(true)
    command.cleanup()
  }, 15_000)

  test('reports a terminal result-collection failure after process termination is confirmed', async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 30_000)'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    const taskOutput = new TaskOutput(`shell_cancel_${randomUUID()}`, null)
    const outputCaptureStarted = deferred<void>()
    const releaseOutputCapture = deferred<void>()
    const mutableOutput = taskOutput as unknown as {
      getStdout: () => Promise<string>
    }
    mutableOutput.getStdout = async () => {
      outputCaptureStarted.resolve()
      await releaseOutputCapture.promise
      return ''
    }
    const command = wrapSpawn(
      child,
      new AbortController().signal,
      60_000,
      taskOutput,
      false,
      1024 * 1024,
      false,
      { timeoutMs: 10, abortGraceMs: 10 },
    )

    const stopping = command.kill()
    await outputCaptureStarted.promise
    await expect(stopping).rejects.toBeInstanceOf(ShellResultSettlementError)
    expect(command.terminationConfirmed).toBe(true)
    expect(command.resultSettled).toBe(false)
    expect(command.status).toBe('running')

    releaseOutputCapture.resolve()
    expect((await command.result).interrupted).toBe(true)
    expect(command.resultSettled).toBe(true)
    expect(command.status).toBe('killed')
    command.cleanup()
  }, 15_000)
})
