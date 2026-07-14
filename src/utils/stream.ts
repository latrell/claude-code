import { t } from 'src/i18n/t.js'

export class Stream<T> implements AsyncIterator<T> {
  private readonly queue: T[] = []
  private readResolve?: (value: IteratorResult<T>) => void
  private readReject?: (error: unknown) => void
  private isDone: boolean = false
  private hasError: unknown | undefined
  private started = false
  private returnPromise?: Promise<IteratorResult<T, unknown>>

  constructor(private readonly returned?: () => void | Promise<void>) {}

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    if (this.started) {
      throw new Error(t('Stream can only be iterated once'))
    }
    this.started = true
    return this
  }

  next(): Promise<IteratorResult<T, unknown>> {
    if (this.queue.length > 0) {
      return Promise.resolve({
        done: false,
        value: this.queue.shift()!,
      })
    }
    if (this.hasError) {
      return Promise.reject(this.hasError)
    }
    if (this.isDone) {
      return Promise.resolve({ done: true, value: undefined })
    }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.readResolve = resolve
      this.readReject = reject
    })
  }

  enqueue(value: T): void {
    if (this.isDone || this.hasError) {
      return
    }
    if (this.readResolve) {
      const resolve = this.readResolve
      this.readResolve = undefined
      this.readReject = undefined
      resolve({ done: false, value })
    } else {
      this.queue.push(value)
    }
  }

  done() {
    this.isDone = true
    if (this.readResolve) {
      const resolve = this.readResolve
      this.readResolve = undefined
      this.readReject = undefined
      resolve({ done: true, value: undefined })
    }
  }

  error(error: unknown) {
    if (this.isDone || this.hasError) {
      return
    }
    this.hasError = error
    if (this.readReject) {
      const reject = this.readReject
      this.readResolve = undefined
      this.readReject = undefined
      reject(error)
    }
  }

  return(): Promise<IteratorResult<T, unknown>> {
    // A second Stop while the first cancellation is still unwinding must wait
    // for the same producer settlement. `isDone` is set before the async
    // returned callback settles, so checking it first would falsely confirm
    // termination on repeated iterator.return() calls.
    if (this.returnPromise) return this.returnPromise
    if (this.isDone) {
      return Promise.resolve({ done: true, value: undefined })
    }
    this.isDone = true
    this.queue.length = 0
    if (this.readResolve) {
      const resolve = this.readResolve
      this.readResolve = undefined
      this.readReject = undefined
      resolve({ done: true, value: undefined })
    }
    if (!this.returned || this.hasError) {
      return Promise.resolve({ done: true, value: undefined })
    }

    // A producer's cancellation dispatcher may need to wait for the exact
    // underlying operation (HTTP request, tool call, subprocess) to settle.
    // Do not acknowledge iterator.return() merely because cancellation was
    // sent; doing so would let outer executors report Stop while work remains.
    try {
      this.returnPromise = Promise.resolve(this.returned()).then(() => ({
        done: true as const,
        value: undefined,
      }))
      return this.returnPromise
    } catch (error) {
      this.returnPromise = Promise.reject(error)
      // The caller receives this exact rejection. Keep the cached promise so
      // later return() calls cannot bypass the failed settlement attempt.
      return this.returnPromise
    }
  }
}
