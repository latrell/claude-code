import { describe, expect, test } from 'bun:test'
import { guardAsyncIterableCancellation } from 'src/services/api/providerCancellation.js'
import { AbortSettlementTimeoutError } from 'src/utils/abortSettlement.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'
import {
  closeForegroundAgentBeforeBackgrounding,
  settleForegroundAgentHandoff,
} from '../foregroundAgentHandoff.js'

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

describe('closeForegroundAgentBeforeBackgrounding', () => {
  test('waits for pending next and iterator cleanup before resolving', async () => {
    let resolveNext: ((result: IteratorResult<string>) => void) | undefined
    let resolveReturn: ((result: IteratorResult<string>) => void) | undefined
    const calls: string[] = []

    const pendingNext = new Promise<IteratorResult<string>>(resolve => {
      resolveNext = resolve
    })
    const iterator: AsyncIterator<string> = {
      next: () => pendingNext,
      return: () => {
        calls.push('return')
        return new Promise<IteratorResult<string>>(resolve => {
          resolveReturn = resolve
        })
      },
    }

    let closed = false
    const closePromise = closeForegroundAgentBeforeBackgrounding(
      iterator,
      pendingNext,
    ).then(() => {
      closed = true
    })

    await Promise.resolve()
    expect(calls).toEqual([])
    expect(closed).toBe(false)

    resolveNext?.({ done: true, value: undefined })
    await Promise.resolve()
    expect(calls).toEqual(['return'])
    expect(closed).toBe(false)

    resolveReturn?.({ done: true, value: undefined })
    await closePromise
    expect(closed).toBe(true)
  })

  test('closes the iterator after an aborted pending next rejects', async () => {
    let returnCalls = 0
    const iterator: AsyncIterator<string> = {
      next: async () => ({ done: true, value: undefined }),
      return: async () => {
        returnCalls++
        return { done: true, value: undefined }
      },
    }

    await closeForegroundAgentBeforeBackgrounding(
      iterator,
      Promise.reject(new DOMException('aborted', 'AbortError')),
    )

    expect(returnCalls).toBe(1)
  })

  test('preserves an unconfirmed pending request after cleanup', async () => {
    const confirmationError = new StopConfirmationError(
      'provider request did not settle',
    )
    let returnCalls = 0
    const iterator: AsyncIterator<string> = {
      next: async () => ({ done: true, value: undefined }),
      return: async () => {
        returnCalls++
        return { done: true, value: undefined }
      },
    }

    await expect(
      closeForegroundAgentBeforeBackgrounding(
        iterator,
        Promise.reject(confirmationError),
      ),
    ).rejects.toBe(confirmationError)
    expect(returnCalls).toBe(1)
  })

  test('preserves an unconfirmed iterator cleanup failure', async () => {
    const confirmationError = new StopConfirmationError(
      'iterator cleanup did not settle',
    )
    const iterator: AsyncIterator<string> = {
      next: async () => ({ done: true, value: undefined }),
      return: () => Promise.reject(confirmationError),
    }

    await expect(
      closeForegroundAgentBeforeBackgrounding(
        iterator,
        Promise.resolve({ done: true, value: undefined }),
      ),
    ).rejects.toBe(confirmationError)
  })
})

describe('settleForegroundAgentHandoff', () => {
  test('uses a fresh deadline for cleanup after the foreground abort', async () => {
    const controller = new AbortController()
    const rawNext = deferred<IteratorResult<string>>()
    const rawReturn = deferred<IteratorResult<string>>()
    let returnCalls = 0
    const rawStream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => rawNext.promise,
          return: () => {
            returnCalls++
            return rawReturn.promise
          },
        }
      },
    }
    const guardedIterator = guardAsyncIterableCancellation(
      rawStream,
      controller.signal,
      {
        abortGraceMs: 2_000,
        returnTimeoutMs: 2_000,
        operation: 'foreground handoff test stream',
      },
    )[Symbol.asyncIterator]()
    const pendingNext = guardedIterator.next()

    controller.abort('background-handoff')
    type HandoffOutcome = 'pending' | 'fulfilled' | 'rejected'
    let handoffOutcome: HandoffOutcome = 'pending'
    const getHandoffOutcome = (): HandoffOutcome => handoffOutcome
    let handoffError: unknown
    const observedHandoff = settleForegroundAgentHandoff(
      guardedIterator,
      pendingNext,
      'deadline-test',
      { timeoutMs: 2_000, deadlineGraceMs: 5 },
    ).then(
      () => {
        handoffOutcome = 'fulfilled'
      },
      error => {
        handoffOutcome = 'rejected'
        handoffError = error
      },
    )

    // The foreground signal is already aborted, but its short grace must not
    // become the deadline for the complete nested iterator cleanup.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(getHandoffOutcome()).toBe('pending')
    expect(returnCalls).toBe(1)

    rawNext.resolve({ done: true, value: undefined })
    await Promise.resolve()
    expect(getHandoffOutcome()).toBe('pending')

    rawReturn.resolve({ done: true, value: undefined })
    await observedHandoff

    expect(getHandoffOutcome()).toBe('fulfilled')
    expect(handoffError).toBeUndefined()
    expect(returnCalls).toBe(1)
  })

  test('preserves a specific confirmation failure through the public gate', async () => {
    const confirmationError = new StopConfirmationError(
      'provider request did not settle',
    )
    let returnCalls = 0
    let replacementStarted = false
    const iterator: AsyncIterator<string> = {
      next: async () => ({ done: true, value: undefined }),
      return: async () => {
        returnCalls++
        return { done: true, value: undefined }
      },
    }

    const handoff = settleForegroundAgentHandoff(
      iterator,
      Promise.reject(confirmationError),
      'confirmation-test',
    ).then(() => {
      replacementStarted = true
    })

    await expect(handoff).rejects.toBe(confirmationError)
    expect(replacementStarted).toBe(false)
    expect(returnCalls).toBe(1)
  })

  test('reports an unconfirmed handoff when its absolute deadline expires', async () => {
    let returnCalls = 0
    const iterator: AsyncIterator<string> = {
      next: async () => ({ done: true, value: undefined }),
      return: () => {
        returnCalls++
        return new Promise<IteratorResult<string>>(() => {})
      },
    }

    let caught: unknown
    try {
      await settleForegroundAgentHandoff(
        iterator,
        Promise.resolve({ done: true, value: undefined }),
        'stuck-test',
        { timeoutMs: 5, deadlineGraceMs: 5 },
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(StopConfirmationError)
    expect((caught as StopConfirmationError).message).toBe(
      'Agent stuck-test foreground request did not settle during background handoff',
    )
    expect((caught as StopConfirmationError).failures[0]).toBeInstanceOf(
      AbortSettlementTimeoutError,
    )
    expect(returnCalls).toBe(1)
  })
})
