import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from '../utils/abortSettlement.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'

export type SdkRunGeneration = Readonly<{
  generation: number
  settled: Promise<void>
  abortController: AbortController
}>

export type SdkRunGenerationHandle = SdkRunGeneration & {
  settle: () => void
}

export type SdkRunCancellation = Readonly<{
  /** The generation captured when this cancellation epoch began. */
  settled: Promise<void>
  /**
   * Release this acknowledgement lease. Passing false retains the epoch's
   * replacement gate so a later Stop can retry unconfirmed owned work.
   * Idempotent for each cancellation lease.
   */
  releaseAfterAcknowledgement: (confirmed?: boolean) => void
}>

export type SdkOwnedAbortRun = Readonly<{
  abortController: AbortController
  settled: Promise<unknown>
}>

/**
 * Dispatch cancellation to every auxiliary request owned by an SDK session
 * and require each original promise to settle. Ordinary rejection proves
 * settlement; StopConfirmationError/timeout means remote termination remains
 * unconfirmed and must be reported to the control-plane caller.
 */
export async function cancelSdkOwnedRuns(
  runs: readonly SdkOwnedAbortRun[],
  reason: unknown,
  operation: string,
  abortGraceMs = 2_000,
): Promise<void> {
  for (const run of runs) {
    if (!run.abortController.signal.aborted) {
      run.abortController.abort(reason)
    }
  }

  const results = await Promise.allSettled(
    runs.map(run =>
      waitForAbortSettlement(
        run.settled,
        run.abortController.signal,
        abortGraceMs,
        operation,
      ),
    ),
  )
  const failures = results.flatMap(result => {
    if (result.status !== 'rejected') return []
    if (result.reason instanceof StopConfirmationError) {
      return [result.reason]
    }
    if (result.reason instanceof AbortSettlementTimeoutError) {
      return [
        new StopConfirmationError(`${operation} was not confirmed`, [
          result.reason,
        ]),
      ]
    }
    return []
  })
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new StopConfirmationError(
      `${failures.length} owned SDK requests did not confirm termination`,
      failures,
    )
  }
}

/**
 * Bound the control-plane acknowledgement wait without pretending the
 * generation stopped. SdkRunLifecycle separately keeps the replacement gate
 * closed until the captured run settles and a cancellation attempt confirms
 * every owned request.
 */
export async function waitForSdkStopSettlement(
  settlement: Promise<unknown>,
  timeoutMs = 35_000,
  operation = 'SDK run cancellation',
): Promise<boolean> {
  try {
    await waitForBoundedSettlement(settlement, {
      timeoutMs,
      abortGraceMs: 100,
      operation,
    })
    return true
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError) return false
    throw error
  }
}

/**
 * Decide whether a headless generation still owns background work that can
 * produce another model turn. The pending-delivery input covers the interval
 * after a task becomes terminal but before its task notification is queued.
 */
export function shouldWaitForSdkBackgroundTasks({
  hasRunningBackgroundTask,
  hasPendingTaskDelivery,
  hasMainThreadQueued,
}: {
  hasRunningBackgroundTask: boolean
  hasPendingTaskDelivery: boolean
  hasMainThreadQueued: boolean
}): boolean {
  return (
    hasRunningBackgroundTask || hasPendingTaskDelivery || hasMainThreadQueued
  )
}

/**
 * A queued notification in retry backoff or parked state is intentionally not
 * selectable, but it still owns future delivery. Closing the SDK output while
 * that ownership exists would let its retry timer fire against a finished
 * stream.
 */
export function shouldDeferHeadlessOutputClose({
  inputClosed,
  hasPendingTaskNotificationDelivery,
}: {
  inputClosed: boolean
  hasPendingTaskNotificationDelivery: boolean
}): boolean {
  return !inputClosed || hasPendingTaskNotificationDelivery
}

/**
 * A parked notification is recoverable only while the SDK can still receive
 * fresh user input and no independently-owned cleanup failed. The next user
 * message can then explicitly reactivate delivery without restarting the
 * process.
 */
export function shouldKeepParkedTaskNotificationRecoverable({
  inputClosed,
  hasAuxiliaryFailures,
}: {
  inputClosed: boolean
  hasAuxiliaryFailures: boolean
}): boolean {
  return !inputClosed && !hasAuxiliaryFailures
}

/**
 * Wait for the next background-task poll without letting a cancelled SDK
 * generation stay trapped in the waiting_for_agents loop. Returns false as
 * soon as cancellation is observed, including when the signal was already
 * aborted before the poll began.
 */
export function waitForSdkBackgroundTaskPoll(
  signal: AbortSignal,
  pollMs = 100,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)

  return new Promise(resolve => {
    let settled = false
    const finish = (shouldPollAgain: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(shouldPollAgain)
    }
    const onAbort = (): void => finish(false)
    const timer = setTimeout(() => finish(true), pollMs)
    signal.addEventListener('abort', onAbort, { once: true })

    // Close the race where cancellation lands between the initial check and
    // listener registration.
    if (signal.aborted) onAbort()
  })
}

type CancellationGate = {
  epoch: number
  settled: Promise<void>
  settledDone: boolean
  released: Promise<void>
  resolveReleased: () => void
  leases: number
  confirmed: boolean
}

/**
 * Tracks the currently executing headless SDK run.
 *
 * Interrupts create a cancellation epoch before aborting the active run.
 * New generations wait behind that gate until the captured run settles and
 * every interrupt acknowledgement has been queued. This prevents a queued
 * prompt from starting a fresh HTTP stream while Stop is still being
 * acknowledged for the previous generation.
 */
export class SdkRunLifecycle {
  #nextGeneration = 0
  #nextCancellationEpoch = 0
  #active: SdkRunGenerationHandle | null = null
  #cancellationGate: CancellationGate | null = null

  #releaseCancellationGateIfReady(gate: CancellationGate): void {
    if (!gate.confirmed || !gate.settledDone || gate.leases !== 0) return
    if (this.#cancellationGate === gate) {
      this.#cancellationGate = null
    }
    gate.resolveReleased()
  }

  start(): SdkRunGenerationHandle {
    if (this.#cancellationGate) {
      throw new Error(
        `Cannot start an SDK run during cancellation epoch ${this.#cancellationGate.epoch}`,
      )
    }
    if (this.#active) {
      throw new Error(
        `Cannot start SDK run generation ${this.#nextGeneration + 1} before generation ${this.#active.generation} settles`,
      )
    }

    let resolveSettled: () => void = () => {}
    const settled = new Promise<void>(resolve => {
      resolveSettled = resolve
    })
    let didSettle = false

    const handle: SdkRunGenerationHandle = {
      generation: ++this.#nextGeneration,
      settled,
      abortController: new AbortController(),
      settle: () => {
        if (didSettle) return
        didSettle = true
        resolveSettled()
        if (this.#active === handle) {
          this.#active = null
        }
      },
    }

    this.#active = handle
    return handle
  }

  capture(): SdkRunGeneration | null {
    return this.#active
  }

  /**
   * Reserve a generation only when no run or cancellation gate is active.
   * Callers should retry after waitUntilRunnable() when this returns null.
   */
  tryStart(): SdkRunGenerationHandle | null {
    if (this.#active || this.#cancellationGate) return null
    return this.start()
  }

  /**
   * Wait for the blocker observed at call time. The caller must retry its
   * reservation afterward: another waiter may have acquired the next
   * generation before this continuation resumes.
   */
  async waitUntilRunnable(): Promise<void> {
    const gate = this.#cancellationGate
    if (gate) {
      await gate.released
      return
    }
    await this.#active?.settled
  }

  /**
   * Latch cancellation to the current generation and block subsequent runs.
   * Concurrent interrupts share an epoch and each hold a lease, so the gate
   * opens only after every corresponding acknowledgement has been queued.
   */
  beginCancellation(reason: unknown): SdkRunCancellation {
    let gate = this.#cancellationGate
    if (!gate) {
      let resolveReleased: () => void = () => {}
      const released = new Promise<void>(resolve => {
        resolveReleased = resolve
      })
      const active = this.#active
      gate = {
        epoch: ++this.#nextCancellationEpoch,
        settled: active?.settled ?? Promise.resolve(),
        settledDone: active === null,
        released,
        resolveReleased,
        leases: 0,
        confirmed: false,
      }

      // Publish the gate before aborting: AbortSignal listeners run
      // synchronously and may otherwise try to start the next generation.
      this.#cancellationGate = gate
      active?.abortController.abort(reason)
      void gate.settled.then(() => {
        gate!.settledDone = true
        this.#releaseCancellationGateIfReady(gate!)
      })
    }

    gate.leases++
    let released = false
    return {
      settled: gate.settled,
      releaseAfterAcknowledgement: (confirmed = true) => {
        if (released) return
        released = true
        gate.confirmed ||= confirmed
        gate.leases--
        this.#releaseCancellationGateIfReady(gate)
      },
    }
  }
}
