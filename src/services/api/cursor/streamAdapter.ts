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

export async function* adaptCursorFramesToAnthropic(
  frames: AsyncIterable<FrameResult>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`

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
