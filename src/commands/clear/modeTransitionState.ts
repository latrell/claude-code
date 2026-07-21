import type { GoalState } from '../../types/logs.js'
import {
  _setGoalFromPersistedState,
  getGoal,
} from '../../services/goal/goalState.js'
import {
  copyTaskListForSessionTransition,
  isUsingSessionScopedTaskList,
} from '../../utils/tasks.js'

export type ModeTransitionState = {
  sourceSessionId: string
  activeGoal: GoalState | null
  migrateSessionTaskList: boolean
  hasRestored: boolean
}

/**
 * Snapshot state that must survive the internal context clear performed when
 * accepting a plan. User-issued `/clear` never calls this helper.
 */
export function captureModeTransitionState(
  sourceSessionId: string,
): ModeTransitionState {
  const goal = getGoal(sourceSessionId)
  return {
    sourceSessionId,
    // Snapshot instead of retaining the old session's mutable map value.
    activeGoal: goal?.status === 'active' ? { ...goal } : null,
    migrateSessionTaskList: isUsingSessionScopedTaskList(),
    hasRestored: false,
  }
}

/**
 * Re-home captured continuation state under the regenerated session ID. Both
 * task files and goal state are copied so the source session remains intact
 * and independently resumable.
 */
export async function restoreModeTransitionState(
  state: ModeTransitionState,
  targetSessionId: string,
): Promise<{ goalRestored: boolean }> {
  // A late clear failure can retry this same object after the first target has
  // already received and changed task/goal state. Advance from that latest
  // successful target rather than replaying the stale original capture.
  if (state.hasRestored) {
    const latestGoal = getGoal(state.sourceSessionId)
    state.activeGoal =
      latestGoal?.status === 'active' ? { ...latestGoal } : null
  }

  if (state.migrateSessionTaskList) {
    await copyTaskListForSessionTransition(
      state.sourceSessionId,
      targetSessionId,
    )
  }

  const goalToRestore = state.activeGoal ? { ...state.activeGoal } : null
  if (goalToRestore) {
    _setGoalFromPersistedState(goalToRestore, targetSessionId)
  }

  state.sourceSessionId = targetSessionId
  state.activeGoal = goalToRestore ? { ...goalToRestore } : null
  state.hasRestored = true
  return { goalRestored: goalToRestore !== null }
}
