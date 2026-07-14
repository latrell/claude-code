const activeWorkerTransports = new Map<string, number>()

/**
 * Register a live transport that can receive control requests for a worker.
 * The returned cleanup function is idempotent so transport error/close paths
 * can safely converge on the same teardown.
 */
export function registerWorkerTransport(sessionId: string): () => void {
  activeWorkerTransports.set(
    sessionId,
    (activeWorkerTransports.get(sessionId) ?? 0) + 1,
  )

  let registered = true
  return () => {
    if (!registered) return
    registered = false

    const remaining = (activeWorkerTransports.get(sessionId) ?? 1) - 1
    if (remaining > 0) {
      activeWorkerTransports.set(sessionId, remaining)
    } else {
      activeWorkerTransports.delete(sessionId)
    }
  }
}

export function hasActiveWorkerTransport(sessionId: string): boolean {
  return (activeWorkerTransports.get(sessionId) ?? 0) > 0
}
