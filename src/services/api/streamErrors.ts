import { APIUserAbortError } from '@anthropic-ai/sdk'

/**
 * undici (Node.js/Bun HTTP client) throws `TypeError("terminated")` when the
 * fetch controller transitions to 'terminated' state without being aborted —
 * e.g. server closes the SSE/stream response connection while it's still being
 * consumed. This is a transient network interruption, not a protocol error,
 * so it should be retried with exponential backoff.
 *
 * This function lives in its own module so it can be tested in isolation
 * without pulling in the full withRetry dependency graph.
 */
export function isStreamInterruptionError(error: unknown): boolean {
  if (error instanceof APIUserAbortError) return false
  if (!(error instanceof TypeError)) return false
  const msg = error.message.toLowerCase()
  return msg === 'terminated' || msg.includes('terminated')
}
