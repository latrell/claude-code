export type PromiseSettlement<T> =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }

export type SettledPromise<T> = {
  /** The exact underlying settlement promise. */
  promise: Promise<T>
  /** Synchronous, zero-wait observation of the promise state. */
  peek(): PromiseSettlement<T>
}

/**
 * Adds synchronous settlement observation without replacing the exact promise
 * used by lifecycle owners. This is useful for speculative work: callers may
 * consume a result if it finished under foreground work, but must never await
 * it merely to decide whether the foreground turn can complete.
 */
export function trackPromiseSettlement<T>(
  promise: Promise<T>,
): SettledPromise<T> {
  let settlement: PromiseSettlement<T> = { status: 'pending' }
  const tracked = Promise.resolve(promise).then(
    value => {
      settlement = { status: 'fulfilled', value }
      return value
    },
    reason => {
      settlement = { status: 'rejected', reason }
      throw reason
    },
  )

  // `peek()` users may deliberately leave the promise to another lifecycle
  // owner. Observe the branch here so a rejection cannot become process-level
  // noise before that owner starts its drain.
  void tracked.catch(() => {})

  return {
    promise: tracked,
    peek: () => settlement,
  }
}
