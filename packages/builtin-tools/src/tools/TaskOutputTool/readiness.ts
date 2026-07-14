import type { LocalAgentTaskState } from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from 'src/tasks/types.js'
import { isTerminalTaskStatus } from 'src/Task.js'

/**
 * A local agent's model result can be consumed while classifier and cleanup
 * work is still running. The task remains non-terminal so TaskStop can cancel
 * that owned finalization work.
 */
export function isTaskOutputReady(task: TaskState): boolean {
  return (
    (task.status !== 'running' && task.status !== 'pending') ||
    (task.type === 'local_agent' &&
      (task as LocalAgentTaskState).result !== undefined)
  )
}

/** Record result consumption without suppressing the later lifecycle event. */
export function markTaskOutputRetrieved<T extends TaskState>(task: T): T {
  return {
    ...task,
    ...(task.type === 'local_agent' ? { retrieved: true } : {}),
    ...(isTerminalTaskStatus(task.status) ? { notified: true } : {}),
  }
}
