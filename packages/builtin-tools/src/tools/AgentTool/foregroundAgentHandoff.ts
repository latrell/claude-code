/**
 * Fully stop a foreground agent iterator before starting its replacement
 * background run.
 *
 * The caller must abort the foreground controller before invoking this helper.
 * AsyncGenerator.return() is queued behind an outstanding next(), so waiting
 * for that next() first is required to avoid starting two runAgent instances
 * concurrently.
 */
export async function closeForegroundAgentBeforeBackgrounding<T>(
  iterator: AsyncIterator<T>,
  pendingNext: Promise<IteratorResult<T>>,
): Promise<void> {
  try {
    await pendingNext
  } catch {
    // The foreground controller was intentionally aborted for the handoff.
  }

  if (!iterator.return) {
    return
  }

  try {
    await iterator.return()
  } catch {
    // Cleanup failures must not turn an intentional handoff into an error.
  }
}
