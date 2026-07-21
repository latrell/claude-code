import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from '../../utils/abortSettlement.js'
import { AbortError } from '../../utils/errors.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'

const PROVIDER_ABORT_SETTLEMENT_GRACE_MS = 2_000

export async function waitForProviderAbortSettlement<T>(
  settlement: Promise<T>,
  signal: AbortSignal,
  operation: string,
  abortGraceMs = PROVIDER_ABORT_SETTLEMENT_GRACE_MS,
): Promise<T> {
  try {
    return await waitForAbortSettlement(
      settlement,
      signal,
      abortGraceMs,
      operation,
    )
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError) {
      throw new StopConfirmationError(
        `${operation} did not settle within ${abortGraceMs}ms after abort`,
        [error],
      )
    }
    throw error
  }
}

export type ProviderStreamGuardOptions = {
  abortGraceMs?: number
  returnTimeoutMs?: number
  operation?: string
}

/**
 * Consume an async iterator with cancellation checkpoints around every next().
 * Teardown is also bounded: a stuck return() is an unconfirmed Stop. A short
 * next() timeout remains provisional until the original next() and return()
 * either settle exactly or exhaust the teardown deadline; nested structured
 * confirmation failures remain authoritative.
 */
export async function* guardAsyncIterableCancellation<T>(
  stream: AsyncIterable<T>,
  signal: AbortSignal,
  {
    abortGraceMs = PROVIDER_ABORT_SETTLEMENT_GRACE_MS,
    returnTimeoutMs = PROVIDER_ABORT_SETTLEMENT_GRACE_MS,
    operation = 'Model provider stream',
  }: ProviderStreamGuardOptions = {},
): AsyncGenerator<T, void> {
  const iterator = stream[Symbol.asyncIterator]()
  let completed = false
  let iterationError: unknown
  let timedOutNext:
    | {
        promise: Promise<IteratorResult<T>>
        error: StopConfirmationError
      }
    | undefined
  let iteratorReturnPromise: Promise<IteratorResult<T>> | undefined
  const requestIteratorReturn = (): Promise<IteratorResult<T>> | undefined => {
    if (!iterator.return) return undefined
    if (!iteratorReturnPromise) {
      try {
        iteratorReturnPromise = Promise.resolve(iterator.return())
      } catch (error) {
        iteratorReturnPromise = Promise.reject(error)
      }
      // Abort can arrive while this generator is suspended at `yield`. Attach a
      // handler immediately, while retaining the rejection for finally to
      // classify when the consumer resumes/closes the generator.
      void iteratorReturnPromise.catch(() => undefined)
    }
    return iteratorReturnPromise
  }
  const onAbort = (): void => {
    if (!completed) requestIteratorReturn()
  }

  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      // waitForAbortSettlement intentionally allows an in-flight operation to
      // settle during its grace period. It is not itself an abort checkpoint:
      // without this check an abort-ignoring, chatty stream can keep resolving
      // every next() inside the grace and be consumed forever.
      if (signal.aborted) {
        throw new AbortError(`${operation} was aborted`)
      }

      let next: IteratorResult<T>
      const nextPromise = Promise.resolve(iterator.next())
      try {
        next = await waitForProviderAbortSettlement(
          nextPromise,
          signal,
          `${operation} next()`,
          abortGraceMs,
        )
      } catch (error) {
        // The short abort grace is only a provisional observation. Keep the
        // original next() promise so iterator teardown can still turn a late,
        // exact settlement into a confirmed Abort instead of permanently
        // caching "may still be running".
        if (
          error instanceof StopConfirmationError &&
          error.failures.some(
            failure => failure instanceof AbortSettlementTimeoutError,
          )
        ) {
          timedOutNext = { promise: nextPromise, error }
        }
        iterationError = error
        throw error
      }

      // Abort may race a successful next(). Never publish the post-abort value
      // or request another event; unwind through iterator.return() instead.
      if (signal.aborted) {
        throw new AbortError(`${operation} was aborted`)
      }

      if (next.done) {
        completed = true
        return
      }
      yield next.value
    }
  } catch (error) {
    iterationError = error
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (!completed) {
      if (!iterator.return) {
        if (
          signal.aborted &&
          !(iterationError instanceof StopConfirmationError)
        ) {
          // biome-ignore lint/correctness/noUnsafeFinally: an unconfirmed iterator close must override normal return/AbortError so Stop is not falsely confirmed.
          throw new StopConfirmationError(
            `${operation} cannot confirm cancellation because its iterator has no return()`,
            iterationError === undefined ? [] : [iterationError],
          )
        }
      } else {
        let teardownConfirmed = false
        try {
          const returning = requestIteratorReturn()!
          const teardownSettlement = timedOutNext
            ? Promise.all([
                timedOutNext.promise.catch(error => {
                  // Any ordinary fulfillment or rejection proves next()
                  // settled. A nested confirmation error explicitly says the
                  // owned provider request is still not known to be closed.
                  if (error instanceof StopConfirmationError) throw error
                  return { done: true as const, value: undefined }
                }),
                returning.catch(error => {
                  if (error instanceof StopConfirmationError) throw error
                  return { done: true as const, value: undefined }
                }),
              ]).then(() => undefined)
            : returning
          await waitForBoundedSettlement(teardownSettlement, {
            signal,
            timeoutMs: returnTimeoutMs,
            abortGraceMs: returnTimeoutMs,
            operation: `${operation} return()`,
          })
          teardownConfirmed = true
        } catch (returnError) {
          if (
            returnError instanceof StopConfirmationError &&
            returnError !== iterationError
          ) {
            // A nested guard's exact settlement can replace this guard's own
            // provisional timeout with a more authoritative confirmation
            // failure. Do not hide it behind the earlier observation.
            // biome-ignore lint/correctness/noUnsafeFinally: nested confirmation is more precise than this guard's provisional timeout.
            throw returnError
          }
          if (returnError instanceof AbortSettlementTimeoutError) {
            // A stuck next() already produced the most precise confirmation
            // failure. Do not replace it with a less useful return() timeout.
            if (!(iterationError instanceof StopConfirmationError)) {
              // biome-ignore lint/correctness/noUnsafeFinally: return() timeout is stronger than normal return/AbortError and must reach the Stop caller.
              throw new StopConfirmationError(
                `${operation} return() did not settle within ${returnTimeoutMs}ms`,
                iterationError === undefined
                  ? [returnError]
                  : [iterationError, returnError],
              )
            }
          } else if (iterationError === undefined) {
            // A rejected return() still confirms that iterator teardown
            // settled. Preserve a primary iteration error when one exists; for
            // an explicit consumer return, surface the teardown rejection.
            // biome-ignore lint/correctness/noUnsafeFinally: explicit iterator.return() has no primary error to preserve.
            throw returnError
          }
        }
        if (
          teardownConfirmed &&
          timedOutNext?.error === iterationError &&
          signal.aborted
        ) {
          // Both the exact in-flight next() and iterator.return() have now
          // settled. Override only the provisional timeout created by this
          // guard; a nested StopConfirmationError remains authoritative.
          // biome-ignore lint/correctness/noUnsafeFinally: exact teardown proof must replace this guard's stale provisional timeout.
          throw new AbortError(`${operation} was aborted`)
        }
      }
    }
  }
}

// Provider streams are the primary caller, while the generic name is also
// used for non-streaming-tool execution in query.ts.
export const guardProviderStreamCancellation = guardAsyncIterableCancellation
