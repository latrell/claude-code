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
  /**
   * Retry cancellation after `settlement` itself ended with unconfirmed Stop
   * evidence. Unlike `cancel`, the returned promise must be a fresh, exact
   * termination proof rather than acknowledgement that abort was dispatched.
   */
  retrySettlement?: (reason: unknown) => Promise<void>
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
  /** Rejection from the exact settlement promise, not cancellation dispatch. */
  settlementFailure?: unknown
  failure?: unknown
  failureObserved: boolean
}

type DetachedAuxiliaryConfirmationSnapshot = {
  entry: DetachedAuxiliaryEntry
  settlement: Promise<void>
  /** Undefined only when this proof was superseded while it was settling. */
  error?: StopConfirmationError
}

type DetachedAuxiliaryConfirmationFailure =
  DetachedAuxiliaryConfirmationSnapshot & {
    error: StopConfirmationError
  }

const activeEntries = new Map<number, DetachedAuxiliaryEntry>()
const changed = createSignal()
let nextId = 0

export type DetachedAuxiliaryStopFailure = Readonly<{
  operation: string
  error: unknown
  settlementPending: boolean
  canRetrySettlement: boolean
}>

/**
 * Structured Stop evidence for detached work. Keep the operation/error pairs
 * separate from the diagnostic message so UI callers never need to parse an
 * English Error.message to explain which background owners remain uncertain.
 */
export class DetachedAuxiliaryStopConfirmationError extends StopConfirmationError {
  readonly operationFailures: readonly DetachedAuxiliaryStopFailure[]
  readonly operations: readonly string[]
  readonly retryableOperations: readonly string[]
  readonly nonRetryableOperations: readonly string[]
  /** Whether another Stop can still confirm every failed operation. */
  readonly canRetry: boolean
  readonly hasPendingSettlement: boolean

  constructor(operationFailures: readonly DetachedAuxiliaryStopFailure[]) {
    const copiedFailures = operationFailures.map(
      ({ operation, error, settlementPending, canRetrySettlement }) => ({
        operation,
        error,
        settlementPending,
        canRetrySettlement,
      }),
    )
    const operations = [
      ...new Set(copiedFailures.map(({ operation }) => operation)),
    ]
    super(
      `Detached auxiliary work termination could not be confirmed${
        operations.length > 0 ? `: ${operations.join(', ')}` : ''
      }`,
      copiedFailures.map(({ error }) => error),
    )
    this.name = 'DetachedAuxiliaryStopConfirmationError'
    this.operationFailures = copiedFailures
    this.operations = operations
    this.retryableOperations = [
      ...new Set(
        copiedFailures
          .filter(({ canRetrySettlement }) => canRetrySettlement)
          .map(({ operation }) => operation),
      ),
    ]
    this.nonRetryableOperations = [
      ...new Set(
        copiedFailures
          .filter(({ canRetrySettlement }) => !canRetrySettlement)
          .map(({ operation }) => operation),
      ),
    ]
    this.canRetry = copiedFailures.every(
      ({ canRetrySettlement }) => canRetrySettlement,
    )
    this.hasPendingSettlement = copiedFailures.some(
      ({ settlementPending }) => settlementPending,
    )
  }
}

export function isDetachedAuxiliaryStopConfirmationError(
  error: unknown,
): error is DetachedAuxiliaryStopConfirmationError {
  return error instanceof DetachedAuxiliaryStopConfirmationError
}

function removeEntry(entry: DetachedAuxiliaryEntry): void {
  if (activeEntries.get(entry.id) !== entry) return
  activeEntries.delete(entry.id)
  changed.emit()
}

function trackSettlement(
  entry: DetachedAuxiliaryEntry,
  settlement: Promise<void>,
): void {
  entry.settlement = settlement
  entry.settled = false
  entry.settlementFailure = undefined
  entry.failure = undefined

  void settlement.then(
    () => {
      if (entry.settlement !== settlement) return
      entry.settled = true
      entry.settlementFailure = undefined
      removeEntry(entry)
    },
    error => {
      if (entry.settlement !== settlement) return
      // Ordinary rejection proves the request ended and only needs reporting.
      // Explicit unconfirmed Stop evidence remains Esc-routable.
      entry.settled = true
      entry.settlementFailure = error
      observeFailure(entry, error)
      if (error instanceof StopConfirmationError && entry.retrySettlement) {
        changed.emit()
      } else {
        // A terminal StopConfirmationError without a fresh proof cannot be
        // retried. Report it once through onError/current Stop, then release
        // the active affordance so it cannot poison every future Esc/session.
        removeEntry(entry)
      }
    },
  )
}

function retryUnconfirmedSettlement(
  entry: DetachedAuxiliaryEntry,
  reason: unknown,
): boolean {
  if (
    !entry.settled ||
    !(entry.failure instanceof StopConfirmationError) ||
    !entry.retrySettlement
  ) {
    return false
  }

  let settlement: Promise<void>
  try {
    settlement = Promise.resolve(entry.retrySettlement(reason))
  } catch (error) {
    settlement = Promise.reject(error)
  }
  trackSettlement(entry, settlement)
  return true
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
  failures: readonly DetachedAuxiliaryConfirmationFailure[],
): void {
  const operationFailures = failures.flatMap(({ entry, settlement, error }) => {
    // Another Stop may have installed a fresh exact proof while this call
    // was still waiting for a different entry. The stale generation cannot
    // describe the liveness of the replacement.
    if (entry.settlement !== settlement) return []

    // A timeout wrapper can lose a close race to the exact promise. If that
    // promise fulfilled (or rejected ordinarily) before aggregation, it is
    // positive terminal evidence and the earlier timeout is now stale.
    if (
      entry.settled &&
      !(entry.settlementFailure instanceof StopConfirmationError)
    ) {
      return []
    }

    return [
      {
        operation: entry.operation,
        error:
          entry.settlementFailure instanceof StopConfirmationError
            ? entry.settlementFailure
            : error,
        settlementPending: !entry.settled,
        canRetrySettlement:
          !entry.settled || entry.retrySettlement !== undefined,
      },
    ]
  })
  if (operationFailures.length === 0) return
  throw new DetachedAuxiliaryStopConfirmationError(operationFailures)
}

async function confirmDetachedAuxiliaryEntry(
  entry: DetachedAuxiliaryEntry,
  reason: unknown,
): Promise<DetachedAuxiliaryConfirmationSnapshot | undefined> {
  const settlement = entry.settlement
  const cancellationSignal = new AbortController()
  cancellationSignal.abort(reason)

  try {
    await waitForAbortSettlement(
      settlement,
      cancellationSignal.signal,
      entry.abortGraceMs ?? DEFAULT_ABORT_SETTLEMENT_GRACE_MS,
      entry.operation,
    )
    if (entry.settlement !== settlement) {
      return { entry, settlement }
    }
    removeEntry(entry)
    return undefined
  } catch (error) {
    if (entry.settlement !== settlement) {
      return { entry, settlement }
    }
    if (error instanceof AbortSettlementTimeoutError) {
      return {
        entry,
        settlement,
        error: new StopConfirmationError(
          `${entry.operation} did not confirm termination after cancellation`,
          [error, ...(entry.failure === undefined ? [] : [entry.failure])],
        ),
      }
    }
    if (error instanceof StopConfirmationError) {
      return { entry, settlement, error }
    }
    // Other rejection proves the work is no longer running. Report it and
    // remove the affordance instead of manufacturing a false Stop failure.
    observeFailure(entry, error)
    removeEntry(entry)
    return undefined
  }
}

/**
 * Register auxiliary work without making it part of the foreground query
 * loading gate. Successful settlement and ordinary rejection remove the
 * record after reporting. Pending exact settlements and explicitly retryable
 * confirmation failures remain Esc-routable; a terminal non-retryable
 * StopConfirmationError is reported once and then released so it cannot
 * poison every later Stop.
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
  trackSettlement(entry, entry.settlement)
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
    if (retryUnconfirmedSettlement(entry, reason)) continue
    void startCancellation(entry, reason).catch(error => {
      observeFailure(entry, error)
    })
  }

  let failures = await Promise.all(
    entries.map(entry => confirmDetachedAuxiliaryEntry(entry, reason)),
  )

  // A concurrent Stop can replace a rejected proof through retrySettlement
  // while this call is still waiting for another entry. Follow each replacement
  // until every failure belongs to the currently published generation; never
  // report an old proof using a newer generation's mutable status.
  while (true) {
    const supersededIndexes = failures.flatMap((failure, index) =>
      failure && failure.entry.settlement !== failure.settlement ? [index] : [],
    )
    if (supersededIndexes.length === 0) break

    const replacements = await Promise.all(
      supersededIndexes.map(index =>
        confirmDetachedAuxiliaryEntry(entries[index]!, reason),
      ),
    )
    failures = failures.map((failure, index) => {
      const replacementIndex = supersededIndexes.indexOf(index)
      return replacementIndex === -1 ? failure : replacements[replacementIndex]
    })
  }

  throwTerminationFailures(
    failures.filter(
      (failure): failure is DetachedAuxiliaryConfirmationFailure =>
        failure?.error !== undefined,
    ),
  )
}

/** Test-only reset for module-level ownership state. */
export function resetDetachedAuxiliaryWorkForTests(): void {
  activeEntries.clear()
  nextId = 0
  changed.emit()
}
