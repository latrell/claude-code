import { describe, expect, test } from 'bun:test'
import {
  canPublishRemoteSessionIdle,
  canRetryRemoteTitleAfterCancellation,
  cancelRemoteTitleRun,
  hasCancelableRemoteTitleWork,
  RemoteTitleOwnership,
  resolveRemoteCancellationOutcome,
  type RemoteTitleRun,
} from '../remoteTitleLifecycle.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'

describe('canPublishRemoteSessionIdle', () => {
  const settled = {
    remoteTurnActive: false,
    titleRunActive: false,
    cancellationPending: false,
    remoteCancellationUnconfirmed: false,
    titleCancellationUnconfirmed: false,
  }

  test('publishes main idle when the agent ended before title inference', () => {
    expect(
      canPublishRemoteSessionIdle({ ...settled, titleRunActive: true }),
    ).toBe(true)
    expect(hasCancelableRemoteTitleWork({ titleRunActive: true })).toBe(true)
  })

  test('does not permanently gate idle after an auxiliary title failure', () => {
    expect(
      canPublishRemoteSessionIdle({
        ...settled,
        titleCancellationUnconfirmed: true,
      }),
    ).toBe(true)
  })

  test('keeps Stop available after a negative worker interrupt ACK', () => {
    expect(
      canPublishRemoteSessionIdle({
        ...settled,
        remoteCancellationUnconfirmed: true,
      }),
    ).toBe(false)
  })

  test('publishes idle only when every owner has settled', () => {
    expect(canPublishRemoteSessionIdle(settled)).toBe(true)
  })
})

describe('resolveRemoteCancellationOutcome', () => {
  test('accepts an acknowledged manager interrupt despite title uncertainty', () => {
    expect(
      resolveRemoteCancellationOutcome({
        managerCancelled: true,
        titleCancelled: false,
        remoteTurnActive: true,
      }),
    ).toEqual({
      mainTurnStopped: true,
      titleStopUnconfirmed: true,
    })
  })

  test('uses a terminal worker event as independent main-turn proof', () => {
    expect(
      resolveRemoteCancellationOutcome({
        managerCancelled: false,
        titleCancelled: false,
        remoteTurnActive: false,
      }),
    ).toEqual({
      mainTurnStopped: true,
      titleStopUnconfirmed: true,
    })
  })

  test('keeps the main Stop gate only for an unconfirmed active worker', () => {
    expect(
      resolveRemoteCancellationOutcome({
        managerCancelled: false,
        titleCancelled: true,
        remoteTurnActive: true,
      }),
    ).toEqual({
      mainTurnStopped: false,
      titleStopUnconfirmed: false,
    })
  })
})

describe('canRetryRemoteTitleAfterCancellation', () => {
  test('keeps the title latch after unconfirmed cancellation', () => {
    expect(
      canRetryRemoteTitleAfterCancellation({
        hadTitleRun: true,
        titleCancelled: false,
      }),
    ).toBe(false)
  })

  test('releases the title latch only after the original chain settles', () => {
    expect(
      canRetryRemoteTitleAfterCancellation({
        hadTitleRun: true,
        titleCancelled: true,
      }),
    ).toBe(true)
  })
})

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolve: () => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('cancelRemoteTitleRun', () => {
  test('does not confirm cancellation until the original chain settles', async () => {
    const controller = new AbortController()
    const runSettlement = deferred()
    const run: RemoteTitleRun = {
      abortController: controller,
      settled: runSettlement.promise,
    }

    let completed = false
    const cancellation = cancelRemoteTitleRun(run, 'user-cancel', 50).then(
      result => {
        completed = true
        return result
      },
    )

    await Promise.resolve()
    expect(controller.signal.aborted).toBe(true)
    expect(completed).toBe(false)

    runSettlement.resolve()
    expect(await cancellation).toBe(true)
  })

  test('fails closed when the request ignores abort', async () => {
    const controller = new AbortController()
    const run: RemoteTitleRun = {
      abortController: controller,
      settled: new Promise<void>(() => {}),
    }

    expect(await cancelRemoteTitleRun(run, 'user-cancel', 5)).toBe(false)
  })

  test('preserves an explicit unconfirmed-stop failure', async () => {
    const controller = new AbortController()
    const settled = Promise.reject(
      new StopConfirmationError('provider did not confirm termination'),
    )
    void settled.catch(() => {})

    expect(
      await cancelRemoteTitleRun(
        { abortController: controller, settled },
        'user-cancel',
        20,
      ),
    ).toBe(false)
  })

  test('treats an ordinary rejection as settled ownership', async () => {
    const controller = new AbortController()
    const settled = Promise.reject(new Error('request failed'))
    void settled.catch(() => {})

    expect(
      await cancelRemoteTitleRun(
        { abortController: controller, settled },
        'user-cancel',
        20,
      ),
    ).toBe(true)
  })
})

describe('RemoteTitleOwnership', () => {
  test('blocks a replacement title until the prior session title settles', async () => {
    let settleFirst!: () => void
    const firstSettled = new Promise<void>(resolve => {
      settleFirst = resolve
    })
    const first = {
      abortController: new AbortController(),
      settled: firstSettled,
    }
    const replacement = {
      abortController: new AbortController(),
      settled: Promise.resolve(),
    }
    const ownership = new RemoteTitleOwnership()

    expect(ownership.tryStart(first)).toBe(true)
    const cancellation = ownership.cancel('session-replaced', 50)
    expect(cancellation).not.toBeNull()
    expect(ownership.hasActiveOwner).toBe(true)
    expect(ownership.tryStart(replacement)).toBe(false)
    expect(
      canPublishRemoteSessionIdle({
        remoteTurnActive: false,
        titleRunActive: ownership.hasActiveOwner,
        cancellationPending: false,
        remoteCancellationUnconfirmed: false,
        titleCancellationUnconfirmed: false,
      }),
    ).toBe(true)
    expect(
      hasCancelableRemoteTitleWork({
        titleRunActive: ownership.hasActiveOwner,
      }),
    ).toBe(true)

    settleFirst()
    expect(await cancellation).toBe(true)
    expect(ownership.hasActiveOwner).toBe(false)
    expect(ownership.tryStart(replacement)).toBe(true)
  })

  test('retains a fuse and handle after replacement cancellation is unconfirmed', async () => {
    const first = {
      abortController: new AbortController(),
      settled: new Promise<void>(() => {}),
    }
    const replacement = {
      abortController: new AbortController(),
      settled: Promise.resolve(),
    }
    const ownership = new RemoteTitleOwnership()

    expect(ownership.tryStart(first)).toBe(true)
    expect(await ownership.cancel('session-replaced', 5)).toBe(false)
    expect(ownership.hasActiveOwner).toBe(false)
    expect(ownership.hasUnconfirmedStop).toBe(true)
    expect(ownership.owns(first)).toBe(true)
    expect(ownership.tryStart(replacement)).toBe(false)
  })
})
