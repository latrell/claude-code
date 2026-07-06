/**
 * Live probe for the Cursor provider model catalog.
 *
 * For every curated CURSOR_MODELS entry (or the ids passed as CLI args), this
 * resolves the id through resolveCursorModel (alias/slug normalization, same
 * as the real request path) and sends a minimal chat request to the live
 * api2.cursor.sh endpoint, reporting PASS/FAIL per model. Also diffs the
 * curated list against the live AvailableModels catalog.
 *
 * Requires signed-in Cursor credentials (OAuth file / env / IDE). Not part of
 * CI — run manually when Cursor rotates its catalog:
 *
 *   bun run scripts/probe-cursor-models.ts             # all curated models
 *   bun run scripts/probe-cursor-models.ts auto gpt-5.5 # specific ids
 */

import { resolveCursorModel } from '../packages/@ant/model-provider/src/providers/cursor/modelMapping.js'
import { resolveCursorCredentials } from '../src/services/api/cursor/auth.js'
import { streamCursorChat } from '../src/services/api/cursor/client.js'
import {
  CURSOR_MODELS,
  fetchCursorAvailableModels,
} from '../src/services/api/cursor/models.js'

const argModels = process.argv.slice(2)

async function probeModel(
  model: string,
  credentials: Awaited<ReturnType<typeof resolveCursorCredentials>>,
): Promise<{ model: string; ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
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

const credentials = await resolveCursorCredentials()
const models = argModels.length > 0 ? argModels : CURSOR_MODELS.map(m => m.id)

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
