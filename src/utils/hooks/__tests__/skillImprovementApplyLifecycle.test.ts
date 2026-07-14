import { describe, expect, test } from 'bun:test'
import {
  commitSkillImprovementIfActive,
  SkillImprovementApplyLifecycle,
} from '../skillImprovementApplyLifecycle.js'

describe('SkillImprovementApplyLifecycle', () => {
  test('starting a new request aborts the previous request', () => {
    const lifecycle = new SkillImprovementApplyLifecycle()
    const first = lifecycle.start()
    const second = lifecycle.start()

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(lifecycle.isCurrent(first)).toBe(false)
    expect(lifecycle.isCurrent(second)).toBe(true)
  })

  test('cancel keeps loading active until the aborted request settles', () => {
    const lifecycle = new SkillImprovementApplyLifecycle()
    const controller = lifecycle.start()

    expect(lifecycle.cancel()).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(lifecycle.isActive).toBe(true)
    expect(lifecycle.cancel()).toBe(false)
    expect(lifecycle.settle(controller)).toBe(true)
    expect(lifecycle.isActive).toBe(false)
  })

  test('an older request cannot settle a newer request', () => {
    const lifecycle = new SkillImprovementApplyLifecycle()
    const first = lifecycle.start()
    const second = lifecycle.start()

    expect(lifecycle.settle(first)).toBe(false)
    expect(lifecycle.isCurrent(second)).toBe(true)
    expect(lifecycle.settle(second)).toBe(true)
    expect(lifecycle.isActive).toBe(false)
  })
})

describe('commitSkillImprovementIfActive', () => {
  test('does not start a file write after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    let writeStarted = false

    const committed = await commitSkillImprovementIfActive(
      controller.signal,
      async () => {
        writeStarted = true
      },
    )

    expect(committed).toBe(false)
    expect(writeStarted).toBe(false)
  })

  test('passes cancellation into an in-flight file write', async () => {
    const controller = new AbortController()
    let observedSignal: AbortSignal | undefined

    const committed = commitSkillImprovementIfActive(
      controller.signal,
      signal => {
        observedSignal = signal
        return new Promise<void>(resolve => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
      },
    )
    controller.abort()

    expect(await committed).toBe(false)
    expect(observedSignal).toBe(controller.signal)
    expect(observedSignal?.aborted).toBe(true)
  })
})
