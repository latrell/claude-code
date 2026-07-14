/**
 * Cancellation intent is not the same as confirmed termination. This error is
 * used when a Stop path dispatched cancellation but could not prove that all
 * owned execution/resources had actually settled.
 */
export class StopConfirmationError extends Error {
  readonly failures: readonly unknown[]

  constructor(message: string, failures: readonly unknown[] = []) {
    super(message)
    this.name = 'StopConfirmationError'
    this.failures = failures
  }
}
