import { describe, expect, test } from 'bun:test'
import {
  adaptCursorFramesToAnthropic,
  CursorStreamError,
  extractInlineToolCalls,
  splitThinkingFinalMarker,
} from '../streamAdapter.js'
import type { CursorTool } from '../protobufSchema.js'
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
    // Marker scanners may merge small chunks (holdback), so assert on the
    // combined text rather than the delta count.
    const textDeltas = events
      .filter(
        e =>
          e.type === 'content_block_delta' &&
          (e.delta as { type: string }).type === 'text_delta',
      )
      .map(e => (e.delta as { text: string }).text)
    expect(textDeltas.join('')).toBe('Hello world')
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

  test('splits on a bare </think> close tag with no final marker', async () => {
    // Composer sometimes ends reasoning with just `</think>\nanswer` — the
    // answer must still surface as text or the turn renders empty.
    const frames = await splitAll([
      'The user wants exactly "OK".',
      '\n</think>\nOK',
    ])
    expect(joined(frames, 'thinking')).toBe('The user wants exactly "OK".')
    expect(joined(frames, 'text')).toBe('OK')
  })

  test('splits a fragmented bare close tag across frames', async () => {
    const frames = await splitAll(['reasoning</th', 'ink>', '\nO', 'K'])
    expect(joined(frames, 'thinking')).toBe('reasoning')
    expect(joined(frames, 'text')).toBe('OK')
  })

  test('post-close text starting with < that is not a marker is preserved', async () => {
    const frames = await splitAll(['r</think>\n<tag>done</tag>'])
    expect(joined(frames, 'thinking')).toBe('r')
    expect(joined(frames, 'text')).toBe('<tag>done</tag>')
  })

  test('thinking ending at </think> with no answer emits no text', async () => {
    const frames = await splitAll(['only reasoning</think>'])
    expect(joined(frames, 'thinking')).toBe('only reasoning')
    expect(joined(frames, 'text')).toBe('')
  })
})

describe('extractInlineToolCalls', () => {
  const grepTool: CursorTool = {
    function: {
      name: 'Grep',
      description: 'search',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          head_limit: { type: 'number' },
          multiline: { type: 'boolean' },
        },
      },
    },
  }

  async function* textFrames(chunks: string[]): AsyncGenerator<FrameResult> {
    for (const text of chunks) yield { type: 'text', text }
  }

  async function extractAll(
    chunks: string[],
    tools: CursorTool[] = [grepTool],
  ): Promise<FrameResult[]> {
    const out: FrameResult[] = []
    for await (const frame of extractInlineToolCalls(
      textFrames(chunks),
      tools,
    )) {
      out.push(frame)
    }
    return out
  }

  function joinedText(frames: FrameResult[]): string {
    return frames
      .filter(f => f.type === 'text')
      .map(f => (f as { text: string }).text)
      .join('')
  }

  const SAMPLE =
    '正在查找 DISABLE_TELEMETRY 的定义位置。\n\n' +
    '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\n' +
    'Grep\n' +
    '<｜tool▁sep｜>pattern\n' +
    'DISABLE_TELEMETRY\n' +
    '<｜tool▁sep｜>path\n' +
    'D:\\code\\ccb\n' +
    '<｜tool▁call▁end｜><｜tool▁calls▁end｜>'

  test('parses the observed Composer inline call and strips marker text', async () => {
    const frames = await extractAll([SAMPLE])
    const calls = frames.filter(f => f.type === 'toolCall')
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    if (call.type === 'toolCall') {
      expect(call.toolCall.function.name).toBe('Grep')
      expect(JSON.parse(call.toolCall.function.arguments)).toEqual({
        pattern: 'DISABLE_TELEMETRY',
        path: 'D:\\code\\ccb',
      })
      expect(call.toolCall.id).toMatch(/^toolu_inline_/)
    }
    // Marker syntax must never leak into user-visible text.
    expect(joinedText(frames)).toBe('正在查找 DISABLE_TELEMETRY 的定义位置。')
  })

  test('parses calls fragmented across many frames', async () => {
    const chunks = SAMPLE.match(/.{1,7}/gs) ?? []
    const frames = await extractAll(chunks)
    const calls = frames.filter(f => f.type === 'toolCall')
    expect(calls).toHaveLength(1)
    expect(joinedText(frames)).toBe('正在查找 DISABLE_TELEMETRY 的定义位置。')
  })

  test('coerces number/boolean args per the tool schema and keeps value newlines', async () => {
    const frames = await extractAll([
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\nGrep\n' +
        '<｜tool▁sep｜>pattern\nline1\nline2\n' +
        '<｜tool▁sep｜>head_limit\n5\n' +
        '<｜tool▁sep｜>multiline\ntrue\n' +
        '<｜tool▁call▁end｜><｜tool▁calls▁end｜>',
    ])
    const call = frames.find(f => f.type === 'toolCall')!
    if (call.type === 'toolCall') {
      expect(JSON.parse(call.toolCall.function.arguments)).toEqual({
        pattern: 'line1\nline2',
        head_limit: 5,
        multiline: true,
      })
    }
  })

  test('emits one frame per call in a multi-call block', async () => {
    const frames = await extractAll([
      '<｜tool▁calls▁begin｜>' +
        '<｜tool▁call▁begin｜>\nGlob\n<｜tool▁sep｜>file_search_pattern\n**/grep*\n<｜tool▁call▁end｜>' +
        '<｜tool▁call▁begin｜>\nGlob\n<｜tool▁sep｜>file_search_pattern\n**/*Grep*\n<｜tool▁call▁end｜>' +
        '<｜tool▁calls▁end｜>',
    ])
    const calls = frames.filter(f => f.type === 'toolCall')
    expect(calls).toHaveLength(2)
    const args = calls.map(c =>
      c.type === 'toolCall'
        ? (JSON.parse(c.toolCall.function.arguments) as Record<string, unknown>)
        : {},
    )
    expect(args[0]).toEqual({ file_search_pattern: '**/grep*' })
    expect(args[1]).toEqual({ file_search_pattern: '**/*Grep*' })
  })

  test('unwraps call_mcp_tool and remaps built-in names', async () => {
    const frames = await extractAll([
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\ncall_mcp_tool\n' +
        '<｜tool▁sep｜>mcpServer\ncustom\n' +
        '<｜tool▁sep｜>toolName\nWebFetch\n' +
        '<｜tool▁sep｜>arguments\n{"url":"https://example.com"}\n' +
        '<｜tool▁call▁end｜><｜tool▁calls▁end｜>' +
        '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\nrun_terminal_cmd\n' +
        '<｜tool▁sep｜>command\ngit status\n' +
        '<｜tool▁call▁end｜><｜tool▁calls▁end｜>',
    ])
    const calls = frames.filter(f => f.type === 'toolCall')
    expect(calls).toHaveLength(2)
    if (calls[0]!.type === 'toolCall') {
      expect(calls[0]!.toolCall.function.name).toBe('WebFetch')
      expect(JSON.parse(calls[0]!.toolCall.function.arguments)).toEqual({
        url: 'https://example.com',
      })
    }
    if (calls[1]!.type === 'toolCall') {
      expect(calls[1]!.toolCall.function.name).toBe('Bash')
      expect(JSON.parse(calls[1]!.toolCall.function.arguments)).toEqual({
        command: 'git status',
      })
    }
  })

  test('normalizes hybrid calls (CCB name + built-in arg names)', async () => {
    // Observed live: composer calls `Read` (CCB name) with read_file's arg
    // shape. Without normalization the CCB schema rejects it and the model
    // burns a turn retrying.
    const frames = await extractAll([
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\nRead\n' +
        '<｜tool▁sep｜>target_file\nD:\\code\\ccb\\package.json\n' +
        '<｜tool▁sep｜>start_line_one_indexed\n1\n' +
        '<｜tool▁sep｜>end_line_one_indexed_inclusive\n5\n' +
        '<｜tool▁sep｜>should_read_entire_file\nfalse\n' +
        '<｜tool▁call▁end｜><｜tool▁calls▁end｜>',
    ])
    const call = frames.find(f => f.type === 'toolCall')!
    if (call.type === 'toolCall') {
      expect(call.toolCall.function.name).toBe('Read')
      expect(JSON.parse(call.toolCall.function.arguments)).toEqual({
        file_path: 'D:\\code\\ccb\\package.json',
        offset: 0,
        limit: 5,
      })
    }
  })

  test('parses the stock DeepSeek function-json variant', async () => {
    const frames = await extractAll([
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>Grep\n' +
        '```json\n{"pattern":"foo","head_limit":3}\n```' +
        '<｜tool▁call▁end｜><｜tool▁calls▁end｜>',
    ])
    const call = frames.find(f => f.type === 'toolCall')!
    if (call.type === 'toolCall') {
      expect(call.toolCall.function.name).toBe('Grep')
      expect(JSON.parse(call.toolCall.function.arguments)).toEqual({
        pattern: 'foo',
        head_limit: 3,
      })
    }
  })

  test('passes plain text through untouched', async () => {
    const frames = await extractAll(['hello ', 'world <tag> not a marker'])
    expect(frames.filter(f => f.type === 'toolCall')).toHaveLength(0)
    expect(joinedText(frames)).toBe('hello world <tag> not a marker')
  })

  test('extracts calls arriving on the thinking channel too', async () => {
    async function* mixed(): AsyncGenerator<FrameResult> {
      yield { type: 'thinking', text: 'planning…' }
      yield {
        type: 'thinking',
        text: '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\nGrep\n<｜tool▁sep｜>pattern\nfoo\n<｜tool▁call▁end｜><｜tool▁calls▁end｜>',
      }
    }
    const out: FrameResult[] = []
    for await (const frame of extractInlineToolCalls(mixed(), [grepTool])) {
      out.push(frame)
    }
    expect(out.filter(f => f.type === 'toolCall')).toHaveLength(1)
    const thinkingText = out
      .filter(f => f.type === 'thinking')
      .map(f => (f as { text: string }).text)
      .join('')
    expect(thinkingText).toBe('planning…')
  })

  test('drops a truncated block at stream end instead of leaking markers', async () => {
    const frames = await extractAll([
      'before ',
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>\nGrep\n<｜tool▁sep｜>pattern\nfoo',
    ])
    expect(frames.filter(f => f.type === 'toolCall')).toHaveLength(0)
    expect(joinedText(frames)).toBe('before')
  })
})
