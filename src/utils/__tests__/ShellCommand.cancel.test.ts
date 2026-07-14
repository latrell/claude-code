import { describe, expect, test } from 'bun:test'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { TaskOutput } from '../task/TaskOutput.js'
import { wrapSpawn } from '../ShellCommand.js'

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
})
