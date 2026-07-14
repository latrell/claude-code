export type ReplBridgeTeardownRef = {
  current: Promise<void> | undefined
}

/**
 * Await the teardown observed by this initialization attempt, then release
 * that exact cached promise on both fulfillment and rejection. A rejected
 * teardown must fail the current re-initialization attempt, but it must not be
 * replayed forever by every later attempt.
 */
export async function awaitPendingReplBridgeTeardown(
  ref: ReplBridgeTeardownRef,
): Promise<void> {
  const teardown = ref.current
  if (!teardown) return

  try {
    await teardown
  } finally {
    if (ref.current === teardown) {
      ref.current = undefined
    }
  }
}
