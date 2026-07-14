import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from './abortSettlement.js'
import { StopConfirmationError } from './stopConfirmation.js'

export type TurnCallbackSettlementOptions = {
  signal?: AbortSignal
  timeoutMs: number
  abortGraceMs: number
  operation: string
}

export type TurnCallbackExecution<T> = {
  /** Exact callback settlement; never replaced by a deadline wrapper. */
  settlement: Promise<T>
  /** Dispatch cancellation to the callback-owned signal. */
  cancel(reason?: unknown): void
}

/**
 * Starts an externally supplied callback under its own AbortController while
 * retaining the exact callback promise. Detached owners must keep this exact
 * settlement so a deadline failure cannot hide a callback that is still live.
 */
export function startTurnCallback<T>(
  callback: (signal: AbortSignal) => T | Promise<T>,
): TurnCallbackExecution<T> {
  const callbackController = new AbortController()
  const settlement = Promise.resolve().then(() =>
    callback(callbackController.signal),
  )
  // Ownership may transfer to a detached registry on the next synchronous
  // statement. Observe this branch so an immediate rejection is never noisy.
  void settlement.catch(() => {})

  return {
    settlement,
    cancel(reason?: unknown): void {
      if (!callbackController.signal.aborted) {
        callbackController.abort(reason)
      }
    },
  }
}

/** Apply foreground/failure-path bounds to a previously started callback. */
export async function waitForTurnCallback<T>(
  execution: TurnCallbackExecution<T>,
  { signal, timeoutMs, abortGraceMs, operation }: TurnCallbackSettlementOptions,
): Promise<T> {
  try {
    return await waitForBoundedSettlement(execution.settlement, {
      signal,
      timeoutMs,
      abortGraceMs,
      operation,
      onAbort: reason => execution.cancel(reason),
    })
  } catch (error) {
    if (error instanceof StopConfirmationError) throw error
    if (error instanceof AbortSettlementTimeoutError) {
      throw new StopConfirmationError(
        `${operation} did not confirm termination`,
        [error],
      )
    }
    throw error
  } finally {
    execution.cancel(`${operation} settled`)
  }
}

/**
 * Run an externally supplied turn callback without allowing it to retain the
 * REPL lifecycle forever. The callback receives an owned signal that is
 * aborted both when the turn is cancelled and when the absolute deadline is
 * reached. Existing callbacks may ignore the argument; the bounded waiter
 * still releases the QueryGuard and reports that termination was unconfirmed.
 */
export async function runTurnCallback<T>(
  callback: (signal: AbortSignal) => T | Promise<T>,
  options: TurnCallbackSettlementOptions,
): Promise<T> {
  return waitForTurnCallback(startTurnCallback(callback), options)
}
