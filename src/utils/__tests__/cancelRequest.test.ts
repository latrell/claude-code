import { describe, expect, mock, test } from 'bun:test'
import {
  canCancelRequest,
  cancelActiveRequestSources,
  isAuxiliaryOnlyCancellation,
} from '../cancelRequest'
import { QueryGuard } from '../QueryGuard'

describe('canCancelRequest', () => {
  test('allows cancellation while external work is loading', () => {
    expect(canCancelRequest(undefined, true)).toBe(true)
  })

  test('external loading overrides a stale local signal', () => {
    const controller = new AbortController()
    controller.abort()

    expect(canCancelRequest(controller.signal, true)).toBe(true)
  })

  test('allows cancellation for a live local abort signal', () => {
    const controller = new AbortController()

    expect(canCancelRequest(controller.signal, false)).toBe(true)
  })

  test('rejects a stale aborted signal when no external work is loading', () => {
    const controller = new AbortController()
    controller.abort()

    expect(canCancelRequest(controller.signal, false)).toBe(false)
  })

  test('keeps cancellation active while an aborted query is still finalizing', () => {
    const controller = new AbortController()
    controller.abort()

    expect(canCancelRequest(controller.signal, false, true)).toBe(true)
  })

  test('releases repeated Escape only after dispatch ownership returns idle', () => {
    const guard = new QueryGuard()
    const controller = new AbortController()
    guard.reserve()
    controller.abort()

    expect(
      canCancelRequest(controller.signal, false, guard.getSnapshot()),
    ).toBe(true)

    guard.cancelReservation()
    expect(
      canCancelRequest(controller.signal, false, guard.getSnapshot()),
    ).toBe(false)
  })
})

describe('isAuxiliaryOnlyCancellation', () => {
  test('routes idle detached work without inventing a main turn cancellation', () => {
    expect(
      isAuxiliaryOnlyCancellation({
        hasCancelableAuxiliaryWork: true,
        hasLocalQueryInFlight: false,
        isExternalLoading: false,
        hasMainAbortController: false,
      }),
    ).toBe(true)
  })

  test.each([
    ['local query', true, false, false],
    ['external loading', false, true, false],
    ['main controller', false, false, true],
  ])('keeps full cancellation for %s', (_, local, external, controller) => {
    expect(
      isAuxiliaryOnlyCancellation({
        hasCancelableAuxiliaryWork: true,
        hasLocalQueryInFlight: local,
        isExternalLoading: external,
        hasMainAbortController: controller,
      }),
    ).toBe(false)
  })
})

describe('cancelActiveRequestSources', () => {
  test('aborts local and remote request sources together', () => {
    const controller = new AbortController()
    const cancelRemoteRequest = mock(() => {})

    cancelActiveRequestSources({
      abortController: controller,
      isRemoteMode: true,
      cancelRemoteRequest,
    })

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe('user-cancel')
    expect(cancelRemoteRequest).toHaveBeenCalledTimes(1)
  })

  test('retries remote Stop when the local signal is already aborted', () => {
    const controller = new AbortController()
    const cancelRemoteRequest = mock(() => {})

    cancelActiveRequestSources({
      abortController: controller,
      isRemoteMode: true,
      cancelRemoteRequest,
    })
    cancelActiveRequestSources({
      abortController: controller,
      isRemoteMode: true,
      cancelRemoteRequest,
    })

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe('user-cancel')
    expect(cancelRemoteRequest).toHaveBeenCalledTimes(2)
  })

  test('cancels a remote request without a local controller', () => {
    const cancelRemoteRequest = mock(() => {})

    cancelActiveRequestSources({
      abortController: null,
      isRemoteMode: true,
      cancelRemoteRequest,
    })

    expect(cancelRemoteRequest).toHaveBeenCalledTimes(1)
  })

  test('does not contact a remote when only local work is active', () => {
    const controller = new AbortController()
    const cancelRemoteRequest = mock(() => {})

    cancelActiveRequestSources({
      abortController: controller,
      isRemoteMode: false,
      cancelRemoteRequest,
    })

    expect(controller.signal.aborted).toBe(true)
    expect(cancelRemoteRequest).not.toHaveBeenCalled()
  })
})
