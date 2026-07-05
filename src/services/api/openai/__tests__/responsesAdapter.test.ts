import { describe, expect, test } from 'bun:test'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  extractUsage,
} from '../responsesAdapter.js'

describe('buildResponsesRequest', () => {
  test('includes reasoning effort for ChatGPT Responses requests', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'xhigh',
    })

    expect(request.reasoning).toEqual({ effort: 'xhigh' })
  })

  test('does not include unsupported max_output_tokens parameter', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    }) as Record<string, unknown>

    expect('max_output_tokens' in request).toBe(false)
  })
})

describe('adaptResponsesStreamToAnthropic', () => {
  test('emits text from completed message output items when text deltas are absent', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          content: [],
        },
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '继续修复测试',
            },
          ],
        },
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 5,
            output_tokens: 3,
          },
        },
      },
    ]

    const stream = adaptResponsesStreamToAnthropic(
      (async function* () {
        for (const event of events) yield event
      })(),
      'gpt-5.5',
    )

    const output = []
    for await (const event of stream) output.push(event)

    expect(output).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: '继续修复测试' },
    })
    expect(output).toContainEqual({
      type: 'message_stop',
    })
  })
})

describe('extractUsage', () => {
  test('returns zeros for undefined response', () => {
    const usage = extractUsage(undefined)
    expect(usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })

  test('extracts usage from ChatGPT Responses API response', () => {
    const response: Record<string, unknown> = {
      usage: {
        input_tokens: 1200,
        output_tokens: 300,
        input_tokens_details: {
          cached_tokens: 640,
        },
      },
    }
    const usage = extractUsage(response)
    expect(usage).toEqual({
      input_tokens: 1200,
      output_tokens: 300,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 640,
    })
  })

  test('handles missing input_tokens_details', () => {
    const response: Record<string, unknown> = {
      usage: {
        input_tokens: 500,
        output_tokens: 100,
      },
    }
    const usage = extractUsage(response)
    expect(usage.cache_read_input_tokens).toBe(0)
    expect(usage.cache_creation_input_tokens).toBe(0)
  })

  test('handles missing usage entirely', () => {
    const response: Record<string, unknown> = { status: 'completed' }
    const usage = extractUsage(response)
    expect(usage.input_tokens).toBe(0)
    expect(usage.output_tokens).toBe(0)
  })
})
