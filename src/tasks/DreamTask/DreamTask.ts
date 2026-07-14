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
import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from '../../utils/abortSettlement.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

// Keep only the N most recent turns for live display.
const MAX_TURNS = 30
const DREAM_STOP_SETTLEMENT_TIMEOUT_MS = 30_000
const DREAM_STOP_ABORT_GRACE_MS = 2_000

type DreamStopSettlementTiming = {
  timeoutMs?: number
  abortGraceMs?: number
}

// A task is not stopped merely because its AbortController was signalled.  The
// forked query may still be unwinding an HTTP stream and tool generators. Keep
// its settlement promise so TaskStop can wait for that unwind before exposing
// a terminal state or releasing the consolidation lock for another run.
const activeDreamRuns = new Map<string, Promise<void>>()
const pendingDreamStops = new Map<string, Promise<void>>()

export function trackDreamTaskRun(
  taskId: string,
  run: Promise<unknown>,
  setAppState: SetAppState,
): void {
  // An ordinary rejection still proves that the local runner exited. The
  // owner handles that failure, while an in-flight Stop may safely continue
  // with lock rollback. StopConfirmationError is different: the local runner
  // has ended specifically because it could not prove its remote work ended.
  // Publish that as an explicit failed terminal state instead of retaining an
  // already-rejected promise that every later Stop would retry forever.
  const settled = run.then(
    () => undefined,
    error => {
      if (error instanceof StopConfirmationError) {
        failDreamTaskAfterUnconfirmedStop(taskId, setAppState, error)
        throw error
      }
      return undefined
    },
  )
  activeDreamRuns.set(taskId, settled)
  const clear = (): void => {
    if (activeDreamRuns.get(taskId) === settled) {
      activeDreamRuns.delete(taskId)
    }
  }
  // A waiter that already captured `settled` still receives its rejection;
  // the registry itself must only contain live/retryable work.
  void settled.then(clear, clear)
}

async function waitForDreamStopWork(
  work: Promise<void>,
  signal: AbortSignal | undefined,
  operation: string,
  timing: DreamStopSettlementTiming,
): Promise<void> {
  try {
    await waitForBoundedSettlement(work, {
      signal,
      timeoutMs: timing.timeoutMs ?? DREAM_STOP_SETTLEMENT_TIMEOUT_MS,
      abortGraceMs: timing.abortGraceMs ?? DREAM_STOP_ABORT_GRACE_MS,
      operation,
    })
  } catch (error) {
    if (error instanceof StopConfirmationError) throw error
    const message =
      error instanceof AbortSettlementTimeoutError
        ? `${operation} did not settle after cancellation`
        : `${operation} failed`
    throw new StopConfirmationError(message, [error])
  }
}

async function waitForDreamTaskRun(
  taskId: string,
  signal: AbortSignal | undefined,
  timing: DreamStopSettlementTiming,
): Promise<void> {
  const run = activeDreamRuns.get(taskId)
  if (!run) return
  await waitForDreamStopWork(
    run,
    signal,
    `Dream task ${taskId} runner settlement`,
    timing,
  )
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
  /** Failure detail surfaced when remote termination could not be confirmed. */
  error?: string
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

function failDreamTaskAfterUnconfirmedStop(
  taskId: string,
  setAppState: SetAppState,
  error: StopConfirmationError,
): void {
  updateTaskState<DreamTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    return {
      ...task,
      status: 'failed',
      endTime: Date.now(),
      notified: true,
      error: error.message,
      abortController: undefined,
      lockLease: undefined,
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

export async function stopDreamTask(
  taskId: string,
  setAppState: SetAppState,
  settlementTiming: DreamStopSettlementTiming = {},
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
  await waitForDreamTaskRun(taskId, abortController?.signal, settlementTiming)

  // A Stop is not complete while this run still owns the consolidation lock.
  // Keep the task non-terminal if rollback stalls/fails so the user can retry
  // instead of hiding incomplete cleanup behind a killed state.
  if (lockLease !== undefined) {
    await waitForDreamStopWork(
      rollbackConsolidationLock(lockLease),
      abortController?.signal,
      `Dream task ${taskId} consolidation lock rollback`,
      settlementTiming,
    )
  }

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
}
