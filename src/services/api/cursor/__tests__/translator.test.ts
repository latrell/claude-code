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

  test('renders tool results as structured user blocks with remembered names', () => {
    const messages: OpenAIMessage[] = [
      { role: 'user', content: 'read the file' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents here' },
    ]
    const result = convertOpenAIMessagesToCursor(messages)
    // user + tool-result user (empty assistant dropped)
    expect(result).toHaveLength(2)
    const toolResult = result[1]
    expect(toolResult.role).toBe('user')
    expect(toolResult.content).toContain('<tool_result>')
    expect(toolResult.content).toContain('<tool_name>read_file</tool_name>')
    expect(toolResult.content).toContain('<tool_call_id>call_1</tool_call_id>')
    expect(toolResult.content).toContain('file contents here')
  })

  test('escapes XML-sensitive characters in tool results', () => {
    const result = convertOpenAIMessagesToCursor([
      { role: 'tool', tool_call_id: 'c1', name: 'grep', content: '<a> & </b>' },
    ])
    expect(result[0].content).toContain('&lt;a&gt; &amp; &lt;/b&gt;')
  })
})
