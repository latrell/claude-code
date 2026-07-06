import { describe, expect, test } from 'bun:test'
import { encodeField } from '../protobufEncoder.js'
import { WIRE_TYPE, FIELD, COMPRESS_FLAG } from '../protobufSchema.js'
import { StreamingFrameParser } from '../streamParser.js'

/** Wrap a payload in a ConnectRPC envelope: [flags:1][len:4BE][payload]. */
function frame(
  payload: Uint8Array,
  flags: number = COMPRESS_FLAG.NONE,
): Buffer {
  const header = Buffer.alloc(5)
  header[0] = flags
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, Buffer.from(payload)])
}

function textResponsePayload(text: string): Uint8Array {
  const inner = encodeField(FIELD.ChatResponse.TEXT, WIRE_TYPE.LEN, text)
  return encodeField(FIELD.Response.RESPONSE, WIRE_TYPE.LEN, inner)
}

describe('StreamingFrameParser', () => {
  test('parses a text response frame', () => {
    const parser = new StreamingFrameParser()
    const results = parser.push(frame(textResponsePayload('hello world')))
    expect(results).toEqual([{ type: 'text', text: 'hello world' }])
  })

  test('reassembles frames split across chunk boundaries', () => {
    const parser = new StreamingFrameParser()
    const full = frame(textResponsePayload('split me'))
    expect(parser.push(full.subarray(0, 4))).toEqual([])
    const results = parser.push(full.subarray(4))
    expect(results).toEqual([{ type: 'text', text: 'split me' }])
  })

  test('treats an ERROR_USER_ABORTED_REQUEST end-stream trailer as benign', () => {
    // Cursor ends a tool-calling turn with this trailer because the chat RPC is
    // server-streaming and we don't return the tool result on the same stream.
    // It must NOT surface as an error, or the whole turn aborts after the tool
    // call is emitted.
    const parser = new StreamingFrameParser()
    const trailer = Buffer.from(
      JSON.stringify({
        error: {
          code: 'aborted',
          message: 'Error',
          details: [
            {
              type: 'aiserver.v1.ErrorDetails',
              debug: {
                error: 'ERROR_USER_ABORTED_REQUEST',
                details: {
                  title: 'User aborted request.',
                  detail: 'Tool call ended before result was received',
                },
                isExpected: true,
              },
            },
          ],
        },
      }),
    )
    const results = parser.push(frame(trailer, COMPRESS_FLAG.END_STREAM))
    expect(results).toEqual([])
  })

  test('surfaces a genuine error trailer', () => {
    const parser = new StreamingFrameParser()
    const trailer = Buffer.from(
      JSON.stringify({
        error: {
          code: 'resource_exhausted',
          message: 'rate limited',
          details: [
            {
              debug: {
                error: 'ERROR_RATE_LIMIT',
                details: { title: 'Too many requests' },
              },
            },
          ],
        },
      }),
    )
    const results = parser.push(frame(trailer, COMPRESS_FLAG.END_STREAM))
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'error',
      status: 429,
      errorType: 'rate_limit_error',
    })
  })

  test('ignores an empty (successful) end-stream trailer', () => {
    const parser = new StreamingFrameParser()
    const results = parser.push(
      frame(Buffer.from('{}'), COMPRESS_FLAG.END_STREAM),
    )
    expect(results).toEqual([])
  })
})
