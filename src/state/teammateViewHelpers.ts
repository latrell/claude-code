import { logEvent } from '../services/analytics/index.js'
import {
  isLocalAgentState as isLocalAgent,
  releaseAgentView as release,
} from './agentStopAction.js'
export {
  stopOrDismissAgent,
  type StopRunningAgent,
} from './agentStopAction.js'

import type { AppState } from './AppState.js'

/**
 * Transitions the UI to view a teammate's transcript.
 * Sets viewingAgentTaskId and, for local_agent, retain: true (blocks eviction,
 * enables stream-append, triggers disk bootstrap) and clears evictAfter.
 * If switching from another agent, releases the previous one back to stub.
 */
export function enterTeammateView(
  taskId: string,
  setAppState: (updater: (prev: AppState) => AppState) => void,
): void {
  logEvent('tengu_transcript_view_enter', {})
  setAppState(prev => {
    const task = prev.tasks[taskId]
    const prevId = prev.viewingAgentTaskId
    const prevTask = prevId !== undefined ? prev.tasks[prevId] : undefined
    const switching =
      prevId !== undefined &&
      prevId !== taskId &&
      isLocalAgent(prevTask) &&
      prevTask.retain
    const needsRetain =
      isLocalAgent(task) && (!task.retain || task.evictAfter !== undefined)
    const needsView =
      prev.viewingAgentTaskId !== taskId ||
      prev.viewSelectionMode !== 'viewing-agent'
    if (!needsRetain && !needsView && !switching) return prev
    let tasks = prev.tasks
    if (switching || needsRetain) {
      tasks = { ...prev.tasks }
      if (switching) tasks[prevId] = release(prevTask)
      if (needsRetain) {
        tasks[taskId] = { ...task, retain: true, evictAfter: undefined }
      }
    }
    return {
      ...prev,
      viewingAgentTaskId: taskId,
      viewSelectionMode: 'viewing-agent',
      tasks,
    }
  })
}

/**
 * Exit teammate transcript view and return to leader's view.
 * Drops retain and clears messages back to stub form; if terminal,
 * schedules eviction via evictAfter so the row lingers briefly.
 */
export function exitTeammateView(
  setAppState: (updater: (prev: AppState) => AppState) => void,
): void {
  logEvent('tengu_transcript_view_exit', {})
  setAppState(prev => {
    const id = prev.viewingAgentTaskId
    const cleared = {
      ...prev,
      viewingAgentTaskId: undefined,
      viewSelectionMode: 'none' as const,
    }
    if (id === undefined) {
      return prev.viewSelectionMode === 'none' ? prev : cleared
    }
    const task = prev.tasks[id]
    if (!isLocalAgent(task) || !task.retain) return cleared
    return {
      ...cleared,
      tasks: { ...prev.tasks, [id]: release(task) },
    }
  })
}
