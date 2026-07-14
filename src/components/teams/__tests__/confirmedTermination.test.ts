import { describe, expect, test } from 'bun:test'
import { runConfirmedTermination } from '../confirmedTermination'

describe('runConfirmedTermination', () => {
  test('does not clean up or report success when Stop returns false', async () => {
    let cleanupCalls = 0
    let unconfirmedCalls = 0

    const result = await runConfirmedTermination({
      stop: async () => false,
      afterConfirmed: async () => {
        cleanupCalls++
      },
      onUnconfirmed: () => {
        unconfirmedCalls++
      },
    })

    expect(result).toBe(false)
    expect(cleanupCalls).toBe(0)
    expect(unconfirmedCalls).toBe(1)
  })

  test('does not clean up or report success when Stop throws', async () => {
    let cleanupCalls = 0
    let capturedError: unknown
    const stopError = new Error('backend unavailable')

    const result = await runConfirmedTermination({
      stop: async () => Promise.reject(stopError),
      afterConfirmed: async () => {
        cleanupCalls++
      },
      onStopError: error => {
        capturedError = error
      },
    })

    expect(result).toBe(false)
    expect(cleanupCalls).toBe(0)
    expect(capturedError).toBe(stopError)
  })

  test('runs cleanup exactly once after confirmed termination', async () => {
    let cleanupCalls = 0

    const result = await runConfirmedTermination({
      stop: async () => true,
      afterConfirmed: async () => {
        cleanupCalls++
      },
    })

    expect(result).toBe(true)
    expect(cleanupCalls).toBe(1)
  })
})
