import { describe, expect, test } from 'bun:test'
import {
  deferUntilNextFrame,
  waitForInkRenderFrame,
  waitUntilNextFrame,
} from '../deferUntilNextFrame'

describe('deferUntilNextFrame', () => {
  test('does not call the callback synchronously', () => {
    let called = false
    deferUntilNextFrame(() => {
      called = true
    })
    expect(called).toBe(false)
  })

  test('calls the callback after the next macrotask', async () => {
    let called = false
    deferUntilNextFrame(() => {
      called = true
    })
    expect(called).toBe(false)
    // Wait for the next macrotask — setTimeout(0) fires before this promise
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(called).toBe(true)
  })

  test('multiple deferred callbacks fire in deferral order', async () => {
    const order: number[] = []
    deferUntilNextFrame(() => order.push(1))
    deferUntilNextFrame(() => order.push(2))
    deferUntilNextFrame(() => order.push(3))
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(order).toEqual([1, 2, 3])
  })

  test('sync action runs before deferred action (the UI-clear-first pattern)', async () => {
    const timeline: string[] = []

    // Simulate: clear suggestions (sync), then execute command (deferred)
    timeline.push('clear suggestions')
    deferUntilNextFrame(() => {
      timeline.push('execute command')
    })
    timeline.push('after clear, before deferred')

    expect(timeline).toEqual([
      'clear suggestions',
      'after clear, before deferred',
    ])

    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(timeline).toEqual([
      'clear suggestions',
      'after clear, before deferred',
      'execute command',
    ])
  })
})

describe('waitUntilNextFrame', () => {
  test('resolves after the next macrotask tick', async () => {
    let resolved = false
    const promise = waitUntilNextFrame()
    promise.then(() => {
      resolved = true
    })
    expect(resolved).toBe(false)
    await promise
    expect(resolved).toBe(true)
  })

  test('await waits exactly one tick (clear-before-execute pattern)', async () => {
    const timeline: string[] = []

    timeline.push('clear suggestions')
    await waitUntilNextFrame()
    // After the await, Ink should have flushed the cleared state
    timeline.push('execute command')

    expect(timeline).toEqual(['clear suggestions', 'execute command'])

    // Verify that a zero-delay callback scheduled BEFORE the await fires BEFORE
    // the code after await (proving await deferred by one tick).
    const order: string[] = []
    setTimeout(() => order.push('before-await-fire'), 0)
    await waitUntilNextFrame()
    order.push('after-await')

    // setTimeout(0) fires in FIFO order. Our helper uses setTimeout(0),
    // so the external setTimeout(0) scheduled before our await should fire
    // before our helper's setTimeout(0) resolves the promise.
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(order[0]).toBe('before-await-fire')
    expect(order[1]).toBe('after-await')
  })
})

describe('waitForInkRenderFrame', () => {
  // NOTE: waitForInkRenderFrame is no longer used by the /exit path
  // (clearTerminalBelow + microtask wait supersedes it).  It remains
  // as a utility for callers that need to wait through Ink's 16ms
  // render throttle window.  Tests avoid quantitative timing assertions
  // (e.g. >=10ms) to prevent CI flake.

  test('does not resolve synchronously', async () => {
    let resolved = false
    const promise = waitForInkRenderFrame()
    promise.then(() => {
      resolved = true
    })
    expect(resolved).toBe(false)
    await promise
    expect(resolved).toBe(true)
  })

  test('resolves later than a microtask (setTimeout vs queueMicrotask)', async () => {
    // waitForInkRenderFrame uses setTimeout(20), which fires after the
    // microtask queue is drained.  A queueMicrotask callback should fire
    // before the timer.
    const order: string[] = []
    queueMicrotask(() => order.push('microtask'))
    setTimeout(() => order.push('setTimeout-zero'), 0)
    const promise = waitForInkRenderFrame().then(() => order.push('ink-render'))
    await promise
    // queueMicrotask fires first, then setTimeout(0), then our setTimeout(20)
    expect(order.indexOf('microtask')).toBeLessThan(
      order.indexOf('setTimeout-zero'),
    )
    expect(order.indexOf('setTimeout-zero')).toBeLessThan(
      order.indexOf('ink-render'),
    )
  })

  test('still exported and callable', () => {
    expect(typeof waitForInkRenderFrame).toBe('function')
    const p = waitForInkRenderFrame()
    expect(p).toBeInstanceOf(Promise)
  })
})
