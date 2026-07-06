/**
 * CCB tool ↔ Cursor built-in tool mapping.
 *
 * Cursor exposes two tool channels:
 *   1. MCP tools (`mcp_tools` field 34, invoked via the `call_mcp_tool` wrapper).
 *   2. Built-in `ClientSideToolV2` tools (advertised in `supported_tools`,
 *      invoked directly by their built-in name, e.g. `run_terminal_cmd`).
 *
 * Cursor's newer agent-tuned models (Fable, Sonnet-5, Composer) are trained to
 * ONLY call the built-in tools and refuse custom MCP tools entirely — and they
 * only accept a tool *result* when it's a structured `ClientSideToolV2Result`
 * matching the built-in tool they called (a plain text result makes them
 * re-call the tool in a loop). Generic models (claude-4.5-sonnet, gpt-5) happily
 * call MCP tools and accept text results, but they ALSO accept the structured
 * built-in path.
 *
 * So we map CCB's tools that have a safe, lossless built-in equivalent onto the
 * built-in channel (works on every model), and leave the rest on the MCP
 * channel (works on generic models; agent models route those operations through
 * the shell instead). Only tools with a clean argument + result translation are
 * mapped; the model naturally falls back to `run_terminal_cmd` (→ Bash) for
 * anything else.
 *
 * Reference: https://github.com/timxx/Cursor-To-OpenAI (advertises + drives
 * Cursor built-in ClientSideToolV2 tools for cross-model agent support).
 */

import { CLIENT_SIDE_TOOL, FIELD, WIRE_TYPE } from './protobufSchema.js'
import { concatArrays, encodeField } from './protobufEncoder.js'

/** CCB tool names (string literals to avoid importing the builtin-tools pkg). */
const CCB_TOOL = {
  BASH: 'Bash',
  READ: 'Read',
} as const

type JsonObject = Record<string, unknown>

interface BuiltinToolMapping {
  /** CCB tool name this built-in maps to (e.g. 'Bash'). */
  ccbToolName: string
  /** ClientSideToolV2 enum id advertised in `supported_tools`. */
  builtinEnum: number
  /** Wire name the model emits / expects (ClientSideToolV2Call.name). */
  builtinName: string
  /** Translate the model's built-in call args → CCB tool input. */
  toCcbArgs: (args: JsonObject) => JsonObject
  /** Translate CCB tool input → the built-in call args (for history echo). */
  toBuiltinArgs: (args: JsonObject) => JsonObject
  /** Encode the CCB result text into the built-in's ClientSideToolV2Result. */
  encodeResult: (resultText: string) => Uint8Array
}

function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Wrap a per-tool result variant in a ClientSideToolV2Result envelope
 * (`{ tool, <variantField>: <variantBytes> }`).
 */
function wrapToolV2Result(
  toolEnum: number,
  variantField: number,
  variantBytes: Uint8Array,
): Uint8Array {
  return concatArrays(
    encodeField(FIELD.ToolV2Result.TOOL, WIRE_TYPE.VARINT, toolEnum),
    encodeField(variantField, WIRE_TYPE.LEN, variantBytes),
  )
}

const BUILTIN_TOOL_MAPPINGS: BuiltinToolMapping[] = [
  {
    ccbToolName: CCB_TOOL.BASH,
    builtinEnum: CLIENT_SIDE_TOOL.RUN_TERMINAL_COMMAND_V2,
    builtinName: 'run_terminal_cmd',
    // Cursor run_terminal_cmd { command, explanation, is_background } ↔ CCB Bash
    // { command, run_in_background }. `command` lines up 1:1.
    toCcbArgs: args => {
      const out: JsonObject = {}
      const command = str(args.command)
      if (command !== undefined) out.command = command
      if (typeof args.is_background === 'boolean') {
        out.run_in_background = args.is_background
      }
      return out
    },
    toBuiltinArgs: args => {
      const out: JsonObject = {}
      const command = str(args.command)
      if (command !== undefined) out.command = command
      if (typeof args.run_in_background === 'boolean') {
        out.is_background = args.run_in_background
      }
      return out
    },
    encodeResult: resultText =>
      wrapToolV2Result(
        CLIENT_SIDE_TOOL.RUN_TERMINAL_COMMAND_V2,
        FIELD.ToolV2Result.RUN_TERMINAL_COMMAND_V2_RESULT,
        concatArrays(
          encodeField(
            FIELD.RunTerminalResult.OUTPUT,
            WIRE_TYPE.LEN,
            resultText,
          ),
          encodeField(FIELD.RunTerminalResult.EXIT_CODE, WIRE_TYPE.VARINT, 0),
        ),
      ),
  },
  {
    ccbToolName: CCB_TOOL.READ,
    builtinEnum: CLIENT_SIDE_TOOL.READ_FILE,
    builtinName: 'read_file',
    // Cursor read_file { target_file, should_read_entire_file,
    // start_line_one_indexed, end_line_one_indexed_inclusive } ↔ CCB Read
    // { file_path, offset, limit }.
    toCcbArgs: args => {
      const out: JsonObject = {}
      const filePath =
        str(args.target_file) ?? str(args.file_path) ?? str(args.path)
      if (filePath !== undefined) out.file_path = filePath
      if (args.should_read_entire_file === true) return out
      const start = toPositiveInt(args.start_line_one_indexed)
      const end = toPositiveInt(args.end_line_one_indexed_inclusive)
      if (start !== undefined && start > 0) {
        out.offset = start - 1
        if (end !== undefined && end >= start) out.limit = end - start + 1
      }
      return out
    },
    toBuiltinArgs: args => {
      const out: JsonObject = {}
      const filePath = str(args.file_path) ?? str(args.target_file)
      if (filePath !== undefined) out.target_file = filePath
      const offset = toPositiveInt(args.offset)
      const limit = toPositiveInt(args.limit)
      if (offset === undefined && limit === undefined) {
        out.should_read_entire_file = true
      } else {
        const start = (offset ?? 0) + 1
        out.start_line_one_indexed = start
        if (limit !== undefined) {
          out.end_line_one_indexed_inclusive = start + limit - 1
        }
        out.should_read_entire_file = false
      }
      return out
    },
    encodeResult: resultText =>
      wrapToolV2Result(
        CLIENT_SIDE_TOOL.READ_FILE,
        FIELD.ToolV2Result.READ_FILE_RESULT,
        encodeField(FIELD.ReadFileResult.CONTENTS, WIRE_TYPE.LEN, resultText),
      ),
  },
]

const MAPPING_BY_BUILTIN_NAME = new Map(
  BUILTIN_TOOL_MAPPINGS.map(m => [m.builtinName, m]),
)
const MAPPING_BY_CCB_NAME = new Map(
  BUILTIN_TOOL_MAPPINGS.map(m => [m.ccbToolName, m]),
)

/** Whether a CCB tool is mapped to a Cursor built-in tool. */
export function isBuiltinMappedTool(ccbToolName: string): boolean {
  return MAPPING_BY_CCB_NAME.has(ccbToolName)
}

/**
 * Given the CCB tools present in a request, return the Cursor built-in enum ids
 * to advertise in `supported_tools` so agent-tuned models can call them.
 */
export function builtinToolEnumsForTools(
  toolNames: Iterable<string>,
): number[] {
  const enums = new Set<number>()
  for (const name of toolNames) {
    const mapping = MAPPING_BY_CCB_NAME.get(name)
    if (mapping) enums.add(mapping.builtinEnum)
  }
  return [...enums]
}

function parseArgs(rawArgs: string): JsonObject {
  if (!rawArgs) return {}
  try {
    const value = JSON.parse(rawArgs)
    return value && typeof value === 'object' ? (value as JsonObject) : {}
  } catch {
    return {}
  }
}

/**
 * If `builtinName` is a Cursor built-in tool we map, translate the raw JSON
 * arguments into the equivalent CCB tool name + argument JSON. Returns null
 * when the name isn't a mapped built-in (caller keeps the original tool call).
 */
export function remapBuiltinToolCall(
  builtinName: string,
  rawArgs: string,
): { name: string; arguments: string } | null {
  const mapping = MAPPING_BY_BUILTIN_NAME.get(builtinName)
  if (!mapping) return null
  return {
    name: mapping.ccbToolName,
    arguments: JSON.stringify(mapping.toCcbArgs(parseArgs(rawArgs))),
  }
}

/**
 * Build a structured Cursor tool result for a CCB tool that maps to a built-in.
 * Returns the built-in tool name, the built-in-shaped argument JSON, and the
 * pre-encoded `ClientSideToolV2Result` bytes. Returns null for unmapped tools
 * (caller renders those as a text block instead).
 */
export function buildStructuredToolResult(
  ccbToolName: string,
  ccbArgsJson: string,
  resultText: string,
): { builtinName: string; rawArgs: string; result: Uint8Array } | null {
  const mapping = MAPPING_BY_CCB_NAME.get(ccbToolName)
  if (!mapping) return null
  return {
    builtinName: mapping.builtinName,
    rawArgs: JSON.stringify(mapping.toBuiltinArgs(parseArgs(ccbArgsJson))),
    result: mapping.encodeResult(resultText),
  }
}
