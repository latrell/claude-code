/**
 * Adapt a stream of Cursor ConnectRPC frames into Anthropic
 * BetaRawMessageStreamEvent, so the rest of the CLI (query loop, REPL) can
 * consume Cursor responses through the same pipeline as first-party Anthropic.
 *
 * Mapping:
 *   first content frame  → message_start
 *   thinking frame       → content_block_start(thinking) + thinking_delta
 *   text frame           → content_block_start(text) + text_delta
 *   toolCall frames      → content_block_start(tool_use) + input_json_delta
 *   stream end           → message_delta(stop_reason) + message_stop
 *   error frame          → throws CursorStreamError
 *
 * Cursor does not report token usage over the stream, so usage counts are 0.
 */

import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import { CALL_MCP_TOOL_NAME, type CursorTool } from './protobufSchema.js'
import { unwrapCallMcpTool } from './protobufDecoder.js'
import { normalizeCcbToolArgs, remapBuiltinToolCall } from './toolMapping.js'
import type { FrameResult } from './streamParser.js'

export class CursorStreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly errorType = 'server_error',
  ) {
    super(message)
    this.name = 'CursorStreamError'
  }
}

type CurrentBlock =
  | { kind: 'text'; index: number }
  | { kind: 'thinking'; index: number }
  | { kind: 'tool'; index: number; toolId: string; name: string; args: string }

// Composer models stream their FINAL answer through the thinking channel,
// terminated by a DeepSeek-style boundary. Two observed shapes:
//   `…reasoning…</think><｜final｜>answer`
//   `…reasoning…</think>\nanswer`          (bare close tag, no marker)
// Cursor's own client splits on that boundary; without doing the same the
// final answer is swallowed into the thinking block and the assistant turn
// renders empty. Boundaries arrive fragmented across frame boundaries, so we
// hold back a small tail while scanning.
const FINAL_MARKERS = ['<｜final｜>', '<|final|>'] as const
const THINK_CLOSE = '</think>'
const BOUNDARIES = [...FINAL_MARKERS, THINK_CLOSE] as const
const MARKER_HOLDBACK = Math.max(...BOUNDARIES.map(m => m.length)) + 12

// ---------------------------------------------------------------------------
// Inline (DeepSeek-marker) tool calls
// ---------------------------------------------------------------------------
// Composer models emit tool calls as DeepSeek-template TEXT rather than
// Cursor's structured ClientSideToolV2Call frames:
//
//   <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
//   Grep
//   <｜tool▁sep｜>pattern
//   DISABLE_TELEMETRY
//   <｜tool▁sep｜>path
//   D:\code\ccb
//   <｜tool▁call▁end｜><｜tool▁calls▁end｜>
//
// Without parsing these the "call" renders as literal text and no tool ever
// executes. Markers use the fullwidth bar (｜, U+FF5C) + ▁ (U+2581); accept an
// ASCII-bar variant defensively. A block may contain several calls, and the
// wrapper name can be call_mcp_tool (unwrap) or a Cursor built-in (remap).

interface InlineMarkerSet {
  callsBegin: string
  callBegin: string
  sep: string
  callEnd: string
  callsEnd: string
}

const INLINE_MARKER_SETS: InlineMarkerSet[] = [
  {
    callsBegin: '<｜tool▁calls▁begin｜>',
    callBegin: '<｜tool▁call▁begin｜>',
    sep: '<｜tool▁sep｜>',
    callEnd: '<｜tool▁call▁end｜>',
    callsEnd: '<｜tool▁calls▁end｜>',
  },
  {
    callsBegin: '<|tool▁calls▁begin|>',
    callBegin: '<|tool▁call▁begin|>',
    sep: '<|tool▁sep|>',
    callEnd: '<|tool▁call▁end|>',
    callsEnd: '<|tool▁calls▁end|>',
  },
]

const INLINE_HOLDBACK =
  Math.max(...INLINE_MARKER_SETS.map(m => m.callsBegin.length)) + 12

type InlineParsedCall = { name: string; argsJson: string }

/** Map tool name → parameter name → JSON-schema type, for value coercion. */
function buildArgTypeMap(
  tools: CursorTool[] | undefined,
): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>()
  for (const tool of tools ?? []) {
    const name = tool.function?.name || tool.name
    const params = tool.function?.parameters || tool.input_schema
    const properties = (params as { properties?: Record<string, unknown> })
      ?.properties
    if (!name || !properties) continue
    const argTypes = new Map<string, string>()
    for (const [argName, schema] of Object.entries(properties)) {
      const type = (schema as { type?: unknown })?.type
      if (typeof type === 'string') argTypes.set(argName, type)
    }
    map.set(name, argTypes)
  }
  return map
}

/** Coerce an inline string value according to the declared JSON-schema type. */
function coerceInlineArgValue(
  value: string,
  type: string | undefined,
): unknown {
  if (type === 'number' || type === 'integer') {
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : value
  }
  if (type === 'boolean') {
    const v = value.trim().toLowerCase()
    if (v === 'true') return true
    if (v === 'false') return false
    return value
  }
  if (type === 'object' || type === 'array') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/**
 * Parse one call body (the text between call▁begin and call▁end):
 * `NAME\n(<sep>ARG\nVALUE)*`. Values keep interior newlines; the single
 * newline that precedes the next marker is syntax and is stripped. Also
 * accepts the stock DeepSeek shape `function<sep>NAME\n```json\n{...}\n````.
 */
function parseInlineCallBody(
  body: string,
  markers: InlineMarkerSet,
  argTypes: Map<string, Map<string, string>>,
): InlineParsedCall | null {
  const segments = body.split(markers.sep)
  const head = (segments[0] ?? '').trim()

  // Stock DeepSeek template: function<sep>{name}\n```json\n{args}\n```
  if (head === 'function' && segments.length === 2) {
    const rest = segments[1] ?? ''
    const newline = rest.indexOf('\n')
    const name = (newline === -1 ? rest : rest.slice(0, newline)).trim()
    if (!name) return null
    const fenced = rest.slice(newline + 1).trim()
    const json = fenced.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    try {
      JSON.parse(json)
      return { name, argsJson: json }
    } catch {
      return { name, argsJson: '{}' }
    }
  }

  const name = head
  if (!name) return null
  const types = argTypes.get(name)
  const args: Record<string, unknown> = {}
  for (const segment of segments.slice(1)) {
    const newline = segment.indexOf('\n')
    if (newline === -1) {
      const argName = segment.trim()
      if (argName) args[argName] = ''
      continue
    }
    const argName = segment.slice(0, newline).trim()
    if (!argName) continue
    // Strip exactly one trailing newline — it belongs to the marker syntax.
    const value = segment.slice(newline + 1).replace(/\r?\n$/, '')
    args[argName] = coerceInlineArgValue(value, types?.get(argName))
  }
  return { name, argsJson: JSON.stringify(args) }
}

/** Normalize an inline call the same way the protobuf decoder does. */
function normalizeInlineCall(call: InlineParsedCall): InlineParsedCall {
  if (call.name === CALL_MCP_TOOL_NAME) {
    const unwrapped = unwrapCallMcpTool(call.argsJson)
    if (unwrapped)
      return { name: unwrapped.name, argsJson: unwrapped.arguments }
    return call
  }
  // Built-in name (run_terminal_cmd/read_file) → CCB tool + args.
  const remapped = remapBuiltinToolCall(call.name, call.argsJson)
  if (remapped) return { name: remapped.name, argsJson: remapped.arguments }
  // CCB name with possibly built-in-shaped args (hybrid inline calls).
  const normalizedArgs = normalizeCcbToolArgs(call.name, call.argsJson)
  if (normalizedArgs !== null)
    return { name: call.name, argsJson: normalizedArgs }
  return call
}

function toInlineToolCallFrame(call: InlineParsedCall): FrameResult {
  return {
    type: 'toolCall',
    toolCall: {
      id: `toolu_inline_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'function',
      function: { name: call.name, arguments: call.argsJson },
      isLast: false,
    },
  }
}

/**
 * Extract DeepSeek-marker inline tool calls from text/thinking frames and
 * re-emit them as structured toolCall frames. Content before a calls-block
 * passes through on its original channel; marker syntax never reaches the
 * user-visible text. Runs AFTER splitThinkingFinalMarker so Composer's
 * post-`</think>` output (where the markers live) arrives here as text.
 * Exported for the live model probe script.
 */
export async function* extractInlineToolCalls(
  frames: AsyncIterable<FrameResult>,
  tools?: CursorTool[],
): AsyncGenerator<FrameResult, void> {
  const argTypes = buildArgTypeMap(tools)
  let pending = ''
  let pendingChannel: 'text' | 'thinking' = 'text'
  let inBlock: InlineMarkerSet | null = null

  function findCallsBegin(
    haystack: string,
  ): { index: number; markers: InlineMarkerSet } | null {
    let best: { index: number; markers: InlineMarkerSet } | null = null
    for (const markers of INLINE_MARKER_SETS) {
      const i = haystack.indexOf(markers.callsBegin)
      if (i !== -1 && (best === null || i < best.index)) {
        best = { index: i, markers }
      }
    }
    return best
  }

  /**
   * Emit the complete calls currently sitting in `pending`. Returns true
   * once the block's calls▁end marker was consumed (block closed).
   */
  function* drainBlock(
    markers: InlineMarkerSet,
  ): Generator<FrameResult, boolean> {
    while (true) {
      const begin = pending.indexOf(markers.callBegin)
      const close = pending.indexOf(markers.callsEnd)
      // A call begins before the block closes → need its end marker.
      if (begin !== -1 && (close === -1 || begin < close)) {
        const end = pending.indexOf(markers.callEnd, begin)
        if (end === -1) return false
        const body = pending.slice(begin + markers.callBegin.length, end)
        pending = pending.slice(end + markers.callEnd.length)
        const parsed = parseInlineCallBody(body, markers, argTypes)
        if (parsed) yield toInlineToolCallFrame(normalizeInlineCall(parsed))
        continue
      }
      if (close !== -1) {
        pending = pending.slice(close + markers.callsEnd.length)
        return true
      }
      return false
    }
  }

  function* processPending(atStreamEnd: boolean): Generator<FrameResult> {
    while (pending) {
      if (inBlock) {
        const closed = yield* drainBlock(inBlock)
        if (closed) {
          inBlock = null
          continue
        }
        // Block still open: wait for more input. At stream end, drop the
        // remainder — a truncated call is unusable and the raw markers must
        // never leak into user-visible text.
        if (atStreamEnd) pending = ''
        return
      }

      const found = findCallsBegin(pending)
      if (found) {
        // Trailing whitespace right before the block is presentation-only.
        const before = pending.slice(0, found.index).replace(/\s+$/, '')
        if (before) {
          yield { type: pendingChannel, text: before } as FrameResult
        }
        pending = pending.slice(found.index + found.markers.callsBegin.length)
        inBlock = found.markers
        continue
      }

      if (atStreamEnd) {
        yield { type: pendingChannel, text: pending } as FrameResult
        pending = ''
        return
      }

      // Flush all but a tail that could still grow into a begin marker.
      if (pending.length > INLINE_HOLDBACK) {
        const flush = pending.slice(0, -INLINE_HOLDBACK)
        pending = pending.slice(-INLINE_HOLDBACK)
        if (flush) yield { type: pendingChannel, text: flush } as FrameResult
      }
      return
    }
  }

  for await (const frame of frames) {
    if (frame.type !== 'text' && frame.type !== 'thinking') {
      yield* processPending(true)
      inBlock = null
      yield frame
      continue
    }

    // Channel switch: settle what we buffered on the previous channel first.
    if (pending && frame.type !== pendingChannel && !inBlock) {
      yield* processPending(true)
    }
    if (!inBlock) pendingChannel = frame.type
    pending += frame.text
    yield* processPending(false)
  }

  yield* processPending(true)
}

/**
 * Rewrite thinking frames so content after the reasoning boundary
 * (`</think>` and/or a `<｜final｜>` marker) flows as text frames. Exported
 * for the live model probe script.
 */
export async function* splitThinkingFinalMarker(
  frames: AsyncIterable<FrameResult>,
): AsyncGenerator<FrameResult, void> {
  // thinking → (afterClose) → final
  //   thinking:   scanning reasoning for a boundary
  //   afterClose: just crossed a bare `</think>` — swallow whitespace and an
  //               optional final marker before emitting the answer as text
  //   final:      everything is answer text
  let mode: 'thinking' | 'afterClose' | 'final' = 'thinking'
  let pending = ''

  function findBoundary(
    haystack: string,
  ): { index: number; length: number; kind: 'marker' | 'close' } | null {
    let best: {
      index: number
      length: number
      kind: 'marker' | 'close'
    } | null = null
    for (const marker of FINAL_MARKERS) {
      const i = haystack.indexOf(marker)
      if (i !== -1 && (best === null || i < best.index)) {
        best = { index: i, length: marker.length, kind: 'marker' }
      }
    }
    const closeIdx = haystack.indexOf(THINK_CLOSE)
    if (closeIdx !== -1 && (best === null || closeIdx < best.index)) {
      best = { index: closeIdx, length: THINK_CLOSE.length, kind: 'close' }
    }
    return best
  }

  /**
   * Resolve the afterClose buffer: strip leading whitespace and an optional
   * final marker, then hand the rest over to final mode. Returns the text to
   * emit now (empty string = keep waiting for more input).
   */
  function resolveAfterClose(buffer: string, atStreamEnd: boolean): string {
    const trimmed = buffer.trimStart()
    if (!trimmed) {
      pending = buffer
      return ''
    }
    const fullMarker = FINAL_MARKERS.find(m => trimmed.startsWith(m))
    if (fullMarker) {
      mode = 'final'
      pending = ''
      return trimmed.slice(fullMarker.length)
    }
    // Could the buffer still grow into a marker? (fragmented prefix)
    if (!atStreamEnd && FINAL_MARKERS.some(m => m.startsWith(trimmed))) {
      pending = buffer
      return ''
    }
    mode = 'final'
    pending = ''
    return trimmed
  }

  for await (const frame of frames) {
    if (frame.type !== 'thinking') {
      // Boundary bookkeeping only applies to the thinking channel; flush any
      // held-back content before passing other frames through.
      if (pending) {
        if (mode === 'thinking') {
          yield { type: 'thinking', text: pending }
        } else {
          const text = resolveAfterClose(pending, true)
          if (text) yield { type: 'text', text }
        }
        pending = ''
      }
      yield frame
      continue
    }

    if (mode === 'final') {
      if (frame.text) yield { type: 'text', text: frame.text }
      continue
    }

    pending += frame.text

    if (mode === 'afterClose') {
      const text = resolveAfterClose(pending, false)
      if (text) yield { type: 'text', text }
      continue
    }

    const boundary = findBoundary(pending)
    if (boundary) {
      const before = pending.slice(0, boundary.index).replace(/\s+$/, '')
      const rest = pending.slice(boundary.index + boundary.length)
      pending = ''
      if (before) yield { type: 'thinking', text: before }
      if (boundary.kind === 'marker') {
        mode = 'final'
        if (rest) yield { type: 'text', text: rest }
      } else {
        mode = 'afterClose'
        const text = resolveAfterClose(rest, false)
        if (text) yield { type: 'text', text }
      }
      continue
    }

    // Flush all but a tail that could still be a fragmented boundary prefix.
    if (pending.length > MARKER_HOLDBACK) {
      const flush = pending.slice(0, -MARKER_HOLDBACK)
      pending = pending.slice(-MARKER_HOLDBACK)
      yield { type: 'thinking', text: flush }
    }
  }

  if (pending) {
    if (mode === 'thinking') {
      yield { type: 'thinking', text: pending }
    } else {
      const text = resolveAfterClose(pending, true)
      if (text) yield { type: 'text', text }
    }
  }
}

export async function* adaptCursorFramesToAnthropic(
  rawFrames: AsyncIterable<FrameResult>,
  model: string,
  tools?: CursorTool[],
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const frames = extractInlineToolCalls(
    splitThinkingFinalMarker(rawFrames),
    tools,
  )

  let started = false
  let contentIndex = -1
  let toolCallCount = 0
  let current: CurrentBlock | null = null

  function* ensureStarted(): Generator<BetaRawMessageStreamEvent> {
    if (started) return
    started = true
    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    } as unknown as BetaRawMessageStreamEvent
  }

  function* closeCurrent(): Generator<BetaRawMessageStreamEvent> {
    if (!current) return
    if (current.kind === 'tool') {
      const json = current.args.length > 0 ? current.args : '{}'
      yield {
        type: 'content_block_delta',
        index: current.index,
        delta: { type: 'input_json_delta', partial_json: json },
      } as BetaRawMessageStreamEvent
    }
    yield {
      type: 'content_block_stop',
      index: current.index,
    } as BetaRawMessageStreamEvent
    current = null
  }

  for await (const frame of frames) {
    if (frame.type === 'error') {
      throw new CursorStreamError(frame.message, frame.status, frame.errorType)
    }

    if (frame.type === 'text') {
      yield* ensureStarted()
      if (current && current.kind !== 'text') yield* closeCurrent()
      let block: CurrentBlock | null = current
      if (!block || block.kind !== 'text') {
        contentIndex++
        block = { kind: 'text', index: contentIndex }
        current = block
        yield {
          type: 'content_block_start',
          index: block.index,
          content_block: { type: 'text', text: '' },
        } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'content_block_delta',
        index: block.index,
        delta: { type: 'text_delta', text: frame.text },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (frame.type === 'thinking') {
      yield* ensureStarted()
      if (current && current.kind !== 'thinking') yield* closeCurrent()
      let block: CurrentBlock | null = current
      if (!block || block.kind !== 'thinking') {
        contentIndex++
        block = { kind: 'thinking', index: contentIndex }
        current = block
        yield {
          type: 'content_block_start',
          index: block.index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        } as BetaRawMessageStreamEvent
      }
      yield {
        type: 'content_block_delta',
        index: block.index,
        delta: { type: 'thinking_delta', thinking: frame.text },
      } as BetaRawMessageStreamEvent
      continue
    }

    // toolCall
    yield* ensureStarted()
    const tc = frame.toolCall
    if (current && (current.kind !== 'tool' || current.toolId !== tc.id)) {
      yield* closeCurrent()
    }
    let block: CurrentBlock | null = current
    if (!block || block.kind !== 'tool') {
      contentIndex++
      toolCallCount++
      const toolId =
        tc.id || `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`
      block = {
        kind: 'tool',
        index: contentIndex,
        toolId,
        name: tc.function.name,
        args: '',
      }
      current = block
      yield {
        type: 'content_block_start',
        index: block.index,
        content_block: {
          type: 'tool_use',
          id: toolId,
          name: tc.function.name,
          input: {},
        },
      } as BetaRawMessageStreamEvent
    }

    // Accumulate argument fragments. Cursor streams incremental fragments;
    // skip the '{}' placeholder the decoder emits when a frame carries no raw
    // args so it doesn't corrupt real JSON accumulation.
    const fragment = tc.function.arguments || ''
    if (fragment && fragment !== '{}') {
      block.args += fragment
    }
  }

  if (current) yield* closeCurrent()

  if (started) {
    yield {
      type: 'message_delta',
      delta: {
        stop_reason: toolCallCount > 0 ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    } as BetaRawMessageStreamEvent

    yield {
      type: 'message_stop',
    } as BetaRawMessageStreamEvent
  }
}
