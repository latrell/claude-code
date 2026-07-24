import { TASK_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskListTool/constants.js'
import { TASK_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/constants.js'
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
import { isTerminalTaskStatus } from '../Task.js'
import type { TaskState } from '../tasks/types.js'
import { hashContent } from '../utils/hash.js'
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

export type GuardedTaskStateItem = TaskStateItem & {
  taskListId: string
}

export type UnfinishedTaskInspection = {
  snapshotKey: string
  hasPublicUnfinishedTasks: boolean
  publicTasks: GuardedTaskStateItem[]
  unfinishedTasks: GuardedTaskStateItem[]
  actionableTasks: GuardedTaskStateItem[]
}

export function isTaskCompletionGuardToolName(name: string): boolean {
  return TASK_COMPLETION_GUARD_TOOL_NAMES.has(name)
}

function canonicalizeProgressValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeProgressValue).join(',')}]`
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
    case 'number':
      return JSON.stringify(value)
    case 'bigint':
      return `${value.toString()}n`
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      )
      return `{${entries
        .map(
          ([key, entry]) =>
            `${JSON.stringify(key)}:${canonicalizeProgressValue(entry)}`,
        )
        .join(',')}}`
    }
    default:
      return String(value)
  }
}

/**
 * Fingerprint settled work that can advance an unfinished TaskList without
 * changing its public metadata immediately. Task tools are represented by the
 * TaskList snapshot itself, while Sleep only lets time pass.
 */
export function getTaskCompletionGuardProgressFingerprint({
  toolName,
  input,
}: {
  toolName: string
  input: unknown
}): string | undefined {
  if (
    isTaskCompletionGuardToolName(toolName) ||
    toolName === TASK_OUTPUT_TOOL_NAME ||
    toolName === SLEEP_TOOL_NAME
  ) {
    return undefined
  }
  // The query loop has already proven that this invocation settled
  // successfully. Do not include result text here: timestamps, counters, and
  // rolling logs would otherwise make the same repeated command look novel
  // forever and defeat the consecutive-idle guard.
  return hashContent(canonicalizeProgressValue({ toolName, input }))
}

export type TaskCompletionGuardRuntimeState = {
  hasActiveWork: boolean
  hasPendingDelivery: boolean
}

function isCorrelatedRuntimeTask(
  task: TaskState,
  trackedTaskIds: ReadonlySet<string>,
  guardedOwners: ReadonlySet<string>,
): boolean {
  if (trackedTaskIds.has(task.id)) return true
  if (task.type === 'in_process_teammate') {
    return (
      guardedOwners.has(task.identity.agentId) ||
      guardedOwners.has(task.identity.agentName)
    )
  }
  return (
    'agentId' in task &&
    typeof task.agentId === 'string' &&
    guardedOwners.has(task.agentId)
  )
}

function isLongLivedRuntimeTask(task: TaskState): boolean {
  if (task.type === 'dream') return true
  if (task.type === 'monitor_mcp') return true
  if (task.type === 'local_bash' && task.kind === 'monitor') return true
  if (task.type === 'remote_agent' && task.isLongRunning) return true
  return task.type === 'local_agent' && task.agentType === 'main-session'
}

/**
 * Find only runtime work correlated with this guard. This intentionally
 * excludes unrelated monitors, idle teammates, foreground tools, and the
 * LocalMainSessionTask wrapper whose status cannot settle until query returns.
 */
export function getTaskCompletionGuardRuntimeState(
  tasks: Record<string, TaskState>,
  trackedTaskIds: ReadonlySet<string>,
  guardedOwners: ReadonlySet<string>,
): TaskCompletionGuardRuntimeState {
  let hasActiveWork = false
  let hasPendingDelivery = false

  for (const task of Object.values(tasks)) {
    if (
      !isCorrelatedRuntimeTask(task, trackedTaskIds, guardedOwners) ||
      isLongLivedRuntimeTask(task) ||
      ('isBackgrounded' in task && task.isBackgrounded === false)
    ) {
      continue
    }

    if (task.type === 'in_process_teammate') {
      if (task.status === 'running' && !task.isIdle) hasActiveWork = true
      continue
    }
    if (task.status === 'running' || task.status === 'pending') {
      hasActiveWork = true
      continue
    }
    if (isTerminalTaskStatus(task.status) && !task.notified) {
      hasPendingDelivery = true
    }
  }

  return { hasActiveWork, hasPendingDelivery }
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
  const publicTasks = snapshot.tasks.map(task => ({ ...task, taskListId }))
  const resolvedTaskIds = new Set(
    tasks.filter(task => task.status === 'completed').map(task => task.id),
  )
  const unfinishedTasks = publicTasks.filter(
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
    publicTasks,
    unfinishedTasks,
    actionableTasks,
  }
}

function oneLineSubject(subject: string): string {
  const compact = subject.replace(/\s+/g, ' ').trim()
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}

function formatTasks(tasks: GuardedTaskStateItem[]): string {
  const shown = tasks.slice(0, 5).map(task => {
    const owner = task.owner ? `; owner=${task.owner}` : ''
    const blockers =
      task.blockedBy.length > 0
        ? `; blocked by ${task.blockedBy.map(id => `#${id}`).join(', ')}`
        : ''
    return `- [TaskList ${JSON.stringify(task.taskListId)}] #${task.id} [${task.status}] ${oneLineSubject(task.subject)}${owner}${blockers}`
  })
  if (tasks.length > shown.length) {
    shown.push(
      `- ...and ${tasks.length - shown.length} more unfinished task(s)`,
    )
  }
  return shown.join('\n')
}

export function buildUnfinishedTaskContinuationPrompt(
  tasks: GuardedTaskStateItem[],
  currentTaskListId: string,
): string {
  return `The current user request still has actionable unfinished tasks. Continue the work instead of ending the turn.

${formatTasks(tasks)}

Task tools currently address TaskList ${JSON.stringify(currentTaskListId)}. Work only on unassigned, unblocked tasks from that list. Keep TaskList status accurate, and do not give a final answer while actionable tasks remain.`
}

export function buildUnfinishedTaskCoordinationPrompt(
  tasks: GuardedTaskStateItem[],
  currentTaskListId: string,
): string {
  return `The current user request still has unfinished tasks, but none are currently safe for the main thread to execute.

${formatTasks(tasks)}

Task tools currently address TaskList ${JSON.stringify(currentTaskListId)}. Never apply a same-numbered task ID from another list to the current list. Check owners and blockers, then coordinate, wait, or restore the correct list as appropriate. Do not take over assigned work or bypass unresolved blockers, and do not give a final answer while these tasks remain unfinished.`
}

export function buildUnfinishedTaskNoProgressError(
  tasks: GuardedTaskStateItem[],
): string {
  return `Task completion guard stopped after ${MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS} consecutive automatic continuations without TaskList progress or new settled work. Remaining unfinished tasks:\n${formatTasks(tasks)}`
}
