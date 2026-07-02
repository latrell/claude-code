import { useEffect, useRef } from 'react'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  isLocalAgentTask,
  type LocalAgentTaskState,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  evictTerminalTask,
  PANEL_GRACE_MS,
  updateTaskState,
} from '../utils/task/framework.js'
import { isTerminalStatus } from '../components/tasks/taskStatusUtils.js'
import type { TaskState } from '../tasks/types.js'

/**
 * Action determined for a single local_agent task during the eviction tick.
 */
export type LocalAgentEvictionAction =
  | { type: 'release'; taskId: string }
  | { type: 'evict'; taskId: string }
  | { type: 'skip' }

/**
 * Pure helper: determine the eviction action for a single local_agent task.
 *
 * @param task - The task to evaluate
 * @param viewingAgentTaskId - Task currently being viewed in transcript (if any)
 * @param now - Current timestamp (usually Date.now())
 * @returns The action to take: release, evict, or skip
 */
export function decideLocalAgentEviction(
  task: TaskState,
  viewingAgentTaskId: string | undefined,
  now: number,
): LocalAgentEvictionAction {
  if (!isLocalAgentTask(task)) return { type: 'skip' }
  if (!isTerminalStatus(task.status)) return { type: 'skip' }
  if (!task.notified) return { type: 'skip' }

  // Auto-release: retain=true but user is NOT currently viewing this task.
  // The retain is stale — release it so the grace period starts.
  if (task.retain && task.id !== viewingAgentTaskId) {
    return { type: 'release', taskId: task.id }
  }

  // Normal eviction: deadline passed and not retained (or retained but
  // being viewed — evictAfter stays undefined=never-evict).
  if (!task.retain && (task.evictAfter ?? Infinity) <= now) {
    return { type: 'evict', taskId: task.id }
  }

  return { type: 'skip' }
}

/**
 * Process all local_agent tasks and return the list of actions to take.
 * Used by the 1s tick in both CoordinatorTaskPanel and REPL.
 *
 * @param tasks - All tasks in AppState
 * @param viewingAgentTaskId - Task currently being viewed (if any)
 * @param now - Current timestamp
 * @returns Ordered list of non-skip actions
 */
export function collectLocalAgentEvictions(
  tasks: Record<string, TaskState>,
  viewingAgentTaskId: string | undefined,
  now: number,
): LocalAgentEvictionAction[] {
  const actions: LocalAgentEvictionAction[] = []
  for (const task of Object.values(tasks)) {
    const action = decideLocalAgentEviction(task, viewingAgentTaskId, now)
    if (action.type !== 'skip') {
      actions.push(action)
    }
  }
  return actions
}

/**
 * Shared eviction tick for local_agent tasks.
 *
 * CoordinatorTaskPanel runs this for ant users. For non-ant users, REPL calls
 * this hook so stale local_agent tasks (terminal + notified) are released and
 * eventually evicted even without the ant-only panel.
 *
 * Processing rules (1s tick):
 * 1. Terminal + notified + retain=true + NOT currently viewed → release
 *    (drop retain, clear messages, set evictAfter = now + PANEL_GRACE_MS)
 * 2. Terminal + notified + retain=false + evictAfter past → evict from tasks
 *
 * Never touches a task that the user is currently viewing (viewingAgentTaskId).
 */
export function useLocalAgentEvictionTick(): void {
  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const setAppState = useSetAppState()

  // Ref-based access so the interval closure always sees latest values without
  // restarting the interval on every state change.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const viewingRef = useRef(viewingAgentTaskId)
  viewingRef.current = viewingAgentTaskId
  const setAppStateRef = useRef(setAppState)
  setAppStateRef.current = setAppState

  useEffect(() => {
    // Only start the tick when there are local_agent tasks.
    const hasLocalAgents = Object.values(tasks).some(isLocalAgentTask)
    if (!hasLocalAgents) return

    const interval = setInterval(() => {
      const now = Date.now()
      const actions = collectLocalAgentEvictions(
        tasksRef.current,
        viewingRef.current,
        now,
      )
      for (const action of actions) {
        if (action.type === 'release') {
          updateTaskState<LocalAgentTaskState>(
            action.taskId,
            setAppStateRef.current,
            task => ({
              ...task,
              retain: false,
              messages: undefined,
              diskLoaded: false,
              evictAfter: Date.now() + PANEL_GRACE_MS,
            }),
          )
        } else if (action.type === 'evict') {
          evictTerminalTask(action.taskId, setAppStateRef.current)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [tasks, setAppState])
}
