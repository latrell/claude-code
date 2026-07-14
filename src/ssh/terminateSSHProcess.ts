import type { Subprocess } from 'bun'
import { terminateProcessTree } from '../utils/processTermination.js'

const SSH_TERMINATION_GRACE_MS = 500
const SSH_TERMINATION_FORCE_WAIT_MS = 1_000

export class SSHProcessTerminationError extends Error {
  readonly proc: Subprocess

  constructor(message: string, proc: Subprocess) {
    super(message)
    this.name = 'SSHProcessTerminationError'
    this.proc = proc
  }
}

/**
 * Stop a locally-owned SSH process and every captured descendant. A false
 * result means termination could not be proven and must not be reported as a
 * completed disconnect.
 */
export async function terminateSSHProcess(proc: Subprocess): Promise<boolean> {
  // Never inspect or signal a PID after Bun has observed its process exit: the
  // operating system may already have reused that PID for unrelated work. We
  // also cannot prove that uncaptured descendants are gone in this case.
  if (proc.exitCode !== null) return false

  return terminateProcessTree(proc.pid, {
    graceMs: SSH_TERMINATION_GRACE_MS,
    forceWaitMs: SSH_TERMINATION_FORCE_WAIT_MS,
  })
}
