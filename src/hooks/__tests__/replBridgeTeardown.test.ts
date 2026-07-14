import { describe, expect, test } from 'bun:test'
import { awaitPendingReplBridgeTeardown } from '../replBridgeTeardown.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('awaitPendingReplBridgeTeardown', () => {
  test('clears a rejected teardown so a later initialization does not replay it', async () => {
    const teardown = deferred<void>()
    const ref: { current: Promise<void> | undefined } = {
      current: teardown.promise,
    }
    const observed = awaitPendingReplBridgeTeardown(ref)
    const failure = new Error('teardown failed')

    teardown.reject(failure)

    await expect(observed).rejects.toBe(failure)
    expect(ref.current).toBeUndefined()
    await expect(awaitPendingReplBridgeTeardown(ref)).resolves.toBeUndefined()
  })

  test('does not clear a replacement teardown installed while awaiting', async () => {
    const first = deferred<void>()
    const replacement = Promise.resolve()
    const ref: { current: Promise<void> | undefined } = {
      current: first.promise,
    }
    const observed = awaitPendingReplBridgeTeardown(ref)

    ref.current = replacement
    first.resolve()
    await observed

    expect(ref.current).toBe(replacement)
  })
})
