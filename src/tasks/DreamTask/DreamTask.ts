// Background task entry for auto-dream (memory consolidation subagent).
// Makes the otherwise-invisible forked agent visible in the footer pill and
// Shift+Down dialog. The dream agent itself is unchanged — this is pure UI
// surfacing via the existing task registry.

import {
  rollbackConsolidationLock,
  type ConsolidationLockLease,
} from '../../services/autoDream/consolidationLock.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

// Keep only the N most recent turns for live display.
const MAX_TURNS = 30

// A task is not stopped merely because its AbortController was signalled.  The
// forked query may still be unwinding an HTTP stream and tool generators. Keep
// its settlement promise so TaskStop can wait for that unwind before exposing
// a terminal state or releasing the consolidation lock for another run.
const activeDreamRuns = new Map<string, Promise<void>>()
const pendingDreamStops = new Map<string, Promise<void>>()

export function trackDreamTaskRun(taskId: string, run: Promise<unknown>): void {
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  activeDreamRuns.set(taskId, settled)
  void settled.finally(() => {
    if (activeDreamRuns.get(taskId) === settled) {
      activeDreamRuns.delete(taskId)
    }
  })
}

async function waitForDreamTaskRun(taskId: string): Promise<void> {
  await activeDreamRuns.get(taskId)
}

// A single assistant turn from the dream agent, tool uses collapsed to a count.
export type DreamTurn = {
  text: string
  toolUseCount: number
}

// No phase detection — the dream prompt has a 4-stage structure
// (orient/gather/consolidate/prune) but we don't parse it. Just flip from
// 'starting' to 'updating' when the first Edit/Write tool_use lands.
export type DreamPhase = 'starting' | 'updating'

export type DreamTaskState = TaskStateBase & {
  type: 'dream'
  phase: DreamPhase
  sessionsReviewing: number
  /**
   * Paths observed in Edit/Write tool_use blocks via onMessage. This is an
   * INCOMPLETE reflection of what the dream agent actually changed — it misses
   * any bash-mediated writes and only captures the tool calls we pattern-match.
   * Treat as "at least these were touched", not "only these were touched".
   */
  filesTouched: string[]
  /** Assistant text responses, tool uses collapsed. Prompt is NOT included. */
  turns: DreamTurn[]
  abortController?: AbortController
  /** Owner-scoped lease used to release a failed or cancelled consolidation. */
  lockLease?: ConsolidationLockLease
}

export function isDreamTask(task: unknown): task is DreamTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'dream'
  )
}

export function registerDreamTask(
  setAppState: SetAppState,
  opts: {
    sessionsReviewing: number
    lockLease?: ConsolidationLockLease
    abortController: AbortController
  },
): string {
  const id = generateTaskId('dream')
  const task: DreamTaskState = {
    ...createTaskStateBase(id, 'dream', 'dreaming'),
    type: 'dream',
    status: 'running',
    phase: 'starting',
    sessionsReviewing: opts.sessionsReviewing,
    filesTouched: [],
    turns: [],
    abortController: opts.abortController,
    lockLease: opts.lockLease,
  }
  registerTask(task, setAppState)
  return id
}

export function addDreamTurn(
  taskId: string,
  turn: DreamTurn,
  touchedPaths: string[],
  setAppState: SetAppState,
): void {
  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    const seen = new Set(task.filesTouched)
    const newTouched = touchedPaths.filter(p => !seen.has(p) && seen.add(p))
    // Skip the update entirely if the turn is empty AND nothing new was
    // touched. Avoids re-rendering on pure no-ops.
    if (
      turn.text === '' &&
      turn.toolUseCount === 0 &&
      newTouched.length === 0
    ) {
      return task
    }
    return {
      ...task,
      phase: newTouched.length > 0 ? 'updating' : task.phase,
      filesTouched:
        newTouched.length > 0
          ? [...task.filesTouched, ...newTouched]
          : task.filesTouched,
      turns: task.turns.slice(-(MAX_TURNS - 1)).concat(turn),
    }
  })
}

export function completeDreamTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  // notified: true immediately — dream has no model-facing notification path
  // (it's UI-only), and eviction requires terminal + notified. The inline
  // appendSystemMessage completion note IS the user surface.
  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running' || task.abortController?.signal.aborted) {
      return task
    }
    return {
      ...task,
      status: 'completed',
      endTime: Date.now(),
      notified: true,
      abortController: undefined,
    }
  })
}

export function failDreamTask(taskId: string, setAppState: SetAppState): void {
  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running' || task.abortController?.signal.aborted) {
      return task
    }
    return {
      ...task,
      status: 'failed',
      endTime: Date.now(),
      notified: true,
      abortController: undefined,
    }
  })
}

export const DreamTask: Task = {
  name: 'DreamTask',
  type: 'dream',

  kill(taskId, setAppState) {
    const pending = pendingDreamStops.get(taskId)
    if (pending) return pending

    const stop = stopDreamTask(taskId, setAppState)
    pendingDreamStops.set(taskId, stop)
    const clearPendingStop = (): void => {
      if (pendingDreamStops.get(taskId) === stop) {
        pendingDreamStops.delete(taskId)
      }
    }
    void stop.then(clearPendingStop, clearPendingStop)
    return stop
  },
}

async function stopDreamTask(
  taskId: string,
  setAppState: SetAppState,
): Promise<void> {
  let lockLease: ConsolidationLockLease | undefined
  let abortController: AbortController | undefined
  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    lockLease = task.lockLease
    abortController = task.abortController
    return task
  })
  abortController?.abort()
  await waitForDreamTaskRun(taskId)

  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      notified: true,
      abortController: undefined,
    }
  })
  // Release only this run's lease so the next session can retry. If this was
  // a forced run, or updateTaskState was a no-op, there is no lease to undo.
  if (lockLease !== undefined) {
    await rollbackConsolidationLock(lockLease)
  }
}
