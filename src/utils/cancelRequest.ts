export function canCancelRequest(
  abortSignal: AbortSignal | undefined,
  isExternalLoading: boolean,
): boolean {
  return (
    isExternalLoading || (abortSignal !== undefined && !abortSignal.aborted)
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
