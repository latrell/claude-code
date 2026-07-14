import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ToolUseContext } from '../../../Tool.js'
import type { SystemPrompt } from '../../systemPromptType.js'
import { logMock } from '../../../../tests/mocks/log.js'

let logErrorCalls = 0
let capturedRequestSignal: AbortSignal | undefined

mock.module('src/utils/log.ts', () => ({
  ...logMock(),
  logError: () => {
    logErrorCalls++
  },
}))

const claudeApi = await import('../../../services/api/claude.js')
spyOn(claudeApi, 'queryModelWithoutStreaming').mockImplementation((({
  signal,
}: {
  signal: AbortSignal
}) => {
  capturedRequestSignal = signal
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    )
  })
}) as never)

const {
  PostSamplingHookLifecycle,
  clearPostSamplingHooks,
  registerPostSamplingHook,
} = await import('../postSamplingHooks.js')
const { createApiQueryHook } = await import('../apiQueryHookHelper.js')
const { StopConfirmationError } = await import('../../stopConfirmation.js')

const systemPrompt = [] as unknown as SystemPrompt

function toolUseContext(abortController: AbortController): ToolUseContext {
  return {
    abortController,
    options: {
      tools: [],
      agentDefinitions: { activeAgents: [] },
      isNonInteractiveSession: true,
      appendSystemPrompt: undefined,
    },
    getAppState: () => ({
      toolPermissionContext: {},
    }),
  } as unknown as ToolUseContext
}

afterEach(() => {
  clearPostSamplingHooks()
  capturedRequestSignal = undefined
  logErrorCalls = 0
})

describe('PostSamplingHookLifecycle', () => {
  test('keeps hook work owned until normal turn finalization', async () => {
    let releaseHook: (() => void) | undefined
    let hookStarted = false
    registerPostSamplingHook(async () => {
      hookStarted = true
      await new Promise<void>(resolve => {
        releaseHook = resolve
      })
    })

    const parent = new AbortController()
    const lifecycle = new PostSamplingHookLifecycle(parent)
    lifecycle.schedule([], systemPrompt, {}, {}, toolUseContext(parent), 'sdk')

    expect(hookStarted).toBe(true)
    let finished = false
    const finishing = lifecycle.finish().then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)

    releaseHook?.()
    await finishing
    expect(finished).toBe(true)
    expect(parent.signal.aborted).toBe(false)
  })

  test('aborts active hooks and skips later hooks on generator teardown', async () => {
    let observedReason: unknown
    let laterHookRan = false
    registerPostSamplingHook(
      context =>
        new Promise<void>(resolve => {
          context.toolUseContext.abortController.signal.addEventListener(
            'abort',
            () => {
              observedReason =
                context.toolUseContext.abortController.signal.reason
              resolve()
            },
            { once: true },
          )
        }),
    )
    registerPostSamplingHook(() => {
      laterHookRan = true
    })

    const parent = new AbortController()
    const lifecycle = new PostSamplingHookLifecycle(parent)
    lifecycle.schedule([], systemPrompt, {}, {}, toolUseContext(parent), 'sdk')

    await lifecycle.finish({ abort: true, reason: 'generator-return' })

    expect(observedReason).toBe('generator-return')
    expect(laterHookRan).toBe(false)
    expect(parent.signal.aborted).toBe(false)
    expect(logErrorCalls).toBe(0)
  })

  test('inherits parent turn cancellation while hooks are active', async () => {
    let observedReason: unknown
    let laterHookRan = false
    registerPostSamplingHook(
      context =>
        new Promise<void>(resolve => {
          context.toolUseContext.abortController.signal.addEventListener(
            'abort',
            () => {
              observedReason =
                context.toolUseContext.abortController.signal.reason
              resolve()
            },
            { once: true },
          )
        }),
    )
    registerPostSamplingHook(() => {
      laterHookRan = true
    })

    const parent = new AbortController()
    const lifecycle = new PostSamplingHookLifecycle(parent)
    lifecycle.schedule([], systemPrompt, {}, {}, toolUseContext(parent), 'sdk')

    parent.abort('escape')
    await lifecycle.finish()

    expect(observedReason).toBe('escape')
    expect(laterHookRan).toBe(false)
    expect(logErrorCalls).toBe(0)
  })

  test('retains an early unconfirmed failure until turn finalization', async () => {
    const parent = new AbortController()
    const lifecycle = new PostSamplingHookLifecycle(parent)
    const failure = new StopConfirmationError('side request still running')

    lifecycle.trackOwnedRequest(Promise.reject(failure))
    // Let the request's immediate rejection observer remove it from pending.
    await Promise.resolve()

    await expect(lifecycle.finish()).rejects.toBeInstanceOf(
      StopConfirmationError,
    )
  })

  test('waits for a tracked non-hook request before finishing', async () => {
    const parent = new AbortController()
    const lifecycle = new PostSamplingHookLifecycle(parent)
    let release: (() => void) | undefined
    const request = new Promise<void>(resolve => {
      release = resolve
    })
    lifecycle.trackOwnedRequest(request)

    let finished = false
    const finishing = lifecycle.finish().then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)

    release?.()
    await finishing
    expect(finished).toBe(true)
  })
})

describe('createApiQueryHook cancellation', () => {
  test('propagates parent cancellation to the side-query request', async () => {
    let resultCalls = 0
    const hook = createApiQueryHook({
      name: 'skill_improvement',
      shouldRun: async () => true,
      buildMessages: () => [],
      useTools: false,
      parseResponse: () => 'unused',
      logResult: () => {
        resultCalls++
      },
      getModel: () => 'test-side-model',
    })
    const parent = new AbortController()

    const running = hook({
      messages: [],
      systemPrompt,
      userContext: {},
      systemContext: {},
      toolUseContext: toolUseContext(parent),
      querySource: 'sdk',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedRequestSignal?.aborted).toBe(false)
    parent.abort('escape')
    await running

    expect(capturedRequestSignal?.aborted).toBe(true)
    expect(capturedRequestSignal?.reason).toBe('escape')
    expect(resultCalls).toBe(0)
    expect(logErrorCalls).toBe(0)
  })
})
