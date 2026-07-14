import { describe, expect, test } from 'bun:test'
import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from '../abortSettlement.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('waitForAbortSettlement', () => {
  test('returns a result that settles before abort', async () => {
    const controller = new AbortController()
    await expect(
      waitForAbortSettlement(
        Promise.resolve('done'),
        controller.signal,
        20,
        'test operation',
      ),
    ).resolves.toBe('done')
  })

  test('allows a short settlement grace after abort', async () => {
    const controller = new AbortController()
    const work = deferred<string>()
    const waiting = waitForAbortSettlement(
      work.promise,
      controller.signal,
      50,
      'test operation',
    )

    controller.abort()
    work.resolve('stopped')

    await expect(waiting).resolves.toBe('stopped')
  })

  test('rejects when aborted work ignores the settlement deadline', async () => {
    const controller = new AbortController()
    const waiting = waitForAbortSettlement(
      new Promise<never>(() => {}),
      controller.signal,
      10,
      'test operation',
    )

    controller.abort()

    await expect(waiting).rejects.toBeInstanceOf(AbortSettlementTimeoutError)
  })
})

describe('waitForBoundedSettlement', () => {
  test('bounds work even when no parent cancellation occurs', async () => {
    await expect(
      waitForBoundedSettlement(new Promise<never>(() => {}), {
        timeoutMs: 10,
        abortGraceMs: 5,
        operation: 'bounded operation',
      }),
    ).rejects.toBeInstanceOf(AbortSettlementTimeoutError)
  })

  test('uses the short grace immediately when the parent is already aborted', async () => {
    const controller = new AbortController()
    controller.abort('stopped')
    const startedAt = Date.now()

    await expect(
      waitForBoundedSettlement(new Promise<never>(() => {}), {
        signal: controller.signal,
        timeoutMs: 1_000,
        abortGraceMs: 10,
        operation: 'cancelled operation',
      }),
    ).rejects.toBeInstanceOf(AbortSettlementTimeoutError)

    expect(Date.now() - startedAt).toBeLessThan(500)
  })

  test('dispatches cancellation when its absolute deadline expires', async () => {
    const cancellation = deferred<void>()
    const work = deferred<string>()

    const waiting = waitForBoundedSettlement(work.promise, {
      timeoutMs: 10,
      abortGraceMs: 50,
      operation: 'abortable operation',
      onAbort: () => {
        cancellation.resolve()
        work.resolve('cancelled')
      },
    })

    await cancellation.promise
    await expect(waiting).resolves.toBe('cancelled')
  })
})
