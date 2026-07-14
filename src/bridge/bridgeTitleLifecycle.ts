import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from '../utils/abortSettlement.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'
import type { ReplBridgeHandle } from './replBridge.js'

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_CANCELLATION_TIMEOUT_MS = 1_500

export type BridgeTitleRequest = Readonly<{
  revision: number
  sessionId: string
  signal: AbortSignal
}>

export type BridgeTitleCancellation = Readonly<{
  revision: number
  synchronous: boolean
  settlement: Promise<void>
}>

export type BridgeTitleLifecycle = Readonly<{
  begin: (sessionId: string) => BridgeTitleRequest | undefined
  track: <T>(request: BridgeTitleRequest, promise: Promise<T>) => void
  isCurrent: (
    request: BridgeTitleRequest,
    currentSessionId: string | undefined,
  ) => boolean
  cancel: () => BridgeTitleCancellation
  isRevisionCurrent: (revision: number) => boolean
}>

type RequestScope = {
  controller: AbortController
  timeout: ReturnType<typeof setTimeout>
  trackedCount: number
}

/**
 * Owns title generation and PATCH requests for bridge turns. A replacement
 * turn invalidates and aborts the previous scope; completing a turn snapshots
 * every still-pending child and makes a bounded confirmation attempt before
 * the bridge can publish `idle`.
 */
export function createBridgeTitleLifecycle({
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  cancellationTimeoutMs = DEFAULT_CANCELLATION_TIMEOUT_MS,
}: {
  requestTimeoutMs?: number
  cancellationTimeoutMs?: number
} = {}): BridgeTitleLifecycle {
  let revision = 0
  const scopes = new Map<number, RequestScope>()
  const pending = new Set<Promise<unknown>>()
  const unconfirmedFailures: StopConfirmationError[] = []
  let titleCreationBlocked = false

  const abortScopes = (): void => {
    for (const scope of scopes.values()) {
      clearTimeout(scope.timeout)
      if (!scope.controller.signal.aborted) scope.controller.abort()
    }
  }

  const finishTracked = (
    request: BridgeTitleRequest,
    promise: Promise<unknown>,
    error?: unknown,
  ): void => {
    pending.delete(promise)
    if (error instanceof StopConfirmationError) {
      // Preserve the failure until the current owner reports it. It is drained
      // after reporting so an auxiliary title failure cannot permanently pin
      // every later bridge turn in a non-terminal state.
      unconfirmedFailures.push(error)
      titleCreationBlocked = true
    }

    const scope = scopes.get(request.revision)
    if (!scope) return
    scope.trackedCount -= 1
    if (scope.trackedCount <= 0) {
      clearTimeout(scope.timeout)
      scopes.delete(request.revision)
    }
  }

  const confirmCancellation = async (
    owned: Promise<unknown>[],
  ): Promise<void> => {
    const recordedFailures = unconfirmedFailures.splice(0)
    let results: PromiseSettledResult<unknown>[] = []
    if (owned.length > 0) {
      try {
        results = await waitForBoundedSettlement(Promise.allSettled(owned), {
          timeoutMs: cancellationTimeoutMs,
          abortGraceMs: 1,
          operation: 'bridge title request cancellation',
        })
      } catch (error) {
        if (error instanceof AbortSettlementTimeoutError) {
          throw new StopConfirmationError(
            'Bridge title request did not confirm termination after cancellation',
            [
              ...new Set([
                ...recordedFailures,
                ...unconfirmedFailures.splice(0),
              ]),
              error,
            ],
          )
        }
        throw error
      }
    }

    const failures = new Set([
      ...recordedFailures,
      ...unconfirmedFailures.splice(0),
    ])
    for (const result of results) {
      if (
        result.status === 'rejected' &&
        result.reason instanceof StopConfirmationError
      ) {
        failures.add(result.reason)
        titleCreationBlocked = true
      }
    }
    if (failures.size > 0) {
      throw new StopConfirmationError(
        'Bridge title request termination was not confirmed',
        [...failures],
      )
    }
  }

  return {
    begin(sessionId) {
      revision += 1
      abortScopes()
      // Never overlap a replacement title request with work that ignored the
      // prior abort. An explicit provider StopConfirmationError permanently
      // disables further title generation for this bridge lifecycle.
      if (pending.size > 0 || titleCreationBlocked) return undefined

      const controller = new AbortController()
      const requestRevision = revision
      const scope: RequestScope = {
        controller,
        timeout: setTimeout(() => controller.abort(), requestTimeoutMs),
        trackedCount: 0,
      }
      scopes.set(requestRevision, scope)
      return {
        revision: requestRevision,
        sessionId,
        signal: controller.signal,
      }
    },
    track<T>(request: BridgeTitleRequest, promise: Promise<T>): void {
      const owned = promise as Promise<unknown>
      const scope = scopes.get(request.revision)
      if (scope) scope.trackedCount += 1
      pending.add(owned)
      // Attach both handlers immediately: callers intentionally do not await
      // auxiliary title work, so this observer prevents unhandled rejections
      // while retaining StopConfirmationError for the owning handle.
      void owned.then(
        () => finishTracked(request, owned),
        error => finishTracked(request, owned, error),
      )
    },
    isCurrent(request, currentSessionId) {
      return (
        request.revision === revision &&
        request.sessionId === currentSessionId &&
        !request.signal.aborted
      )
    },
    cancel() {
      revision += 1
      const cancellationRevision = revision
      abortScopes()
      const owned = [...pending]
      const synchronous = owned.length === 0 && unconfirmedFailures.length === 0
      return {
        revision: cancellationRevision,
        synchronous,
        settlement: synchronous
          ? Promise.resolve()
          : confirmCancellation(owned),
      }
    },
    isRevisionCurrent(candidate) {
      return candidate === revision
    },
  }
}

/**
 * Delays the bridge result until title-owned work has confirmed cancellation.
 * A late result is suppressed if another turn starts meanwhile. Cancellation
 * failures are reported explicitly, but auxiliary title work must not
 * permanently pin the main bridge turn or teardown.
 */
export function wrapBridgeTitleLifecycle(
  handle: ReplBridgeHandle,
  lifecycle: BridgeTitleLifecycle,
  onUnconfirmedStop: (error: unknown) => void = () => {},
  {
    innerHandleOwnsTeardownCancellation = false,
  }: { innerHandleOwnsTeardownCancellation?: boolean } = {},
): ReplBridgeHandle {
  let teardownStarted = false
  let teardownPromise: Promise<void> | undefined

  const reportUnconfirmedStop = (error: unknown): void => {
    try {
      onUnconfirmedStop(error)
    } catch {
      // Diagnostics must never turn an already-observed auxiliary failure into
      // a process-level unhandled rejection.
    }
  }

  return {
    get bridgeSessionId() {
      return handle.bridgeSessionId
    },
    get environmentId() {
      return handle.environmentId
    },
    get sessionIngressUrl() {
      return handle.sessionIngressUrl
    },
    writeMessages(messages) {
      handle.writeMessages(messages)
    },
    writeSdkMessages(messages) {
      handle.writeSdkMessages(messages)
    },
    markTranscriptReset: handle.markTranscriptReset
      ? () => handle.markTranscriptReset?.()
      : undefined,
    sendControlRequest(request) {
      handle.sendControlRequest(request)
    },
    sendControlResponse(response) {
      handle.sendControlResponse(response)
    },
    sendControlCancelRequest(requestId) {
      handle.sendControlCancelRequest(requestId)
    },
    sendResult() {
      if (teardownStarted) return
      const cancellation = lifecycle.cancel()
      const publish = (): void => {
        if (
          !teardownStarted &&
          lifecycle.isRevisionCurrent(cancellation.revision)
        ) {
          handle.sendResult()
        }
      }

      if (cancellation.synchronous) {
        publish()
        return
      }
      void cancellation.settlement.then(publish, error => {
        reportUnconfirmedStop(error)
        publish()
      })
    },
    teardown() {
      if (teardownPromise) return teardownPromise
      teardownStarted = true
      const attempt = innerHandleOwnsTeardownCancellation
        ? handle.teardown()
        : lifecycle
            .cancel()
            .settlement.catch(error => reportUnconfirmedStop(error))
            .then(() => handle.teardown())
      teardownPromise = attempt
      // Preserve rejection for awaiters while also marking it handled for
      // cleanup registries that intentionally fire-and-forget teardown().
      void attempt.then(undefined, error => {
        reportUnconfirmedStop(error)
        if (teardownPromise === attempt) {
          teardownPromise = undefined
          teardownStarted = false
        }
      })
      return attempt
    },
  }
}
