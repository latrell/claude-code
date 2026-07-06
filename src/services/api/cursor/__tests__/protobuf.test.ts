import { describe, expect, test } from 'bun:test'
import { encodeVarint, encodeField } from '../protobufEncoder.js'
import { decodeVarint, decodeMessage } from '../protobufDecoder.js'
import { WIRE_TYPE, FIELD } from '../protobufSchema.js'
import {
  generateCursorBody,
  wrapConnectRPCFrame,
  extractTextFromResponse,
} from '../protobuf.js'

describe('varint encoding', () => {
  test('round-trips small and large values', () => {
    for (const value of [0, 1, 127, 128, 300, 16384, 1_000_000]) {
      const encoded = encodeVarint(value)
      const [decoded, offset] = decodeVarint(encoded, 0)
      expect(decoded).toBe(value)
      expect(offset).toBe(encoded.length)
    }
  })
})

describe('decodeMessage', () => {
  test('decodes a LEN field containing a string', () => {
    const buf = encodeField(1, WIRE_TYPE.LEN, 'hello')
    const fields = decodeMessage(buf)
    const entry = fields.get(1)?.[0]
    expect(entry).toBeDefined()
    expect(new TextDecoder().decode(entry?.value as Uint8Array)).toBe('hello')
  })

  test('decodes a VARINT field', () => {
    const buf = encodeField(2, WIRE_TYPE.VARINT, 42)
    const fields = decodeMessage(buf)
    expect(fields.get(2)?.[0]?.value).toBe(42)
  })
})

describe('generateCursorBody', () => {
  test('wraps the request in top-level field 1', () => {
    const body = generateCursorBody(
      [{ role: 'user', content: 'hi' }],
      'claude-4.5-sonnet',
    )
    expect(body.length).toBeGreaterThan(0)
    const fields = decodeMessage(body)
    // Top-level StreamUnifiedChatWithTools request is field 1 (Request.REQUEST)
    expect(fields.has(FIELD.Request.REQUEST)).toBe(true)
  })

  test('throws on empty messages', () => {
    expect(() => generateCursorBody([], 'm')).toThrow()
  })
})

describe('wrapConnectRPCFrame', () => {
  test('prefixes a 5-byte header with big-endian length', () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    const frame = wrapConnectRPCFrame(payload, false)
    expect(frame[0]).toBe(0x00) // uncompressed flag
    const length =
      (frame[1] << 24) | (frame[2] << 16) | (frame[3] << 8) | frame[4]
    expect(length).toBe(4)
    expect(Array.from(frame.slice(5))).toEqual([1, 2, 3, 4])
  })

  test('sets compression flag and shrinks large payloads', () => {
    const payload = new Uint8Array(2000).fill(65) // highly compressible
    const frame = wrapConnectRPCFrame(payload, true)
    expect(frame[0]).toBe(0x01) // gzip flag
    expect(frame.length).toBeLessThan(payload.length)
  })
})

describe('extractTextFromResponse', () => {
  test('extracts text from a StreamUnifiedChatResponse frame', () => {
    const responseInner = encodeField(
      FIELD.ChatResponse.TEXT,
      WIRE_TYPE.LEN,
      'Hello there',
    )
    const top = encodeField(
      FIELD.Response.RESPONSE,
      WIRE_TYPE.LEN,
      responseInner,
    )
    const result = extractTextFromResponse(top)
    expect(result.text).toBe('Hello there')
    expect(result.error).toBeNull()
    expect(result.toolCall).toBeNull()
  })

  test('extracts thinking text', () => {
    const thinkingInner = encodeField(
      FIELD.Thinking.TEXT,
      WIRE_TYPE.LEN,
      'pondering',
    )
    const responseInner = encodeField(
      FIELD.ChatResponse.THINKING,
      WIRE_TYPE.LEN,
      thinkingInner,
    )
    const top = encodeField(
      FIELD.Response.RESPONSE,
      WIRE_TYPE.LEN,
      responseInner,
    )
    const result = extractTextFromResponse(top)
    expect(result.thinking).toBe('pondering')
  })

  test('returns no error for an empty payload', () => {
    const result = extractTextFromResponse(new Uint8Array(0))
    expect(result.error).toBeNull()
    expect(result.text).toBeNull()
  })

  test('treats a structurally valid metadata frame as a no-op, not an error', () => {
    // Cursor interleaves metadata frames (message ids, usage stats, system
    // notices) that decode to field 2 with no text/thinking payload. These
    // must NOT surface as "Malformed protobuf response" or the stream aborts
    // before the real text frames arrive.
    const responseInner = encodeField(
      22, // a non-text sub-field (e.g. an id), not ChatResponse.TEXT/THINKING
      WIRE_TYPE.LEN,
      'b8e0f-metadata',
    )
    const top = encodeField(
      FIELD.Response.RESPONSE,
      WIRE_TYPE.LEN,
      responseInner,
    )
    const result = extractTextFromResponse(top)
    expect(result.error).toBeNull()
    expect(result.text).toBeNull()
    expect(result.thinking).toBeNull()
    expect(result.toolCall).toBeNull()
  })

  test('flags a genuinely undecodable payload as malformed', () => {
    // field 1, LEN, claims 5 bytes but only 1 follows → decodes to zero fields.
    const result = extractTextFromResponse(new Uint8Array([0x0a, 0x05, 0x01]))
    expect(result.error).toBe('Malformed protobuf response')
  })
})
