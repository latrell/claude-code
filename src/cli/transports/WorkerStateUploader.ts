import { sleep } from '../../utils/sleep.js'

/**
 * Coalescing uploader for PUT /worker (session state + metadata).
 *
 * - 1 in-flight PUT + 1 pending patch
 * - New calls coalesce into pending (never grows beyond 1 slot)
 * - On success: send pending if exists
 * - On failure: exponential backoff (clamped), retries indefinitely
 *   until success or close(). Absorbs any pending patches before each retry.
 * - No backpressure needed — naturally bounded at 2 slots
 *
 * Coalescing rules:
 * - Top-level keys (worker_status, external_metadata) — last value wins
 * - Inside external_metadata / internal_metadata — RFC 7396 merge:
 *   keys are added/overwritten, null values preserved (server deletes)
 */

type WorkerStateUploaderConfig = {
  send: (body: Record<string, unknown>) => Promise<boolean>
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number
  /** Max delay cap (ms) */
  maxDelayMs: number
  /** Random jitter range added to retry delay (ms) */
  jitterMs: number
}

export class WorkerStateUploader {
  private inflight: Promise<void> | null = null
  private pending: Record<string, unknown> | null = null
  private closed = false
  private retrySleepController: AbortController | null = null
  private readonly config: WorkerStateUploaderConfig

  constructor(config: WorkerStateUploaderConfig) {
    this.config = config
  }

  /**
   * Enqueue a patch to PUT /worker. Coalesces with any existing pending
   * patch. Fire-and-forget — callers don't need to await.
   */
  enqueue(patch: Record<string, unknown>): void {
    if (this.closed) return
    this.pending = this.pending ? coalescePatches(this.pending, patch) : patch
    // A state transition supersedes the stale state currently backing off.
    // Wake immediately so an `idle` completion is not stranded for up to the
    // 30-second retry ceiling. Metadata-only updates remain coalesced without
    // defeating transport backoff.
    if ('worker_status' in patch) {
      this.retrySleepController?.abort('worker-state-changed')
    }
    void this.drain()
  }

  close(): void {
    this.closed = true
    this.pending = null
    // Wake a retry sleeping at the exponential-backoff ceiling. Otherwise
    // its referenced timer can keep teardown/process exit alive for ~30s.
    this.retrySleepController?.abort('worker-state-uploader-closed')
  }

  private async drain(): Promise<void> {
    if (this.inflight || this.closed) return
    if (!this.pending) return

    const payload = this.pending
    this.pending = null

    const attempt = this.sendWithRetry(payload).catch(() => {
      // sendWithRetry normally absorbs transport failures. If an unexpected
      // implementation error still escapes, retain this payload behind any
      // newer patch instead of losing the worker's terminal state.
      if (!this.closed) {
        this.pending = this.pending
          ? coalescePatches(payload, this.pending)
          : payload
      }
    })
    let tracked: Promise<void>
    tracked = attempt.finally(() => {
      // A late completion must never clear a replacement drain installed by
      // a newer generation.
      if (this.inflight !== tracked) return
      this.inflight = null
      if (this.pending && !this.closed) {
        void this.drain()
      }
    })
    this.inflight = tracked
    // enqueue() is intentionally fire-and-forget; keep that boundary from
    // becoming a process-level unhandled rejection if finalization ever fails.
    void tracked.catch(() => {})
  }

  /** Retries indefinitely with exponential backoff until success or close(). */
  private async sendWithRetry(payload: Record<string, unknown>): Promise<void> {
    let current = payload
    let failures = 0
    while (!this.closed) {
      // Network clients can reject as well as resolve false. Treat both as a
      // retryable delivery failure; otherwise drain() keeps `inflight` pinned
      // to an already-rejected promise and every later worker/completion patch
      // is silently stranded behind that stale cache entry.
      let ok = false
      try {
        ok = await this.config.send(current)
      } catch {
        // Both a synchronous adapter throw and a rejected HTTP request are a
        // retryable failed PUT.
        ok = false
      }
      if (ok) return

      failures++

      // A newer state may have arrived while the failed request was in
      // flight, before the retry sleep was installed. Retry that state now
      // and give it a fresh backoff budget instead of inheriting a stale
      // request's 30-second ceiling.
      if (this.pending && 'worker_status' in this.pending) {
        current = coalescePatches(current, this.pending)
        this.pending = null
        failures = 0
        continue
      }

      await this.waitForRetry(this.retryDelay(failures))

      // Absorb any patches that arrived during the retry
      if (this.pending && !this.closed) {
        if ('worker_status' in this.pending) failures = 0
        current = coalescePatches(current, this.pending)
        this.pending = null
      }
    }
  }

  private async waitForRetry(delayMs: number): Promise<void> {
    const controller = new AbortController()
    this.retrySleepController = controller
    if (this.closed) controller.abort('worker-state-uploader-closed')
    try {
      await sleep(delayMs, controller.signal)
    } catch (error) {
      // Both close() and a superseding worker state intentionally wake the
      // delay. Preserve unexpected timer failures for drain() to requeue.
      if (!controller.signal.aborted) throw error
    } finally {
      if (this.retrySleepController === controller) {
        this.retrySleepController = null
      }
    }
  }

  private retryDelay(failures: number): number {
    const exponential = Math.min(
      this.config.baseDelayMs * 2 ** (failures - 1),
      this.config.maxDelayMs,
    )
    const jitter = Math.random() * this.config.jitterMs
    return exponential + jitter
  }
}

/**
 * Coalesce two patches for PUT /worker.
 *
 * Top-level keys: overlay replaces base (last value wins).
 * Metadata keys (external_metadata, internal_metadata): RFC 7396 merge
 * one level deep — overlay keys are added/overwritten, null values
 * preserved for server-side delete.
 */
function coalescePatches(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    if (
      (key === 'external_metadata' || key === 'internal_metadata') &&
      merged[key] &&
      typeof merged[key] === 'object' &&
      typeof value === 'object' &&
      value !== null
    ) {
      // RFC 7396 merge — overlay keys win, nulls preserved for server
      merged[key] = {
        ...(merged[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      }
    } else {
      merged[key] = value
    }
  }

  return merged
}
