import { describe, expect, test } from 'bun:test'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { isRetryableCompatError } from '../../compatRetry.js'
import {
  EmptyOpenAICompletionError,
  holdUntilObservableOpenAIOutput,
} from '../observableOutputGuard.js'

function event(value: Record<string, unknown>): BetaRawMessageStreamEvent {
  return value as unknown as BetaRawMessageStreamEvent
}

async function* eventStream(
  events: BetaRawMessageStreamEvent[],
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  yield* events
}

async function collect(
  events: BetaRawMessageStreamEvent[],
): Promise<BetaRawMessageStreamEvent[]> {
  const output: BetaRawMessageStreamEvent[] = []
  for await (const item of holdUntilObservableOpenAIOutput(
    eventStream(events),
  )) {
    output.push(item)
  }
  return output
}

const messageStart = event({
  type: 'message_start',
  message: {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'deepseek-v4-flash',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  },
})

const messageStop = event({ type: 'message_stop' })

function messageDelta(stopReason: string): BetaRawMessageStreamEvent {
  return event({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  })
}

describe('holdUntilObservableOpenAIOutput', () => {
  test('rejects a completed thinking-only response before publishing events', async () => {
    const published: BetaRawMessageStreamEvent[] = []
    let caught: unknown

    try {
      for await (const item of holdUntilObservableOpenAIOutput(
        eventStream([
          messageStart,
          event({
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          }),
          event({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'Reasoning only.' },
          }),
          event({ type: 'content_block_stop', index: 0 }),
          messageDelta('end_turn'),
          messageStop,
        ]),
      )) {
        published.push(item)
      }
    } catch (error) {
      caught = error
    }

    expect(published).toEqual([])
    expect(caught).toBeInstanceOf(EmptyOpenAICompletionError)
    expect(isRetryableCompatError(caught)).toBe(true)
  })

  test('replays reasoning and whitespace prefixes when non-blank text arrives', async () => {
    const output = await collect([
      messageStart,
      event({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }),
      event({ type: 'content_block_stop', index: 0 }),
      event({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      }),
      event({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: '  ' },
      }),
      event({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'OK' },
      }),
      event({ type: 'content_block_stop', index: 1 }),
      messageDelta('end_turn'),
      messageStop,
    ])

    expect(output.map(item => item.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_stop',
      'content_block_start',
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ])
  })

  test('releases a tool call without waiting for message_stop', async () => {
    const guarded = holdUntilObservableOpenAIOutput(
      eventStream([
        messageStart,
        event({
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'toolu_test',
            name: 'Bash',
            input: {},
          },
        }),
        event({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"cmd":"pwd"}' },
        }),
      ]),
    )

    expect((await guarded.next()).value?.type).toBe('message_start')
    expect((await guarded.next()).value?.type).toBe('content_block_start')
    await guarded.return()
  })

  test('preserves a thinking-only max-token response for query recovery', async () => {
    const output = await collect([
      messageStart,
      event({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }),
      event({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Long reasoning.' },
      }),
      event({ type: 'content_block_stop', index: 0 }),
      messageDelta('max_tokens'),
      messageStop,
    ])

    expect(output.at(-1)?.type).toBe('message_stop')
    expect(
      output.some(
        item =>
          item.type === 'content_block_delta' &&
          item.delta.type === 'thinking_delta',
      ),
    ).toBe(true)
  })

  test('rejects whitespace-only text as an empty completion', async () => {
    await expect(
      collect([
        messageStart,
        event({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
        event({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' \n\t ' },
        }),
        event({ type: 'content_block_stop', index: 0 }),
        messageDelta('end_turn'),
        messageStop,
      ]),
    ).rejects.toBeInstanceOf(EmptyOpenAICompletionError)
  })

  test('keeps a reasoning-only EOF inside the retry boundary', async () => {
    const published: BetaRawMessageStreamEvent[] = []
    let caught: unknown

    try {
      for await (const item of holdUntilObservableOpenAIOutput(
        eventStream([
          messageStart,
          event({
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          }),
        ]),
      )) {
        published.push(item)
      }
    } catch (error) {
      caught = error
    }

    expect(published).toEqual([])
    expect((caught as Error).message).toContain('message_stop terminal event')
    expect(isRetryableCompatError(caught)).toBe(true)
  })
})
