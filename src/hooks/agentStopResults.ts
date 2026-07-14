import type { TaskState } from '../tasks/types.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'

export type AgentStopFailure = { taskId: string; error: unknown }

/** Foreground agents emit stopped from their own outer lifecycle finally. */
export function shouldEmitAggregateStoppedSdk(
  task: TaskState | undefined,
): boolean {
  return task?.type === 'local_agent' && task.isBackgrounded
}

/**
 * Reconcile the original kill snapshot with fresh task state. A fulfilled
 * kill call is not itself proof that this request stopped the task: the agent
 * may have completed naturally between the snapshot and kill dispatch.
 */
export function reconcileAgentStopResults(
  succeeded: string[],
  alreadyTerminal: string[],
  failures: AgentStopFailure[],
  currentTasks: Record<string, TaskState>,
): { stoppedIds: string[]; failures: AgentStopFailure[] } {
  const stoppedIds: string[] = []
  const reconciledFailures = [...failures]

  for (const taskId of succeeded) {
    const task = currentTasks[taskId]
    if (task?.type !== 'local_agent') {
      continue
    }
    if (task.status === 'killed') {
      stoppedIds.push(taskId)
    } else if (task.status === 'running') {
      reconciledFailures.push({
        taskId,
        error: new StopConfirmationError(
          `Agent task ${taskId} remained running after Stop settled`,
        ),
      })
    }
    // completed/failed means the natural terminal transition won the race.
    // Do not misreport it as stopped or overwrite its own notification.
  }

  // An old execution can finish naturally and then be replaced under the
  // same task id before aggregate reconciliation. The old terminal outcome
  // is not proof that the replacement stopped.
  for (const taskId of alreadyTerminal) {
    const task = currentTasks[taskId]
    if (task?.type === 'local_agent' && task.status === 'running') {
      reconciledFailures.push({
        taskId,
        error: new StopConfirmationError(
          `Agent task ${taskId} was replaced by a running execution during Stop`,
        ),
      })
    }
  }

  return { stoppedIds, failures: reconciledFailures }
}
