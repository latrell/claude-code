import { describe, expect, test } from 'bun:test'
import { WorkerStateUploader } from '../WorkerStateUploader.js'

describe('WorkerStateUploader', () => {
  test('retries a rejected PUT and still delivers a queued completion patch', async () => {
    const payloads: Record<string, unknown>[] = []
    let resolveSecondAttempt!: (ok: boolean) => void
    const secondAttempt = new Promise<boolean>(resolve => {
      resolveSecondAttempt = resolve
    })
    let notifySecondAttempt!: () => void
    const secondAttemptObserved = new Promise<void>(resolve => {
      notifySecondAttempt = resolve
    })
    let notifyFinalPatch!: () => void
    const finalPatchObserved = new Promise<void>(resolve => {
      notifyFinalPatch = resolve
    })
    const uploader = new WorkerStateUploader({
      baseDelayMs: 0,
      maxDelayMs: 0,
      jitterMs: 0,
      send: payload => {
        payloads.push(payload)
        if (payloads.length === 1) {
          throw new Error('temporary network failure')
        }
        if (payloads.length === 2) {
          notifySecondAttempt()
          return secondAttempt
        }
        notifyFinalPatch()
        return Promise.resolve(true)
      },
    })

    uploader.enqueue({ worker_status: 'running' })
    uploader.enqueue({ worker_status: 'completed' })
    await secondAttemptObserved
    // Arrives while the retry generation is still live. Its completion must
    // start a fresh drain without a stale finalizer clearing that new inflight.
    uploader.enqueue({ worker_status: 'failed' })
    resolveSecondAttempt(true)
    await finalPatchObserved
    // Let sendWithRetry and its identity-guarded finalizer release inflight
    // before close mutates the uploader lifecycle.
    await Promise.resolve()
    await Promise.resolve()
    uploader.close()

    expect(payloads).toHaveLength(3)
    expect(payloads[1]).toEqual({ worker_status: 'completed' })
    expect(payloads[2]).toEqual({ worker_status: 'failed' })
  })

  test('close wakes a long retry backoff and releases inflight promptly', async () => {
    let sends = 0
    let notifyFirstSend!: () => void
    const firstSend = new Promise<void>(resolve => {
      notifyFirstSend = resolve
    })
    const uploader = new WorkerStateUploader({
      baseDelayMs: 60_000,
      maxDelayMs: 60_000,
      jitterMs: 0,
      send: async () => {
        sends++
        notifyFirstSend()
        return false
      },
    })

    uploader.enqueue({ worker_status: 'running' })
    await firstSend
    const inFlight = (uploader as unknown as { inflight: Promise<void> | null })
      .inflight
    expect(inFlight).not.toBeNull()

    uploader.close()
    await inFlight

    expect(sends).toBe(1)
    expect(
      (uploader as unknown as { inflight: Promise<void> | null }).inflight,
    ).toBeNull()
  })

  test('a new worker state wakes backoff and delivers idle immediately', async () => {
    const payloads: Record<string, unknown>[] = []
    let notifyFirstSend!: () => void
    const firstSend = new Promise<void>(resolve => {
      notifyFirstSend = resolve
    })
    let notifyIdleSend!: () => void
    const idleSend = new Promise<void>(resolve => {
      notifyIdleSend = resolve
    })
    const uploader = new WorkerStateUploader({
      baseDelayMs: 60_000,
      maxDelayMs: 60_000,
      jitterMs: 0,
      send: async payload => {
        payloads.push(payload)
        if (payloads.length === 1) {
          notifyFirstSend()
          return false
        }
        notifyIdleSend()
        return true
      },
    })

    uploader.enqueue({ worker_status: 'running' })
    await firstSend
    await Promise.resolve()
    await Promise.resolve()

    uploader.enqueue({ worker_status: 'idle' })
    await idleSend
    uploader.close()

    expect(payloads).toEqual([
      { worker_status: 'running' },
      { worker_status: 'idle' },
    ])
  })
})
