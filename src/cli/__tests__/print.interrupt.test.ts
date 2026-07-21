import { describe, expect, test } from 'bun:test'
import { createChildAbortController } from '../../utils/abortController.js'
import { withResolvers } from '../../utils/withResolvers.js'
import {
  cancelSdkOwnedRuns,
  SdkRunLifecycle,
  shouldDeferHeadlessOutputClose,
  shouldKeepParkedTaskNotificationRecoverable,
  shouldWaitForSdkBackgroundTasks,
  waitForSdkBackgroundTaskPoll,
  waitForSdkStopSettlement,
} from '../sdkRunLifecycle.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'

describe('headless SDK interrupt settlement', () => {
  test('keeps output open through notification retry backoff after stdin closes', () => {
    expect(
      shouldDeferHeadlessOutputClose({
        inputClosed: true,
        hasPendingTaskNotificationDelivery: true,
      }),
    ).toBe(true)
    expect(
      shouldDeferHeadlessOutputClose({
        inputClosed: true,
        hasPendingTaskNotificationDelivery: false,
      }),
    ).toBe(false)
  })

  test('keeps a parked notification recoverable only for an open healthy session', () => {
    expect(
      shouldKeepParkedTaskNotificationRecoverable({
        inputClosed: false,
        hasAuxiliaryFailures: false,
      }),
    ).toBe(true)
    expect(
      shouldKeepParkedTaskNotificationRecoverable({
        inputClosed: true,
        hasAuxiliaryFailures: false,
      }),
    ).toBe(false)
    expect(
      shouldKeepParkedTaskNotificationRecoverable({
        inputClosed: false,
        hasAuxiliaryFailures: true,
      }),
    ).toBe(false)
  })

  test('cancels and drains every auxiliary SDK request before confirming Stop', async () => {
    const first = new AbortController()
    const second = new AbortController()
    const firstSettled = new Promise<void>(resolve =>
      first.signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    const secondSettled = new Promise<void>(resolve =>
      second.signal.addEventListener('abort', () => resolve(), { once: true }),
    )

    await cancelSdkOwnedRuns(
      [
        { abortController: first, settled: firstSettled },
        { abortController: second, settled: secondSettled },
      ],
      'interrupt',
      'auxiliary test requests',
      10,
    )

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  test('rejects Stop confirmation when an auxiliary SDK request ignores abort', async () => {
    const controller = new AbortController()
    await expect(
      cancelSdkOwnedRuns(
        [
          {
            abortController: controller,
            settled: new Promise<void>(() => {}),
          },
        ],
        'interrupt',
        'hung auxiliary request',
        5,
      ),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(controller.signal.aborted).toBe(true)
  })

  test('preserves an auxiliary request StopConfirmationError', async () => {
    const controller = new AbortController()
    const unconfirmed = new StopConfirmationError('provider still running')
    const settled = Promise.reject(unconfirmed)
    void settled.catch(() => {})

    await expect(
      cancelSdkOwnedRuns(
        [{ abortController: controller, settled }],
        'interrupt',
        'failed auxiliary request',
        10,
      ),
    ).rejects.toBe(unconfirmed)
  })

  test('a second interrupt can recover after a terminal auxiliary wrapper failed Stop confirmation', async () => {
    const lifecycle = new SdkRunLifecycle()
    const first = lifecycle.start()
    const firstCancellation = lifecycle.beginCancellation('interrupt')
    const controller = new AbortController()
    const unconfirmed = new StopConfirmationError('remote may still be active')
    const settled = Promise.reject(unconfirmed)
    void settled.catch(() => {})
    const run = { abortController: controller, settled }
    const ownedRuns = new Set([run])

    first.settle()
    await firstCancellation.settled
    let firstConfirmed = true
    try {
      await cancelSdkOwnedRuns(
        [...ownedRuns],
        'interrupt',
        'failed auxiliary wrapper',
        10,
      )
    } catch (error) {
      expect(error).toBe(unconfirmed)
      firstConfirmed = false
    } finally {
      // Mirrors print.ts: a rejected local wrapper is terminal and leaves the
      // active registry; that auxiliary feature is separately fused off.
      ownedRuns.delete(run)
    }
    firstCancellation.releaseAfterAcknowledgement(firstConfirmed)

    expect(firstConfirmed).toBe(false)
    expect(ownedRuns.size).toBe(0)
    expect(lifecycle.tryStart()).toBeNull()

    const retry = lifecycle.beginCancellation('interrupt-retry')
    await retry.settled
    await cancelSdkOwnedRuns(
      [...ownedRuns],
      'interrupt-retry',
      'failed auxiliary wrapper',
      10,
    )
    retry.releaseAfterAcknowledgement(true)

    const second = lifecycle.tryStart()
    expect(second).not.toBeNull()
    expect(second?.abortController.signal.aborted).toBe(false)
    second?.settle()
  })

  test('bounds an unresponsive control-plane cancellation acknowledgement', async () => {
    expect(
      await waitForSdkStopSettlement(
        new Promise<void>(() => {}),
        5,
        'hung SDK test run',
      ),
    ).toBe(false)
  })

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

  test('keeps the replacement gate closed when an unconfirmed stop is acknowledged', async () => {
    const lifecycle = new SdkRunLifecycle()
    const first = lifecycle.start()
    const cancellation = lifecycle.beginCancellation('interrupt')
    let becameRunnable = false
    const nextRun = (async () => {
      await lifecycle.waitUntilRunnable()
      becameRunnable = true
      return lifecycle.tryStart()
    })()

    first.settle()
    await cancellation.settled
    cancellation.releaseAfterAcknowledgement(false)
    await Promise.resolve()
    expect(becameRunnable).toBe(false)
    expect(lifecycle.tryStart()).toBeNull()

    const retry = lifecycle.beginCancellation('interrupt-retry')
    await retry.settled
    retry.releaseAfterAcknowledgement(true)
    const second = await nextRun
    expect(second).not.toBeNull()
    second?.settle()
  })

  test('releases a stuck waiting_for_agents poll when its generation is cancelled', async () => {
    const controller = new AbortController()
    const poll = waitForSdkBackgroundTaskPoll(controller.signal, 10_000)

    controller.abort('interrupt')

    await expect(poll).resolves.toBe(false)
  })

  test('keeps waiting across a terminal task notification-delivery gap', () => {
    expect(
      shouldWaitForSdkBackgroundTasks({
        hasRunningBackgroundTask: false,
        hasPendingTaskDelivery: true,
        hasMainThreadQueued: false,
      }),
    ).toBe(true)
  })

  test('stops waiting only after background work and delivery are drained', () => {
    expect(
      shouldWaitForSdkBackgroundTasks({
        hasRunningBackgroundTask: false,
        hasPendingTaskDelivery: false,
        hasMainThreadQueued: false,
      }),
    ).toBe(false)
    expect(
      shouldWaitForSdkBackgroundTasks({
        hasRunningBackgroundTask: false,
        hasPendingTaskDelivery: false,
        hasMainThreadQueued: true,
      }),
    ).toBe(true)
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
