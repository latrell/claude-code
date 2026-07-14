import { describe, expect, test } from 'bun:test'
import { closeForegroundAgentBeforeBackgrounding } from '../foregroundAgentHandoff.js'

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
})
