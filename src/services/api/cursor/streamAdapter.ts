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
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const frames = splitThinkingFinalMarker(rawFrames)

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
