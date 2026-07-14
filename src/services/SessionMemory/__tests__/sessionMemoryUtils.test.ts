import { afterEach, describe, expect, test } from 'bun:test'
import {
  markExtractionCompleted,
  markExtractionStarted,
  waitForSessionMemoryExtraction,
  withSessionMemoryExtraction,
} from '../sessionMemoryUtils.js'

async function settlesWithin(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>(resolve => {
        timer = setTimeout(resolve, timeoutMs, false)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

afterEach(() => {
  markExtractionCompleted()
})

describe('waitForSessionMemoryExtraction', () => {
  test('returns immediately when the turn signal is already aborted', async () => {
    markExtractionStarted()
    const controller = new AbortController()
    controller.abort('user-cancel')

    expect(
      await settlesWithin(
        waitForSessionMemoryExtraction(controller.signal),
        100,
      ),
    ).toBe(true)
  })

  test('interrupts an active polling sleep when the turn is aborted', async () => {
    markExtractionStarted()
    const controller = new AbortController()
    const pending = waitForSessionMemoryExtraction(controller.signal)

    controller.abort('user-cancel')

    expect(await settlesWithin(pending, 100)).toBe(true)
  })
})

describe('withSessionMemoryExtraction', () => {
  test('clears the extraction marker when the operation rejects', async () => {
    const failure = new Error('aborted extraction')
    let caught: unknown

    try {
      await withSessionMemoryExtraction(async () => {
        throw failure
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBe(failure)
    expect(await settlesWithin(waitForSessionMemoryExtraction(), 100)).toBe(
      true,
    )
  })
})
