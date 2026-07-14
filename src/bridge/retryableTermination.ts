/**
 * Coalesce concurrent termination requests without retaining a settled
 * failure. Each later Stop gets a fresh attempt after false/rejection (and a
 * fresh liveness check after success) instead of replaying stale evidence.
 */
export function createRetryableTermination(
  startAttempt: (graceMs?: number, forceWaitMs?: number) => Promise<boolean>,
): (graceMs?: number, forceWaitMs?: number) => Promise<boolean> {
  let inFlight: Promise<boolean> | null = null

  return (graceMs?: number, forceWaitMs?: number): Promise<boolean> => {
    if (inFlight) return inFlight

    let tracked: Promise<boolean>
    tracked = Promise.resolve()
      .then(() => startAttempt(graceMs, forceWaitMs))
      .finally(() => {
        if (inFlight === tracked) inFlight = null
      })
    inFlight = tracked
    return tracked
  }
}
