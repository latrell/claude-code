import { useEffect, useRef } from 'react'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { exitTeammateView } from '../state/teammateViewHelpers.js'
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js'
import { isLocalAgentTask } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { isTerminalTaskStatus } from '../Task.js'

/**
 * Result of the auto-exit decision for a viewed task.
 * - 'exit-now': immediately exit the view (e.g. task killed/evicted)
 * - 'exit-after-grace': schedule a delayed exit (local_agent terminal)
 * - 'stay': keep viewing the transcript
 */
export type TeammateAutoExitDecision = 'exit-now' | 'exit-after-grace' | 'stay'

/**
 * Pure helper: determines whether the viewed task should trigger an auto-exit.
 *
 * In-process teammate rules:
 *   - killed, failed, or error → exit-now
 *   - completed, running, pending → stay (user reviews transcript)
 *   - other statuses → exit-now
 *
 * Local_agent rules:
 *   - terminal (completed/failed/killed) → exit-after-grace
 *   - running/pending → stay
 *
 * @param task - The viewed task (or undefined if gone from the map)
 * @returns The auto-exit decision
 */
export function decideTeammateAutoExit(
  task: unknown,
): TeammateAutoExitDecision {
  // Task evicted out from under us
  if (task === undefined || task === null) {
    return 'exit-now'
  }

  // in_process_teammate path
  if (isInProcessTeammateTask(task)) {
    const status = task.status
    if (
      status === 'killed' ||
      status === 'failed' ||
      task.error ||
      (status !== 'running' && status !== 'completed' && status !== 'pending')
    ) {
      return 'exit-now'
    }
    return 'stay'
  }

  // local_agent path
  if (isLocalAgentTask(task)) {
    if (isTerminalTaskStatus(task.status)) {
      return 'exit-after-grace'
    }
    return 'stay'
  }

  // Unknown task type — play it safe and stay
  return 'stay'
}

/** Brief grace period before auto-exiting a completed local_agent view. */
const LOCAL_AGENT_VIEW_GRACE_MS = 3_000

/**
 * Auto-exits teammate viewing mode when the viewed teammate
 * is killed or encounters an error. Users stay viewing completed
 * teammates so they can review the full transcript.
 *
 * Also auto-exits local_agent transcripts when the agent reaches
 * a terminal state (completed/failed/killed), after a brief grace
 * period so the user can see the final result.
 */
export function useTeammateViewAutoExit(): void {
  const setAppState = useSetAppState()
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  // Select only the viewed task, not the full tasks map — otherwise every
  // streaming update from any teammate re-renders this hook.
  const task = useAppState(s =>
    s.viewingAgentTaskId ? s.tasks[s.viewingAgentTaskId] : undefined,
  )

  // Track the local_agent auto-exit timeout so we can clear it on unmount
  // or when the user navigates away before the grace period expires.
  const localAgentExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    if (!viewingAgentTaskId) return

    const decision = decideTeammateAutoExit(task)

    switch (decision) {
      case 'exit-now':
        exitTeammateView(setAppState)
        return

      case 'exit-after-grace':
        if (localAgentExitTimerRef.current === null) {
          localAgentExitTimerRef.current = setTimeout(() => {
            localAgentExitTimerRef.current = null
            exitTeammateView(setAppState)
          }, LOCAL_AGENT_VIEW_GRACE_MS)
        }
        break

      case 'stay':
        // Cancel any pending auto-exit (e.g. task was resumed).
        if (localAgentExitTimerRef.current !== null) {
          clearTimeout(localAgentExitTimerRef.current)
          localAgentExitTimerRef.current = null
        }
        break
    }

    return () => {
      if (localAgentExitTimerRef.current !== null) {
        clearTimeout(localAgentExitTimerRef.current)
        localAgentExitTimerRef.current = null
      }
    }
  }, [viewingAgentTaskId, task, setAppState])
}
