import { useEffect, type RefObject } from 'react'

import type { QueuedCommand } from '../types/textInputTypes.js'
import { getCommandQueueSnapshot } from '../utils/messageQueueManager.js'

type UsePriorityNowInterruptParams = {
  abortControllerRef: RefObject<AbortController | null>
  queueSnapshot: readonly QueuedCommand[]
}

/**
 * Interrupt the query that was already active when a main-thread `now`
 * command arrived.
 *
 * The queue processor runs in an earlier passive effect. When the REPL was
 * idle, it can drain the command and synchronously publish the controller for
 * the new query before this effect runs. Re-checking the live queue prevents
 * that newly started query from being mistaken for the operation that the
 * command was intended to interrupt.
 */
export function usePriorityNowInterrupt({
  abortControllerRef,
  queueSnapshot,
}: UsePriorityNowInterruptParams): void {
  useEffect(() => {
    const hasPendingMainThreadInterrupt = getCommandQueueSnapshot().some(
      command => command.agentId === undefined && command.priority === 'now',
    )

    if (hasPendingMainThreadInterrupt) {
      abortControllerRef.current?.abort('interrupt')
    }
  }, [abortControllerRef, queueSnapshot])
}
