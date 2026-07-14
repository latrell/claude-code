import { isTerminalTaskStatus, type SetAppState } from '../Task.js'
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'

// Keep in sync with PANEL_GRACE_MS in utils/task/framework.ts. Importing the
// framework here would recreate the BackgroundTasksDialog module cycle.
const PANEL_GRACE_MS = 30_000

export function isLocalAgentState(task: unknown): task is LocalAgentTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'local_agent'
  )
}

export function releaseAgentView(
  task: LocalAgentTaskState,
): LocalAgentTaskState {
  return {
    ...task,
    retain: false,
    messages: undefined,
    diskLoaded: false,
    evictAfter: isTerminalTaskStatus(task.status)
      ? Date.now() + PANEL_GRACE_MS
      : undefined,
  }
}

export type StopRunningAgent = (
  taskId: string,
  setAppState: SetAppState,
) => Promise<void>

/**
 * Context-sensitive x: running → confirmed async stop, terminal → dismiss.
 * Dismiss sets evictAfter=0 so the filter hides immediately.
 * If viewing the dismissed agent, also exits to leader.
 */
export async function stopOrDismissAgent(
  taskId: string,
  setAppState: SetAppState,
  stopRunningAgent: StopRunningAgent,
): Promise<'stopped' | 'dismissed' | 'not_found'> {
  let shouldStop = false
  let dismissed = false
  setAppState(prev => {
    const task = prev.tasks[taskId]
    if (!isLocalAgentState(task)) return prev
    if (task.status === 'running') {
      // Capture intent only. Calling abort() inside a state updater bypassed
      // LocalAgentTask's settlement/confirmation contract and left the panel
      // showing an agent that could never be confirmed stopped.
      shouldStop = true
      return prev
    }
    if (task.evictAfter === 0) return prev
    dismissed = true
    const viewingThis = prev.viewingAgentTaskId === taskId
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: { ...releaseAgentView(task), evictAfter: 0 },
      },
      ...(viewingThis && {
        viewingAgentTaskId: undefined,
        viewSelectionMode: 'none',
      }),
    }
  })

  if (shouldStop) {
    await stopRunningAgent(taskId, setAppState)
    return 'stopped'
  }
  return dismissed ? 'dismissed' : 'not_found'
}
