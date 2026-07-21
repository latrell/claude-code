import { describe, expect, test } from 'bun:test'

import {
  requestInitialMessageRetryFromSubmission,
  runInitialMessageAttempt,
} from '../initialMessageAttempt.js'

describe('runInitialMessageAttempt', () => {
  test('releases the latch, reports failure, and does not start implementation after migration fails', async () => {
    const processingRef = { current: true }
    const migrationError = new Error('task-list copy failed')
    let reportedError: unknown
    let implementationStarted = false

    await runInitialMessageAttempt({
      processingRef,
      attempt: async () => {
        await Promise.reject(migrationError)
        implementationStarted = true
      },
      onFailure: error => {
        reportedError = error
      },
    })

    expect(processingRef.current).toBe(false)
    expect(reportedError).toBe(migrationError)
    expect(implementationStarted).toBe(false)
  })

  test('leaves successful latch reset timing to the caller', async () => {
    const processingRef = { current: true }
    let failed = false

    await runInitialMessageAttempt({
      processingRef,
      attempt: async () => {},
      onFailure: () => {
        failed = true
      },
    })

    expect(processingRef.current).toBe(true)
    expect(failed).toBe(false)
  })
})

describe('requestInitialMessageRetryFromSubmission', () => {
  test('consumes a submission and requests retry after a failed attempt', () => {
    const processingRef = { current: false }
    let retries = 0

    expect(
      requestInitialMessageRetryFromSubmission({
        hasPendingInitialMessage: true,
        processingRef,
        requestRetry: () => retries++,
      }),
    ).toBe(true)
    expect(retries).toBe(1)
  })

  test('consumes input without starting a second retry while one is active', () => {
    let retries = 0
    expect(
      requestInitialMessageRetryFromSubmission({
        hasPendingInitialMessage: true,
        processingRef: { current: true },
        requestRetry: () => retries++,
      }),
    ).toBe(true)
    expect(retries).toBe(0)
  })

  test('does not intercept input after the initial message commits', () => {
    expect(
      requestInitialMessageRetryFromSubmission({
        hasPendingInitialMessage: false,
        processingRef: { current: false },
        requestRetry: () => {
          throw new Error('should not retry')
        },
      }),
    ).toBe(false)
  })
})
