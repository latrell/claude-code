import { describe, expect, test } from 'bun:test'
import { createRetryableTermination } from '../retryableTermination.js'

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

describe('createRetryableTermination', () => {
  test('shares only an in-flight attempt and retries after false', async () => {
    const first = deferred<boolean>()
    let calls = 0
    const terminate = createRetryableTermination(async () => {
      calls += 1
      return calls === 1 ? first.promise : true
    })

    const one = terminate()
    const concurrent = terminate()
    expect(one).toBe(concurrent)
    expect(calls).toBe(0)

    first.resolve(false)
    expect(await one).toBe(false)
    expect(await terminate()).toBe(true)
    expect(calls).toBe(2)
  })

  test('retries after rejection instead of replaying it forever', async () => {
    const failure = new Error('signal failed')
    let calls = 0
    const terminate = createRetryableTermination(async () => {
      calls += 1
      if (calls === 1) throw failure
      return true
    })

    await expect(terminate()).rejects.toBe(failure)
    await expect(terminate()).resolves.toBe(true)
    expect(calls).toBe(2)
  })
})
