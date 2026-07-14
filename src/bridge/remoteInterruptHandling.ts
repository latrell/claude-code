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
): Promise<void> {
  const abortPublishedController = (): void => {
    getAbortController()?.abort('remote-interrupt')
  }

  abortPublishedController()
  if (!lifecycle.isActive) return Promise.resolve()

  return new Promise(resolve => {
    let didResolve = false
    let unsubscribe: (() => void) | undefined
    const observe = (): void => {
      abortPublishedController()
      if (lifecycle.isActive || didResolve) return
      didResolve = true
      unsubscribe?.()
      resolve()
    }

    unsubscribe = lifecycle.subscribe(observe)
    // Close the gap between the initial snapshot and subscription without
    // relying on the lifecycle implementation to replay its current state.
    observe()
    if (didResolve) unsubscribe()
  })
}

export function handleRemoteInterrupt(
  abortController: AbortController | null,
  waitForSettlement: () => Promise<void> = () => Promise.resolve(),
): Promise<boolean> {
  if (feature('PROACTIVE') || feature('KAIROS')) {
    const { pauseProactive } =
      require('../proactive/index.js') as typeof import('../proactive/index.js')
    pauseProactive()
  }

  abortController?.abort('remote-interrupt')
  return waitForSettlement().then(() => true)
}
