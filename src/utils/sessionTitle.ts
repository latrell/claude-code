/**
 * Session title generation via Haiku.
 *
 * Standalone module with minimal dependencies so it can be imported from
 * print.ts (SDK control request handler) without pulling in the React/chalk/
 * git dependency chain that teleport.tsx carries.
 *
 * This is the single source of truth for AI-generated session titles across
 * all surfaces. Previously there were separate Haiku title generators:
 * - teleport.tsx generateTitleAndBranch (6-word title + branch for CCR)
 * - rename/generateSessionName.ts (kebab-case name for /rename)
 * Each remains for backwards compat; new callers should use this module.
 */

import { z } from 'zod/v4'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { queryHaiku } from '../services/api/claude.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'
import { isAbortError } from './errors.js'
import { findFirstJsonObject, safeParseJSON } from './json.js'
import { getPreferredLanguage } from './language.js'
import { lazySchema } from './lazySchema.js'
import { extractTextContent } from './messages.js'
import { getGraphemeSegmenter } from './intl.js'
import { asSystemPrompt } from './systemPromptType.js'

const MAX_CONVERSATION_TEXT = 1000

/**
 * Flatten a message array into a single text string for Haiku title input.
 * Skips meta/non-human messages. Tail-slices to the last 1000 chars so
 * recent context wins when the conversation is long.
 */
export function extractConversationText(messages: Message[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue
    if ('isMeta' in msg && msg.isMeta) continue
    if (
      'origin' in msg &&
      (msg as unknown as { origin?: { kind?: string } }).origin &&
      (msg as unknown as { origin: { kind?: string } }).origin.kind !== 'human'
    )
      continue
    const content = msg.message!.content
    if (typeof content === 'string') {
      parts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if ('type' in block && block.type === 'text' && 'text' in block) {
          parts.push(block.text as string)
        }
      }
    }
  }
  const text = parts.join('\n')
  return text.length > MAX_CONVERSATION_TEXT
    ? text.slice(-MAX_CONVERSATION_TEXT)
    : text
}

const SESSION_TITLE_PROMPT = `Generate a concise, sentence-case title (3-7 words) that captures the main topic or goal of this coding session. The title should be clear enough that the user recognizes the session in a list. Use sentence case: capitalize only the first word and proper nouns.

Return JSON with a single "title" field.

Good examples:
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

Bad (too vague): {"title": "Code changes"}
Bad (too long): {"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
Bad (wrong case): {"title": "Fix Login Button On Mobile"}`

/**
 * Build the system prompt for title generation, appending a language
 * instruction so titles aren't locked to the English few-shot examples:
 * - language set (settings.language, e.g. '简体中文', 'Japanese') → write
 *   the title in that language
 * - unset → follow the language of the user's message
 */
export function buildSessionTitleSystemPrompt(language?: string): string {
  const languageLine = language
    ? `Write the title in ${language}.`
    : "Write the title in the same language as the user's message."
  return `${SESSION_TITLE_PROMPT}\n\n${languageLine} The examples above illustrate length and casing only, not the output language.`
}

const titleSchema = lazySchema(() => z.object({ title: z.string() }))

const FALLBACK_TITLE_MAX_CHARS = 32

export type SessionTitleRequest = Readonly<{
  generation: number
  sessionId: string
  signal: AbortSignal
}>

export type SessionTitleRequestGuard = {
  begin: (sessionId: string) => SessionTitleRequest
  invalidate: () => void
  isCurrent: (request: SessionTitleRequest, currentSessionId: string) => boolean
}

/**
 * Keeps async title generation scoped to the session that started it.
 * Starting or invalidating a request aborts the previous controller, while
 * the generation and session checks keep late promise callbacks harmless
 * even when a provider ignores cancellation.
 */
export function createSessionTitleRequestGuard(): SessionTitleRequestGuard {
  let generation = 0
  let controller: AbortController | undefined

  return {
    begin(sessionId) {
      controller?.abort()
      controller = new AbortController()
      generation += 1
      return {
        generation,
        sessionId,
        signal: controller.signal,
      }
    },
    invalidate() {
      generation += 1
      controller?.abort()
      controller = undefined
    },
    isCurrent(request, currentSessionId) {
      return (
        request.generation === generation &&
        request.sessionId === currentSessionId &&
        !request.signal.aborted
      )
    },
  }
}

/**
 * Local, model-free fallback title: first non-empty line of the user's
 * message, truncated. Used when the Haiku call fails or returns unparseable
 * output (e.g. a fast-slot provider is down or ignores JSON instructions)
 * so the terminal tab still gets a topical title instead of silently
 * falling back to the product name.
 *
 * Truncation is grapheme-aware — a plain slice() can split a surrogate
 * pair (emoji) and leave an unpaired code unit rendering as � in the tab.
 */
export function fallbackSessionTitle(text: string): string | null {
  const firstLine = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0)
  if (!firstLine) return null
  const graphemes = Array.from(
    getGraphemeSegmenter().segment(firstLine),
    s => s.segment,
  )
  return graphemes.length > FALLBACK_TITLE_MAX_CHARS
    ? `${graphemes.slice(0, FALLBACK_TITLE_MAX_CHARS).join('')}…`
    : firstLine
}

/**
 * Generate a sentence-case session title from a description or first message.
 * Returns null on error or if Haiku returns an unparseable response.
 *
 * @param description - The user's first message or a description of the session
 * @param signal - Abort signal for cancellation
 */
export async function generateSessionTitle(
  description: string,
  signal: AbortSignal,
): Promise<string | null> {
  const trimmed = description.trim()
  if (!trimmed) return null

  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([
        buildSessionTitleSystemPrompt(getPreferredLanguage()),
      ]),
      userPrompt: trimmed,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'generate_session_title',
        agents: [],
        // Reflect the actual session mode — this module is called from
        // both the SDK print path (non-interactive) and the CCR remote
        // session path via useRemoteSession (interactive).
        isNonInteractiveSession: getIsNonInteractiveSession(),
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const text = extractTextContent(
      result.message.content as readonly { readonly type: string }[],
    )

    // Strict parse first; fall back to lenient extraction for providers that
    // ignore json_schema output formats (the OpenAI-compat layer drops
    // outputFormat entirely, so fast-slot models like DeepSeek often wrap
    // the JSON in markdown fences or narration).
    const parsed = titleSchema().safeParse(
      safeParseJSON(text, false) ?? findFirstJsonObject(text),
    )
    const title = parsed.success ? parsed.data.title.trim() || null : null

    if (title === null) {
      // Distinct from the catch below: the request succeeded but the model
      // returned something unparseable (common with non-Anthropic providers
      // that ignore json_schema output formats). Log the head of the raw
      // text so "title never appears" is diagnosable from debug logs.
      logForDebugging(
        `generateSessionTitle: unparseable model output: ${text.slice(0, 200)}`,
        { level: 'error' },
      )
    }

    logEvent('tengu_session_title_generated', { success: title !== null })

    return title
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return null

    logForDebugging(`generateSessionTitle failed: ${error}`, {
      level: 'error',
    })
    logEvent('tengu_session_title_generated', { success: false })
    return null
  }
}
