type ConfirmedTerminationOptions = {
  stop: () => Promise<boolean>
  afterConfirmed: () => Promise<void>
  onUnconfirmed?: () => void
  onStopError?: (error: unknown) => void
}

/**
 * Runs destructive UI/state cleanup only after the execution backend confirms
 * termination. A false result or exception deliberately leaves all tracking
 * intact so the user can retry Stop and never sees a false terminal event.
 */
export async function runConfirmedTermination({
  stop,
  afterConfirmed,
  onUnconfirmed,
  onStopError,
}: ConfirmedTerminationOptions): Promise<boolean> {
  let confirmed: boolean
  try {
    confirmed = await stop()
  } catch (error) {
    onStopError?.(error)
    return false
  }

  if (!confirmed) {
    onUnconfirmed?.()
    return false
  }

  await afterConfirmed()
  return true
}
