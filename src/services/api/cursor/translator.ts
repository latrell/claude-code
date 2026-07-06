/**
 * OpenAI-shape → Cursor message translator.
 *
 * We reuse the shared Anthropic→OpenAI converter to flatten Claude Code's
 * message history into OpenAI chat messages, then translate those into the
 * Cursor conversation shape here. Cursor has no native tool/assistant-tool-call
 * message roles, so tool results are rendered into structured user text blocks.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import type { CursorMessage, CursorToolResult } from './protobufSchema.js'
import {
  buildStructuredToolResult,
  isBuiltinMappedTool,
} from './toolMapping.js'

interface OpenAITextPart {
  type: 'text'
  text?: string
}

interface OpenAIToolUsePart {
  type: 'tool_use'
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface OpenAIToolResultPart {
  type: 'tool_result'
  tool_use_id?: string
  content?: unknown
}

interface OpenAIUnknownPart {
  type: string
  [key: string]: unknown
}

type OpenAIContentPart =
  | OpenAITextPart
  | OpenAIToolUsePart
  | OpenAIToolResultPart
  | OpenAIUnknownPart

export interface OpenAIMessage {
  role: string
  content: string | OpenAIContentPart[] | null
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: string
    function: { name: string; arguments: string }
  }>
}

const MAX_TOOL_RESULT_CHARS = 12_000
const TOOL_RESULT_SERIALIZATION_FALLBACK = '[unserializable content]'
const TOOL_USE_ARGUMENTS_FALLBACK = '{}'
const TOOL_CALL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function isTextPart(part: OpenAIContentPart): part is OpenAITextPart {
  return part.type === 'text'
}

function isToolUsePart(part: OpenAIContentPart): part is OpenAIToolUsePart {
  return part.type === 'tool_use'
}

function isToolResultPart(
  part: OpenAIContentPart,
): part is OpenAIToolResultPart {
  return part.type === 'tool_result'
}

function extractTextContent(
  content: OpenAIMessage['content'],
  separator = '',
): string {
  if (content == null) return ''
  if (typeof content === 'string') return content

  const parts: string[] = []
  for (const part of content) {
    if (isTextPart(part) && part.text) {
      parts.push(part.text)
    }
  }
  return parts.join(separator)
}

function stringifyUnknown(value: unknown, fallback = ''): string {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? serialized : fallback
  } catch {
    return fallback
  }
}

function sanitizeToolResultText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars from tool output
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function truncateToolResultText(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text

  let omittedChars = text.length - MAX_TOOL_RESULT_CHARS
  while (true) {
    const suffix = `\n[truncated ${omittedChars} chars]`
    const keepLength = Math.max(MAX_TOOL_RESULT_CHARS - suffix.length, 0)
    const nextOmittedChars = text.length - keepLength
    if (nextOmittedChars === omittedChars) {
      return `${text.slice(0, keepLength)}${suffix}`
    }
    omittedChars = nextOmittedChars
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildToolResultBlock(
  toolName: string,
  toolCallId: string,
  resultText: string,
): string {
  const cleanResult = escapeXml(
    truncateToolResultText(sanitizeToolResultText(resultText)),
  )

  return [
    '<tool_result>',
    `<tool_name>${escapeXml(toolName || 'tool')}</tool_name>`,
    `<tool_call_id>${escapeXml(toolCallId)}</tool_call_id>`,
    `<result>${cleanResult}</result>`,
    '</tool_result>',
  ].join('\n')
}

function normalizeToolCallId(toolCallId: string | undefined): string {
  return typeof toolCallId === 'string' ? toolCallId.split('\n')[0] : ''
}

function sanitizeToolCallId(toolCallId: string | undefined): string {
  const normalizedId = normalizeToolCallId(toolCallId).trim()
  if (!normalizedId) return ''
  if (TOOL_CALL_ID_PATTERN.test(normalizedId)) return normalizedId
  return normalizedId.replace(/[^a-zA-Z0-9_-]/g, '')
}

function extractToolResultText(content: unknown): string {
  if (content === undefined) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p): p is OpenAITextPart => isTextPart(p as OpenAIContentPart))
      .map(part => part.text || '')
      .join('\n')
  }
  return stringifyUnknown(content, TOOL_RESULT_SERIALIZATION_FALLBACK)
}

function createFallbackToolUseId(
  messageIndex: number,
  partIndex: number,
): string {
  return `toolu_cursor_fallback_${messageIndex}_${partIndex}`
}

function resolveToolUseId(
  part: OpenAIToolUsePart,
  messageIndex: number,
  partIndex: number,
): string {
  const sanitizedId = sanitizeToolCallId(part.id)
  return sanitizedId || createFallbackToolUseId(messageIndex, partIndex)
}

function fallbackToolResultId(messageIndex: number, partIndex: number): string {
  return `toolu_cursor_result_${messageIndex}_${partIndex}`
}

type ToolMetaMap = Map<string, { name: string }>

function rememberToolCallMeta(
  toolCallMetaMap: ToolMetaMap,
  toolCalls: NonNullable<OpenAIMessage['tool_calls']>,
): void {
  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.id || ''
    const toolName = toolCall.function?.name || 'tool'
    if (!toolCallId) continue
    toolCallMetaMap.set(toolCallId, { name: toolName })
    const normalizedId = normalizeToolCallId(toolCallId)
    if (normalizedId && normalizedId !== toolCallId) {
      toolCallMetaMap.set(normalizedId, { name: toolName })
    }
  }
}

function rememberToolUseParts(
  toolCallMetaMap: ToolMetaMap,
  content: OpenAIMessage['content'],
  messageIndex: number,
): void {
  if (!Array.isArray(content)) return
  for (let partIndex = 0; partIndex < content.length; partIndex++) {
    const part = content[partIndex]
    if (!isToolUsePart(part)) continue
    const toolCallId = resolveToolUseId(part, messageIndex, partIndex)
    const toolName = part.name || 'tool'
    toolCallMetaMap.set(toolCallId, { name: toolName })
    const normalizedId = normalizeToolCallId(toolCallId)
    if (normalizedId && normalizedId !== toolCallId) {
      toolCallMetaMap.set(normalizedId, { name: toolName })
    }
  }
}

function renderUserContent(
  content: OpenAIMessage['content'],
  toolCallMetaMap: ToolMetaMap,
  messageIndex: number,
  consumedResultIds: Set<string>,
): string {
  if (content == null) return ''
  if (typeof content === 'string') return content

  const parts: string[] = []
  let textBuffer = ''
  for (let partIndex = 0; partIndex < content.length; partIndex++) {
    const part = content[partIndex]
    if (isTextPart(part) && part.text) {
      textBuffer += part.text
      continue
    }
    if (!isToolResultPart(part)) continue

    const toolCallId =
      sanitizeToolCallId(part.tool_use_id) ||
      fallbackToolResultId(messageIndex, partIndex)
    // Skip results already emitted as a structured tool_result on the
    // assistant turn (mapped built-in tools).
    if (consumedResultIds.has(toolCallId)) continue

    if (textBuffer) {
      parts.push(textBuffer)
      textBuffer = ''
    }

    const normalizedId = normalizeToolCallId(toolCallId)
    const toolName =
      toolCallMetaMap.get(toolCallId)?.name ||
      toolCallMetaMap.get(normalizedId)?.name ||
      'tool'
    parts.push(
      buildToolResultBlock(
        toolName,
        toolCallId,
        extractToolResultText(part.content),
      ),
    )
  }

  if (textBuffer) parts.push(textBuffer)
  return parts.join('\n')
}

interface ExtractedToolCall {
  id: string
  name: string
  argsJson: string
}

/**
 * Pre-scan: collect every tool result text keyed by sanitized tool-call id, so
 * a preceding assistant turn can attach the result structurally (the result
 * always appears in a later message than the call that produced it).
 */
function collectToolResultTexts(
  messages: OpenAIMessage[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role === 'tool') {
      const id = sanitizeToolCallId(msg.tool_call_id)
      if (id) map.set(id, extractTextContent(msg.content, '\n'))
      continue
    }
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!isToolResultPart(part)) continue
        const id = sanitizeToolCallId(part.tool_use_id)
        if (id) map.set(id, extractToolResultText(part.content))
      }
    }
  }
  return map
}

/** All tool calls on an assistant message (both tool_calls[] and tool_use parts). */
function extractAssistantToolCalls(
  msg: OpenAIMessage,
  messageIndex: number,
): ExtractedToolCall[] {
  const calls: ExtractedToolCall[] = []
  for (const toolCall of msg.tool_calls ?? []) {
    const id = sanitizeToolCallId(toolCall.id)
    if (!id) continue
    calls.push({
      id,
      name: toolCall.function?.name || 'tool',
      argsJson:
        typeof toolCall.function?.arguments === 'string'
          ? toolCall.function.arguments
          : TOOL_USE_ARGUMENTS_FALLBACK,
    })
  }
  if (Array.isArray(msg.content)) {
    for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
      const part = msg.content[partIndex]
      if (!isToolUsePart(part)) continue
      calls.push({
        id: resolveToolUseId(part, messageIndex, partIndex),
        name: part.name || 'tool',
        argsJson: stringifyUnknown(
          part.input ?? {},
          TOOL_USE_ARGUMENTS_FALLBACK,
        ),
      })
    }
  }
  return calls
}

/**
 * Convert OpenAI-shape messages into Cursor conversation messages.
 * - system → user with a [System Instructions] prefix
 * - assistant tool calls for tools mapped to a Cursor built-in (Bash → Read →)
 *   are paired with their result and emitted as a structured `tool_results`
 *   entry on the assistant turn (Cursor's agent-tuned models require this).
 * - tool results for unmapped tools → flattened into a user text block.
 */
export function convertOpenAIMessagesToCursor(
  messages: OpenAIMessage[],
): CursorMessage[] {
  const result: CursorMessage[] = []
  const toolCallMetaMap: ToolMetaMap = new Map()
  const toolResultTextById = collectToolResultTexts(messages)
  const consumedResultIds = new Set<string>()

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const msg = messages[messageIndex]

    if (msg.role === 'system' || msg.role === 'developer') {
      const text = extractTextContent(msg.content)
      if (text) {
        result.push({
          role: 'user',
          content: `[System Instructions]\n${text}`,
        })
      }
      continue
    }

    if (msg.role === 'tool') {
      const sanitizedId = sanitizeToolCallId(msg.tool_call_id)
      // Already emitted as a structured tool_result on the assistant turn.
      if (sanitizedId && consumedResultIds.has(sanitizedId)) continue

      const toolCallId = sanitizedId || fallbackToolResultId(messageIndex, 0)
      const normalizedToolCallId = normalizeToolCallId(toolCallId)
      const rememberedToolName =
        toolCallMetaMap.get(toolCallId)?.name ||
        toolCallMetaMap.get(normalizedToolCallId)?.name
      const toolName = msg.name || rememberedToolName || 'tool'

      result.push({
        role: 'user',
        content: buildToolResultBlock(
          toolName,
          toolCallId,
          extractTextContent(msg.content, '\n'),
        ),
      })
      continue
    }

    if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        rememberToolCallMeta(toolCallMetaMap, msg.tool_calls)
      }
      rememberToolUseParts(toolCallMetaMap, msg.content, messageIndex)

      const content = extractTextContent(msg.content)
      const toolResults: CursorToolResult[] = []
      const calls = extractAssistantToolCalls(msg, messageIndex)
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]
        if (!isBuiltinMappedTool(call.name)) continue
        const resultText = toolResultTextById.get(call.id)
        if (resultText === undefined) continue
        const built = buildStructuredToolResult(
          call.name,
          call.argsJson,
          resultText,
        )
        if (!built) continue
        toolResults.push({
          tool_call_id: call.id,
          name: built.builtinName,
          index: i,
          raw_args: built.rawArgs,
          result: built.result,
        })
        consumedResultIds.add(call.id)
      }

      if (content || toolResults.length > 0) {
        const assistantMessage: CursorMessage = { role: 'assistant', content }
        if (toolResults.length > 0) assistantMessage.tool_results = toolResults
        result.push(assistantMessage)
      }
      continue
    }

    if (msg.role === 'user') {
      const content = renderUserContent(
        msg.content,
        toolCallMetaMap,
        messageIndex,
        consumedResultIds,
      )
      if (content) {
        result.push({ role: 'user', content })
      }
    }
  }

  return result
}
