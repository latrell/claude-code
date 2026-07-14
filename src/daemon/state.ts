import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import {
  isProcessTreeAlive,
  signalProcessTree,
  waitForTermination,
} from '../utils/processTermination.js'

/**
 * Daemon state persisted to disk so that `status` / `stop` can work
 * from a different CLI process than the one that started the daemon.
 */
export interface DaemonStateData {
  pid: number
  cwd: string
  startedAt: string
  workerKinds: string[]
  lastStatus: 'running' | 'stopped' | 'error'
}

export type DaemonStatus = 'running' | 'stopped' | 'stale'

interface DaemonStopDeps {
  isAlive: (pid: number) => boolean
  signalTree: (pid: number, signal: 'SIGTERM' | 'SIGKILL') => Promise<void>
}

/**
 * Returns the path to the daemon state file for a given daemon name.
 */
export function getDaemonStateFilePath(name = 'remote-control'): string {
  return join(getClaudeConfigHomeDir(), 'daemon', `${name}.json`)
}

/**
 * Write daemon state to disk. Called by the supervisor on startup.
 */
export function writeDaemonState(
  state: DaemonStateData,
  name = 'remote-control',
): void {
  const filePath = getDaemonStateFilePath(name)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * Read daemon state from disk. Returns null if no state file exists.
 */
export function readDaemonState(
  name = 'remote-control',
): DaemonStateData | null {
  const filePath = getDaemonStateFilePath(name)
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as DaemonStateData
  } catch {
    return null
  }
}

/**
 * Remove the daemon state file.
 */
export function removeDaemonState(name = 'remote-control'): void {
  const filePath = getDaemonStateFilePath(name)
  try {
    unlinkSync(filePath)
  } catch {
    // File may not exist — that's fine
  }
}

/**
 * Check if a process with the given PID is alive.
 */
function isProcessAlive(pid: number): boolean {
  return isProcessTreeAlive(pid)
}

/**
 * Query the daemon status by reading the state file and probing the PID.
 *
 * Returns:
 *  - { status: 'running', state } — PID is alive
 *  - { status: 'stopped' }       — no state file
 *  - { status: 'stale' }         — state file exists but PID is dead (auto-cleaned)
 */
export function queryDaemonStatus(name = 'remote-control'): {
  status: DaemonStatus
  state?: DaemonStateData
} {
  const state = readDaemonState(name)
  if (!state) {
    return { status: 'stopped' }
  }

  if (isProcessAlive(state.pid)) {
    return { status: 'running', state }
  }

  // Stale — process is dead but state file remains
  removeDaemonState(name)
  return { status: 'stale' }
}

/**
 * Stop a running daemon by sending SIGTERM, waiting, then SIGKILL if needed.
 * Cleans up the state file afterward.
 *
 * @returns true if the daemon was stopped, false if it wasn't running
 */
export async function stopDaemonByPid(
  name = 'remote-control',
  timeoutMs = 10_000,
  forceWaitMs = 5_000,
  deps: DaemonStopDeps = {
    isAlive: isProcessAlive,
    signalTree: signalProcessTree,
  },
): Promise<boolean> {
  const state = readDaemonState(name)
  if (!state) {
    return false
  }

  const { pid } = state

  if (!deps.isAlive(pid)) {
    removeDaemonState(name)
    return false
  }

  // Signal the full tree. On Windows SIGTERM is not catchable, so tree-kill
  // uses taskkill /T /F; on POSIX descendants still get a graceful SIGTERM.
  try {
    await deps.signalTree(pid, 'SIGTERM')
  } catch {
    if (!deps.isAlive(pid)) {
      removeDaemonState(name)
      return true
    }
  }

  if (await waitForTermination(() => !deps.isAlive(pid), timeoutMs, 200)) {
    removeDaemonState(name)
    return true
  }

  // Force the complete tree, then confirm the supervisor actually exited.
  try {
    await deps.signalTree(pid, 'SIGKILL')
  } catch {
    // A racing natural exit is confirmed by the wait below. Other failures
    // must not be reported as success while the PID remains alive.
  }

  const stopped = await waitForTermination(
    () => !deps.isAlive(pid),
    forceWaitMs,
    100,
  )
  if (stopped) removeDaemonState(name)
  return stopped
}
