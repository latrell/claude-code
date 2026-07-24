import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Permutations } from 'src/types/utils.js'
import { getSessionId } from '../bootstrap/state.js'
import type { AppState } from '../state/AppState.js'
import type {
  QueueOperation,
  QueueOperationMessage,
} from '../types/messageQueueTypes.js'
import type {
  EditablePromptInputMode,
  PromptInputMode,
  QueuedCommand,
  QueuePriority,
} from '../types/textInputTypes.js'
import type { PastedContent } from './config.js'
import { extractTextContent } from './messages.js'
import { objectGroupBy } from './objectGroupBy.js'
import { recordQueueOperation } from './sessionStorage.js'
import { createSignal } from './signal.js'

export type SetAppState = (f: (prev: AppState) => AppState) => void
export type CommandQueueOwner = QueuedCommand['agentId']

// ============================================================================
// Logging helper
// ============================================================================

function logOperation(operation: QueueOperation, content?: string): void {
  const sessionId = getSessionId()
  const queueOp: QueueOperationMessage = {
    type: 'queue-operation',
    operation,
    timestamp: new Date().toISOString(),
    sessionId,
    ...(content !== undefined && { content }),
  }
  void recordQueueOperation(queueOp)
}

// ============================================================================
// Unified command queue (module-level, independent of React state)
//
// All commands — user input, task notifications, orphaned permissions — go
// through this single queue. React components subscribe via
// useSyncExternalStore (subscribeToCommandQueue / getCommandQueueSnapshot).
// Non-React code (print.ts streaming loop) reads directly via
// getCommandQueue() / getCommandQueueLength().
//
// Priority determines dequeue order: 'now' > 'next' > 'later'. Within the same
// priority, commands are processed FIFO. Conversation-reset commands form a
// hard submission-order barrier so post-clear work cannot run in old context.
// ============================================================================

const commandQueue: QueuedCommand[] = []
type CommandQueueMetadata = {
  sequence: number
  taskNotificationFailures?: number
  taskNotificationParked?: boolean
  taskNotificationRetryAt?: number
}

type ConversationClearQueueBarrier = Readonly<CommandQueueMetadata>

export type TaskNotificationLease = Readonly<{
  id: number
  commands: QueuedCommand[]
}>

export type TaskNotificationLeaseFailureDisposition =
  | 'retry-scheduled'
  | 'parked'
  | 'invalidated'

type ActiveTaskNotificationLease = {
  lease: TaskNotificationLease
  retryableCommands: QueuedCommand[]
}

const TASK_NOTIFICATION_RETRY_DELAY_MS = 250
const MAX_AUTOMATIC_TASK_NOTIFICATION_RETRIES = 1

let commandMetadataByCommand = new WeakMap<
  QueuedCommand,
  CommandQueueMetadata
>()
let lastEnqueuedSequence = 0
let nextTaskNotificationLeaseId = 0
const activeTaskNotificationLeases = new Map<
  number,
  ActiveTaskNotificationLease
>()
let taskNotificationRetryTimer: ReturnType<typeof setTimeout> | undefined
/** Frozen snapshot — recreated on every mutation for useSyncExternalStore. */
let snapshot: readonly QueuedCommand[] = Object.freeze([])
const queueChanged = createSignal()

function getCommandMetadata(command: QueuedCommand): CommandQueueMetadata {
  const existing = commandMetadataByCommand.get(command)
  if (existing) return existing
  const metadata = { sequence: ++lastEnqueuedSequence }
  commandMetadataByCommand.set(command, metadata)
  return metadata
}

function isTaskNotificationUnavailable(
  command: QueuedCommand,
  now = Date.now(),
): boolean {
  if (command.mode !== 'task-notification') return false
  const metadata = commandMetadataByCommand.get(command)
  return (
    metadata?.taskNotificationParked === true ||
    (metadata?.taskNotificationRetryAt !== undefined &&
      metadata.taskNotificationRetryAt > now)
  )
}

function isBlockedByEarlierUnavailableTaskNotification(
  command: QueuedCommand,
  index: number,
  filter: ((cmd: QueuedCommand) => boolean) | undefined,
  now: number,
): boolean {
  if (command.mode !== 'task-notification') return false
  const priority = command.priority ?? 'next'
  for (let i = 0; i < index; i++) {
    const earlier = commandQueue[i]!
    if (filter && !filter(earlier)) continue
    if (
      earlier.mode === 'task-notification' &&
      earlier.agentId === command.agentId &&
      (earlier.priority ?? 'next') === priority &&
      isTaskNotificationUnavailable(earlier, now)
    ) {
      return true
    }
  }
  return false
}

function isCommandSelectable(
  command: QueuedCommand,
  index: number,
  filter?: (cmd: QueuedCommand) => boolean,
  now = Date.now(),
): boolean {
  return (
    (!filter || filter(command)) &&
    !isTaskNotificationUnavailable(command, now) &&
    !isBlockedByEarlierUnavailableTaskNotification(command, index, filter, now)
  )
}

function getSelectableCommands(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const now = Date.now()
  return commandQueue.filter((command, index) =>
    isCommandSelectable(command, index, filter, now),
  )
}

function notifySubscribers(): void {
  snapshot = Object.freeze(getSelectableCommands())
  queueChanged.emit()
}

function clearTaskNotificationRetryTimer(): void {
  if (taskNotificationRetryTimer === undefined) return
  clearTimeout(taskNotificationRetryTimer)
  taskNotificationRetryTimer = undefined
}

function scheduleTaskNotificationRetryWake(): void {
  clearTaskNotificationRetryTimer()
  let earliestRetryAt = Infinity
  for (const command of commandQueue) {
    const retryAt =
      commandMetadataByCommand.get(command)?.taskNotificationRetryAt
    if (retryAt !== undefined && retryAt < earliestRetryAt) {
      earliestRetryAt = retryAt
    }
  }
  if (earliestRetryAt === Infinity) return
  taskNotificationRetryTimer = setTimeout(
    releaseDueTaskNotificationRetries,
    Math.max(0, earliestRetryAt - Date.now()),
  )
}

function resetParkedTaskNotifications(agentId: CommandQueueOwner): boolean {
  let reactivated = false
  for (const command of commandQueue) {
    if (command.agentId !== agentId) continue
    const metadata = commandMetadataByCommand.get(command)
    if (!metadata?.taskNotificationParked) continue
    metadata.taskNotificationFailures = 0
    metadata.taskNotificationParked = false
    metadata.taskNotificationRetryAt = undefined
    reactivated = true
  }
  return reactivated
}

/**
 * Make one conversation owner's parked task notifications selectable after
 * fresh external input. Callers at real user-input boundaries must invoke this
 * explicitly; generic queue producers include internal automation and must not
 * revive failed delivery for another turn or owner.
 */
export function reactivateParkedTaskNotifications(
  agentId: CommandQueueOwner = undefined,
): void {
  if (resetParkedTaskNotifications(agentId)) notifySubscribers()
}

/**
 * Permanently discard one owner's parked deliveries when its external input
 * boundary has closed and no future user turn can reactivate them.
 */
export function discardParkedTaskNotificationsAddressedTo(
  agentId: CommandQueueOwner,
): number {
  return removeByFilter(command => {
    if (command.mode !== 'task-notification' || command.agentId !== agentId) {
      return false
    }
    return (
      commandMetadataByCommand.get(command)?.taskNotificationParked === true
    )
  }).length
}

// ============================================================================
// useSyncExternalStore interface
// ============================================================================

/**
 * Subscribe to command queue changes.
 * Compatible with React's useSyncExternalStore.
 */
export const subscribeToCommandQueue = queueChanged.subscribe

/**
 * Get current snapshot of the command queue.
 * Compatible with React's useSyncExternalStore.
 * Returns a frozen array that only changes reference on mutation.
 */
export function getCommandQueueSnapshot(): readonly QueuedCommand[] {
  return snapshot
}

// ============================================================================
// Read operations (for non-React code)
// ============================================================================

/**
 * Get a mutable copy of the current queue.
 * Use for one-off reads where you need the actual commands.
 */
export function getCommandQueue(): QueuedCommand[] {
  return [...commandQueue]
}

/**
 * Get the current queue length without copying.
 */
export function getCommandQueueLength(): number {
  return getSelectableCommands().length
}

/**
 * Check if there are commands in the queue.
 */
export function hasCommandsInQueue(): boolean {
  return getSelectableCommands().length > 0
}

/**
 * Check whether the queue contains work addressed to one conversation owner.
 *
 * The queue is process-global and shared by the main thread and all in-process
 * subagents. Consumers must not use the global length as a liveness signal:
 * an item for an exited subagent has no bearing on whether the main thread is
 * busy (and vice versa).
 */
export function hasCommandsAddressedTo(agentId: CommandQueueOwner): boolean {
  return (
    getSelectableCommands(command => command.agentId === agentId).length > 0
  )
}

/**
 * Whether one owner has a task notification waiting for an automatic retry.
 * Parked notifications are intentionally excluded: they can only be revived
 * by fresh external input, so a query-local completion gate must not wait on
 * them forever. Active leases are excluded as well because the current turn
 * may own that lease itself.
 */
export function hasRetryingTaskNotificationDeliveryAddressedTo(
  agentId: CommandQueueOwner,
): boolean {
  const now = Date.now()
  return commandQueue.some(command => {
    if (command.mode !== 'task-notification' || command.agentId !== agentId) {
      return false
    }
    const metadata = commandMetadataByCommand.get(command)
    return (
      metadata?.taskNotificationParked !== true &&
      metadata?.taskNotificationRetryAt !== undefined &&
      metadata.taskNotificationRetryAt > now
    )
  })
}

/** Whether one owner's failed task notification is awaiting external input. */
export function hasParkedTaskNotificationDeliveryAddressedTo(
  agentId: CommandQueueOwner,
): boolean {
  return commandQueue.some(command => {
    if (command.mode !== 'task-notification' || command.agentId !== agentId) {
      return false
    }
    return (
      commandMetadataByCommand.get(command)?.taskNotificationParked === true
    )
  })
}

/**
 * Whether one owner still has a task notification anywhere in its delivery
 * lifecycle. Unlike selectable queue reads, this includes retry backoff,
 * parked commands, and commands temporarily removed under an active lease.
 */
export function hasTaskNotificationDeliveryAddressedTo(
  agentId: CommandQueueOwner,
): boolean {
  if (
    commandQueue.some(
      command =>
        command.mode === 'task-notification' && command.agentId === agentId,
    )
  ) {
    return true
  }
  for (const active of activeTaskNotificationLeases.values()) {
    if (
      active.retryableCommands.some(
        command =>
          command.mode === 'task-notification' && command.agentId === agentId,
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * Trigger a re-check by notifying subscribers.
 * Use after async processing completes to ensure remaining commands
 * are picked up by useSyncExternalStore consumers.
 */
export function recheckCommandQueue(): void {
  if (getSelectableCommands().length > 0) {
    notifySubscribers()
  }
}

// ============================================================================
// Write operations
// ============================================================================

/**
 * Add a command to the queue.
 * Used for both user-initiated and internal commands. This function never
 * treats enqueueing as external activity; user-input boundaries must call
 * reactivateParkedTaskNotifications() themselves.
 * Defaults priority to 'next' (processed before task notifications).
 */
export function enqueue(command: QueuedCommand): void {
  const queuedCommand = { ...command, priority: command.priority ?? 'next' }
  stampCommandQueuePosition(queuedCommand)
  commandQueue.push(queuedCommand)
  notifySubscribers()
  logOperation(
    'enqueue',
    typeof command.value === 'string' ? command.value : undefined,
  )
}

/**
 * Add a task notification to the queue.
 * Convenience wrapper that defaults priority to 'later' so user input
 * is never starved by system messages.
 */
export function enqueuePendingNotification(command: QueuedCommand): void {
  const queuedCommand = { ...command, priority: command.priority ?? 'later' }
  stampCommandQueuePosition(queuedCommand)
  commandQueue.push(queuedCommand)
  notifySubscribers()
  logOperation(
    'enqueue',
    typeof command.value === 'string' ? command.value : undefined,
  )
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
}

function findBestCommandIndex(
  filter?: (cmd: QueuedCommand) => boolean,
): number {
  const now = Date.now()
  let bestIdx = -1
  let bestPriority = Infinity
  for (let i = 0; i < commandQueue.length; i++) {
    const command = commandQueue[i]!
    if (!isCommandSelectable(command, i, filter, now)) continue
    const priority = PRIORITY_ORDER[command.priority ?? 'next']
    if (priority < bestPriority) {
      bestIdx = i
      bestPriority = priority
    }
  }
  return bestIdx
}

/**
 * Remove and return the highest-priority command, or undefined if empty.
 * Within the same priority level, commands are dequeued FIFO.
 *
 * An optional `filter` narrows the candidates: only commands for which the
 * predicate returns `true` are considered. Non-matching commands stay in the
 * queue untouched. This lets between-turn drains (SDK, REPL) restrict to
 * main-thread commands (`cmd.agentId === undefined`) without restructuring
 * the existing while-loop patterns.
 */
export function dequeue(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  const bestIdx = findBestCommandIndex(filter)
  if (bestIdx === -1) return undefined

  const [dequeued] = commandQueue.splice(bestIdx, 1)
  scheduleTaskNotificationRetryWake()
  notifySubscribers()
  logOperation('dequeue')
  return dequeued
}

/**
 * Remove and return all commands from the queue.
 * Logs a dequeue operation for each command.
 */
export function dequeueAll(): QueuedCommand[] {
  if (commandQueue.length === 0) {
    return []
  }

  const commands = [...commandQueue]
  commandQueue.length = 0
  clearTaskNotificationRetryTimer()
  notifySubscribers()

  for (const _cmd of commands) {
    logOperation('dequeue')
  }

  return commands
}

/**
 * Return the highest-priority command without removing it, or undefined if empty.
 * Accepts an optional `filter` — only commands passing the predicate are considered.
 */
export function peek(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }
  const bestIdx = findBestCommandIndex(filter)
  if (bestIdx === -1) return undefined
  return commandQueue[bestIdx]
}

/**
 * Remove and return all commands matching a predicate, preserving priority order.
 * Non-matching commands stay in the queue.
 */
export function dequeueAllMatching(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const matched: QueuedCommand[] = []
  const remaining: QueuedCommand[] = []
  const now = Date.now()
  for (let index = 0; index < commandQueue.length; index++) {
    const cmd = commandQueue[index]!
    if (isCommandSelectable(cmd, index, predicate, now)) {
      matched.push(cmd)
    } else {
      remaining.push(cmd)
    }
  }
  if (matched.length === 0) {
    return []
  }
  commandQueue.length = 0
  commandQueue.push(...remaining)
  scheduleTaskNotificationRetryWake()
  notifySubscribers()
  for (const _cmd of matched) {
    logOperation('dequeue')
  }
  return matched
}

function reinsertCommandsByOriginalSequence(
  commands: readonly QueuedCommand[],
): void {
  const ordered = [...commands].sort(
    (left, right) =>
      getCommandMetadata(left).sequence - getCommandMetadata(right).sequence,
  )
  for (const command of ordered) {
    const sequence = getCommandMetadata(command).sequence
    const insertAt = commandQueue.findIndex(
      queued => getCommandMetadata(queued).sequence > sequence,
    )
    if (insertAt === -1) {
      commandQueue.push(command)
    } else {
      commandQueue.splice(insertAt, 0, command)
    }
  }
}

/**
 * Lease all currently executable task notifications matching a queue scope.
 * Leased commands leave the visible queue until the caller explicitly ACKs
 * them or returns them via retryTaskNotificationLease().
 */
export function leaseTaskNotificationBatch(
  predicate: (cmd: QueuedCommand) => boolean,
): TaskNotificationLease | undefined {
  const commands: QueuedCommand[] = []
  const remaining: QueuedCommand[] = []
  const now = Date.now()
  for (let index = 0; index < commandQueue.length; index++) {
    const command = commandQueue[index]!
    if (
      command.mode === 'task-notification' &&
      isCommandSelectable(command, index, predicate, now)
    ) {
      getCommandMetadata(command).taskNotificationRetryAt = undefined
      commands.push(command)
    } else {
      remaining.push(command)
    }
  }
  if (commands.length === 0) return undefined

  commandQueue.length = 0
  commandQueue.push(...remaining)
  const lease: TaskNotificationLease = {
    id: ++nextTaskNotificationLeaseId,
    commands,
  }
  activeTaskNotificationLeases.set(lease.id, {
    lease,
    retryableCommands: [...commands],
  })
  scheduleTaskNotificationRetryWake()
  notifySubscribers()
  for (const _command of commands) {
    logOperation('dequeue')
  }
  return lease
}

/** Confirm that a leased notification batch was handed to a model turn. */
export function acknowledgeTaskNotificationLease(
  lease: TaskNotificationLease,
): void {
  const active = activeTaskNotificationLeases.get(lease.id)
  if (active?.lease !== lease) return
  activeTaskNotificationLeases.delete(lease.id)
}

/** ACK a committed lease before publishing any fallible downstream event. */
export function commitTaskNotificationLease(
  lease: TaskNotificationLease,
  afterAcknowledge?: () => void,
): void {
  acknowledgeTaskNotificationLease(lease)
  afterAcknowledge?.()
}

/**
 * Return a pre-query failed notification batch to its original queue position.
 * The first failure gets one automatic delayed retry. A second consecutive
 * failure is parked until fresh external input explicitly reactivates it.
 */
export function retryTaskNotificationLease(
  lease: TaskNotificationLease,
): TaskNotificationLeaseFailureDisposition {
  const active = activeTaskNotificationLeases.get(lease.id)
  if (active?.lease !== lease) return 'invalidated'
  activeTaskNotificationLeases.delete(lease.id)
  if (active.retryableCommands.length === 0) return 'invalidated'

  const retryAt = Date.now() + TASK_NOTIFICATION_RETRY_DELAY_MS
  const failuresByCommand = active.retryableCommands.map(command => ({
    command,
    failures: (getCommandMetadata(command).taskNotificationFailures ?? 0) + 1,
  }))
  // A lease is one delivery unit. If an older command has exhausted its
  // retry while a newer command is still fresh, parking only the older one
  // would make the same-owner FIFO barrier hide the newer retry forever and
  // suppress the visible parked error. Park the entire failed batch instead.
  const shouldParkBatch = failuresByCommand.some(
    ({ failures }) => failures > MAX_AUTOMATIC_TASK_NOTIFICATION_RETRIES,
  )
  for (const { command, failures } of failuresByCommand) {
    const metadata = getCommandMetadata(command)
    metadata.taskNotificationFailures = failures
    if (!shouldParkBatch) {
      metadata.taskNotificationParked = false
      metadata.taskNotificationRetryAt = retryAt
    } else {
      metadata.taskNotificationParked = true
      metadata.taskNotificationRetryAt = undefined
    }
  }

  reinsertCommandsByOriginalSequence(active.retryableCommands)
  scheduleTaskNotificationRetryWake()
  notifySubscribers()
  return shouldParkBatch ? 'parked' : 'retry-scheduled'
}

/**
 * Release expired retry backoffs and wake queue subscribers. The optional
 * timestamp also makes the scheduler boundary deterministic in unit tests.
 */
export function releaseDueTaskNotificationRetries(now = Date.now()): void {
  clearTaskNotificationRetryTimer()
  let released = false
  for (const command of commandQueue) {
    const metadata = commandMetadataByCommand.get(command)
    if (
      metadata?.taskNotificationRetryAt !== undefined &&
      metadata.taskNotificationRetryAt <= now
    ) {
      metadata.taskNotificationRetryAt = undefined
      released = true
    }
  }
  if (released) notifySubscribers()
  scheduleTaskNotificationRetryWake()
}

/**
 * Remove specific commands from the queue by reference identity.
 * Callers must pass the same object references that are in the queue
 * (e.g. from getCommandsByMaxPriority). Logs a 'remove' operation for each.
 */
export function remove(commandsToRemove: QueuedCommand[]): void {
  if (commandsToRemove.length === 0) {
    return
  }

  const before = commandQueue.length
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (commandsToRemove.includes(commandQueue[i]!)) {
      commandQueue.splice(i, 1)
    }
  }

  if (commandQueue.length !== before) {
    scheduleTaskNotificationRetryWake()
    notifySubscribers()
  }

  for (const _cmd of commandsToRemove) {
    logOperation('remove')
  }
}

/**
 * Remove commands matching a predicate.
 * Returns the removed commands.
 */
export function removeByFilter(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const removed: QueuedCommand[] = []
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (predicate(commandQueue[i]!)) {
      removed.unshift(commandQueue.splice(i, 1)[0]!)
    }
  }

  if (removed.length > 0) {
    scheduleTaskNotificationRetryWake()
    notifySubscribers()
    for (const _cmd of removed) {
      logOperation('remove')
    }
  }

  return removed
}

/**
 * Clear all commands from the queue.
 * Used by ESC cancellation to discard queued notifications.
 */
export function clearCommandQueue(): void {
  const hadQueuedCommands = commandQueue.length > 0
  commandQueue.length = 0
  activeTaskNotificationLeases.clear()
  clearTaskNotificationRetryTimer()
  if (hadQueuedCommands) notifySubscribers()
}

/**
 * Assign a submission-order position to a command without enqueueing it.
 * Direct commands need this stamp before their first await so later user input
 * is ordered after them just like input submitted through the shared queue.
 */
export function stampCommandQueuePosition(command: QueuedCommand): void {
  getCommandMetadata(command)
}

/**
 * Capture the queue position at which a conversation clear was submitted.
 *
 * A queued `/clear` carries its original position even after dequeueing. The
 * fallback covers internal callers that do not originate from user input.
 */
export function captureConversationClearQueueBarrier(
  command?: QueuedCommand,
): ConversationClearQueueBarrier {
  const commandMetadata = command
    ? commandMetadataByCommand.get(command)
    : undefined
  return {
    sequence: commandMetadata?.sequence ?? lastEnqueuedSequence,
  }
}

/**
 * Remove queued commands that cannot survive the conversation being cleared.
 *
 * Commands for the explicitly preserved background agents survive. Commands
 * for stopped foreground agents are removed because those agents can no longer
 * drain them. Main-thread work submitted before (or at) `/clear` belongs to the
 * old conversation and is discarded. Anything submitted after the barrier
 * survives; this is an explicit temporal policy for completion notifications
 * from background tasks that are themselves preserved across `/clear`.
 */
export function clearCommandsForConversationReset(
  barrier: ConversationClearQueueBarrier,
  preservedAgentIds: ReadonlySet<string> = new Set(),
): QueuedCommand[] {
  const shouldRemove = (command: QueuedCommand) => {
    if (command.agentId !== undefined) {
      return !preservedAgentIds.has(command.agentId)
    }
    const metadata = commandMetadataByCommand.get(command)
    return metadata === undefined || metadata.sequence <= barrier.sequence
  }
  const removed = removeByFilter(shouldRemove)

  for (const [leaseId, active] of activeTaskNotificationLeases) {
    const retained: QueuedCommand[] = []
    for (const command of active.retryableCommands) {
      if (shouldRemove(command)) {
        removed.push(command)
        logOperation('remove')
      } else {
        retained.push(command)
      }
    }
    if (retained.length === 0) {
      activeTaskNotificationLeases.delete(leaseId)
    } else {
      active.retryableCommands = retained
    }
  }

  return removed.sort(
    (left, right) =>
      getCommandMetadata(left).sequence - getCommandMetadata(right).sequence,
  )
}

/**
 * Clear all commands and reset snapshot.
 * Used for test cleanup.
 */
export function resetCommandQueue(): void {
  commandQueue.length = 0
  activeTaskNotificationLeases.clear()
  clearTaskNotificationRetryTimer()
  commandMetadataByCommand = new WeakMap()
  lastEnqueuedSequence = 0
  nextTaskNotificationLeaseId = 0
  snapshot = Object.freeze([])
}

// ============================================================================
// Editable mode helpers
// ============================================================================

const NON_EDITABLE_MODES = new Set<PromptInputMode>([
  'task-notification',
] satisfies Permutations<Exclude<PromptInputMode, EditablePromptInputMode>>)

export function isPromptInputModeEditable(
  mode: PromptInputMode,
): mode is EditablePromptInputMode {
  return !NON_EDITABLE_MODES.has(mode)
}

/**
 * Whether this queued command can be pulled into the input buffer via UP/ESC.
 * System-generated commands (proactive ticks, scheduled tasks, plan
 * verification, channel messages) contain raw XML and must not leak into
 * the user's input.
 */
export function isQueuedCommandEditable(cmd: QueuedCommand): boolean {
  return isPromptInputModeEditable(cmd.mode) && !cmd.isMeta
}

/**
 * Whether this queued command should render in the queue preview under the
 * prompt. Superset of editable — channel messages show (so the keyboard user
 * sees what arrived) but stay non-editable (raw XML).
 */
export function isQueuedCommandVisible(cmd: QueuedCommand): boolean {
  if (
    (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
    (cmd as Record<string, unknown>).origin !== undefined &&
    ((cmd as Record<string, unknown>).origin as Record<string, unknown>)
      ?.kind === 'channel'
  )
    return true
  return isQueuedCommandEditable(cmd)
}

/**
 * Extract text from a queued command value.
 * For strings, returns the string.
 * For ContentBlockParam[], extracts text from text blocks.
 */
function extractTextFromValue(value: string | ContentBlockParam[]): string {
  return typeof value === 'string' ? value : extractTextContent(value, '\n')
}

/**
 * Extract images from ContentBlockParam[] and convert to PastedContent format.
 * Returns empty array for string values or if no images found.
 */
function extractImagesFromValue(
  value: string | ContentBlockParam[],
  startId: number,
): PastedContent[] {
  if (typeof value === 'string') {
    return []
  }

  const images: PastedContent[] = []
  let imageIndex = 0
  for (const block of value) {
    if (block.type === 'image' && block.source.type === 'base64') {
      images.push({
        id: startId + imageIndex,
        type: 'image',
        content: block.source.data,
        mediaType: block.source.media_type,
        filename: `image${imageIndex + 1}`,
      })
      imageIndex++
    }
  }
  return images
}

export type PopAllEditableResult = {
  text: string
  cursorOffset: number
  images: PastedContent[]
}

/**
 * Pop all editable commands addressed to one conversation owner and combine
 * them with current input for editing. The main REPL uses the default
 * `agentId === undefined`; private subagent work remains queued.
 * Notification modes (task-notification) are left in the queue
 * to be auto-processed later.
 * Returns object with combined text, cursor offset, and images to restore.
 * Returns undefined if no editable commands in queue.
 */
export function popAllEditable(
  currentInput: string,
  currentCursorOffset: number,
  agentId: QueuedCommand['agentId'] = undefined,
): PopAllEditableResult | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  const { editable = [], nonEditable = [] } = objectGroupBy(
    [...commandQueue],
    cmd =>
      cmd.agentId === agentId && isQueuedCommandEditable(cmd)
        ? 'editable'
        : 'nonEditable',
  )

  if (editable.length === 0) {
    return undefined
  }

  // Extract text from queued commands (handles both strings and ContentBlockParam[])
  const queuedTexts = editable.map(cmd => extractTextFromValue(cmd.value))
  const newInput = [...queuedTexts, currentInput].filter(Boolean).join('\n')

  // Calculate cursor offset: length of joined queued commands + 1 + current cursor offset
  const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset

  // Extract images from queued commands
  const images: PastedContent[] = []
  let nextImageId = Date.now() // Use timestamp as base for unique IDs
  for (const cmd of editable) {
    // handlePromptSubmit queues images in pastedContents (value is a string).
    // Preserve the original PastedContent id so imageStore lookups still work.
    if (cmd.pastedContents) {
      for (const content of Object.values(cmd.pastedContents)) {
        if (content.type === 'image') {
          images.push(content)
        }
      }
    }
    // Bridge/remote commands may embed images directly in ContentBlockParam[].
    const cmdImages = extractImagesFromValue(cmd.value, nextImageId)
    images.push(...cmdImages)
    nextImageId += cmdImages.length
  }

  for (const command of editable) {
    logOperation(
      'popAll',
      typeof command.value === 'string' ? command.value : undefined,
    )
  }

  // Replace queue contents with only the non-editable commands
  commandQueue.length = 0
  commandQueue.push(...nonEditable)
  notifySubscribers()

  return { text: newInput, cursorOffset, images }
}

/**
 * Get commands at or above a given priority level without removing them.
 * Useful for mid-chain draining where only urgent items should be processed.
 *
 * Priority order: 'now' (0) > 'next' (1) > 'later' (2).
 * Passing 'now' returns only now-priority commands; 'later' returns everything.
 */
export function getCommandsByMaxPriority(
  maxPriority: QueuePriority,
): QueuedCommand[] {
  const threshold = PRIORITY_ORDER[maxPriority]
  return getSelectableCommands().filter(
    cmd => PRIORITY_ORDER[cmd.priority ?? 'next'] <= threshold,
  )
}

/**
 * Return priority-eligible commands that the scheduler would reach before the
 * first conversation-reset command in the selected queue scope. Resets execute
 * between turns and form a control-flow boundary: later prompts must not be
 * folded into the old turn, and lower-priority work must not jump ahead of it.
 */
export function getCommandsByMaxPriorityBeforeConversationReset(
  maxPriority: QueuePriority,
  filter: (command: QueuedCommand) => boolean,
): QueuedCommand[] {
  const scopedCommands = getSelectableCommands(filter)
  const resetIndex = scopedCommands.findIndex(isConversationResetCommand)
  const resetCommand =
    resetIndex === -1 ? undefined : scopedCommands[resetIndex]
  const commandsBeforeReset =
    resetIndex === -1 ? scopedCommands : scopedCommands.slice(0, resetIndex)
  const threshold = PRIORITY_ORDER[maxPriority]
  const resetPriority = resetCommand
    ? PRIORITY_ORDER[resetCommand.priority ?? 'next']
    : Infinity
  return commandsBeforeReset.filter(command => {
    const priority = PRIORITY_ORDER[command.priority ?? 'next']
    return priority <= threshold && priority <= resetPriority
  })
}

/** Whether this command starts a fresh conversation when locally dispatched. */
export function isConversationResetCommand(cmd: QueuedCommand): boolean {
  if (!isSlashCommand(cmd)) return false
  const value =
    typeof cmd.value === 'string'
      ? cmd.value
      : cmd.value.find(block => block.type === 'text')?.text
  const commandName = value?.trim().slice(1).split(' ', 1)[0]
  return (
    commandName === 'clear' || commandName === 'reset' || commandName === 'new'
  )
}

/**
 * Returns true if the command is a slash command that should be routed through
 * processSlashCommand rather than sent to the model as text.
 *
 * Commands with `skipSlashCommands` are usually treated as plain text, except
 * Remote Control bridge messages (`bridgeOrigin`) that are re-validated later
 * through isBridgeSafeCommand().
 */
export function isSlashCommand(cmd: QueuedCommand): boolean {
  if (typeof cmd.value === 'string') {
    return (
      cmd.value.trim().startsWith('/') &&
      (!cmd.skipSlashCommands || cmd.bridgeOrigin === true)
    )
  }
  for (const block of cmd.value) {
    if (block.type === 'text') {
      return (
        block.text.trim().startsWith('/') &&
        (!cmd.skipSlashCommands || cmd.bridgeOrigin === true)
      )
    }
  }
  return false
}
