import { describe, expect, test } from 'bun:test'
import { detachQueryOwnedRequests, settleQueryOwnedRequests } from '../query.js'
import {
  cancelAndWaitForDetachedAuxiliaryWork,
  hasActiveDetachedAuxiliaryWork,
  resetDetachedAuxiliaryWorkForTests,
} from '../utils/detachedAuxiliaryWork.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'
import { PostSamplingHookLifecycle } from '../utils/hooks/postSamplingHooks.js'
import { trackPromiseSettlement } from '../utils/settledPromise.js'

function deferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('settleQueryOwnedRequests', () => {
  test('starts every owned request drain before awaiting any of them', async () => {
    const postSampling = deferred()
    const promptSuggestion = deferred()
    const extractMemories = deferred()
    const started: string[] = []

    const settling = settleQueryOwnedRequests({
      signal: new AbortController().signal,
      finishPostSamplingHooks: () => {
        started.push('post-sampling')
        return postSampling.promise
      },
      abortPostSamplingHooks: () => {},
      settlePromptSuggestion: () => {
        started.push('prompt-suggestion')
        return promptSuggestion.promise
      },
      settleExtractMemories: () => {
        started.push('extract-memories')
        return extractMemories.promise
      },
      timeoutMs: 1_000,
      abortGraceMs: 20,
    })

    expect(started).toEqual([
      'post-sampling',
      'prompt-suggestion',
      'extract-memories',
    ])
    postSampling.resolve()
    promptSuggestion.resolve()
    extractMemories.resolve()
    expect(await settling).toBeUndefined()
  })

  test('bounds aborted drains and preserves the original thrown error', async () => {
    const controller = new AbortController()
    const originalError = new Error('original query failure')
    controller.abort(originalError)
    const abortReasons: unknown[] = []

    const error = await settleQueryOwnedRequests({
      signal: controller.signal,
      finishPostSamplingHooks: () => new Promise<void>(() => {}),
      abortPostSamplingHooks: reason => {
        abortReasons.push(reason)
      },
      settlePromptSuggestion: () => new Promise<void>(() => {}),
      settleExtractMemories: () => new Promise<void>(() => {}),
      thrownError: originalError,
      includeThrownError: true,
      timeoutMs: 1_000,
      abortGraceMs: 10,
    })

    expect(error).toBeInstanceOf(StopConfirmationError)
    expect(error?.failures).toHaveLength(4)
    expect(error?.failures[0]).toBe(originalError)
    expect(abortReasons).toEqual([originalError])
  })

  test('turns synchronous and asynchronous drain failures into one stop confirmation', async () => {
    const postSamplingError = new Error('post-sampling failed')
    const promptSuggestionError = new Error('suggestion failed')

    const error = await settleQueryOwnedRequests({
      signal: new AbortController().signal,
      finishPostSamplingHooks: () => {
        throw postSamplingError
      },
      abortPostSamplingHooks: () => {},
      settlePromptSuggestion: () => Promise.reject(promptSuggestionError),
      timeoutMs: 1_000,
      abortGraceMs: 20,
    })

    expect(error).toBeInstanceOf(StopConfirmationError)
    expect(error?.failures).toEqual([postSamplingError, promptSuggestionError])
  })

  test('cancels owner-scoped drains when Esc arrives after normal cleanup starts', async () => {
    const controller = new AbortController()
    const promptSuggestion = deferred()
    const extractMemories = deferred()
    const aborts: Array<[string, unknown]> = []

    const settling = settleQueryOwnedRequests({
      signal: controller.signal,
      finishPostSamplingHooks: () => Promise.resolve(),
      abortPostSamplingHooks: () => {},
      settlePromptSuggestion: () => promptSuggestion.promise,
      abortPromptSuggestion: reason => {
        aborts.push(['prompt-suggestion', reason])
        promptSuggestion.resolve()
      },
      settleExtractMemories: () => extractMemories.promise,
      abortExtractMemories: reason => {
        aborts.push(['extract-memories', reason])
        extractMemories.resolve()
      },
      timeoutMs: 1_000,
      abortGraceMs: 20,
    })

    const reason = new Error('Esc during query cleanup')
    controller.abort(reason)

    expect(await settling).toBeUndefined()
    expect(aborts).toEqual([
      ['prompt-suggestion', reason],
      ['extract-memories', reason],
    ])
  })
})

describe('detachQueryOwnedRequests', () => {
  test('normal completion starts every drain without waiting for deferred work', async () => {
    resetDetachedAuxiliaryWorkForTests()
    const postSampling = deferred()
    const promptSuggestion = deferred()
    const extractMemories = deferred()
    const started: string[] = []

    const result = detachQueryOwnedRequests({
      finishPostSamplingHooks: () => {
        started.push('post-sampling')
        return postSampling.promise
      },
      abortPostSamplingHooks: () => {},
      settlePromptSuggestion: () => {
        started.push('prompt-suggestion')
        return promptSuggestion.promise
      },
      abortPromptSuggestion: () => {},
      settleExtractMemories: () => {
        started.push('extract-memories')
        return extractMemories.promise
      },
      abortExtractMemories: () => {},
    })

    expect(result).toBeUndefined()
    expect(started).toEqual([
      'post-sampling',
      'prompt-suggestion',
      'extract-memories',
    ])
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)

    postSampling.resolve()
    promptSuggestion.resolve()
    extractMemories.resolve()
    await Promise.all([
      postSampling.promise,
      promptSuggestion.promise,
      extractMemories.promise,
    ])
    await Promise.resolve()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    resetDetachedAuxiliaryWorkForTests()
  })

  test('Esc aborts every detached owner and waits for their exact promises', async () => {
    resetDetachedAuxiliaryWorkForTests()
    const postSampling = deferred()
    const promptSuggestion = deferred()
    const extractMemories = deferred()
    const aborts: Array<[string, unknown]> = []

    detachQueryOwnedRequests({
      finishPostSamplingHooks: () => postSampling.promise,
      abortPostSamplingHooks: reason => {
        aborts.push(['post-sampling', reason])
        postSampling.resolve()
      },
      settlePromptSuggestion: () => promptSuggestion.promise,
      abortPromptSuggestion: reason => {
        aborts.push(['prompt-suggestion', reason])
        promptSuggestion.resolve()
      },
      settleExtractMemories: () => extractMemories.promise,
      abortExtractMemories: reason => {
        aborts.push(['extract-memories', reason])
        extractMemories.resolve()
      },
      abortGraceMs: 100,
    })

    const reason = new Error('Esc after foreground completion')
    await cancelAndWaitForDetachedAuxiliaryWork(reason)
    expect(aborts).toEqual([
      ['post-sampling', reason],
      ['prompt-suggestion', reason],
      ['extract-memories', reason],
    ])
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    resetDetachedAuxiliaryWorkForTests()
  })

  test('pending optional work never gates completion and remains Esc-cancellable', async () => {
    resetDetachedAuxiliaryWorkForTests()
    const lifecycle = new PostSamplingHookLifecycle(new AbortController())
    let observedAbort = false
    const exactSettlement = new Promise<void>(resolve => {
      lifecycle.signal.addEventListener(
        'abort',
        () => {
          observedAbort = true
          resolve()
        },
        { once: true },
      )
    })
    const optionalWork = trackPromiseSettlement(exactSettlement)
    lifecycle.trackOwnedRequest(optionalWork.promise)

    // This is the query-loop consume decision: unresolved optional metadata is
    // skipped synchronously instead of awaited after final assistant output.
    expect(optionalWork.peek()).toEqual({ status: 'pending' })

    detachQueryOwnedRequests({
      finishPostSamplingHooks: () => lifecycle.finish(),
      abortPostSamplingHooks: reason => {
        void lifecycle.finish({ abort: true, reason })
      },
      settlePromptSuggestion: () => Promise.resolve(),
      settleExtractMemories: () => Promise.resolve(),
      abortGraceMs: 100,
    })

    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    await cancelAndWaitForDetachedAuxiliaryWork('Esc after query completion')
    expect(observedAbort).toBe(true)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    resetDetachedAuxiliaryWorkForTests()
  })
})
