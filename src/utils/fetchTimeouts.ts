/**
 * Both runtimes ship a ~300s *idle* timeout inside fetch that kills healthy
 * long-silence streams (surfaced as "API Error: terminated" / TimeoutError):
 *
 * - Node (undici): headersTimeout=300s + bodyTimeout=300s. bodyTimeout fires
 *   when no body bytes arrive for 300s. Fixed globally by replacing the
 *   global dispatcher (installNodeFetchTimeoutFix) — undici stores it under
 *   Symbol.for('undici.globalDispatcher.1'), shared between the npm package
 *   and Node's bundled copy. Code paths that build their own dispatcher
 *   (proxy/mTLS/cursor-h2) must also spread getUndiciTimeoutOptions().
 * - Bun: native fetch aborts after 5 idle minutes ("no bytes moving in either
 *   direction"). There is no global hook; Bun's fetch extension
 *   `timeout: false` disarms it per request. getFetchIdleTimeoutOptions()
 *   is spread into fetch options via getProxyFetchOptions(), which every
 *   SDK/fetch path (Anthropic/OpenAI/Gemini/Grok/MCP/Cursor) flows through.
 *
 * Streaming LLM backends (vLLM etc.) send ZERO bytes while a request sits in
 * the queue and during prompt prefill — for large-context sessions that
 * silent window routinely exceeds 300s, so slow/self-hosted endpoints get
 * their perfectly healthy requests aborted mid-flight.
 *
 * Defaults to disabling the idle timeouts. Override via:
 *   CLAUDE_FETCH_BODY_TIMEOUT_MS     idle/body timeout, both runtimes (0 = disabled)
 *   CLAUDE_FETCH_HEADERS_TIMEOUT_MS  headers timeout, Node only (0 = disabled)
 * Opt-in stream idle protection still exists via CLAUDE_ENABLE_STREAM_WATCHDOG.
 */
import type * as undici from 'undici'

function parseTimeoutMs(raw: string | undefined): number {
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** undici Agent options for Node dispatchers (global or purpose-built). */
export function getUndiciTimeoutOptions(): {
  headersTimeout: number
  bodyTimeout: number
} {
  return {
    headersTimeout: parseTimeoutMs(process.env.CLAUDE_FETCH_HEADERS_TIMEOUT_MS),
    bodyTimeout: parseTimeoutMs(process.env.CLAUDE_FETCH_BODY_TIMEOUT_MS),
  }
}

/**
 * Per-request fetch options neutralizing Bun's native 5-minute idle timeout.
 * `timeout: false` disarms it; a positive CLAUDE_FETCH_BODY_TIMEOUT_MS keeps
 * a numeric idle deadline instead. Returns {} under Node — the global
 * dispatcher already handles it there, and undici has no `timeout` option.
 */
export function getFetchIdleTimeoutOptions(): { timeout?: number | false } {
  if (typeof Bun === 'undefined') return {}
  const ms = parseTimeoutMs(process.env.CLAUDE_FETCH_BODY_TIMEOUT_MS)
  return { timeout: ms > 0 ? ms : false }
}

let installed = false

/**
 * Replace Node fetch's global dispatcher with one whose idle timeouts are
 * disabled (or set from env). No-op under Bun and on repeat calls.
 */
export function installNodeFetchTimeoutFix(): void {
  if (installed || typeof Bun !== 'undefined') return
  installed = true
  try {
    // Lazy require: keeps the ~1.5MB undici package off Bun builds' hot path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undiciMod = require('undici') as typeof undici
    undiciMod.setGlobalDispatcher(
      new undiciMod.Agent(getUndiciTimeoutOptions()),
    )
  } catch {
    // undici unavailable — leave stock dispatcher (300s idle timeouts) in place.
  }
}
