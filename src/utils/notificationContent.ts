import type { Message, UserMessage } from '../types/message.js'
import {
  getAssistantMessageText,
  getLastAssistantMessage,
  textForResubmit,
} from './messages.js'

const TASK_TITLE_MAX_CHARS = 60
const SUMMARY_MAX_CHARS = 150

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function truncateForNotification(
  text: string,
  maxChars: number,
): string {
  const chars = Array.from(collapseWhitespace(text))
  if (chars.length <= maxChars) {
    return chars.join('')
  }
  return `${chars.slice(0, maxChars - 1).join('')}…`
}

/**
 * The user's most recent real prompt, used as the notification title so a
 * push identifies which task finished. Skips meta scaffolding and
 * tool-result user messages (their content has no text blocks).
 */
export function getTaskTitleFromMessages(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.type !== 'user' || msg.isMeta) {
      continue
    }
    const text = textForResubmit(msg as UserMessage)?.text?.trim()
    if (text) {
      return truncateForNotification(text, TASK_TITLE_MAX_CHARS)
    }
  }
  return null
}

/**
 * A short excerpt of Claude's final response — what was actually done —
 * capped at 150 chars for push notification bodies.
 */
export function getCompletionSummaryFromMessages(
  messages: Message[],
): string | null {
  const lastAssistant = getLastAssistantMessage(messages)
  if (!lastAssistant) {
    return null
  }
  const text = getAssistantMessageText(lastAssistant)
  if (!text) {
    return null
  }
  return truncateForNotification(text, SUMMARY_MAX_CHARS)
}

/**
 * Build a rich task-completion notification (Codex-style): title = the task
 * prompt, body = a summary of what was completed. Falls back to the plain
 * message when the conversation has no usable text.
 */
export function buildTaskCompletionNotification(
  messages: Message[],
  fallbackMessage: string,
): { title?: string; message: string } {
  const title = getTaskTitleFromMessages(messages) ?? undefined
  const summary = getCompletionSummaryFromMessages(messages)
  return { title, message: summary ?? fallbackMessage }
}
