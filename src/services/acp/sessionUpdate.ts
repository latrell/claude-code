import type { AgentSideConnection } from '@agentclientprotocol/sdk'
import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from '../../utils/abortSettlement.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'

export type AcpSessionUpdateParams = Parameters<
  AgentSideConnection['sessionUpdate']
>[0]

export type AcpSessionUpdateOptions = {
  signal: AbortSignal
  abortGraceMs: number
  operation: string
  /** Optional absolute deadline for non-critical, best-effort updates. */
  timeoutMs?: number
}

/**
 * Send one ACP notification without letting an abort-ignoring client transport
 * pin the prompt lifecycle forever.
 *
 * The SDK does not accept an AbortSignal for sessionUpdate(), so cancellation
 * cannot stop the underlying write directly. We still retain and observe its
 * promise, then require it to settle within a short grace period after the
 * prompt signal aborts. A missed grace period is an unconfirmed Stop, not a
 * successful cancellation.
 */
export async function sendAcpSessionUpdate(
  conn: AgentSideConnection,
  params: AcpSessionUpdateParams,
  { signal, abortGraceMs, operation, timeoutMs }: AcpSessionUpdateOptions,
): Promise<void> {
  signal.throwIfAborted()

  // Invoke synchronously so an abort cannot win a microtask gap and still
  // allow a new outbound write to start afterward.
  const write = Promise.resolve(conn.sessionUpdate(params))

  try {
    if (timeoutMs === undefined) {
      await waitForAbortSettlement(write, signal, abortGraceMs, operation)
    } else {
      await waitForBoundedSettlement(write, {
        signal,
        timeoutMs,
        abortGraceMs,
        operation,
      })
    }
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError && signal.aborted) {
      throw new StopConfirmationError(
        `${operation} did not confirm settlement after cancellation`,
        [error],
      )
    }
    throw error
  }
}
