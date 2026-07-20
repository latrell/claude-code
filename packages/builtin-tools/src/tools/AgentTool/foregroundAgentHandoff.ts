import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from 'src/utils/abortSettlement.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'

const FOREGROUND_HANDOFF_TIMEOUT_MS = 10_000
const FOREGROUND_HANDOFF_DEADLINE_GRACE_MS = 2_000

type ForegroundAgentHandoffOptions = {
  timeoutMs?: number
  deadlineGraceMs?: number
}

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
  let confirmationError: StopConfirmationError | undefined
  try {
    await pendingNext
  } catch (error) {
    // Abort and ordinary rejection both prove that next() settled. An explicit
    // confirmation failure means the owned request may still be running and
    // must remain authoritative after the iterator cleanup attempt.
    if (error instanceof StopConfirmationError) confirmationError = error
  }

  if (iterator.return) {
    try {
      await iterator.return()
    } catch (error) {
      // A rejected return() has settled. Only the structured error that says
      // termination remains unconfirmed must block the replacement run.
      if (
        error instanceof StopConfirmationError &&
        confirmationError === undefined
      ) {
        confirmationError = error
      }
    }
  }

  if (confirmationError) throw confirmationError
}

/**
 * Wait for the old foreground generation under a fresh absolute deadline.
 *
 * Do not bind this wait to the foreground AbortSignal: backgrounding
 * intentionally aborts that signal before this function starts. Reusing it
 * would collapse the full handoff timeout to the short deadline grace and
 * race the nested provider iterator cleanup.
 */
export async function settleForegroundAgentHandoff<T>(
  iterator: AsyncIterator<T>,
  pendingNext: Promise<IteratorResult<T>>,
  taskId: string,
  {
    timeoutMs = FOREGROUND_HANDOFF_TIMEOUT_MS,
    deadlineGraceMs = FOREGROUND_HANDOFF_DEADLINE_GRACE_MS,
  }: ForegroundAgentHandoffOptions = {},
): Promise<void> {
  try {
    await waitForBoundedSettlement(
      closeForegroundAgentBeforeBackgrounding(iterator, pendingNext),
      {
        timeoutMs,
        abortGraceMs: deadlineGraceMs,
        operation: `Agent ${taskId} foreground handoff`,
      },
    )
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError) {
      throw new StopConfirmationError(
        `Agent ${taskId} foreground request did not settle during background handoff`,
        [error],
      )
    }
    throw error
  }
}
