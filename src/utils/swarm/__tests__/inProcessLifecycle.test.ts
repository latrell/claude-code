import { describe, expect, test } from 'bun:test'
import {
  createInProcessWorkAbortController,
  registerInProcessTeammateRunner,
  reserveInProcessTeammateRunner,
  waitForInProcessTeammateRunner,
} from '../inProcessLifecycle'
import { StopConfirmationError } from '../../stopConfirmation'

describe('in-process teammate lifecycle', () => {
  test('lifecycle abort propagates to the active work controller', () => {
    const lifecycle = new AbortController()
    const work = createInProcessWorkAbortController(lifecycle)
    const reason = new Error('stop teammate')

    lifecycle.abort(reason)

    expect(work.signal.aborted).toBe(true)
    expect(work.signal.reason).toBe(reason)
  })

  test('waits for the complete runner settlement', async () => {
    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    registerInProcessTeammateRunner('teammate', runner)

    let waitFinished = false
    const waiting = waitForInProcessTeammateRunner('teammate').then(found => {
      waitFinished = true
      return found
    })

    await Promise.resolve()
    expect(waitFinished).toBe(false)

    settleRunner?.()
    expect(await waiting).toBe(true)
    expect(waitFinished).toBe(true)
  })

  test('waits across a reserved task-to-runner handoff', async () => {
    reserveInProcessTeammateRunner('late-runner')

    let waitFinished = false
    const waiting = waitForInProcessTeammateRunner('late-runner').then(
      found => {
        waitFinished = true
        return found
      },
    )
    await Promise.resolve()
    expect(waitFinished).toBe(false)

    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    registerInProcessTeammateRunner('late-runner', runner)
    await Promise.resolve()
    expect(waitFinished).toBe(false)

    settleRunner?.()
    expect(await waiting).toBe(true)
  })

  test('fails closed instead of waiting forever when a runner never attaches', async () => {
    reserveInProcessTeammateRunner('missing-runner')

    expect(await waitForInProcessTeammateRunner('missing-runner', 1)).toBe(
      false,
    )
  })

  test('retains a timed-out handoff so a late runner can still be confirmed', async () => {
    reserveInProcessTeammateRunner('late-after-timeout')
    expect(await waitForInProcessTeammateRunner('late-after-timeout', 1)).toBe(
      false,
    )

    registerInProcessTeammateRunner('late-after-timeout', Promise.resolve())
    await Promise.resolve()
    await Promise.resolve()

    expect(
      await waitForInProcessTeammateRunner('late-after-timeout', 100, 100, 1),
    ).toBe(true)
  })

  test('retains settled proof while the owning task still appears running', async () => {
    registerInProcessTeammateRunner(
      'settled-but-running',
      Promise.resolve(),
      () => true,
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(
      await waitForInProcessTeammateRunner('settled-but-running', 100, 100, 1),
    ).toBe(true)
  })

  test('times out a hung runner without discarding retryable settlement state', async () => {
    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    registerInProcessTeammateRunner('hung-runner', runner)

    expect(
      await waitForInProcessTeammateRunner('hung-runner', 1_000, 1, 1),
    ).toBe(false)

    settleRunner?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(
      await waitForInProcessTeammateRunner('hung-runner', 1_000, 100, 1),
    ).toBe(true)
  })

  test('propagates and releases a settled StopConfirmationError instead of treating it as a kill proof', async () => {
    registerInProcessTeammateRunner(
      'unconfirmed-runner',
      Promise.reject(new StopConfirmationError('provider still active')),
      () => true,
    )

    await expect(
      waitForInProcessTeammateRunner('unconfirmed-runner', 100, 100, 1),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    // A rejected, already-settled promise is not a retry handle.
    expect(
      await waitForInProcessTeammateRunner('unconfirmed-runner', 100, 100, 1),
    ).toBe(false)
  })

  test('treats an ordinary runner rejection as settled exit proof', async () => {
    registerInProcessTeammateRunner(
      'ordinary-failure',
      Promise.reject(new Error('runner exited')),
      () => true,
    )

    expect(
      await waitForInProcessTeammateRunner('ordinary-failure', 100, 100, 1),
    ).toBe(true)
  })
})
