import { describe, expect, test } from 'bun:test'
import { createChildAbortController } from '../../utils/abortController.js'
import { withResolvers } from '../../utils/withResolvers.js'
import { SdkRunLifecycle } from '../sdkRunLifecycle.js'

describe('headless SDK interrupt settlement', () => {
  test('delays acknowledgement until slow run cleanup has settled', async () => {
    const lifecycle = new SdkRunLifecycle()
    const generation = lifecycle.start()
    const cleanup = withResolvers<void>()
    const events: string[] = []

    const run = (async () => {
      try {
        events.push('run-started')
      } finally {
        await cleanup.promise
        events.push('cleanup-settled')
      }
    })().finally(generation.settle)

    const interruptedRun = lifecycle.capture()
    const controller = new AbortController()
    controller.abort()
    events.push('abort-signalled')
    const acknowledgement = interruptedRun?.settled.then(() => {
      events.push('acknowledged')
    })

    await Promise.resolve()
    expect(controller.signal.aborted).toBe(true)
    expect(events).toEqual(['run-started', 'abort-signalled'])

    cleanup.resolve()
    await Promise.all([run, acknowledgement])
    expect(events).toEqual([
      'run-started',
      'abort-signalled',
      'cleanup-settled',
      'acknowledged',
    ])
  })

  test('blocks replacement generations until every interrupt ACK releases the gate', async () => {
    const lifecycle = new SdkRunLifecycle()
    const first = lifecycle.start()
    const firstCancellation = lifecycle.beginCancellation('interrupt-1')
    const secondCancellation = lifecycle.beginCancellation('interrupt-2')
    let becameRunnable = false
    const nextRun = (async () => {
      await lifecycle.waitUntilRunnable()
      becameRunnable = true
      return lifecycle.tryStart()
    })()

    expect(first.abortController.signal.aborted).toBe(true)
    expect(lifecycle.tryStart()).toBeNull()

    first.settle()
    await Promise.all([firstCancellation.settled, secondCancellation.settled])
    await Promise.resolve()
    expect(becameRunnable).toBe(false)

    firstCancellation.releaseAfterAcknowledgement()
    await Promise.resolve()
    expect(becameRunnable).toBe(false)

    secondCancellation.releaseAfterAcknowledgement()
    const second = await nextRun
    expect(second).not.toBeNull()
    if (!second) throw new Error('next SDK run did not start')
    expect(second.abortController.signal.aborted).toBe(false)
    expect(lifecycle.capture()?.generation).toBe(second.generation)
    second.settle()
    expect(lifecycle.capture()).toBeNull()
  })

  test('latches an interrupt before a per-query controller exists', () => {
    const lifecycle = new SdkRunLifecycle()
    const generation = lifecycle.start()
    const interruptedRun = lifecycle.capture()

    interruptedRun?.abortController.abort('interrupt')
    const queryController = createChildAbortController(
      generation.abortController,
    )

    expect(queryController.signal.aborted).toBe(true)
    generation.settle()
  })

  test('allows only one replacement run when multiple waiters resume', async () => {
    const lifecycle = new SdkRunLifecycle()
    const current = lifecycle.start()
    const attempts = [1, 2].map(async () => {
      await lifecycle.waitUntilRunnable()
      return lifecycle.tryStart()
    })

    current.settle()
    const replacement = await Promise.race(attempts)
    expect(replacement).not.toBeNull()
    if (!replacement) throw new Error('no waiter acquired the replacement run')
    replacement.settle()

    const results = await Promise.all(attempts)
    expect(results.filter(result => result !== null)).toHaveLength(1)
    expect(lifecycle.capture()).toBeNull()
  })

  test('ignores stale settlement and ACK release from an older generation', async () => {
    const lifecycle = new SdkRunLifecycle()
    const first = lifecycle.start()
    const cancellation = lifecycle.beginCancellation('interrupt')

    first.settle()
    await cancellation.settled
    cancellation.releaseAfterAcknowledgement()

    const second = lifecycle.start()
    first.settle()
    cancellation.releaseAfterAcknowledgement()

    expect(lifecycle.capture()?.generation).toBe(second.generation)
    second.settle()
  })
})
