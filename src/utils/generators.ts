import { t } from 'src/i18n/t.js'
import { StopConfirmationError } from './stopConfirmation.js'

const NO_VALUE = Symbol('NO_VALUE')

export async function lastX<A>(as: AsyncGenerator<A>): Promise<A> {
  let lastValue: A | typeof NO_VALUE = NO_VALUE
  for await (const a of as) {
    lastValue = a
  }
  if (lastValue === NO_VALUE) {
    throw new Error(t('No items in generator'))
  }
  return lastValue
}

export async function returnValue<A>(
  as: AsyncGenerator<unknown, A>,
): Promise<A> {
  let e
  do {
    e = await as.next()
  } while (!e.done)
  return e.value
}

type QueuedGenerator<A> = {
  // biome-ignore lint/suspicious/noConfusingVoidType: void matches AsyncGenerator<A, void> return type
  done: boolean | void
  // biome-ignore lint/suspicious/noConfusingVoidType: void matches AsyncGenerator<A, void> yield type
  value: A | void
  generator: AsyncGenerator<A, void>
  promise: Promise<QueuedGenerator<A>>
}

type AllCancellationHandler = () => void | Promise<void>

function selectAllFailure(
  primaryFailure: unknown,
  hasPrimaryFailure: boolean,
  cleanupFailures: readonly unknown[],
): { hasFailure: boolean; failure: unknown } {
  if (primaryFailure instanceof StopConfirmationError) {
    return { hasFailure: true, failure: primaryFailure }
  }

  const unconfirmedCleanup = cleanupFailures.find(
    failure => failure instanceof StopConfirmationError,
  )
  if (unconfirmedCleanup !== undefined) {
    return { hasFailure: true, failure: unconfirmedCleanup }
  }

  if (hasPrimaryFailure) {
    return { hasFailure: true, failure: primaryFailure }
  }

  return {
    hasFailure: cleanupFailures.length > 0,
    failure: cleanupFailures[0],
  }
}

async function closeStartedGenerators<A>(
  started: ReadonlySet<AsyncGenerator<A, void>>,
  pendingNext: ReadonlySet<Promise<QueuedGenerator<A>>>,
  onCancel?: AllCancellationHandler,
): Promise<unknown[]> {
  const cleanupPromises: Promise<unknown>[] = []

  // Dispatch owner cancellation before calling return(). A native async
  // generator queues return() behind an in-flight next(), so the owner signal
  // must be what releases that next() rather than waiting for return itself.
  if (onCancel) {
    try {
      cleanupPromises.push(Promise.resolve(onCancel()))
    } catch (error) {
      cleanupPromises.push(Promise.reject(error))
    }
  }

  // A consumer can return while all() is suspended at yield, before the next
  // Promise.race has attached observers to the newly scheduled next() calls.
  // Observe those exact promises as part of cleanup as well as the queued
  // generator.return() calls below.
  cleanupPromises.push(...pendingNext)

  // Invoke every return synchronously before awaiting any of them. This keeps
  // one slow sibling from preventing cancellation dispatch to the others.
  for (const generator of started) {
    try {
      cleanupPromises.push(generator.return(undefined))
    } catch (error) {
      cleanupPromises.push(Promise.reject(error))
    }
  }

  const settlements = await Promise.allSettled(cleanupPromises)
  return settlements.flatMap(settlement =>
    settlement.status === 'rejected' ? [settlement.reason] : [],
  )
}

// Run all generators concurrently up to a concurrency cap, yielding values as they come in
export async function* all<A>(
  generators: AsyncGenerator<A, void>[],
  concurrencyCap = Infinity,
  onCancel?: AllCancellationHandler,
): AsyncGenerator<A, void> {
  const next = (generator: AsyncGenerator<A, void>) => {
    let promise: Promise<QueuedGenerator<A>>
    try {
      promise = generator.next().then(({ done, value }) => ({
        done,
        value,
        generator,
        promise,
      }))
    } catch (error) {
      promise = Promise.reject(error)
    }
    return promise
  }
  const waiting = [...generators]
  const promises = new Set<Promise<QueuedGenerator<A>>>()
  const started = new Set<AsyncGenerator<A, void>>()
  let completedNormally = false
  let primaryFailure: unknown
  let hasPrimaryFailure = false

  const start = (generator: AsyncGenerator<A, void>): void => {
    started.add(generator)
    promises.add(next(generator))
  }

  // Start initial batch up to concurrency cap
  while (promises.size < concurrencyCap && waiting.length > 0) {
    const gen = waiting.shift()!
    start(gen)
  }

  try {
    while (promises.size > 0) {
      const { done, value, generator, promise } = await Promise.race(promises)
      promises.delete(promise)

      if (!done) {
        promises.add(next(generator))
        // TODO: Clean this up
        if (value !== undefined) {
          yield value as Awaited<A>
        }
      } else if (waiting.length > 0) {
        // Start a new generator when one finishes
        const nextGen = waiting.shift()!
        start(nextGen)
      }
    }
    completedNormally = true
  } catch (error) {
    primaryFailure = error
    hasPrimaryFailure = true
  } finally {
    if (!completedNormally) {
      const cleanupFailures = await closeStartedGenerators(
        started,
        promises,
        onCancel,
      )
      const selectedFailure = selectAllFailure(
        primaryFailure,
        hasPrimaryFailure,
        cleanupFailures,
      )
      if (selectedFailure.hasFailure) {
        // biome-ignore lint/correctness/noUnsafeFinally: exact cleanup failure must reject consumer return(), while a primary failure is selected explicitly above.
        throw selectedFailure.failure
      }
    }
  }
}

export async function toArray<A>(
  generator: AsyncGenerator<A, void>,
): Promise<A[]> {
  const result: A[] = []
  for await (const a of generator) {
    result.push(a)
  }
  return result
}

export async function* fromArray<T>(values: T[]): AsyncGenerator<T, void> {
  for (const value of values) {
    yield value
  }
}
