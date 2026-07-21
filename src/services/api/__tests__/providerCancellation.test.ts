import { describe, expect, test } from 'bun:test'
import { AbortError } from '../../../utils/errors.js'
import { StopConfirmationError } from '../../../utils/stopConfirmation.js'
import { guardProviderStreamCancellation } from '../providerCancellation.js'

describe('guardProviderStreamCancellation', () => {
  test('rejects with StopConfirmationError when next ignores parent abort', async () => {
    const controller = new AbortController()
    let returnCalls = 0
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<string>>(() => {}),
          return: () => {
            returnCalls++
            return new Promise<IteratorResult<string>>(() => {})
          },
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 5,
      returnTimeoutMs: 5,
    })
    const next = guarded.next()

    controller.abort('user-cancel')

    await expect(next).rejects.toBeInstanceOf(StopConfirmationError)
    expect(returnCalls).toBe(1)
  })

  test('does not request or yield chatty stream events after abort', async () => {
    const controller = new AbortController()
    let nextCalls = 0
    let returnCalls = 0
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({
            done: false as const,
            value: `event-${++nextCalls}`,
          }),
          return: async () => {
            returnCalls++
            return { done: true as const, value: undefined }
          },
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 5,
      returnTimeoutMs: 5,
    })

    expect(await guarded.next()).toEqual({ done: false, value: 'event-1' })
    controller.abort('user-cancel')
    // Abort dispatches iterator.return() even while the consumer is suspended
    // at the yielded value and has not requested another event.
    expect(returnCalls).toBe(1)

    await expect(guarded.next()).rejects.toBeInstanceOf(AbortError)
    expect(nextCalls).toBe(1)
    expect(returnCalls).toBe(1)
  })

  test('drops a value that resolves after abort and closes the iterator', async () => {
    const controller = new AbortController()
    let resolveNext!: (result: IteratorResult<string>) => void
    let returnCalls = 0
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<string>>(resolve => {
              resolveNext = resolve
            }),
          return: async () => {
            returnCalls++
            return { done: true as const, value: undefined }
          },
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 20,
      returnTimeoutMs: 5,
    })
    const next = guarded.next()

    controller.abort('user-cancel')
    resolveNext({ done: false, value: 'post-abort-event' })

    await expect(next).rejects.toBeInstanceOf(AbortError)
    expect(returnCalls).toBe(1)
  })

  test('reports unconfirmed cancellation when return never settles', async () => {
    const controller = new AbortController()
    let returnCalls = 0
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: false as const, value: 'first' }),
          return: () => {
            returnCalls++
            return new Promise<IteratorResult<string>>(() => {})
          },
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 5,
      returnTimeoutMs: 5,
    })

    expect(await guarded.next()).toEqual({ done: false, value: 'first' })
    await expect(guarded.return()).rejects.toBeInstanceOf(StopConfirmationError)
    expect(returnCalls).toBe(1)
  })

  test('accepts exact teardown that settles after the short abort grace', async () => {
    const controller = new AbortController()
    let resolveNext!: (result: IteratorResult<string>) => void
    let resolveReturn!: (result: IteratorResult<string>) => void
    let returnCalls = 0
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<string>>(resolve => {
              resolveNext = resolve
            }),
          return: () => {
            returnCalls++
            return new Promise<IteratorResult<string>>(resolve => {
              resolveReturn = resolve
            })
          },
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 5,
      returnTimeoutMs: 20,
      operation: 'late exact provider teardown',
    })
    const next = guarded.next()

    controller.abort('user-cancel')
    await Bun.sleep(8)
    resolveNext({ done: true, value: undefined })
    resolveReturn({ done: true, value: undefined })

    await expect(next).rejects.toBeInstanceOf(AbortError)
    expect(returnCalls).toBe(1)
  })

  test('preserves a nested unconfirmed request during late teardown', async () => {
    const controller = new AbortController()
    const nestedError = new StopConfirmationError(
      'nested provider request is still unconfirmed',
    )
    let rejectNext!: (error: unknown) => void
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<string>>((_resolve, reject) => {
              rejectNext = reject
            }),
          return: async () => ({ done: true, value: undefined }),
        }
      },
    }
    const guarded = guardProviderStreamCancellation(stream, controller.signal, {
      abortGraceMs: 5,
      returnTimeoutMs: 20,
      operation: 'nested provider teardown',
    })
    const next = guarded.next()

    controller.abort('user-cancel')
    await Bun.sleep(8)
    rejectNext(nestedError)

    await expect(next).rejects.toBe(nestedError)
  })

  test('preserves StopConfirmation through a public model wrapper and the query guard', async () => {
    const controller = new AbortController()
    let returnCalls = 0
    const rawStream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<string>>(() => {}),
          return: () => {
            returnCalls++
            return new Promise<IteratorResult<string>>(() => {})
          },
        }
      },
    }
    const directModelWrapper = (async function* () {
      yield* guardProviderStreamCancellation(rawStream, controller.signal, {
        operation: 'direct queryModelWithStreaming wrapper',
        abortGraceMs: 5,
        returnTimeoutMs: 5,
      })
    })()
    const queryGuard = guardProviderStreamCancellation(
      directModelWrapper,
      controller.signal,
      {
        operation: 'query loop wrapper',
        abortGraceMs: 20,
        returnTimeoutMs: 20,
      },
    )
    const pending = queryGuard.next()

    controller.abort('user-cancel')

    await expect(pending).rejects.toBeInstanceOf(StopConfirmationError)
    expect(returnCalls).toBe(1)
  })
})
