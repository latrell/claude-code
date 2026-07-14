import { describe, expect, test } from 'bun:test'
import { streamGeminiGenerateContent } from '../client.js'

describe('streamGeminiGenerateContent', () => {
  test('passes the request signal and cancels the SSE body on early return', async () => {
    const abortController = new AbortController()
    let capturedSignal: AbortSignal | null | undefined
    let bodyCancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n',
          ),
        )
      },
      cancel() {
        bodyCancelled = true
      },
    })
    const fetchOverride = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      capturedSignal = init?.signal
      return new Response(body, { status: 200 })
    }) as typeof fetch
    const stream = streamGeminiGenerateContent({
      model: 'gemini-test',
      body: { contents: [] },
      signal: abortController.signal,
      fetchOverride,
      envOverride: { GEMINI_API_KEY: 'test-key' },
    })

    expect((await stream.next()).done).toBe(false)
    await stream.return()

    expect(capturedSignal).toBe(abortController.signal)
    expect(bodyCancelled).toBe(true)
  })
})
