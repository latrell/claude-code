import type { ChildProcess } from 'node:child_process'
import { terminateProcessTree } from '../process-tree.js'
import { cancelPendingPermissions } from './acp-client.js'
import { logAgent } from './runtime-state.js'
import type { ClientState } from './types.js'

const CANCEL_FLUSH_TIMEOUT_MS = 500

async function flushCancel(state: ClientState): Promise<void> {
  if (!state.connection || !state.sessionId) return

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const flushed = await Promise.race([
      state.connection.cancel({ sessionId: state.sessionId }).then(() => true),
      new Promise<false>(resolve => {
        timer = setTimeout(() => resolve(false), CANCEL_FLUSH_TIMEOUT_MS)
      }),
    ])
    if (!flushed) {
      logAgent.warn('ACP cancel flush timed out; terminating process tree')
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isChildExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

/** Terminate the active ACP agent process group and confirm it has exited. */
export async function terminateAgentProcess(
  state: ClientState,
): Promise<boolean> {
  if (state.processTermination) return state.processTermination

  const child = state.process
  if (!child) return true

  cancelPendingPermissions(state)
  const termination = terminateProcessTree({
    pid: child.pid,
    isExited: () => isChildExited(child),
    kill: signal => child.kill(signal),
  })
    .then(stopped => {
      if (!stopped) {
        logAgent.error(
          { pid: child.pid },
          'failed to confirm agent process tree stopped',
        )
        return false
      }

      if (state.process === child) {
        state.process = null
        state.connection = null
        state.sessionId = null
        state.activePrompt = null
      }
      return true
    })
    .finally(() => {
      if (state.processTermination === termination) {
        state.processTermination = null
      }
    })

  state.processTermination = termination
  return termination
}

/**
 * Best-effort ACP cancellation followed by a confirmed process-tree stop.
 * The process stop is authoritative: disconnect must not leave an agent (and
 * therefore an HTTP/SSE request) running after the transport disappears.
 */
export async function disconnectAgent(state: ClientState): Promise<boolean> {
  cancelPendingPermissions(state)
  if (state.connection && state.sessionId) {
    try {
      await flushCancel(state)
    } catch (error) {
      logAgent.warn(
        { error: (error as Error).message },
        'ACP cancel before disconnect failed; terminating process tree',
      )
    }
  }
  return terminateAgentProcess(state)
}
