/**
 * Live probe for the Cursor provider model catalog.
 *
 * For every curated CURSOR_MODELS entry (or the ids passed as CLI args), this
 * resolves the id through resolveCursorModel (alias/slug normalization, same
 * as the real request path) and sends a minimal chat request to the live
 * api2.cursor.sh endpoint, reporting PASS/FAIL per model. Also diffs the
 * curated list against the live AvailableModels catalog.
 *
 * `--tool-roundtrip` mode instead replays a fabricated Bash tool call +
 * structured result and asks the model whether the command completed or was
 * interrupted. This guards the RunTerminalCommandV2Result encoding: without
 * not_interrupted/ended_reason the backend renders every replayed command as
 * interrupted (the "命令老被中断" bug). `--tool-roundtrip=ab` also probes the
 * legacy (output+exit_code only) encoding for comparison.
 *
 * Requires signed-in Cursor credentials (OAuth file / env / IDE). Not part of
 * CI — run manually when Cursor rotates its catalog:
 *
 *   bun run scripts/probe-cursor-models.ts                  # all curated models
 *   bun run scripts/probe-cursor-models.ts auto gpt-5.5     # specific ids
 *   bun run scripts/probe-cursor-models.ts --tool-roundtrip # interrupted-flag probe
 */

import { resolveCursorModel } from '../packages/@ant/model-provider/src/providers/cursor/modelMapping.js'
import { resolveCursorCredentials } from '../src/services/api/cursor/auth.js'
import { streamCursorChat } from '../src/services/api/cursor/client.js'
import { splitThinkingFinalMarker } from '../src/services/api/cursor/streamAdapter.js'
import {
  CURSOR_MODELS,
  fetchCursorAvailableModels,
} from '../src/services/api/cursor/models.js'
import { buildStructuredToolResult } from '../src/services/api/cursor/toolMapping.js'
import {
  concatArrays,
  encodeField,
} from '../src/services/api/cursor/protobufEncoder.js'
import {
  CLIENT_SIDE_TOOL,
  FIELD,
  WIRE_TYPE,
  type CursorMessage,
  type CursorTool,
} from '../src/services/api/cursor/protobufSchema.js'

const rawArgs = process.argv.slice(2)
const toolRoundtripArg = rawArgs.find(a => a.startsWith('--tool-roundtrip'))
const argModels = rawArgs.filter(a => !a.startsWith('--'))

// Cursor's Auto tier can queue 80s+ before the first token under load, so
// probe timeouts must be generous or slow-but-healthy models report FAIL.
const PROBE_TIMEOUT_MS = 240_000

async function probeModel(
  model: string,
  credentials: Awaited<ReturnType<typeof resolveCursorCredentials>>,
): Promise<{ model: string; ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  let text = ''
  try {
    const frames = streamCursorChat({
      model: resolveCursorModel(model, {}),
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      tools: [],
      credentials,
      signal: controller.signal,
    })
    for await (const frame of frames) {
      if (frame.type === 'error') {
        return {
          model,
          ok: false,
          detail: `[${frame.status}/${frame.errorType}] ${frame.message}`,
        }
      }
      // Any text/thinking output is proof of life; stop early to save quota.
      if (frame.type === 'text' || frame.type === 'thinking') {
        text += frame.text
        if (text.length >= 2) {
          controller.abort()
          break
        }
      }
    }
    if (text.trim().length > 0) {
      return {
        model,
        ok: true,
        detail: JSON.stringify(text.trim().slice(0, 40)),
      }
    }
    return { model, ok: false, detail: 'stream ended with no content' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (text.trim().length > 0 && /abort/i.test(msg)) {
      return {
        model,
        ok: true,
        detail: JSON.stringify(text.trim().slice(0, 40)),
      }
    }
    return { model, ok: false, detail: `threw: ${msg}` }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Legacy RunTerminalCommandV2Result encoding (output + exit_code only) — what
 * we sent before the not_interrupted fix. Kept here so `--tool-roundtrip=ab`
 * can demonstrate the behavioral difference against the live backend.
 */
function encodeLegacyTerminalResult(resultText: string): Uint8Array {
  const variant = concatArrays(
    encodeField(FIELD.RunTerminalResult.OUTPUT, WIRE_TYPE.LEN, resultText),
    encodeField(FIELD.RunTerminalResult.EXIT_CODE, WIRE_TYPE.VARINT, 0),
  )
  return concatArrays(
    encodeField(
      FIELD.ToolV2Result.TOOL,
      WIRE_TYPE.VARINT,
      CLIENT_SIDE_TOOL.RUN_TERMINAL_COMMAND_V2,
    ),
    encodeField(
      FIELD.ToolV2Result.RUN_TERMINAL_COMMAND_V2_RESULT,
      WIRE_TYPE.LEN,
      variant,
    ),
  )
}

/**
 * Replay a fabricated Bash (run_terminal_cmd) call + structured result and ask
 * the model whether that command completed or was interrupted. A correct
 * encoding must yield COMPLETED.
 */
async function probeToolRoundtrip(
  model: string,
  credentials: Awaited<ReturnType<typeof resolveCursorCredentials>>,
  encoding: 'fixed' | 'legacy',
): Promise<{ model: string; ok: boolean; detail: string }> {
  const commandOutput =
    'On branch main\nnothing to commit, working tree clean\n'
  const built = buildStructuredToolResult(
    'Bash',
    '{"command":"git status"}',
    commandOutput,
  )
  if (!built) {
    return { model, ok: false, detail: 'buildStructuredToolResult failed' }
  }
  const result =
    encoding === 'fixed'
      ? built.result
      : encodeLegacyTerminalResult(commandOutput)

  const bashTool: CursorTool = {
    function: {
      name: 'Bash',
      description: 'Run a shell command.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
      },
    },
  }
  const messages: CursorMessage[] = [
    { role: 'user', content: 'Check the git status of this repo.' },
    {
      role: 'assistant',
      content: '',
      tool_results: [
        {
          tool_call_id: '1',
          name: built.builtinName,
          index: 0,
          raw_args: built.rawArgs,
          result,
        },
      ],
    },
    {
      role: 'user',
      content:
        'Look at the terminal command you ran in this conversation. ' +
        'Did it run to completion, or was it interrupted/cancelled before finishing? ' +
        'Reply with exactly one word: COMPLETED or INTERRUPTED. Do not call any tools.',
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  let text = ''
  try {
    // Same frame pipeline as the real adapter (incl. Composer's
    // `</think><｜final｜>` split, so its final answer arrives as text).
    const frames = splitThinkingFinalMarker(
      streamCursorChat({
        model: resolveCursorModel(model, {}),
        messages,
        tools: [bashTool],
        credentials,
        signal: controller.signal,
      }),
    )
    for await (const frame of frames) {
      if (frame.type === 'error') {
        return {
          model,
          ok: false,
          detail: `[${frame.status}/${frame.errorType}] ${frame.message}`,
        }
      }
      if (frame.type === 'text') text += frame.text
      if (frame.type === 'toolCall') {
        return {
          model,
          ok: false,
          detail: `unexpected tool call: ${frame.toolCall.function.name}`,
        }
      }
    }
    const verdict = text.trim().toUpperCase()
    const ok = verdict.includes('COMPLETED') && !verdict.includes('INTERRUPT')
    return { model, ok, detail: JSON.stringify(text.trim().slice(0, 80)) }
  } catch (err) {
    return {
      model,
      ok: false,
      detail: `threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}

const credentials = await resolveCursorCredentials()
const models = argModels.length > 0 ? argModels : CURSOR_MODELS.map(m => m.id)

if (toolRoundtripArg) {
  const abMode = toolRoundtripArg.endsWith('=ab')
  console.log('=== tool-roundtrip probe (expected verdict: COMPLETED) ===')
  const results: Array<{ model: string; ok: boolean; detail: string }> = []
  for (const model of models) {
    const fixed = await probeToolRoundtrip(model, credentials, 'fixed')
    results.push(fixed)
    console.log(`${fixed.ok ? 'PASS' : 'FAIL'} ${model} -> ${fixed.detail}`)
    if (abMode) {
      const legacy = await probeToolRoundtrip(model, credentials, 'legacy')
      console.log(
        `  (legacy encoding) ${legacy.ok ? 'COMPLETED' : 'NOT-COMPLETED'} -> ${legacy.detail}`,
      )
    }
  }
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  for (const r of failed) console.log(`FAIL ${r.model} -> ${r.detail}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

if (argModels.length === 0) {
  console.log('=== curated list vs live AvailableModels catalog ===')
  const live = await fetchCursorAvailableModels()
  console.log('live agent-capable models:', live.length)
  const liveIds = new Set(live.map(m => m.id))
  for (const m of CURSOR_MODELS) {
    console.log(
      ` ${m.id}: ${liveIds.has(m.id) ? 'in live catalog' : '*** NOT in live catalog — update CURSOR_MODELS ***'}`,
    )
  }
}

console.log('\n=== chat endpoint probe ===')
const results: Array<{ model: string; ok: boolean; detail: string }> = []
for (const model of models) {
  const r = await probeModel(model, credentials)
  results.push(r)
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.model} -> ${r.detail}`)
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
for (const r of failed) {
  console.log(`FAIL ${r.model} -> ${r.detail}`)
}
process.exit(failed.length > 0 ? 1 : 0)
