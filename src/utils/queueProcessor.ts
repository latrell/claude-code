import type { QueuedCommand } from '../types/textInputTypes.js'
import {
  acknowledgeTaskNotificationLease,
  dequeue,
  dequeueAllMatching,
  getCommandQueue,
  hasCommandsInQueue,
  isConversationResetCommand,
  isSlashCommand,
  leaseTaskNotificationBatch,
  peek,
  retryTaskNotificationLease,
} from './messageQueueManager.js'

type ProcessQueueParams = {
  executeInput: (commands: QueuedCommand[]) => Promise<void>
  /** Re-check synchronous ownership immediately before touching the queue. */
  isExecutionActive?: () => boolean
  /** onQuery generation; REPL appends messages before its first awaited hook. */
  getExecutionGeneration?: () => number
}

export type ProcessQueueResult =
  | { processed: false }
  | { processed: true; execution: Promise<void> }

export class TaskNotificationDeliveryParkedError extends Error {
  constructor(public readonly cause?: unknown) {
    super('A background result could not be delivered after one retry.')
    this.name = 'TaskNotificationDeliveryParkedError'
  }
}

function startExecution(
  executeInput: ProcessQueueParams['executeInput'],
  commands: QueuedCommand[],
): Promise<void> {
  try {
    // Start synchronously: executeQueuedInput reserves QueryGuard before its
    // first await, preventing the dequeue-triggered React render from starting
    // a second queued turn.
    return executeInput(commands)
  } catch (error) {
    return Promise.reject(error)
  }
}

/**
 * Processes commands from the queue.
 *
 * Slash commands (starting with '/') and bash-mode commands are processed
 * one at a time so each goes through the executeInput path individually.
 * Bash commands need individual processing to preserve per-command error
 * isolation, exit codes, and progress UI. Other non-slash commands are
 * batched: all items **with the same mode** as the highest-priority item
 * are drained at once and passed as a single array to executeInput — each
 * becomes its own user message with its own UUID. Different modes
 * (e.g. prompt vs task-notification) are never mixed because they are
 * treated differently downstream. Conversation-reset commands form a hard
 * submission-order barrier so prompts on opposite sides of `/clear` (or an
 * alias) never share a model turn. Other slash commands retain priority order.
 *
 * The caller is responsible for ensuring no query is currently running
 * and for calling this function again after each command completes
 * until the queue is empty.
 *
 * @returns result with processed status
 */
export function processQueueIfReady({
  executeInput,
  isExecutionActive,
  getExecutionGeneration,
}: ProcessQueueParams): ProcessQueueResult {
  // A React effect can hold an idle render snapshot after another input has
  // synchronously acquired QueryGuard. Re-check the live owner here so a stale
  // effect cannot dequeue and preprocess a coordinator notification.
  if (isExecutionActive?.()) {
    return { processed: false }
  }

  // This processor runs on the REPL main thread between turns. Skip anything
  // addressed to a subagent — an unfiltered peek() returning a subagent
  // notification would set targetMode, dequeueAllMatching would find nothing
  // matching that mode with agentId===undefined, and we'd return processed:
  // false with the queue unchanged → the React effect never re-fires and any
  // queued user prompt stalls permanently.
  const isMainThread = (cmd: QueuedCommand) => cmd.agentId === undefined
  const mainThreadQueue = getCommandQueue().filter(isMainThread)
  const resetIndex = mainThreadQueue.findIndex(isConversationResetCommand)
  const executableCommands = new Set(
    resetIndex === -1
      ? mainThreadQueue
      : mainThreadQueue.slice(0, resetIndex + 1),
  )
  const isExecutableMainThread = (cmd: QueuedCommand) =>
    isMainThread(cmd) && executableCommands.has(cmd)

  const next = peek(isExecutableMainThread)
  if (!next) {
    return { processed: false }
  }

  // Slash commands and bash-mode commands are processed individually.
  // Bash commands need per-command error isolation, exit codes, and progress UI.
  if (isSlashCommand(next) || next.mode === 'bash') {
    const cmd = dequeue(isExecutableMainThread)!
    return {
      processed: true,
      execution: startExecution(executeInput, [cmd]),
    }
  }

  // Drain all non-slash-command items with the same mode at once.
  const targetMode = next.mode
  if (targetMode === 'task-notification') {
    const lease = leaseTaskNotificationBatch(
      cmd =>
        isExecutableMainThread(cmd) &&
        !isSlashCommand(cmd) &&
        cmd.mode === targetMode,
    )
    if (!lease) return { processed: false }

    const generationBeforeExecution = getExecutionGeneration?.()
    const execution = startExecution(executeInput, lease.commands).then(
      () => {
        // A task notification always becomes a user message and calls onQuery.
        // Fulfillment without a generation transition means preprocessing
        // returned before that handoff, so the lease is still uncommitted.
        const committed =
          generationBeforeExecution === undefined ||
          getExecutionGeneration?.() !== generationBeforeExecution
        if (committed) {
          acknowledgeTaskNotificationLease(lease)
        } else {
          const disposition = retryTaskNotificationLease(lease)
          if (disposition === 'parked') {
            throw new TaskNotificationDeliveryParkedError()
          }
        }
      },
      error => {
        const committed =
          generationBeforeExecution !== undefined &&
          getExecutionGeneration?.() !== generationBeforeExecution
        if (committed) {
          acknowledgeTaskNotificationLease(lease)
        } else {
          const disposition = retryTaskNotificationLease(lease)
          if (disposition === 'parked') {
            throw new TaskNotificationDeliveryParkedError(error)
          }
        }
        throw error
      },
    )
    return { processed: true, execution }
  }

  const commands = dequeueAllMatching(
    cmd =>
      isExecutableMainThread(cmd) &&
      !isSlashCommand(cmd) &&
      cmd.mode === targetMode,
  )
  if (commands.length === 0) {
    return { processed: false }
  }

  return {
    processed: true,
    execution: startExecution(executeInput, commands),
  }
}

/**
 * Checks if the queue has pending commands.
 * Use this to determine if queue processing should be triggered.
 */
export function hasQueuedCommands(): boolean {
  return hasCommandsInQueue()
}
