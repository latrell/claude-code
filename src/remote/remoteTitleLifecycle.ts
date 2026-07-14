import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
} from '../utils/abortSettlement.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'

export type RemoteTitleRun = Readonly<{
  abortController: AbortController
  settled: Promise<void>
}>

type RemoteTitleCancellation = Readonly<{
  run: RemoteTitleRun
  settlement: Promise<boolean>
}>

/**
 * Owns title work across remote-session replacement. A config change may
 * cancel the current request, but it must not discard its settlement handle
 * or allow a new session to start overlapping title inference.
 */
export class RemoteTitleOwnership {
  private current: RemoteTitleRun | null = null
  private retiredUnconfirmed: RemoteTitleRun | null = null
  private cancellation: RemoteTitleCancellation | null = null
  private disabled = false

  get currentRun(): RemoteTitleRun | null {
    return this.current
  }

  /** Local work whose bounded cancellation/settlement is still pending. */
  get hasActiveOwner(): boolean {
    return this.current !== null || this.cancellation !== null
  }

  /** Whether replacement inference is unsafe, including an unconfirmed run. */
  get replacementBlocked(): boolean {
    return (
      this.disabled ||
      this.current !== null ||
      this.cancellation !== null ||
      this.retiredUnconfirmed !== null
    )
  }

  get hasUnconfirmedStop(): boolean {
    return this.retiredUnconfirmed !== null
  }

  owns(run: RemoteTitleRun): boolean {
    return (
      this.current === run ||
      this.cancellation?.run === run ||
      this.retiredUnconfirmed === run
    )
  }

  tryStart(run: RemoteTitleRun): boolean {
    if (this.replacementBlocked) return false
    this.current = run
    return true
  }

  /** Observe the title wrapper's own terminal settlement. */
  complete(run: RemoteTitleRun, unconfirmedStop = false): void {
    if (!this.owns(run)) return
    if (this.current === run) this.current = null
    if (unconfirmedStop) {
      this.retiredUnconfirmed = run
      this.disabled = true
    }
  }

  /**
   * Share cancellation of the exact owned run. The run remains an active
   * loading/Stop owner until this bounded settlement completes. A negative
   * result retires the handle behind a permanent replacement fuse.
   */
  cancel(reason: unknown, abortGraceMs = 2_000): Promise<boolean> | null {
    if (this.cancellation) return this.cancellation.settlement
    const run = this.current
    if (!run) return null

    let settlement: Promise<boolean>
    const raw = cancelRemoteTitleRun(run, reason, abortGraceMs)
    settlement = raw.then(
      confirmed => {
        this.finishCancellation(run, settlement, confirmed)
        return confirmed
      },
      () => {
        this.finishCancellation(run, settlement, false)
        return false
      },
    )
    this.cancellation = { run, settlement }
    return settlement
  }

  private finishCancellation(
    run: RemoteTitleRun,
    settlement: Promise<boolean>,
    confirmed: boolean,
  ): void {
    if (this.cancellation?.settlement !== settlement) return
    this.cancellation = null
    if (this.current === run) this.current = null
    if (!confirmed) {
      this.retiredUnconfirmed = run
      this.disabled = true
    }
  }
}

export type RemoteSessionOwnedWorkState = Readonly<{
  remoteTurnActive: boolean
  titleRunActive: boolean
  managerDisconnectActive?: boolean
  cancellationPending: boolean
  remoteCancellationUnconfirmed: boolean
  titleCancellationUnconfirmed: boolean
}>

/**
 * Publish the main session as idle after authoritative worker/control-plane
 * work ends. Viewer-owned title generation is auxiliary: it remains separately
 * cancellable, but must not keep the completed worker turn in `running`.
 * A title StopConfirmationError is still reported and fuses replacement title
 * inference through RemoteTitleOwnership.
 */
export function canPublishRemoteSessionIdle(
  state: RemoteSessionOwnedWorkState,
): boolean {
  return (
    !state.remoteTurnActive &&
    !state.managerDisconnectActive &&
    !state.cancellationPending &&
    !state.remoteCancellationUnconfirmed
  )
}

/** Keep Escape routable to live title work without treating it as main loading. */
export function hasCancelableRemoteTitleWork(
  state: Pick<RemoteSessionOwnedWorkState, 'titleRunActive'>,
): boolean {
  return state.titleRunActive
}

export type RemoteCancellationOutcome = Readonly<{
  mainTurnStopped: boolean
  titleStopUnconfirmed: boolean
}>

/** Separate authoritative worker termination from auxiliary title cleanup. */
export function resolveRemoteCancellationOutcome({
  managerCancelled,
  titleCancelled,
  remoteTurnActive,
}: {
  managerCancelled: boolean
  titleCancelled: boolean
  remoteTurnActive: boolean
}): RemoteCancellationOutcome {
  return {
    mainTurnStopped: managerCancelled || !remoteTurnActive,
    titleStopUnconfirmed: !titleCancelled,
  }
}

/** Only a physically settled prior chain may release the one-title-run latch. */
export function canRetryRemoteTitleAfterCancellation({
  hadTitleRun,
  titleCancelled,
}: {
  hadTitleRun: boolean
  titleCancelled: boolean
}): boolean {
  return hadTitleRun && titleCancelled
}

/**
 * Cancel a viewer-owned title request and wait for the original request chain
 * (title inference plus metadata update) to settle. A normal rejection still
 * proves ownership ended; StopConfirmationError and a missed deadline do not.
 */
export async function cancelRemoteTitleRun(
  run: RemoteTitleRun,
  reason: unknown,
  abortGraceMs = 2_000,
): Promise<boolean> {
  if (!run.abortController.signal.aborted) {
    run.abortController.abort(reason)
  }

  try {
    await waitForAbortSettlement(
      run.settled,
      run.abortController.signal,
      abortGraceMs,
      'remote session title cancellation',
    )
    return true
  } catch (error) {
    if (
      error instanceof StopConfirmationError ||
      error instanceof AbortSettlementTimeoutError
    ) {
      return false
    }
    // An ordinary rejection is terminal: the request chain is no longer live.
    return true
  }
}
