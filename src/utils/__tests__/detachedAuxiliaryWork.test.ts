import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  cancelAndWaitForDetachedAuxiliaryWork,
  hasActiveDetachedAuxiliaryWork,
  registerDetachedAuxiliaryWork,
  resetDetachedAuxiliaryWorkForTests,
  startAuxiliaryWorkSettlement,
  subscribeToDetachedAuxiliaryWork,
} from '../detachedAuxiliaryWork.js'
import { StopConfirmationError } from '../stopConfirmation.js'

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('detachedAuxiliaryWork', () => {
  beforeEach(resetDetachedAuxiliaryWorkForTests)
  afterEach(resetDetachedAuxiliaryWorkForTests)

  test('publishes active state without becoming a foreground loading gate', async () => {
    const work = deferred()
    const snapshots: boolean[] = []
    const unsubscribe = subscribeToDetachedAuxiliaryWork(() => {
      snapshots.push(hasActiveDetachedAuxiliaryWork())
    })

    registerDetachedAuxiliaryWork({
      operation: 'test work',
      settlement: work.promise,
      cancel: () => {},
      onError: () => {},
    })

    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    work.resolve()
    await work.promise
    await Promise.resolve()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    expect(snapshots).toEqual([true, false])
    unsubscribe()
  })

  test('normal completion helper starts deferred work without returning a foreground wait', async () => {
    const work = deferred()
    let started = false
    const foregroundSettlement = startAuxiliaryWorkSettlement({
      detach: true,
      operation: 'deferred MoreRight completion',
      start: () => {
        started = true
        return work.promise
      },
      cancel: () => {},
      onError: () => {},
    })

    expect(started).toBe(true)
    expect(foregroundSettlement).toBeUndefined()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    work.resolve()
    await work.promise
    await Promise.resolve()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('failure path helper returns the exact settlement for synchronous drain', async () => {
    const work = deferred()
    const foregroundSettlement = startAuxiliaryWorkSettlement({
      detach: false,
      operation: 'cancelled MoreRight completion',
      start: () => work.promise,
      cancel: () => {},
      onError: () => {},
    })

    expect(foregroundSettlement).toBe(work.promise)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    work.resolve()
    await foregroundSettlement
  })

  test('Stop dispatches immediately but waits for the exact settlement promise', async () => {
    const work = deferred()
    const reasons: unknown[] = []
    registerDetachedAuxiliaryWork({
      operation: 'exact work',
      settlement: work.promise,
      cancel: reason => {
        reasons.push(reason)
      },
      onError: () => {},
      abortGraceMs: 100,
    })

    let stopSettled = false
    const stopping = cancelAndWaitForDetachedAuxiliaryWork('Esc').then(() => {
      stopSettled = true
    })
    expect(reasons).toEqual(['Esc'])
    await Promise.resolve()
    expect(stopSettled).toBe(false)

    work.resolve()
    await stopping
    expect(stopSettled).toBe(true)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('dispatcher failure is observed but exact successful settlement confirms Stop', async () => {
    const work = deferred()
    const dispatchError = new Error('dispatcher failed')
    const observed: unknown[] = []
    registerDetachedAuxiliaryWork({
      operation: 'dispatch work',
      settlement: work.promise,
      cancel: () => Promise.reject(dispatchError),
      onError: error => {
        observed.push(error)
      },
      abortGraceMs: 100,
    })

    const stopping = cancelAndWaitForDetachedAuxiliaryWork('Esc')
    await Promise.resolve()
    expect(observed).toEqual([dispatchError])
    work.resolve()
    await expect(stopping).resolves.toBeUndefined()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('ordinary rejection is observed and removed because work is terminal', async () => {
    const work = deferred()
    const failure = new Error('background operation failed')
    const observed: unknown[] = []
    registerDetachedAuxiliaryWork({
      operation: 'failed work',
      settlement: work.promise,
      cancel: () => {},
      onError: error => {
        observed.push(error)
      },
    })

    work.reject(failure)
    await Promise.resolve()
    await Promise.resolve()
    expect(observed).toEqual([failure])
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('StopConfirmationError remains active and visible to repeated Stop', async () => {
    const failure = new StopConfirmationError('remote Stop unconfirmed')
    const observed: unknown[] = []
    let cancelCount = 0
    registerDetachedAuxiliaryWork({
      operation: 'unconfirmed work',
      settlement: Promise.reject(failure),
      cancel: () => {
        cancelCount += 1
      },
      onError: error => {
        observed.push(error)
      },
    })
    await Promise.resolve()

    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('first Esc'),
    ).rejects.toBe(failure)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('second Esc'),
    ).rejects.toBe(failure)
    expect(cancelCount).toBe(2)
    expect(observed).toEqual([failure])
  })

  test('an abort-ignoring exact promise times out and stays retryable', async () => {
    let cancelCount = 0
    registerDetachedAuxiliaryWork({
      operation: 'abort-ignoring work',
      settlement: new Promise<void>(() => {}),
      cancel: () => {
        cancelCount += 1
      },
      onError: () => {},
      abortGraceMs: 5,
    })

    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('first Esc'),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('second Esc'),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(cancelCount).toBe(2)
  })
})
