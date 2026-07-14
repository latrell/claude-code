import { describe, expect, mock, test } from 'bun:test'
import { canCancelRequest, cancelActiveRequestSources } from '../cancelRequest'

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
