import { describe, expect, test } from 'bun:test'
import { buildResponsesRequest, extractUsage } from '../responsesAdapter.js'

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
