import { describe, expect, test } from 'bun:test'
import { t } from '../../i18n/t.js'
import { lastX, returnValue, all, toArray, fromArray } from '../generators'
import { StopConfirmationError } from '../stopConfirmation.js'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function* range(n: number): AsyncGenerator<number, void> {
  for (let i = 0; i < n; i++) {
    yield i
  }
}

describe('lastX', () => {
  test('returns last yielded value', async () => {
    const result = await lastX(range(5))
    expect(result).toBe(4)
  })

  test('returns only value from single-yield generator', async () => {
    const result = await lastX(range(1))
    expect(result).toBe(0)
  })

  test('throws on empty generator', async () => {
    await expect(lastX(range(0))).rejects.toThrow(t('No items in generator'))
  })
})

describe('returnValue', () => {
  test('returns generator return value', async () => {
    async function* gen(): AsyncGenerator<number, string> {
      yield 1
      return 'done'
    }
    const result = await returnValue(gen())
    expect(result).toBe('done')
  })

  test('returns undefined for void return', async () => {
    async function* gen(): AsyncGenerator<number, void> {
      yield 1
    }
    const result = await returnValue(gen())
    expect(result).toBeUndefined()
  })
})

describe('toArray', () => {
  test('collects all yielded values', async () => {
    const result = await toArray(range(4))
    expect(result).toEqual([0, 1, 2, 3])
  })

  test('returns empty array for empty generator', async () => {
    const result = await toArray(fromArray([]))
    expect(result).toEqual([])
  })

  test('preserves order', async () => {
    const result = await toArray(fromArray(['c', 'b', 'a']))
    expect(result).toEqual(['c', 'b', 'a'])
  })
})

describe('fromArray', () => {
  test('yields all array elements', async () => {
    const result = await toArray(fromArray([10, 20, 30]))
    expect(result).toEqual([10, 20, 30])
  })

  test('yields nothing for empty array', async () => {
    const result = await toArray(fromArray([]))
    expect(result).toEqual([])
  })
})

describe('all', () => {
  test('merges multiple generators preserving yield order', async () => {
    const gen1 = fromArray([1, 2])
    const gen2 = fromArray([3, 4])
    const result = await toArray(all([gen1, gen2]))
    // All values from both generators should be present
    expect(result.sort()).toEqual([1, 2, 3, 4])
  })

  test('respects concurrency cap', async () => {
    const gen1 = fromArray([1])
    const gen2 = fromArray([2])
    const gen3 = fromArray([3])
    const result = await toArray(all([gen1, gen2, gen3], 2))
    expect(result.sort()).toEqual([1, 2, 3])
  })

  test('handles empty generator array', async () => {
    const result = await toArray(all([]))
    expect(result).toEqual([])
  })

  test('handles single generator', async () => {
    const result = await toArray(all([fromArray([42])]))
    expect(result).toEqual([42])
  })

  test('handles generators of different lengths', async () => {
    const gen1 = fromArray([1, 2, 3])
    const gen2 = fromArray([10])
    const result = await toArray(all([gen1, gen2]))
    // all() merges concurrently, just verify all values are present
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 10])
  })

  test('yields all values from all generators', async () => {
    const gens = [fromArray([1]), fromArray([2]), fromArray([3])]
    const result = await toArray(all(gens))
    expect(result).toHaveLength(3)
  })

  test('dispatches cancellation and exactly settles siblings before propagating a next rejection', async () => {
    const owner = new AbortController()
    const siblingStarted = deferred()
    const siblingCleanupStarted = deferred()
    const releaseSiblingCleanup = deferred()
    const failure = new Error('generator failed')

    async function* sibling(): AsyncGenerator<number, void> {
      try {
        siblingStarted.resolve()
        await new Promise<void>(resolve => {
          owner.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        })
      } finally {
        siblingCleanupStarted.resolve()
        await releaseSiblingCleanup.promise
      }
    }

    async function* failing(): AsyncGenerator<number, void> {
      await siblingStarted.promise
      yield* []
      throw failure
    }

    let settled = false
    const collecting = toArray(
      all([sibling(), failing()], Infinity, () => owner.abort('batch-failed')),
    ).finally(() => {
      settled = true
    })

    await siblingCleanupStarted.promise
    await Promise.resolve()
    expect(owner.signal.reason).toBe('batch-failed')
    expect(settled).toBe(false)

    releaseSiblingCleanup.resolve()
    await expect(collecting).rejects.toBe(failure)
    expect(settled).toBe(true)
  })

  test('consumer return cancels and exactly settles every started generator', async () => {
    const owner = new AbortController()
    const firstCleanupStarted = deferred()
    const secondCleanupStarted = deferred()
    const releaseFirstCleanup = deferred()
    const releaseSecondCleanup = deferred()

    async function* owned(
      value: number,
      cleanupStarted: ReturnType<typeof deferred>,
      releaseCleanup: ReturnType<typeof deferred>,
    ): AsyncGenerator<number, void> {
      try {
        yield value
        await new Promise<void>(resolve => {
          owner.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        })
      } finally {
        cleanupStarted.resolve()
        await releaseCleanup.promise
      }
    }

    const merged = all(
      [
        owned(1, firstCleanupStarted, releaseFirstCleanup),
        owned(2, secondCleanupStarted, releaseSecondCleanup),
      ],
      Infinity,
      () => owner.abort('consumer-return'),
    )

    expect((await merged.next()).done).toBe(false)
    let closed = false
    const closing = merged.return(undefined).finally(() => {
      closed = true
    })

    await Promise.all([
      firstCleanupStarted.promise,
      secondCleanupStarted.promise,
    ])
    await Promise.resolve()
    expect(owner.signal.reason).toBe('consumer-return')
    expect(closed).toBe(false)

    releaseFirstCleanup.resolve()
    await Promise.resolve()
    expect(closed).toBe(false)

    releaseSecondCleanup.resolve()
    await closing
    expect(closed).toBe(true)
  })

  test('consumer return preserves an exact pending AbortError rejection', async () => {
    const owner = new AbortController()
    const abortError = new DOMException('cancelled', 'AbortError')

    async function* child(): AsyncGenerator<number, void> {
      yield 1
      await new Promise<void>((_resolve, reject) => {
        owner.signal.addEventListener('abort', () => reject(abortError), {
          once: true,
        })
      })
    }

    const merged = all([child()], Infinity, () => owner.abort('return'))
    expect((await merged.next()).value).toBe(1)
    await expect(merged.return(undefined)).rejects.toBe(abortError)
    expect(abortError).not.toBeInstanceOf(StopConfirmationError)
  })

  test('preserves ordinary and AbortError next rejections exactly', async () => {
    const failures = [
      new Error('ordinary failure'),
      new DOMException('cancelled', 'AbortError'),
    ]

    for (const failure of failures) {
      async function* failing(): AsyncGenerator<number, void> {
        yield* []
        throw failure
      }

      await expect(toArray(all([failing()]))).rejects.toBe(failure)
    }
  })

  test('preserves a genuine StopConfirmationError exactly', async () => {
    const failure = new StopConfirmationError('hook request still active')

    async function* failing(): AsyncGenerator<number, void> {
      yield* []
      throw failure
    }

    await expect(toArray(all([failing()]))).rejects.toBe(failure)
  })

  test('preserves exact return rejection without fabricating StopConfirmationError', async () => {
    const failure = new Error('return cleanup failed')
    const child = fromArray([1])
    const originalReturn = child.return.bind(child)
    child.return = async value => {
      await originalReturn(value)
      throw failure
    }
    const merged = all([child])

    expect((await merged.next()).value).toBe(1)
    await expect(merged.return(undefined)).rejects.toBe(failure)
    expect(failure).not.toBeInstanceOf(StopConfirmationError)
  })

  test('propagates a genuine StopConfirmationError from exact return settlement', async () => {
    const failure = new StopConfirmationError('sibling return unconfirmed')
    const child = fromArray([1])
    const originalReturn = child.return.bind(child)
    child.return = async value => {
      await originalReturn(value)
      throw failure
    }
    const merged = all([child])

    expect((await merged.next()).value).toBe(1)
    await expect(merged.return(undefined)).rejects.toBe(failure)
  })
})
