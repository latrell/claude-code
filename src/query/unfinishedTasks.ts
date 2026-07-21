import { TASK_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskListTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/constants.js'
import {
  buildTaskStateSnapshot,
  getTaskStateSnapshotKey,
  type TaskStateItem,
} from '../utils/taskStateMessage.js'
import type { Task } from '../utils/tasks.js'

export const MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS = 3

const TASK_COMPLETION_GUARD_TOOL_NAMES = new Set<string>([
  TASK_CREATE_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_GET_TOOL_NAME,
])

export type UnfinishedTaskInspection = {
  snapshotKey: string
  hasPublicUnfinishedTasks: boolean
  unfinishedTasks: TaskStateItem[]
  actionableTasks: TaskStateItem[]
}

export function isTaskCompletionGuardToolName(name: string): boolean {
  return TASK_COMPLETION_GUARD_TOOL_NAMES.has(name)
}

/**
 * Find unfinished work the main thread may safely take over.
 *
 * Assigned work belongs to its current owner. A task with an unresolved
 * blocker is likewise not actionable yet. Internal tasks stay out of the
 * user-visible snapshot, but still count as unresolved blockers so the guard
 * never bypasses their dependency edge.
 */
export function inspectUnfinishedTasks(
  taskListId: string,
  tasks: Task[],
): UnfinishedTaskInspection {
  const snapshot = buildTaskStateSnapshot(taskListId, tasks)
  const resolvedTaskIds = new Set(
    tasks.filter(task => task.status === 'completed').map(task => task.id),
  )
  const unfinishedTasks = snapshot.tasks.filter(
    task => task.status !== 'completed',
  )
  const actionableTasks = unfinishedTasks.filter(
    task =>
      !task.owner &&
      task.blockedBy.every(blockerId => resolvedTaskIds.has(blockerId)),
  )

  return {
    snapshotKey: JSON.stringify({
      tasks: getTaskStateSnapshotKey(taskListId, tasks),
      actionableTaskIds: actionableTasks.map(task => task.id),
    }),
    hasPublicUnfinishedTasks: unfinishedTasks.length > 0,
    unfinishedTasks,
    actionableTasks,
  }
}

function oneLineSubject(subject: string): string {
  const compact = subject.replace(/\s+/g, ' ').trim()
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}

function formatTasks(tasks: TaskStateItem[]): string {
  const shown = tasks.slice(0, 5).map(task => {
    const owner = task.owner ? `; owner=${task.owner}` : ''
    const blockers =
      task.blockedBy.length > 0
        ? `; blocked by ${task.blockedBy.map(id => `#${id}`).join(', ')}`
        : ''
    return `- #${task.id} [${task.status}] ${oneLineSubject(task.subject)}${owner}${blockers}`
  })
  if (tasks.length > shown.length) {
    shown.push(
      `- ...and ${tasks.length - shown.length} more unfinished task(s)`,
    )
  }
  return shown.join('\n')
}

export function buildUnfinishedTaskContinuationPrompt(
  tasks: TaskStateItem[],
): string {
  return `The current user request still has actionable unfinished tasks. Continue the work instead of ending the turn.

${formatTasks(tasks)}

Work only on unassigned, unblocked tasks. Keep TaskList status accurate, and do not give a final answer while actionable tasks remain.`
}

export function buildUnfinishedTaskCoordinationPrompt(
  tasks: TaskStateItem[],
): string {
  return `The current user request still has unfinished tasks, but none are currently safe for the main thread to execute.

${formatTasks(tasks)}

Check owners and blockers, then coordinate, wait, or unblock as appropriate. Do not take over assigned work or bypass unresolved blockers, and do not give a final answer while these tasks remain unfinished.`
}

export function buildUnfinishedTaskNoProgressError(
  tasks: TaskStateItem[],
): string {
  return `Task completion guard stopped after ${MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS} automatic continuations without TaskList progress. Remaining unfinished tasks:\n${formatTasks(tasks)}`
}
