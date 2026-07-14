import { createChildAbortController } from '../abortController.js'

type RunnerSettlement = {
  attached: boolean
  cancelled: boolean
  attachedSignal: Promise<void>
  resolveAttached: () => void
  settled: Promise<void>
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
    () => undefined,
  )
  void runnerSettlement.finally(() => {
    reservation.resolveSettled()
    if (runnerSettlements.get(taskId) === reservation) {
      runnerSettlements.delete(taskId)
    }
  })
}

/**
 * Waits until the registered runner has fully exited. Returns false only when
 * no runner was registered (for example, a spawn that failed before start).
 */
export async function waitForInProcessTeammateRunner(
  taskId: string,
  attachTimeoutMs = 1_000,
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
      reservation.cancelled = true
      if (runnerSettlements.get(taskId) === reservation) {
        runnerSettlements.delete(taskId)
      }
      reservation.resolveAttached()
      reservation.resolveSettled()
      return false
    }
  }

  if (reservation.cancelled) return false
  await reservation.settled
  return true
}
