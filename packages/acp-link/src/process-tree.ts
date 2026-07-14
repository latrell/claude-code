import { spawn } from 'node:child_process'

export const PROCESS_TERMINATION_GRACE_MS = 3_000
export const PROCESS_TERMINATION_FORCE_MS = 3_000

export interface ProcessTreeHandle {
  pid: number | undefined
  isExited(): boolean
  kill(signal: NodeJS.Signals): unknown
}

export interface ProcessTreeRuntime {
  platform: NodeJS.Platform
  signalProcessGroup(pid: number, signal: NodeJS.Signals): void
  taskkill(pid: number, force: boolean): Promise<void>
  waitForTreeExit(
    handle: ProcessTreeHandle,
    timeoutMs: number,
  ): Promise<boolean>
}

export interface TerminateProcessTreeOptions {
  graceMs?: number
  forceMs?: number
  runtime?: ProcessTreeRuntime
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ESRCH'
  )
}

function isProcessGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return !isNoSuchProcess(error)
  }
}

function runTaskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['/PID', String(pid), '/T']
    if (force) args.push('/F')

    const child = spawn('taskkill', args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0 || code === 128) {
        resolve()
        return
      }
      reject(new Error(`taskkill exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function waitForTreeExit(
  handle: ProcessTreeHandle,
  timeoutMs: number,
): Promise<boolean> {
  const pid = handle.pid
  const deadline = Date.now() + timeoutMs

  while (true) {
    const exited = handle.isExited()
    const treeAlive =
      pid !== undefined && process.platform !== 'win32'
        ? isProcessGroupAlive(pid)
        : !exited
    if (exited && !treeAlive) return true
    if (Date.now() >= deadline) return false
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

const defaultRuntime: ProcessTreeRuntime = {
  platform: process.platform,
  signalProcessGroup(pid, signal) {
    process.kill(-pid, signal)
  },
  taskkill: runTaskkill,
  waitForTreeExit,
}

async function signalTree(
  handle: ProcessTreeHandle,
  signal: NodeJS.Signals,
  runtime: ProcessTreeRuntime,
): Promise<void> {
  const pid = handle.pid
  if (pid === undefined) return

  try {
    if (runtime.platform === 'win32') {
      await runtime.taskkill(pid, signal === 'SIGKILL')
    } else {
      runtime.signalProcessGroup(pid, signal)
    }
  } catch (error) {
    if (handle.isExited()) return
    // A process may not be a process-group leader (for example, a legacy
    // process started before this version). Fall back to the direct child so
    // cancellation still makes progress instead of being silently ignored.
    try {
      handle.kill(signal)
    } catch (fallbackError) {
      if (!isNoSuchProcess(fallbackError)) throw fallbackError
    }
  }
}

/**
 * Stop a detached process group and confirm that it is gone. A graceful
 * request is escalated to a forceful tree kill after the grace period. The
 * return value is true only after both the wrapper and its process group have
 * exited.
 */
export async function terminateProcessTree(
  handle: ProcessTreeHandle,
  options: TerminateProcessTreeOptions = {},
): Promise<boolean> {
  const runtime = options.runtime ?? defaultRuntime
  if (handle.pid === undefined) return handle.isExited()
  if (await runtime.waitForTreeExit(handle, 0)) return true

  try {
    await signalTree(handle, 'SIGTERM', runtime)
  } catch {
    // Confirmation below remains authoritative. A failed signal must never be
    // mistaken for success, but it should still allow forceful escalation.
  }
  if (
    await runtime.waitForTreeExit(
      handle,
      options.graceMs ?? PROCESS_TERMINATION_GRACE_MS,
    )
  ) {
    return true
  }

  try {
    await signalTree(handle, 'SIGKILL', runtime)
  } catch {
    // Return false below unless the tree independently exited.
  }
  return runtime.waitForTreeExit(
    handle,
    options.forceMs ?? PROCESS_TERMINATION_FORCE_MS,
  )
}
