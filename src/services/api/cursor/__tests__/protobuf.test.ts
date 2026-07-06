import { describe, expect, test } from 'bun:test'
import { encodeVarint, encodeField } from '../protobufEncoder.js'
import { decodeVarint, decodeMessage } from '../protobufDecoder.js'
import {
  WIRE_TYPE,
  FIELD,
  CLIENT_SIDE_TOOL,
  CALL_MCP_TOOL_NAME,
  TERMINAL_ENDED_REASON,
} from '../protobufSchema.js'
import {
  generateCursorBody,
  wrapConnectRPCFrame,
  extractTextFromResponse,
} from '../protobuf.js'
import { buildStructuredToolResult } from '../toolMapping.js'

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

  const decodeChat = (body: Uint8Array) => {
    const top = decodeMessage(body)
    const req = top.get(FIELD.Request.REQUEST)?.[0]?.value as Uint8Array
    return decodeMessage(req)
  }

  test('advertises CALL_MCP_TOOL + has_mcp_descriptors + registers unmapped tools as mcp_tools', () => {
    const chat = decodeChat(
      generateCursorBody([{ role: 'user', content: 'do a thing' }], 'gpt-5.5', [
        {
          function: {
            name: 'CustomTool',
            description: 'A custom tool.',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]),
    )

    // supported_tools (field 29) is an unpacked VARINT enum containing
    // CALL_MCP_TOOL — lets generic models invoke our custom mcp_tools.
    const supported = chat.get(FIELD.Chat.SUPPORTED_TOOLS)
    expect(supported?.[0]?.wireType).toBe(WIRE_TYPE.VARINT)
    expect(supported?.map(e => e.value)).toContain(
      CLIENT_SIDE_TOOL.CALL_MCP_TOOL,
    )
    // has_mcp_descriptors (field 90) must be set.
    expect(chat.get(FIELD.Chat.HAS_MCP_DESCRIPTORS)?.[0]?.value).toBe(1)
    // The unmapped tool is registered as an mcp_tool (field 34).
    expect(chat.has(FIELD.Chat.MCP_TOOLS)).toBe(true)
  })

  test('advertises the built-in enum for mapped tools and omits them from mcp_tools', () => {
    const chat = decodeChat(
      generateCursorBody(
        [{ role: 'user', content: 'run git' }],
        'claude-fable-5-thinking-high',
        [
          {
            function: {
              name: 'Bash',
              description: 'Run a shell command.',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      ),
    )

    // Bash maps to the built-in run_terminal_cmd, advertised in supported_tools.
    const supported = chat.get(FIELD.Chat.SUPPORTED_TOOLS)?.map(e => e.value)
    expect(supported).toContain(CLIENT_SIDE_TOOL.RUN_TERMINAL_COMMAND_V2)
    // ...and is NOT registered as an mcp_tool (it uses the built-in channel).
    expect(chat.has(FIELD.Chat.MCP_TOOLS)).toBe(false)
  })

  test('omits agent tool fields when no tools are provided', () => {
    const top = decodeMessage(
      generateCursorBody([{ role: 'user', content: 'hi' }], 'm'),
    )
    const chat = decodeMessage(
      top.get(FIELD.Request.REQUEST)?.[0]?.value as Uint8Array,
    )
    expect(chat.has(FIELD.Chat.SUPPORTED_TOOLS)).toBe(false)
    expect(chat.has(FIELD.Chat.HAS_MCP_DESCRIPTORS)).toBe(false)
    expect(chat.get(FIELD.Chat.IS_AGENTIC)?.[0]?.value).toBe(0)
  })

  test('sets the LARGE_CONTEXT (Max Mode) field from the largeContext flag', () => {
    const decodeLargeContext = (body: Uint8Array): number => {
      const top = decodeMessage(body)
      const req = top.get(FIELD.Request.REQUEST)?.[0]?.value as Uint8Array
      const chat = decodeMessage(req)
      return chat.get(FIELD.Chat.LARGE_CONTEXT)?.[0]?.value as number
    }
    const off = generateCursorBody(
      [{ role: 'user', content: 'hi' }],
      'm',
      [],
      null,
      false,
    )
    const on = generateCursorBody(
      [{ role: 'user', content: 'hi' }],
      'm',
      [],
      null,
      true,
    )
    expect(decodeLargeContext(off)).toBe(0)
    expect(decodeLargeContext(on)).toBe(1)
  })
})

describe('buildStructuredToolResult (Bash → RunTerminalCommandV2Result)', () => {
  const decodeTerminalResult = (resultBytes: Uint8Array) => {
    // ClientSideToolV2Result envelope: { tool=1, run_terminal_command_v2_result=24 }
    const envelope = decodeMessage(resultBytes)
    expect(envelope.get(FIELD.ToolV2Result.TOOL)?.[0]?.value).toBe(
      CLIENT_SIDE_TOOL.RUN_TERMINAL_COMMAND_V2,
    )
    const variant = envelope.get(
      FIELD.ToolV2Result.RUN_TERMINAL_COMMAND_V2_RESULT,
    )?.[0]?.value as Uint8Array
    return decodeMessage(variant)
  }

  test('marks replayed commands as completed and not interrupted', () => {
    const built = buildStructuredToolResult(
      'Bash',
      '{"command":"git status"}',
      'On branch main\nnothing to commit',
    )
    expect(built).not.toBeNull()
    const fields = decodeTerminalResult(built!.result)

    expect(
      new TextDecoder().decode(
        fields.get(FIELD.RunTerminalResult.OUTPUT)?.[0]?.value as Uint8Array,
      ),
    ).toBe('On branch main\nnothing to commit')
    expect(fields.get(FIELD.RunTerminalResult.EXIT_CODE)?.[0]?.value).toBe(0)
    // proto3 bools default to false when omitted: without not_interrupted=true
    // the backend renders every replayed command as interrupted and the model
    // keeps retrying "interrupted" commands that actually succeeded.
    expect(
      fields.get(FIELD.RunTerminalResult.NOT_INTERRUPTED)?.[0]?.value,
    ).toBe(1)
    expect(fields.get(FIELD.RunTerminalResult.ENDED_REASON)?.[0]?.value).toBe(
      TERMINAL_ENDED_REASON.EXECUTION_COMPLETED,
    )
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

  test('unwraps a call_mcp_tool wrapper into the real tool name + args', () => {
    // Custom tools are invoked via the call_mcp_tool wrapper, whose raw_args is
    // a JSON envelope { mcpServer, toolName, arguments }.
    const rawArgs = JSON.stringify({
      mcpServer: 'custom',
      toolName: 'read_file',
      arguments: { path: 'src/index.ts' },
    })
    const toolCallInner = new Uint8Array([
      ...encodeField(
        FIELD.ToolCall.TOOL,
        WIRE_TYPE.VARINT,
        CLIENT_SIDE_TOOL.CALL_MCP_TOOL,
      ),
      ...encodeField(FIELD.ToolCall.ID, WIRE_TYPE.LEN, 'toolu_abc'),
      ...encodeField(FIELD.ToolCall.NAME, WIRE_TYPE.LEN, CALL_MCP_TOOL_NAME),
      ...encodeField(FIELD.ToolCall.RAW_ARGS, WIRE_TYPE.LEN, rawArgs),
    ])
    const top = encodeField(
      FIELD.Response.TOOL_CALL,
      WIRE_TYPE.LEN,
      toolCallInner,
    )

    const result = extractTextFromResponse(top)
    expect(result.toolCall).not.toBeNull()
    expect(result.toolCall?.id).toBe('toolu_abc')
    expect(result.toolCall?.function.name).toBe('read_file')
    expect(result.toolCall?.function.arguments).toBe('{"path":"src/index.ts"}')
  })

  test('passes through an unmapped tool call unchanged', () => {
    const toolCallInner = new Uint8Array([
      ...encodeField(FIELD.ToolCall.ID, WIRE_TYPE.LEN, 'toolu_xyz'),
      ...encodeField(FIELD.ToolCall.NAME, WIRE_TYPE.LEN, 'CustomTool'),
      ...encodeField(
        FIELD.ToolCall.RAW_ARGS,
        WIRE_TYPE.LEN,
        '{"path":"a.txt"}',
      ),
    ])
    const top = encodeField(
      FIELD.Response.TOOL_CALL,
      WIRE_TYPE.LEN,
      toolCallInner,
    )

    const result = extractTextFromResponse(top)
    expect(result.toolCall?.function.name).toBe('CustomTool')
    expect(result.toolCall?.function.arguments).toBe('{"path":"a.txt"}')
  })

  test('remaps a Cursor built-in tool call to the CCB tool name + args', () => {
    // Agent-tuned models call our tools via Cursor built-ins (run_terminal_cmd,
    // read_file). The decoder must translate those back to the CCB tool.
    const toolCallInner = new Uint8Array([
      ...encodeField(FIELD.ToolCall.ID, WIRE_TYPE.LEN, 'toolu_run'),
      ...encodeField(FIELD.ToolCall.NAME, WIRE_TYPE.LEN, 'run_terminal_cmd'),
      ...encodeField(
        FIELD.ToolCall.RAW_ARGS,
        WIRE_TYPE.LEN,
        '{"command":"git status","is_background":false,"explanation":"x"}',
      ),
    ])
    const top = encodeField(
      FIELD.Response.TOOL_CALL,
      WIRE_TYPE.LEN,
      toolCallInner,
    )

    const result = extractTextFromResponse(top)
    expect(result.toolCall?.function.name).toBe('Bash')
    const args = JSON.parse(result.toolCall?.function.arguments ?? '{}')
    expect(args.command).toBe('git status')
    expect(args.run_in_background).toBe(false)
  })
})
