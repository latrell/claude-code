export type InitialMessageProcessingRef = { current: boolean }

/**
 * Consume a normal submission while an initial message still owns startup.
 * A failed plan-exit clear leaves that message pending; the next submission
 * must wake the retry effect, never start an unrelated query in the partially
 * prepared replacement session.
 */
export function requestInitialMessageRetryFromSubmission({
  hasPendingInitialMessage,
  processingRef,
  requestRetry,
}: {
  hasPendingInitialMessage: boolean
  processingRef: InitialMessageProcessingRef
  requestRetry: () => void
}): boolean {
  if (!hasPendingInitialMessage) return false
  if (!processingRef.current) requestRetry()
  return true
}

/**
 * Run one initial-message attempt without leaving its re-entry latch stuck on
 * failure. The caller owns the visible error presentation because REPL state
 * and localization live outside this small lifecycle helper.
 */
export async function runInitialMessageAttempt({
  attempt,
  processingRef,
  onFailure,
}: {
  attempt: () => Promise<void>
  processingRef: InitialMessageProcessingRef
  onFailure: (error: unknown) => void
}): Promise<void> {
  try {
    await attempt()
  } catch (error) {
    processingRef.current = false
    onFailure(error)
  }
}
