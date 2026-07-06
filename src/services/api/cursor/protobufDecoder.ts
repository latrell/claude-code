/**
 * Cursor Protobuf Decoder
 * Implements ConnectRPC protobuf wire format decoding.
 *
 * Reference: https://github.com/eisbaw/cursor_api_demo
 */

import * as zlib from 'zlib'
import {
  WIRE_TYPE,
  FIELD,
  isCompressedConnectFrame,
  type WireType,
} from './protobufSchema.js'

/**
 * Decode a varint from a buffer.
 * @returns [value, newOffset]
 */
export function decodeVarint(
  buffer: Uint8Array,
  offset: number,
): [number, number] {
  let result = 0
  let shift = 0
  let pos = offset
  const maxBytes = 5

  while (pos < buffer.length && pos - offset < maxBytes) {
    const b = buffer[pos]
    result |= (b & 0x7f) << shift
    pos++
    if (!(b & 0x80)) break
    shift += 7
  }

  return [result >>> 0, pos] // Ensure unsigned
}

/**
 * Decode a single protobuf field.
 * @returns [fieldNum, wireType, value, newOffset]
 */
export function decodeField(
  buffer: Uint8Array,
  offset: number,
): [number | null, WireType | null, Uint8Array | number | null, number] {
  if (offset >= buffer.length) {
    return [null, null, null, offset]
  }

  const [tag, pos1] = decodeVarint(buffer, offset)
  const fieldNum = tag >> 3
  const wireType = (tag & 0x07) as WireType

  let value: Uint8Array | number | null
  let pos = pos1

  if (wireType === WIRE_TYPE.VARINT) {
    ;[value, pos] = decodeVarint(buffer, pos)
  } else if (wireType === WIRE_TYPE.LEN) {
    const [length, pos2] = decodeVarint(buffer, pos)
    if (pos2 + length > buffer.length) {
      return [null, null, null, buffer.length]
    }
    value = buffer.slice(pos2, pos2 + length)
    pos = pos2 + length
  } else if (wireType === WIRE_TYPE.FIXED64) {
    if (pos + 8 > buffer.length) {
      return [null, null, null, buffer.length]
    }
    value = buffer.slice(pos, pos + 8)
    pos += 8
  } else if (wireType === WIRE_TYPE.FIXED32) {
    if (pos + 4 > buffer.length) {
      return [null, null, null, buffer.length]
    }
    value = buffer.slice(pos, pos + 4)
    pos += 4
  } else {
    value = null
  }

  return [fieldNum, wireType, value, pos]
}

/**
 * Decode a protobuf message into a map of fields.
 */
export function decodeMessage(
  data: Uint8Array,
): Map<number, Array<{ wireType: WireType; value: Uint8Array | number }>> {
  const fields = new Map<
    number,
    Array<{ wireType: WireType; value: Uint8Array | number }>
  >()
  let pos = 0

  while (pos < data.length) {
    const [fieldNum, wireType, value, newPos] = decodeField(data, pos)
    if (fieldNum === null || wireType === null || value === null) break

    if (!fields.has(fieldNum)) {
      fields.set(fieldNum, [])
    }
    const fieldArray = fields.get(fieldNum)
    if (fieldArray) {
      fieldArray.push({ wireType, value: value as Uint8Array | number })
    }
    pos = newPos
  }

  return fields
}

/**
 * Parse a single ConnectRPC frame from a buffer.
 * @returns frame data or null if incomplete
 */
export function parseConnectRPCFrame(buffer: Buffer): {
  flags: number
  length: number
  payload: Uint8Array
  consumed: number
} | null {
  if (buffer.length < 5) return null

  const flags = buffer[0]
  const length =
    (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4]

  if (buffer.length < 5 + length) return null

  let payload = buffer.slice(5, 5 + length)

  if (isCompressedConnectFrame(flags)) {
    try {
      payload = Buffer.from(zlib.gunzipSync(payload))
    } catch {
      // Decompression failed, fall back to raw payload
    }
  }

  return {
    flags,
    length,
    payload: new Uint8Array(payload),
    consumed: 5 + length,
  }
}

/**
 * Extract a tool call from protobuf data.
 */
function extractToolCall(toolCallData: Uint8Array): {
  id: string
  type: string
  function: { name: string; arguments: string }
  isLast: boolean
} | null {
  const toolCall = decodeMessage(toolCallData)
  let toolCallId = ''
  let toolName = ''
  let rawArgs = ''
  let isLast = false

  if (toolCall.has(FIELD.ToolCall.ID)) {
    const idField = toolCall.get(FIELD.ToolCall.ID)
    if (idField?.[0]) {
      const fullId = new TextDecoder().decode(idField[0].value as Uint8Array)
      toolCallId = fullId.split('\n')[0] // Take first line
    }
  }

  if (toolCall.has(FIELD.ToolCall.NAME)) {
    const nameField = toolCall.get(FIELD.ToolCall.NAME)
    if (nameField?.[0]) {
      toolName = new TextDecoder().decode(nameField[0].value as Uint8Array)
    }
  }

  if (toolCall.has(FIELD.ToolCall.IS_LAST)) {
    const lastField = toolCall.get(FIELD.ToolCall.IS_LAST)
    if (lastField?.[0]) {
      isLast = (lastField[0].value as number) !== 0
    }
  }

  // MCP params carry nested real tool info
  if (toolCall.has(FIELD.ToolCall.MCP_PARAMS)) {
    try {
      const mcpField = toolCall.get(FIELD.ToolCall.MCP_PARAMS)
      if (!mcpField?.[0]) return null

      const mcpParams = decodeMessage(mcpField[0].value as Uint8Array)

      if (mcpParams.has(FIELD.McpParams.TOOLS_LIST)) {
        const toolsList = mcpParams.get(FIELD.McpParams.TOOLS_LIST)
        if (!toolsList?.[0]) return null

        const tool = decodeMessage(toolsList[0].value as Uint8Array)

        if (tool.has(FIELD.McpNested.NAME)) {
          const nestedName = tool.get(FIELD.McpNested.NAME)
          if (nestedName?.[0]) {
            toolName = new TextDecoder().decode(
              nestedName[0].value as Uint8Array,
            )
          }
        }

        if (tool.has(FIELD.McpNested.PARAMS)) {
          const nestedParams = tool.get(FIELD.McpNested.PARAMS)
          if (nestedParams?.[0]) {
            rawArgs = new TextDecoder().decode(
              nestedParams[0].value as Uint8Array,
            )
          }
        }
      }
    } catch {
      // MCP parse error, continue with what we have
    }
  }

  // Fallback to raw_args
  if (!rawArgs && toolCall.has(FIELD.ToolCall.RAW_ARGS)) {
    const rawArgsField = toolCall.get(FIELD.ToolCall.RAW_ARGS)
    if (rawArgsField?.[0]) {
      rawArgs = new TextDecoder().decode(rawArgsField[0].value as Uint8Array)
    }
  }

  if (toolCallId && toolName) {
    return {
      id: toolCallId,
      type: 'function',
      function: {
        name: toolName,
        arguments: rawArgs || '{}',
      },
      isLast,
    }
  }

  return null
}

/**
 * Extract text and thinking from response data.
 */
function extractTextAndThinking(responseData: Uint8Array): {
  text: string | null
  thinking: string | null
} {
  const nested = decodeMessage(responseData)
  let text: string | null = null
  let thinking: string | null = null

  if (nested.has(FIELD.ChatResponse.TEXT)) {
    const textField = nested.get(FIELD.ChatResponse.TEXT)
    if (textField?.[0]) {
      text = new TextDecoder().decode(textField[0].value as Uint8Array)
    }
  }

  if (nested.has(FIELD.ChatResponse.THINKING)) {
    try {
      const thinkingField = nested.get(FIELD.ChatResponse.THINKING)
      if (thinkingField?.[0]) {
        const thinkingMsg = decodeMessage(thinkingField[0].value as Uint8Array)
        if (thinkingMsg.has(FIELD.Thinking.TEXT)) {
          const thinkingTextField = thinkingMsg.get(FIELD.Thinking.TEXT)
          if (thinkingTextField?.[0]) {
            thinking = new TextDecoder().decode(
              thinkingTextField[0].value as Uint8Array,
            )
          }
        }
      }
    } catch {
      // Thinking parse error, continue
    }
  }

  return { text, thinking }
}

/**
 * Extract text, thinking, and tool calls from a decoded response payload.
 */
export function extractTextFromResponse(payload: Uint8Array): {
  text: string | null
  error: string | null
  toolCall: {
    id: string
    type: string
    function: { name: string; arguments: string }
    isLast: boolean
  } | null
  thinking: string | null
} {
  try {
    const fields = decodeMessage(payload)

    // Field 1: ClientSideToolV2Call
    if (fields.has(FIELD.Response.TOOL_CALL)) {
      const toolCallField = fields.get(FIELD.Response.TOOL_CALL)
      if (toolCallField?.[0]) {
        const toolCall = extractToolCall(toolCallField[0].value as Uint8Array)
        if (toolCall) {
          return { text: null, error: null, toolCall, thinking: null }
        }
      }
    }

    // Field 2: StreamUnifiedChatResponse
    if (fields.has(FIELD.Response.RESPONSE)) {
      const responseField = fields.get(FIELD.Response.RESPONSE)
      if (responseField?.[0]) {
        const { text, thinking } = extractTextAndThinking(
          responseField[0].value as Uint8Array,
        )

        if (text || thinking) {
          return { text, error: null, toolCall: null, thinking }
        }
      }
    }

    // A structurally valid frame that carries no text/thinking/tool-call is a
    // metadata frame, not an error. Cursor interleaves many of these around the
    // actual content: message/conversation ids (RESPONSE sub-field 22), usage
    // stats (sub-field 30), system notices like the "old version" banner
    // (sub-field 20), and tool-call frames still being assembled. Treat them as
    // no-ops so the stream keeps flowing to the real text frames. Only a
    // non-empty payload that decoded into zero protobuf fields is malformed.
    if (fields.size === 0 && payload.length > 0) {
      return {
        text: null,
        error: 'Malformed protobuf response',
        toolCall: null,
        thinking: null,
      }
    }

    return { text: null, error: null, toolCall: null, thinking: null }
  } catch {
    return {
      text: null,
      error: 'Malformed protobuf response',
      toolCall: null,
      thinking: null,
    }
  }
}
