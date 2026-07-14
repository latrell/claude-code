import { randomUUID } from 'node:crypto'
import { config } from '../config'
import type { SessionEvent } from '../transport/event-bus'
import { getEventBus } from '../transport/event-bus'
import { hasActiveWorkerTransport } from '../transport/worker-transports'
import { publishSessionEvent } from './transport'

const FALLBACK_INTERRUPT_ACK_TIMEOUT_MS = 5000

export type SessionInterruptFailureReason =
  | 'worker_unavailable'
  | 'timeout'
  | 'rejected'
  | 'delivery_failed'

export type SessionInterruptResult =
  | { ok: true; requestId: string }
  | {
      ok: false
      reason: SessionInterruptFailureReason
      message: string
      requestId?: string
    }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractControlResponse(
  event: SessionEvent,
): Record<string, unknown> | null {
  if (event.direction !== 'inbound' || event.type !== 'control_response') {
    return null
  }

  const payload = asRecord(event.payload)
  const raw = asRecord(payload?.raw)
  return asRecord(payload?.response) ?? asRecord(raw?.response)
}

function responseMessage(response: Record<string, unknown>): string {
  if (typeof response.error === 'string' && response.error) {
    return response.error
  }
  if (typeof response.message === 'string' && response.message) {
    return response.message
  }
  return 'Worker rejected the interrupt request'
}

/**
 * Deliver an interrupt to a live worker and wait for the matching
 * control_response. Publishing to the in-memory bus alone is not considered a
 * successful cancellation.
 */
export function requestSessionInterrupt(
  sessionId: string,
  timeoutMs = config.interruptAckTimeoutMs || FALLBACK_INTERRUPT_ACK_TIMEOUT_MS,
): Promise<SessionInterruptResult> {
  if (!hasActiveWorkerTransport(sessionId)) {
    return Promise.resolve({
      ok: false,
      reason: 'worker_unavailable',
      message: 'No live worker transport is available to receive the interrupt',
    })
  }

  const requestId = randomUUID()
  const bus = getEventBus(sessionId)
  const boundedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : FALLBACK_INTERRUPT_ACK_TIMEOUT_MS

  return new Promise(resolve => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let unsubscribe = () => {}
    let unsubscribeClose = () => {}

    const finish = (result: SessionInterruptResult) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      unsubscribe()
      unsubscribeClose()
      resolve(result)
    }

    unsubscribe = bus.subscribe(event => {
      const response = extractControlResponse(event)
      if (!response || response.request_id !== requestId) return

      if (response.subtype === 'success') {
        finish({ ok: true, requestId })
        return
      }

      finish({
        ok: false,
        reason: 'rejected',
        message: responseMessage(response),
        requestId,
      })
    })

    unsubscribeClose = bus.onClose(() => {
      finish({
        ok: false,
        reason: 'delivery_failed',
        message:
          'Session transport closed before the interrupt was acknowledged',
        requestId,
      })
    })
    if (settled) return

    timeout = setTimeout(() => {
      finish({
        ok: false,
        reason: 'timeout',
        message: `Worker did not acknowledge the interrupt within ${boundedTimeoutMs}ms`,
        requestId,
      })
    }, boundedTimeoutMs)

    try {
      publishSessionEvent(
        sessionId,
        'interrupt',
        { action: 'interrupt' },
        'outbound',
        requestId,
      )
    } catch (error) {
      finish({
        ok: false,
        reason: 'delivery_failed',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to publish the interrupt request',
        requestId,
      })
    }
  })
}
