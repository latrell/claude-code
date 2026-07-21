import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import {
  getIsInteractive,
  getSessionId,
  setIsInteractive,
} from '../../bootstrap/state.js'
import type { ToolUseContext } from '../../Tool.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import * as hooks from '../../utils/hooks.js'
import type { AggregatedHookResult } from '../../utils/hooks.js'
import type { FunctionHook } from '../../utils/hooks/sessionHooks.js'
import { handleStopHooks } from '../stopHooks.js'

const originalSimpleMode = process.env.CLAUDE_CODE_SIMPLE
const originalInteractive = getIsInteractive()

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function toolUseContext(abortController: AbortController): ToolUseContext {
  return {
    abortController,
    getAppState: () => ({
      toolPermissionContext: { mode: 'default' },
    }),
  } as unknown as ToolUseContext
}

async function collect<T, R>(
  generator: AsyncGenerator<T, R>,
): Promise<{ values: T[]; result: R }> {
  const values: T[] = []
  while (true) {
    const next = await generator.next()
    if (next.done) {
      return { values, result: next.value }
    }
    values.push(next.value)
  }
}

function runStopHooks(
  abortController: AbortController,
): ReturnType<typeof handleStopHooks> {
  return handleStopHooks(
    [],
    [],
    [] as unknown as SystemPrompt,
    {},
    {},
    toolUseContext(abortController),
    'test',
  )
}

afterEach(() => {
  mock.restore()
  setIsInteractive(originalInteractive)
  if (originalSimpleMode === undefined) {
    delete process.env.CLAUDE_CODE_SIMPLE
  } else {
    process.env.CLAUDE_CODE_SIMPLE = originalSimpleMode
  }
})

describe('handleStopHooks cancellation', () => {
  test('treats AbortError after owner cancellation as an interrupted turn', async () => {
    process.env.CLAUDE_CODE_SIMPLE = '1'
    const owner = new AbortController()
    const abortError = new DOMException('cancelled', 'AbortError')

    async function* cancelledHook(): AsyncGenerator<AggregatedHookResult> {
      owner.abort('escape')
      yield* []
      throw abortError
    }

    spyOn(hooks, 'executeStopHooks').mockImplementation(() => cancelledHook())

    const { values, result } = await collect(runStopHooks(owner))

    expect(values).toHaveLength(1)
    expect(values[0]).toMatchObject({ type: 'user' })
    expect(JSON.stringify(values)).not.toContain('Stop hook failed')
    expect(result).toEqual({
      blockingErrors: [],
      preventContinuation: true,
    })
  })

  test('does not emit a duplicate interruption when cancellation was already observed', async () => {
    process.env.CLAUDE_CODE_SIMPLE = '1'
    const owner = new AbortController()
    const abortError = new DOMException('cancelled', 'AbortError')

    async function* cancelledHook(): AsyncGenerator<AggregatedHookResult> {
      owner.abort('escape')
      yield {}
      throw abortError
    }

    spyOn(hooks, 'executeStopHooks').mockImplementation(() => cancelledHook())

    const { values, result } = await collect(runStopHooks(owner))

    expect(values).toHaveLength(1)
    expect(values[0]).toMatchObject({ type: 'user' })
    expect(result.preventContinuation).toBe(true)
  })

  test('propagates genuine StopConfirmationError unchanged', async () => {
    process.env.CLAUDE_CODE_SIMPLE = '1'
    const owner = new AbortController()
    const failure = new StopConfirmationError('hook request still active')

    async function* unconfirmedHook(): AsyncGenerator<AggregatedHookResult> {
      owner.abort('escape')
      yield* []
      throw failure
    }

    spyOn(hooks, 'executeStopHooks').mockImplementation(() => unconfirmedHook())

    await expect(collect(runStopHooks(owner))).rejects.toBe(failure)
  })
})

describe('executeStopHooks generator ownership', () => {
  test('consumer return aborts the hook batch before awaiting sibling settlement', async () => {
    delete process.env.CLAUDE_CODE_SIMPLE
    setIsInteractive(false)
    const owner = new AbortController()
    const siblingStarted = deferred()
    const siblingAbortObserved = deferred()
    const releaseSibling = deferred()

    const blockingHook: FunctionHook = {
      type: 'function',
      id: 'blocking-hook',
      errorMessage: 'blocked',
      callback: async () => false,
    }
    const siblingHook: FunctionHook = {
      type: 'function',
      id: 'sibling-hook',
      errorMessage: 'unused',
      callback: async (_messages, signal) => {
        siblingStarted.resolve()
        if (!signal?.aborted) {
          await new Promise<void>(resolve => {
            signal?.addEventListener(
              'abort',
              () => {
                siblingAbortObserved.resolve()
                resolve()
              },
              { once: true },
            )
          })
        } else {
          siblingAbortObserved.resolve()
        }
        await releaseSibling.promise
        return true
      },
    }
    const sessionHooks = new Map([
      [
        getSessionId(),
        {
          hooks: {
            Stop: [
              {
                matcher: '',
                hooks: [{ hook: blockingHook }, { hook: siblingHook }],
              },
            ],
          },
        },
      ],
    ])
    const context = {
      abortController: owner,
      options: { tools: [] },
      getAppState: () => ({ sessionHooks }),
    } as unknown as ToolUseContext
    const generator = hooks.executeStopHooks(
      'default',
      owner.signal,
      5_000,
      false,
      undefined,
      context,
      [],
    )

    // Progress for both hooks is emitted before the parallel batch starts.
    expect((await generator.next()).value).toMatchObject({
      message: { type: 'progress' },
    })
    expect((await generator.next()).value).toMatchObject({
      message: { type: 'progress' },
    })
    const blocking = await generator.next()
    expect(blocking.value).toMatchObject({
      blockingError: { blockingError: 'blocked' },
    })
    await siblingStarted.promise

    let closed = false
    const closing = generator.return(undefined).finally(() => {
      closed = true
    })

    await siblingAbortObserved.promise
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(owner.signal.aborted).toBe(false)

    releaseSibling.resolve()
    await closing
    expect(closed).toBe(true)
  })
})
