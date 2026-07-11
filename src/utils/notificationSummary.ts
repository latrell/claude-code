/**
 * AI-written push notification content.
 *
 * Raw-text truncation makes bad push copy: titles cut off mid-sentence and
 * bodies stop before the actual outcome. When the MeoW channel is configured
 * (phone pushes are read away from the terminal, so copy quality matters),
 * ask the small/fast model — thinking disabled — for a short title and a
 * ≤150-char summary instead. Falls back to the stripped/truncated raw text
 * on any failure, in poor mode, and for OS-toast-only channels where an
 * extra model call isn't worth it.
 *
 * Follows the sessionTitle.ts pattern (queryHaiku + JSON output format).
 * API/config modules are imported dynamically so notificationContent.ts
 * consumers and tests stay off the config/bootstrap dependency chain.
 */

import { z } from 'zod/v4'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'
import { stripDisplayTagsAllowEmpty } from './displayTags.js'
import { safeParseJSON } from './json.js'
import { lazySchema } from './lazySchema.js'
import { extractTextContent } from './messages.js'
import {
  buildTaskCompletionNotification,
  getRawResultText,
  getRawTaskText,
  NOTIFICATION_SUMMARY_MAX_CHARS,
  NOTIFICATION_TITLE_MAX_CHARS,
  truncateForNotification,
} from './notificationContent.js'
import { asSystemPrompt } from './systemPromptType.js'

const SUMMARY_TIMEOUT_MS = 20_000
const TASK_INPUT_MAX_CHARS = 600
const RESULT_INPUT_MAX_CHARS = 2400

const NOTIFICATION_SUMMARY_PROMPT = `You write push notification copy for a coding agent. Given the user's task (<task>) and the agent's final reply (<result>), produce:

- "title": what the task was about, at most 30 characters, no trailing punctuation
- "summary": what was accomplished and the current state (done / waiting for input / blocked), at most 150 characters

Rules:
- Write in the conversation's own language (Chinese conversation → Chinese output).
- Each CJK character counts as one character; stay within the limits.
- Plain text only: no markdown, no XML/HTML tags, no quotes or code fences.
- Be concrete — name what was changed, fixed, or asked; never vague copy like "task done".

Return JSON: {"title": "...", "summary": "..."}`

const summarySchema = lazySchema(() =>
  z.object({ title: z.string(), summary: z.string() }),
)

function headSlice(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  const chars = Array.from(text)
  return chars.length <= maxChars
    ? text
    : `${chars.slice(0, maxChars).join('')}…`
}

/** Model output can still sneak in tags or run long — clean and cap it. */
function sanitizeModelText(text: string, maxChars: number): string | undefined {
  const cleaned = stripDisplayTagsAllowEmpty(text.trim())
  return cleaned ? truncateForNotification(cleaned, maxChars) : undefined
}

async function summarizeTaskCompletion(
  taskText: string | null,
  resultText: string | null,
): Promise<{ title?: string; summary?: string } | null> {
  const { queryHaiku } = await import('../services/api/claude.js')

  const inputParts: string[] = []
  if (taskText) {
    inputParts.push(
      `<task>\n${headSlice(taskText, TASK_INPUT_MAX_CHARS)}\n</task>`,
    )
  }
  if (resultText) {
    inputParts.push(
      `<result>\n${headSlice(resultText, RESULT_INPUT_MAX_CHARS)}\n</result>`,
    )
  }

  const response = await queryHaiku({
    systemPrompt: asSystemPrompt([NOTIFICATION_SUMMARY_PROMPT]),
    userPrompt: inputParts.join('\n\n'),
    outputFormat: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['title', 'summary'],
        additionalProperties: false,
      },
    },
    signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    options: {
      querySource: 'notification_summary',
      agents: [],
      isNonInteractiveSession: getIsNonInteractiveSession(),
      hasAppendSystemPrompt: false,
      mcpTools: [],
    },
  })

  const text = extractTextContent(
    response.message.content as readonly { readonly type: string }[],
  )
  const parsed = summarySchema().safeParse(safeParseJSON(text))
  if (!parsed.success) {
    return null
  }

  const title = sanitizeModelText(
    parsed.data.title,
    NOTIFICATION_TITLE_MAX_CHARS,
  )
  const summary = sanitizeModelText(
    parsed.data.summary,
    NOTIFICATION_SUMMARY_MAX_CHARS,
  )
  if (!title && !summary) {
    return null
  }
  return { title, summary }
}

/**
 * Build task-completion notification content, upgrading to an AI-written
 * title + summary when the MeoW channel is configured. Never rejects — any
 * failure falls back to the stripped/truncated raw text.
 */
export async function buildNotificationWithAISummary(
  messages: Message[],
  fallbackMessage: string,
): Promise<{ title?: string; message: string }> {
  const fallback = buildTaskCompletionNotification(messages, fallbackMessage)

  try {
    const [{ isMeowChannelConfigured }, { isPoorModeActive }] =
      await Promise.all([
        import('../services/notifier.js'),
        import('../commands/poor/poorMode.js'),
      ])
    if (!isMeowChannelConfigured() || isPoorModeActive()) {
      return fallback
    }

    const taskText = getRawTaskText(messages)
    const resultText = getRawResultText(messages)
    if (!taskText && !resultText) {
      return fallback
    }

    const ai = await summarizeTaskCompletion(taskText, resultText)
    if (!ai) {
      return fallback
    }
    return {
      title: ai.title ?? fallback.title,
      message: ai.summary ?? fallback.message,
    }
  } catch (error) {
    logForDebugging(`notification AI summary failed: ${error}`, {
      level: 'error',
    })
    return fallback
  }
}
