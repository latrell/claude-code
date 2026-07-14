import type { AppState } from '../../state/AppState.js'
import { tf } from '../../i18n/t.js'

type AppTask = AppState['tasks'][string]

export function isForegroundTaskForClear(task: AppTask): boolean {
  return 'isBackgrounded' in task && task.isBackgrounded === false
}

/**
 * Stops the exact foreground-task snapshot owned by the conversation being
 * cleared and verifies that none of those tasks is still running. The caller
 * may remove the returned ids only after this promise resolves.
 */
export async function stopForegroundTasksBeforeClear({
  getAppState,
  stopTask,
}: {
  getAppState: () => AppState
  stopTask: (taskId: string, task: AppTask) => Promise<void>
}): Promise<Set<string>> {
  const foregroundTasks = Object.entries(getAppState().tasks).filter(
    ([, task]) => isForegroundTaskForClear(task),
  )

  await Promise.all(
    foregroundTasks.map(([taskId, task]) =>
      task.status === 'running' ? stopTask(taskId, task) : Promise.resolve(),
    ),
  )

  const latest = getAppState()
  const unresolved: string[] = []
  for (const [taskId] of foregroundTasks) {
    if (latest.tasks[taskId]?.status === 'running') {
      unresolved.push(taskId)
    }
  }
  if (unresolved.length > 0) {
    throw new Error(
      tf(
        'Could not confirm foreground task termination before clearing conversation: {tasks}',
        { tasks: unresolved.join(', ') },
      ),
    )
  }

  return new Set(foregroundTasks.map(([taskId]) => taskId))
}
