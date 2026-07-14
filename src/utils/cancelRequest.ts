export function canCancelRequest(
  abortSignal: AbortSignal | undefined,
  isExternalLoading: boolean,
  isQueryActive = false,
): boolean {
  return (
    isQueryActive ||
    isExternalLoading ||
    (abortSignal !== undefined && !abortSignal.aborted)
  )
}

export function isAuxiliaryOnlyCancellation({
  hasCancelableAuxiliaryWork,
  hasLocalQueryInFlight,
  isExternalLoading,
  hasMainAbortController,
}: {
  hasCancelableAuxiliaryWork: boolean
  hasLocalQueryInFlight: boolean
  isExternalLoading: boolean
  hasMainAbortController: boolean
}): boolean {
  return (
    hasCancelableAuxiliaryWork &&
    !hasLocalQueryInFlight &&
    !isExternalLoading &&
    !hasMainAbortController
  )
}

export function cancelActiveRequestSources({
  abortController,
  isRemoteMode,
  cancelRemoteRequest,
}: {
  abortController: AbortController | null
  isRemoteMode: boolean
  cancelRemoteRequest: () => void
}): void {
  // A remote-mode REPL can still execute local JSX commands. Cancel both
  // possible owners so choosing the UI mode never leaves the real request
  // running behind an already-reset interface.
  abortController?.abort('user-cancel')
  if (isRemoteMode) {
    cancelRemoteRequest()
  }
}
