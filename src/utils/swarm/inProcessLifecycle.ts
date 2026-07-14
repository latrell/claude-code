import { createChildAbortController } from '../abortController.js'
import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from '../abortSettlement.js'
import { StopConfirmationError } from '../stopConfirmation.js'

const IN_PROCESS_RUNNER_SETTLEMENT_TIMEOUT_MS = 20_000
const IN_PROCESS_RUNNER_SETTLEMENT_ABORT_GRACE_MS = 2_000

type RunnerSettlement = {
  attached: boolean
  cancelled: boolean
  attachedSignal: Promise<void>
  resolveAttached: () => void
  settled: Promise<void>
  settlementError?: unknown
  didSettle: boolean
  settlementWaiters: number
  retainUntilConfirmed: boolean
  resolveSettled: () => void
}

const runnerSettlements = new Map<string, RunnerSettlement>()

function createRunnerSettlement(): RunnerSettlement {
  let resolveAttached!: () => void
  const attachedSignal = new Promise<void>(resolve => {
    resolveAttached = resolve
  })
  let resolveSettled!: () => void
  const settled = new Promise<void>(resolve => {
    resolveSettled = resolve
  })
  return {
    attached: false,
    cancelled: false,
    attachedSignal,
    resolveAttached,
    settled,
    didSettle: false,
    settlementWaiters: 0,
    retainUntilConfirmed: false,
    resolveSettled,
  }
}

/**
 * Reserve a settlement slot before publishing the task in AppState. Stop can
 * therefore wait across the short task-registration -> runner-start handoff
 * instead of mistaking "not attached yet" for "there is no live work".
 */
export function reserveInProcessTeammateRunner(taskId: string): void {
  runnerSettlements.set(taskId, createRunnerSettlement())
}

/** Release a reservation when task registration itself fails before launch. */
export function cancelInProcessTeammateRunnerReservation(taskId: string): void {
  const reservation = runnerSettlements.get(taskId)
  if (!reservation || reservation.attached) return
  reservation.cancelled = true
  runnerSettlements.delete(taskId)
  reservation.resolveAttached()
  reservation.didSettle = true
  reservation.resolveSettled()
}

/**
 * Creates the controller for one teammate turn. A turn can be interrupted on
 * its own, while aborting the teammate lifecycle always aborts the active turn
 * (and therefore the underlying HTTP/SSE request) immediately.
 */
export function createInProcessWorkAbortController(
  lifecycleController: AbortController,
): AbortController {
  return createChildAbortController(lifecycleController)
}

/**
 * Registers the full lifetime of an in-process teammate runner. The stored
 * promise always resolves, so stop callers can await actual runner settlement
 * without having to duplicate its error handling.
 */
export function registerInProcessTeammateRunner(
  taskId: string,
  runner: Promise<unknown>,
  shouldRetainAfterSettlement?: () => boolean,
): void {
  const existing = runnerSettlements.get(taskId)
  const reservation =
    existing && !existing.attached && !existing.cancelled
      ? existing
      : createRunnerSettlement()
  reservation.attached = true
  reservation.resolveAttached()
  runnerSettlements.set(taskId, reservation)

  const runnerSettlement = runner.then(
    () => undefined,
    error => {
      reservation.settlementError = error
    },
  )
  void runnerSettlement.finally(() => {
    reservation.didSettle = true
    try {
      if (shouldRetainAfterSettlement?.()) {
        // The runner is gone but its task is still non-terminal. Preserve the
        // settlement as proof so TaskStop can finalize this completed runner
        // instead of reporting that no runner was registered.
        reservation.retainUntilConfirmed = true
      }
    } catch {
      // Failing to inspect owner state must fail closed. A later Stop can
      // consume the retained proof; deleting it would create a false negative.
      reservation.retainUntilConfirmed = true
    }
    reservation.resolveSettled()
    if (
      runnerSettlements.get(taskId) === reservation &&
      reservation.settlementWaiters === 0 &&
      !reservation.retainUntilConfirmed
    ) {
      runnerSettlements.delete(taskId)
    }
  })
}

/**
 * Waits until the registered runner has fully exited. Returns false when no
 * runner attaches or when an attached runner does not settle by the deadline.
 * A timed-out runner stays registered so a later Stop can retry confirmation.
 */
export async function waitForInProcessTeammateRunner(
  taskId: string,
  attachTimeoutMs = 1_000,
  settlementTimeoutMs = IN_PROCESS_RUNNER_SETTLEMENT_TIMEOUT_MS,
  settlementAbortGraceMs = IN_PROCESS_RUNNER_SETTLEMENT_ABORT_GRACE_MS,
): Promise<boolean> {
  const reservation = runnerSettlements.get(taskId)
  if (!reservation) {
    return false
  }

  if (!reservation.attached) {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      reservation.attachedSignal,
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, attachTimeoutMs)
      }),
    ])
    if (timer) clearTimeout(timer)

    if (!reservation.attached) {
      // A delayed start can still attach after this caller's deadline. Keep
      // the reservation so that late work inherits the already-aborted
      // lifecycle and a later Stop can confirm its eventual settlement.
      reservation.retainUntilConfirmed = true
      return false
    }
  }

  if (reservation.cancelled) return false
  reservation.settlementWaiters += 1
  let confirmed = false
  try {
    try {
      await waitForBoundedSettlement(reservation.settled, {
        timeoutMs: settlementTimeoutMs,
        abortGraceMs: settlementAbortGraceMs,
        operation: `In-process teammate ${taskId} runner settlement`,
      })
    } catch (error) {
      if (
        error instanceof AbortSettlementTimeoutError &&
        !reservation.didSettle
      ) {
        // Keep the settlement registered. Stop may be retried after the runner
        // eventually unwinds; timing out must never be treated as termination.
        reservation.retainUntilConfirmed = true
        return false
      }
      if (!reservation.didSettle) throw error
    }
    confirmed = true
    if (reservation.settlementError instanceof StopConfirmationError) {
      // The local runner is gone, so there is nothing live to retry. Preserve
      // the causal failure for the owner to publish as a failed terminal task,
      // then release this settlement record in finally.
      throw reservation.settlementError
    }
    return true
  } finally {
    reservation.settlementWaiters -= 1
    if (
      confirmed &&
      reservation.didSettle &&
      reservation.settlementWaiters === 0 &&
      runnerSettlements.get(taskId) === reservation
    ) {
      runnerSettlements.delete(taskId)
    }
  }
}
