import { feature } from 'bun:bundle'

export type ActiveTurnLifecycle = {
  readonly isActive: boolean
  subscribe: (listener: () => void) => () => void
}

/**
 * Keep aborting a turn across the dispatching -> running hand-off, then wait
 * until its finalization has released the lifecycle guard. During dispatch a
 * controller can be published after Stop arrives, so a one-shot abort is not
 * sufficient.
 */
export function waitForActiveTurnSettlement(
  getAbortController: () => AbortController | null,
  lifecycle: ActiveTurnLifecycle,
  cancellationSignal?: AbortSignal,
): Promise<void> {
  const abortPublishedController = (): void => {
    getAbortController()?.abort('remote-interrupt')
  }

  abortPublishedController()
  if (!lifecycle.isActive || cancellationSignal?.aborted) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    let didResolve = false
    let unsubscribe: (() => void) | undefined
    const finish = (): void => {
      if (didResolve) return
      didResolve = true
      unsubscribe?.()
      cancellationSignal?.removeEventListener('abort', finish)
      resolve()
    }
    const observe = (): void => {
      abortPublishedController()
      if (lifecycle.isActive || didResolve) return
      finish()
    }

    unsubscribe = lifecycle.subscribe(observe)
    cancellationSignal?.addEventListener('abort', finish, { once: true })
    // Close the gap between the initial snapshot and subscription without
    // relying on the lifecycle implementation to replay its current state.
    observe()
    if (didResolve) unsubscribe()
  })
}

export function handleRemoteInterrupt(
  abortController: AbortController | null,
  waitForSettlement: (cancellationSignal?: AbortSignal) => Promise<void> = () =>
    Promise.resolve(),
  settlementTimeoutMs = 10_000,
): Promise<boolean> {
  if (feature('PROACTIVE') || feature('KAIROS')) {
    const { pauseProactive } =
      require('../proactive/index.js') as typeof import('../proactive/index.js')
    pauseProactive()
  }

  abortController?.abort('remote-interrupt')
  const timeoutController = new AbortController()
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>(resolve => {
    timeout = setTimeout(() => {
      timedOut = true
      timeoutController.abort('remote interrupt settlement timed out')
      resolve()
    }, settlementTimeoutMs)
  })
  const settlement = Promise.resolve().then(() =>
    waitForSettlement(timeoutController.signal),
  )

  return Promise.race([settlement, deadline])
    .then(() => !timedOut)
    .finally(() => {
      if (timeout !== undefined) clearTimeout(timeout)
      timeoutController.abort('remote interrupt settlement finished')
      // Promise.race does not observe a late rejection from a custom waiter.
      // Keep it handled after the caller has received the negative ACK.
      void settlement.catch(() => {})
    })
}
