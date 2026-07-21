import type { Message } from '../types/message.js'

/**
 * Append a processed prompt to conversation state, then publish its commit.
 * The callback is deliberately synchronous and runs only after the messages
 * are visible in the destination so delivery owners can safely ACK exactly at
 * the boundary where retrying would duplicate transcript state.
 */
export function appendPromptMessagesAndCommit(
  destination: Message[],
  messages: readonly Message[],
  onPromptCommitted?: () => void,
): void {
  if (messages.length === 0) return
  destination.push(...messages)
  onPromptCommitted?.()
}
