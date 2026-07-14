import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
} from './abortSettlement.js'
import { createSignal } from './signal.js'
import { StopConfirmationError } from './stopConfirmation.js'

const DEFAULT_ABORT_SETTLEMENT_GRACE_MS = 2_000

export type DetachedAuxiliaryWork = {
  operation: string
  /** The exact promise that proves the remote/background work settled. */
  settlement: Promise<void>
  /** Dispatch cancellation to the owner of `settlement`. */
  cancel: (reason: unknown) => void | Promise<void>
  /** Observe operational failures without confusing them with live work. */
  onError: (error: unknown) => void
  abortGraceMs?: number
}

export type AuxiliaryWorkSettlement = Omit<
  DetachedAuxiliaryWork,
  'settlement'
> & {
  detach: boolean
  start: () => void | Promise<void>
}

type DetachedAuxiliaryEntry = DetachedAuxiliaryWork & {
  id: number
  settled: boolean
  failure?: unknown
  failureObserved: boolean
}

const activeEntries = new Map<number, DetachedAuxiliaryEntry>()
const changed = createSignal()
let nextId = 0

function removeEntry(entry: DetachedAuxiliaryEntry): void {
  if (activeEntries.get(entry.id) !== entry) return
  activeEntries.delete(entry.id)
  changed.emit()
}

function startCancellation(
  entry: DetachedAuxiliaryEntry,
  reason: unknown,
): Promise<void> {
  try {
    return Promise.resolve(entry.cancel(reason))
  } catch (error) {
    return Promise.reject(error)
  }
}

function observeFailure(entry: DetachedAuxiliaryEntry, error: unknown): void {
  if (entry.failureObserved && entry.failure === error) return
  entry.failureObserved = true
  entry.failure = error
  try {
    entry.onError(error)
  } catch {
    // Error reporting must not replace the exact settlement evidence.
  }
}

function throwTerminationFailures(
  operation: string,
  results: readonly PromiseSettledResult<void>[],
): void {
  const failures = [
    ...new Set(
      results.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      ),
    ),
  ]
  if (failures.length === 0) return
  if (failures.length === 1 && failures[0] instanceof StopConfirmationError) {
    throw failures[0]
  }
  throw new StopConfirmationError(
    `${operation} termination could not be confirmed`,
    failures,
  )
}

/**
 * Register auxiliary work without making it part of the foreground query
 * loading gate. Successful settlement and ordinary rejection remove the
 * record after reporting. Only an unconfirmed Stop remains Esc-routable, so
 * StopConfirmationError cannot disappear as an unhandled background
 * rejection.
 */
export function registerDetachedAuxiliaryWork(
  work: DetachedAuxiliaryWork,
): void {
  const entry: DetachedAuxiliaryEntry = {
    ...work,
    id: ++nextId,
    settled: false,
    failureObserved: false,
  }
  activeEntries.set(entry.id, entry)
  changed.emit()

  void entry.settlement.then(
    () => {
      entry.settled = true
      removeEntry(entry)
    },
    error => {
      // Ordinary rejection proves the request ended and only needs reporting.
      // Explicit unconfirmed Stop evidence remains Esc-routable.
      entry.settled = true
      observeFailure(entry, error)
      if (error instanceof StopConfirmationError) changed.emit()
      else removeEntry(entry)
    },
  )
}

/**
 * Start one exact settlement and either return it to the foreground owner or
 * transfer it to the detached registry. Returning `undefined` is the explicit
 * signal that foreground completion must not await this auxiliary work.
 */
export function startAuxiliaryWorkSettlement({
  detach,
  start,
  ...work
}: AuxiliaryWorkSettlement): Promise<void> | undefined {
  let settlement: Promise<void>
  try {
    settlement = Promise.resolve(start())
  } catch (error) {
    settlement = Promise.reject(error)
  }
  if (!detach) return settlement
  registerDetachedAuxiliaryWork({ ...work, settlement })
  return undefined
}

export function hasActiveDetachedAuxiliaryWork(): boolean {
  return activeEntries.size > 0
}

export const subscribeToDetachedAuxiliaryWork = changed.subscribe

/**
 * Cancel every record that existed at call time, then wait for each exact
 * settlement promise. Newer records are deliberately not captured: they
 * belong to a later turn and require a later Stop.
 */
export async function cancelAndWaitForDetachedAuxiliaryWork(
  reason: unknown = 'detached-auxiliary-work-cancelled',
): Promise<void> {
  const entries = [...activeEntries.values()]
  if (entries.length === 0) return

  // Dispatch every cancellation before awaiting any one record. Dispatcher
  // failure is observable, but only the exact settlement proves liveness.
  for (const entry of entries) {
    void startCancellation(entry, reason).catch(error => {
      observeFailure(entry, error)
    })
  }

  const confirmations = entries.map(async entry => {
    const cancellationSignal = new AbortController()
    cancellationSignal.abort(reason)

    try {
      await waitForAbortSettlement(
        entry.settlement,
        cancellationSignal.signal,
        entry.abortGraceMs ?? DEFAULT_ABORT_SETTLEMENT_GRACE_MS,
        entry.operation,
      )
      removeEntry(entry)
    } catch (error) {
      if (error instanceof AbortSettlementTimeoutError) {
        throw new StopConfirmationError(
          `${entry.operation} did not confirm termination after cancellation`,
          [error, ...(entry.failure === undefined ? [] : [entry.failure])],
        )
      }
      if (error instanceof StopConfirmationError) {
        // Keep explicit unconfirmed evidence active so later Stop attempts
        // can retry cancellation and surface the failed proof again.
        throw error
      }
      // Other rejection proves the work is no longer running. Report it and
      // remove the affordance instead of manufacturing a false Stop failure.
      observeFailure(entry, error)
      removeEntry(entry)
    }
  })

  const results = await Promise.allSettled(confirmations)
  throwTerminationFailures('Detached auxiliary work', results)
}

/** Test-only reset for module-level ownership state. */
export function resetDetachedAuxiliaryWorkForTests(): void {
  activeEntries.clear()
  nextId = 0
  changed.emit()
}
