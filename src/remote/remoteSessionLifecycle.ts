type MutableRef<T> = { current: T }

export type RemoteSessionLifecycleRefs = Readonly<{
  cancellationPending: MutableRef<boolean>
  cancellationGeneration: MutableRef<number>
  remoteCancellationUnconfirmed: MutableRef<boolean>
  remoteTurnActive: MutableRef<boolean>
  cancellationWarningShown: MutableRef<boolean>
  isCompacting: MutableRef<boolean>
  hasUpdatedTitle: MutableRef<boolean>
  responseTimeout: MutableRef<ReturnType<typeof setTimeout> | null>
}>

/**
 * Reset the main worker's Stop/loading gates when remote mode is removed.
 * Viewer-owned title work has a separate cross-config ownership gate and must
 * not be aborted-and-forgotten here.
 * Incrementing cancellationGeneration first also invalidates a late interrupt
 * ACK before clearing the state that ACK used to own.
 */
export function resetRemoteSessionLifecycle(
  refs: RemoteSessionLifecycleRefs,
  setIsLoading: (loading: boolean) => void,
  next: Readonly<{
    remoteTurnActive?: boolean
    /** Auxiliary only; retained for callers that publish Stop state separately. */
    titleOwnerActive?: boolean
    managerOwnerActive?: boolean
  }> = {},
): void {
  refs.cancellationGeneration.current += 1

  if (refs.responseTimeout.current) {
    clearTimeout(refs.responseTimeout.current)
    refs.responseTimeout.current = null
  }

  refs.cancellationPending.current = false
  refs.remoteCancellationUnconfirmed.current = false
  refs.remoteTurnActive.current = next.remoteTurnActive ?? false
  refs.cancellationWarningShown.current = false
  refs.isCompacting.current = false
  refs.hasUpdatedTitle.current = false
  setIsLoading(
    refs.remoteTurnActive.current || (next.managerOwnerActive ?? false),
  )
}

/** Start a manager callback epoch and return a guard for all of its callbacks. */
export function beginRemoteSessionCallbackGeneration(
  generation: MutableRef<number>,
): () => boolean {
  const ownedGeneration = ++generation.current
  return () => generation.current === ownedGeneration
}

/** Invalidate callbacks belonging to the manager currently being torn down. */
export function invalidateRemoteSessionCallbacks(
  generation: MutableRef<number>,
): void {
  generation.current += 1
}
