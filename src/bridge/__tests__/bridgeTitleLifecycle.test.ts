import { describe, expect, test } from 'bun:test'

import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import {
  createBridgeTitleLifecycle,
  wrapBridgeTitleLifecycle,
} from '../bridgeTitleLifecycle.js'
import type { ReplBridgeHandle } from '../replBridge.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createHandle(calls: {
  result: number
  teardown: number
}): ReplBridgeHandle {
  return {
    bridgeSessionId: 'session_test',
    environmentId: 'environment_test',
    sessionIngressUrl: 'https://example.test',
    writeMessages() {},
    writeSdkMessages() {},
    sendControlRequest() {},
    sendControlResponse() {},
    sendControlCancelRequest() {},
    sendResult() {
      calls.result += 1
    },
    async teardown() {
      calls.teardown += 1
    },
  }
}

describe('bridge title lifecycle', () => {
  test('reports an abort-ignoring title request without pinning the main result', async () => {
    const lifecycle = createBridgeTitleLifecycle({
      cancellationTimeoutMs: 5,
      requestTimeoutMs: 1_000,
    })
    const request = lifecycle.begin('session_test')!
    let aborted = false
    request.signal.addEventListener('abort', () => {
      aborted = true
    })
    lifecycle.track(request, new Promise<void>(() => {}))

    const calls = { result: 0, teardown: 0 }
    const failures: unknown[] = []
    const failureReported = deferred<void>()
    const handle = wrapBridgeTitleLifecycle(
      createHandle(calls),
      lifecycle,
      error => {
        failures.push(error)
        failureReported.resolve(undefined)
      },
    )

    handle.sendResult()
    expect(aborted).toBe(true)
    await failureReported.promise

    expect(calls.result).toBe(1)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toBeInstanceOf(StopConfirmationError)
  })

  test('teardown is bounded and still closes the main transport', async () => {
    const lifecycle = createBridgeTitleLifecycle({
      cancellationTimeoutMs: 5,
      requestTimeoutMs: 1_000,
    })
    const request = lifecycle.begin('session_test')!
    const late = deferred<void>()
    lifecycle.track(request, late.promise)

    const calls = { result: 0, teardown: 0 }
    const handle = wrapBridgeTitleLifecycle(createHandle(calls), lifecycle)

    await handle.teardown()
    expect(calls.teardown).toBe(1)

    late.resolve(undefined)
  })

  test('suppresses a delayed prior-turn result after a replacement turn starts', async () => {
    const lifecycle = createBridgeTitleLifecycle({
      cancellationTimeoutMs: 100,
      requestTimeoutMs: 1_000,
    })
    const firstRequest = lifecycle.begin('session_test')!
    const first = deferred<void>()
    lifecycle.track(firstRequest, first.promise)

    const calls = { result: 0, teardown: 0 }
    const handle = wrapBridgeTitleLifecycle(createHandle(calls), lifecycle)
    handle.sendResult()

    expect(lifecycle.begin('session_test')).toBeUndefined()
    first.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()
    expect(calls.result).toBe(0)

    const secondRequest = lifecycle.begin('session_test')!
    const second = deferred<void>()
    lifecycle.track(secondRequest, second.promise)
    second.resolve(undefined)
    await Promise.resolve()
    handle.sendResult()
    expect(calls.result).toBe(1)
  })

  test('owns generation and patch children under the same abort scope', async () => {
    const lifecycle = createBridgeTitleLifecycle({
      cancellationTimeoutMs: 20,
      requestTimeoutMs: 1_000,
    })
    const request = lifecycle.begin('session_test')!
    const generation = deferred<void>()
    const patch = deferred<void>()
    request.signal.addEventListener('abort', () => {
      generation.resolve(undefined)
      patch.resolve(undefined)
    })
    lifecycle.track(request, generation.promise)
    lifecycle.track(request, patch.promise)

    const calls = { result: 0, teardown: 0 }
    const handle = wrapBridgeTitleLifecycle(createHandle(calls), lifecycle)
    handle.sendResult()
    await Bun.sleep(1)

    expect(request.signal.aborted).toBe(true)
    expect(calls.result).toBe(1)
  })

  test('reports a provider StopConfirmationError without permanently gating idle', async () => {
    const lifecycle = createBridgeTitleLifecycle({
      cancellationTimeoutMs: 20,
      requestTimeoutMs: 1_000,
    })
    const request = lifecycle.begin('session_test')!
    lifecycle.track(
      request,
      Promise.reject(
        new StopConfirmationError('provider stream is still running'),
      ),
    )
    await Promise.resolve()

    const calls = { result: 0, teardown: 0 }
    const failures: unknown[] = []
    const handle = wrapBridgeTitleLifecycle(
      createHandle(calls),
      lifecycle,
      error => failures.push(error),
    )
    handle.sendResult()
    await Promise.resolve()
    await Promise.resolve()

    expect(calls.result).toBe(1)
    expect(failures[0]).toBeInstanceOf(StopConfirmationError)
    expect(lifecycle.begin('session_replacement')).toBeUndefined()
    await handle.teardown()
    expect(calls.teardown).toBe(1)
  })
})
