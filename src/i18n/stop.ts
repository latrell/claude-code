import { errorMessage } from '../utils/errors.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'
import { isDetachedAuxiliaryStopConfirmationError } from '../utils/detachedAuxiliaryWork.js'
import { t } from './t.js'

/**
 * Keep internal cancellation diagnostics out of user-facing notifications.
 * StopConfirmationError messages describe lifecycle operations for logs and
 * frequently contain implementation names that are not translation keys.
 */
export function localizedStopErrorMessage(error: unknown): string {
  if (error instanceof StopConfirmationError) {
    return t(
      'Termination could not be confirmed; the request may still be running.',
    )
  }
  return errorMessage(error)
}

/** Select actionable copy only when every failed detached owner has a retry. */
export function localizedDetachedAuxiliaryStopMessage(error: unknown): string {
  return t(
    isDetachedAuxiliaryStopConfirmationError(error) && error.canRetry
      ? 'Stop was requested, but one or more background requests may still be running. Press Esc again to retry.'
      : 'Stop was requested, but one or more background requests could not be confirmed as stopped and may still be running. Check the debug log for details.',
  )
}
