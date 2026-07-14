import { describe, expect, test } from 'bun:test'
import { trackPromiseSettlement } from '../settledPromise.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('trackPromiseSettlement', () => {
  test('peeks at pending work without waiting for it', () => {
    const work = deferred<string>()
    const tracked = trackPromiseSettlement(work.promise)

    expect(tracked.peek()).toEqual({ status: 'pending' })
  })

  test('exposes a fulfilled value after exact settlement', async () => {
    const work = deferred<string>()
    const tracked = trackPromiseSettlement(work.promise)
    work.resolve('ready')

    await expect(tracked.promise).resolves.toBe('ready')
    expect(tracked.peek()).toEqual({ status: 'fulfilled', value: 'ready' })
  })

  test('exposes the original rejection after exact settlement', async () => {
    const work = deferred<string>()
    const tracked = trackPromiseSettlement(work.promise)
    const failure = new Error('failed')
    work.reject(failure)

    await expect(tracked.promise).rejects.toBe(failure)
    expect(tracked.peek()).toEqual({ status: 'rejected', reason: failure })
  })
})
