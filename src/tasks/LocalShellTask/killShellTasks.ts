// Pure (non-React) kill helpers for LocalShellTask.
// Extracted so runAgent.ts can kill agent-scoped bash tasks without pulling
// React/Ink into its module graph (same rationale as guards.ts).

import type { AppState } from '../../state/AppState.js'
import type { AgentId } from '../../types/ids.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { dequeueAllMatching } from '../../utils/messageQueueManager.js'
import type { ShellCommand } from '../../utils/ShellCommand.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import { evictTaskOutput } from '../../utils/task/diskOutput.js'
import { updateTaskState } from '../../utils/task/framework.js'
import { isLocalShellTask } from './guards.js'

type SetAppStateFn = (updater: (prev: AppState) => AppState) => void

export async function killTask(
  taskId: string,
  setAppState: SetAppStateFn,
): Promise<void> {
  const selected: { command: ShellCommand | null } = { command: null }
  let matchedRunningTask = false

  updateTaskState(taskId, setAppState, task => {
    if (task.status !== 'running' || !isLocalShellTask(task)) {
      return task
    }

    matchedRunningTask = true
    selected.command = task.shellCommand
    return task
  })

  const command = selected.command
  if (!matchedRunningTask) return
  if (!command) {
    throw new StopConfirmationError(
      `LocalShellTask ${taskId} has no process handle; exit could not be confirmed`,
    )
  }

  logForDebugging(`LocalShellTask ${taskId} kill requested`)
  const confirmed = await command.kill()
  if (!confirmed) {
    throw new StopConfirmationError(
      `LocalShellTask ${taskId} process exit could not be confirmed`,
    )
  }

  updateTaskState(taskId, setAppState, task => {
    if (task.status !== 'running' || !isLocalShellTask(task)) return task
    try {
      command.cleanup()
    } catch (error) {
      logError(error)
    }

    task.unregisterCleanup?.()
    if (task.cleanupTimeoutId) {
      clearTimeout(task.cleanupTimeoutId)
    }

    return {
      ...task,
      status: 'killed',
      notified: true,
      shellCommand: null,
      unregisterCleanup: undefined,
      cleanupTimeoutId: undefined,
      endTime: Date.now(),
    }
  })
  void evictTaskOutput(taskId)
}

/**
 * Kill all running bash tasks spawned by a given agent.
 * Called from runAgent.ts finally block so background processes don't outlive
 * the agent that started them (prevents 10-day fake-logs.sh zombies).
 */
export async function killShellTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppStateFn,
): Promise<void> {
  const tasks = getAppState().tasks ?? {}
  const kills: Promise<void>[] = []
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isLocalShellTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killShellTasksForAgent: killing orphaned shell task ${taskId} (agent ${agentId} exiting)`,
      )
      kills.push(killTask(taskId, setAppState))
    }
  }
  const results = await Promise.allSettled(kills)
  // Purge any queued notifications addressed to this agent — its query loop
  // has exited and won't drain them. killTask fires 'killed' notifications
  // asynchronously; drop the ones already queued and any that land later sit
  // harmlessly (no consumer matches a dead agentId).
  dequeueAllMatching(cmd => cmd.agentId === agentId)

  const failures = results.flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) {
    throw new StopConfirmationError(
      `Failed to confirm termination of ${failures.length} shell task(s) owned by agent ${agentId}`,
      failures,
    )
  }
}
