export class AbortSettlementTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AbortSettlementTimeoutError'
  }
}

/**
 * Await work normally, but once its AbortSignal fires require the promise to
 * settle within a short grace period. The abort has already been delivered to
 * the underlying transport/process; this guard prevents an abort-ignoring
 * adapter or teardown hook from blocking its owner's lifecycle forever.
 */
export function waitForAbortSettlement<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  graceMs: number,
  operation: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortListenerRegistered = false

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      if (abortListenerRegistered) {
        signal.removeEventListener('abort', onAbort)
        abortListenerRegistered = false
      }
    }
    const finishResolve = (value: T): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const finishReject = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = (): void => {
      if (timer !== undefined || settled) return
      timer = setTimeout(() => {
        finishReject(
          new AbortSettlementTimeoutError(
            `${operation} did not settle within ${graceMs}ms after abort`,
          ),
        )
      }, graceMs)
    }

    if (signal.aborted) onAbort()
    else {
      signal.addEventListener('abort', onAbort, { once: true })
      abortListenerRegistered = true
    }

    void promise.then(
      value => finishResolve(value),
      error => finishReject(error),
    )
  })
}

export type BoundedSettlementOptions = {
  signal?: AbortSignal
  timeoutMs: number
  abortGraceMs: number
  operation: string
  /** Dispatch cancellation to work that owns a separate controller. */
  onAbort?: (reason: unknown) => void
}

/**
 * Gives work an absolute deadline as well as a short settlement grace after
 * its parent is cancelled. Unlike an unref'ed timeout, this deadline is part
 * of the awaited lifecycle and is therefore guaranteed to fire under Bun's
 * test runner and in headless mode.
 */
export function waitForBoundedSettlement<T>(
  promise: Promise<T>,
  {
    signal,
    timeoutMs,
    abortGraceMs,
    operation,
    onAbort,
  }: BoundedSettlementOptions,
): Promise<T> {
  const deadlineController = new AbortController()
  const abort = (reason: unknown): void => {
    if (deadlineController.signal.aborted) return
    deadlineController.abort(reason)
    onAbort?.(reason)
  }
  const abortFromParent = (): void => abort(signal?.reason)

  if (signal?.aborted) abortFromParent()
  else signal?.addEventListener('abort', abortFromParent, { once: true })

  const timeout = setTimeout(
    () => abort(`${operation} exceeded ${timeoutMs}ms`),
    timeoutMs,
  )

  return waitForAbortSettlement(
    promise,
    deadlineController.signal,
    abortGraceMs,
    operation,
  ).finally(() => {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromParent)
  })
}
