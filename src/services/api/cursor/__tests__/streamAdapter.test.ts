import { describe, expect, test } from 'bun:test'
import {
  adaptCursorFramesToAnthropic,
  CursorStreamError,
  splitThinkingFinalMarker,
} from '../streamAdapter.js'
import type { FrameResult } from '../streamParser.js'

async function* framesFrom(frames: FrameResult[]): AsyncGenerator<FrameResult> {
  for (const frame of frames) yield frame
}

async function collect(
  frames: FrameResult[],
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = []
  for await (const event of adaptCursorFramesToAnthropic(
    framesFrom(frames),
    'claude-4.5-sonnet',
  )) {
    out.push(event as unknown as Record<string, unknown>)
  }
  return out
}

describe('adaptCursorFramesToAnthropic', () => {
  test('maps text frames to an Anthropic text block sequence', async () => {
    const events = await collect([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ])
    const types = events.map(e => e.type)
    expect(types[0]).toBe('message_start')
    expect(types).toContain('content_block_start')
    expect(types.filter(t => t === 'content_block_delta')).toHaveLength(2)
    expect(types).toContain('content_block_stop')
    expect(types.at(-2)).toBe('message_delta')
    expect(types.at(-1)).toBe('message_stop')

    const delta = events.find(e => e.type === 'message_delta') as {
      delta: { stop_reason: string }
    }
    expect(delta.delta.stop_reason).toBe('end_turn')
  })

  test('accumulates tool-call argument fragments into one input_json_delta', async () => {
    const events = await collect([
      {
        type: 'toolCall',
        toolCall: {
          id: 't1',
          type: 'function',
          function: { name: 'read', arguments: '{"path"' },
          isLast: false,
        },
      },
      {
        type: 'toolCall',
        toolCall: {
          id: 't1',
          type: 'function',
          function: { name: 'read', arguments: ':"a.txt"}' },
          isLast: true,
        },
      },
    ])

    const start = events.find(
      e =>
        e.type === 'content_block_start' &&
        (e.content_block as { type: string }).type === 'tool_use',
    ) as { content_block: { name: string; id: string } }
    expect(start.content_block.name).toBe('read')

    const jsonDeltas = events.filter(
      e =>
        e.type === 'content_block_delta' &&
        (e.delta as { type: string }).type === 'input_json_delta',
    ) as Array<{ delta: { partial_json: string } }>
    const combined = jsonDeltas.map(d => d.delta.partial_json).join('')
    expect(combined).toBe('{"path":"a.txt"}')

    const messageDelta = events.find(e => e.type === 'message_delta') as {
      delta: { stop_reason: string }
    }
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
  })

  test('throws CursorStreamError on an error frame', async () => {
    await expect(
      collect([
        {
          type: 'error',
          message: 'rate limited',
          status: 429,
          errorType: 'rate_limit_error',
        },
      ]),
    ).rejects.toBeInstanceOf(CursorStreamError)
  })

  test('emits nothing for an empty stream', async () => {
    const events = await collect([])
    expect(events).toHaveLength(0)
  })

  test('routes Composer final-marker content into a text block', async () => {
    // Composer streams `reasoning</think><｜final｜>answer` entirely through
    // the thinking channel; the split must surface "answer" as a text block
    // or the assistant message renders empty.
    const events = await collect([
      { type: 'thinking', text: 'pondering the repo state' },
      { type: 'thinking', text: '</think><｜final｜>**COMPLETED**' },
    ])
    const textDeltas = events
      .filter(
        e =>
          e.type === 'content_block_delta' &&
          (e.delta as { type: string }).type === 'text_delta',
      )
      .map(e => (e.delta as { text: string }).text)
    expect(textDeltas.join('')).toBe('**COMPLETED**')

    const thinkingDeltas = events
      .filter(
        e =>
          e.type === 'content_block_delta' &&
          (e.delta as { type: string }).type === 'thinking_delta',
      )
      .map(e => (e.delta as { thinking: string }).thinking)
    expect(thinkingDeltas.join('')).toBe('pondering the repo state')
  })
})

describe('splitThinkingFinalMarker', () => {
  async function* thinkingFrames(
    chunks: string[],
  ): AsyncGenerator<FrameResult> {
    for (const text of chunks) yield { type: 'thinking', text }
  }

  async function splitAll(chunks: string[]): Promise<FrameResult[]> {
    const out: FrameResult[] = []
    for await (const frame of splitThinkingFinalMarker(
      thinkingFrames(chunks),
    )) {
      out.push(frame)
    }
    return out
  }

  function joined(frames: FrameResult[], type: 'text' | 'thinking'): string {
    return frames
      .filter(f => f.type === type)
      .map(f => (f as { text: string }).text)
      .join('')
  }

  test('passes plain thinking through unchanged', async () => {
    const frames = await splitAll(['step one', ' step two'])
    expect(joined(frames, 'thinking')).toBe('step one step two')
    expect(joined(frames, 'text')).toBe('')
  })

  test('splits a marker that arrives fragmented across frames', async () => {
    const frames = await splitAll([
      'reasoning…',
      '</th',
      'ink><｜fin',
      'al｜>**COMP',
      'LETED**',
    ])
    expect(joined(frames, 'thinking')).toBe('reasoning…')
    expect(joined(frames, 'text')).toBe('**COMPLETED**')
  })

  test('supports the ASCII |final| marker variant', async () => {
    const frames = await splitAll(['thoughts</think><|final|>answer'])
    expect(joined(frames, 'thinking')).toBe('thoughts')
    expect(joined(frames, 'text')).toBe('answer')
  })

  test('keeps streaming post-marker thinking frames as text', async () => {
    const frames = await splitAll(['a</think><｜final｜>first', ' second'])
    expect(joined(frames, 'text')).toBe('first second')
  })
})
