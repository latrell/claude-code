import { describe, expect, test } from 'bun:test'
import {
  convertOpenAIMessagesToCursor,
  type OpenAIMessage,
} from '../translator.js'

describe('convertOpenAIMessagesToCursor', () => {
  test('prefixes system messages and maps them to a user turn', () => {
    const result = convertOpenAIMessagesToCursor([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hi' },
    ])
    expect(result).toEqual([
      { role: 'user', content: '[System Instructions]\nBe concise.' },
      { role: 'user', content: 'Hi' },
    ])
  })

  test('passes assistant text through and drops empty assistant turns', () => {
    const result = convertOpenAIMessagesToCursor([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'assistant', content: '' },
    ])
    expect(result).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ])
  })

  test('renders UNMAPPED tool results as structured user blocks with remembered names', () => {
    const messages: OpenAIMessage[] = [
      { role: 'user', content: 'do a thing' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'CustomTool', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'tool output here' },
    ]
    const result = convertOpenAIMessagesToCursor(messages)
    // user + tool-result user (empty assistant dropped, unmapped → text block)
    expect(result).toHaveLength(2)
    const toolResult = result[1]
    expect(toolResult.role).toBe('user')
    expect(toolResult.content).toContain('<tool_result>')
    expect(toolResult.content).toContain('<tool_name>CustomTool</tool_name>')
    expect(toolResult.content).toContain('<tool_call_id>call_1</tool_call_id>')
    expect(toolResult.content).toContain('tool output here')
  })

  test('emits a structured tool_result on the assistant turn for a mapped tool', () => {
    const messages: OpenAIMessage[] = [
      { role: 'user', content: 'run git status' },
      {
        role: 'assistant',
        content: 'Running git status.',
        tool_calls: [
          {
            id: 'call_bash',
            type: 'function',
            function: { name: 'Bash', arguments: '{"command":"git status"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_bash',
        content: 'nothing to commit, working tree clean',
      },
    ]
    const result = convertOpenAIMessagesToCursor(messages)
    // user + assistant(with structured tool_result). The tool message is
    // consumed into the assistant turn, not emitted as a separate text block.
    expect(result).toHaveLength(2)
    const assistant = result[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.content).toBe('Running git status.')
    expect(assistant.tool_results).toBeDefined()
    expect(assistant.tool_results?.[0]?.tool_call_id).toBe('call_bash')
    // Mapped to the Cursor built-in name + structured result bytes.
    expect(assistant.tool_results?.[0]?.name).toBe('run_terminal_cmd')
    expect(assistant.tool_results?.[0]?.result).toBeInstanceOf(Uint8Array)
    // No stray <tool_result> user text block for the consumed result.
    expect(result.some(m => (m.content ?? '').includes('<tool_result>'))).toBe(
      false,
    )
  })

  test('escapes XML-sensitive characters in unmapped tool results', () => {
    const result = convertOpenAIMessagesToCursor([
      { role: 'tool', tool_call_id: 'c1', name: 'grep', content: '<a> & </b>' },
    ])
    expect(result[0].content).toContain('&lt;a&gt; &amp; &lt;/b&gt;')
  })
})
