import { describe, expect, test } from 'bun:test'
import { QueryGuard } from '../QueryGuard.js'
import { StopConfirmationError } from '../stopConfirmation.js'
import {
  runTurnCallback,
  startTurnCallback,
  waitForTurnCallback,
} from '../turnCallbackSettlement.js'

describe('runTurnCallback', () => {
  test('returns the callback result', async () => {
    await expect(
      runTurnCallback(
        async signal => {
          expect(signal.aborted).toBe(false)
          return 42
        },
        {
          timeoutMs: 50,
          abortGraceMs: 5,
          operation: 'test callback',
        },
      ),
    ).resolves.toBe(42)
  })

  test('aborts and fails closed when the callback misses its deadline', async () => {
    let callbackSignal: AbortSignal | undefined
    const running = runTurnCallback(
      signal => {
        callbackSignal = signal
        return new Promise<never>(() => {})
      },
      {
        timeoutMs: 5,
        abortGraceMs: 5,
        operation: 'hung completion callback',
      },
    )

    await expect(running).rejects.toBeInstanceOf(StopConfirmationError)
    expect(callbackSignal?.aborted).toBe(true)
  })

  test('uses the short grace period after the turn is aborted', async () => {
    const controller = new AbortController()
    let callbackSignal: AbortSignal | undefined
    const running = runTurnCallback(
      signal => {
        callbackSignal = signal
        return new Promise<never>(() => {})
      },
      {
        signal: controller.signal,
        timeoutMs: 1_000,
        abortGraceMs: 5,
        operation: 'cancelled callback',
      },
    )

    await Promise.resolve()
    controller.abort('user-cancel')

    await expect(running).rejects.toBeInstanceOf(StopConfirmationError)
    expect(callbackSignal?.aborted).toBe(true)
    expect(callbackSignal?.reason).toBe('user-cancel')
  })

  test('preserves a nested stop confirmation failure', async () => {
    const expected = new StopConfirmationError('nested callback failed')

    await expect(
      runTurnCallback(
        async () => {
          throw expected
        },
        {
          timeoutMs: 50,
          abortGraceMs: 5,
          operation: 'nested callback',
        },
      ),
    ).rejects.toBe(expected)
  })

  test('preserves ordinary callback failures', async () => {
    const expected = new Error('callback failed')

    await expect(
      runTurnCallback(
        async () => {
          throw expected
        },
        {
          timeoutMs: 50,
          abortGraceMs: 5,
          operation: 'failing callback',
        },
      ),
    ).rejects.toBe(expected)
  })

  test('cannot retain a QueryGuard after callback settlement times out', async () => {
    const guard = new QueryGuard()
    const generation = guard.tryStart()
    expect(generation).not.toBeNull()

    await expect(
      guard.finalize(generation!, () =>
        runTurnCallback(() => new Promise<never>(() => {}), {
          timeoutMs: 5,
          abortGraceMs: 5,
          operation: 'guard completion callback',
        }),
      ),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    expect(guard.status).toBe('idle')
  })

  test('retains exact late settlement after a bounded waiter times out', async () => {
    let resolveCallback!: () => void
    let callbackSignal: AbortSignal | undefined
    const execution = startTurnCallback(signal => {
      callbackSignal = signal
      return new Promise<void>(resolve => {
        resolveCallback = resolve
      })
    })

    await expect(
      waitForTurnCallback(execution, {
        timeoutMs: 5,
        abortGraceMs: 5,
        operation: 'late callback',
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)

    expect(callbackSignal?.aborted).toBe(true)
    resolveCallback()
    await expect(execution.settlement).resolves.toBeUndefined()
  })
})
