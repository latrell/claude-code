// This suite is launched by the wrapper in a child process because its
// module-level mocks must not leak into Bun's shared test process.
import { afterEach, describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
import type { AppState } from '../../../state/AppState.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))

type DeferredRequest = {
  controller: AbortController
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const requests: DeferredRequest[] = []
const speculationRequests: Array<{
  owner: AbortController
  resolve: () => void
}> = []
let speculationEnabled = false

mock.module('src/utils/forkedAgent.ts', () => ({
  createCacheSafeParams: () => ({}),
  createGetAppStateWithAllowedTools: () => () => ({}),
  createSubagentContext: () => ({}),
  extractResultText: () => null,
  getLastCacheSafeParams: () => null,
  prepareForkedCommandContext: async () => ({}),
  saveCacheSafeParams: () => {},
  runForkedAgent: (options: {
    overrides: { abortController: AbortController }
  }) =>
    new Promise((resolve, reject) => {
      requests.push({
        controller: options.overrides.abortController,
        resolve,
        reject,
      })
    }),
}))
mock.module('src/services/PromptSuggestion/speculation.ts', () => ({
  abortSpeculation: () => {},
  abortSpeculationAndWait: async () => {},
  acceptSpeculation: async () => null,
  handleSpeculationAccept: async () => ({ queryRequired: true }),
  isSpeculationEnabled: () => speculationEnabled,
  prepareMessagesForInjection: () => [],
  startSpeculation: (
    _suggestion: string,
    _context: unknown,
    _setAppState: unknown,
    _isPipelined: boolean,
    _cacheSafeParams: unknown,
    owner: AbortController,
  ) =>
    new Promise<void>(resolve => {
      speculationRequests.push({ owner, resolve })
    }),
}))

const {
  abortPromptSuggestion,
  cancelPromptSuggestionForParent,
  drainPromptSuggestionForParent,
  executePromptSuggestion,
} = await import('../promptSuggestion.js')
const { StopConfirmationError } = await import(
  '../../../utils/stopConfirmation.js'
)

function modelResult(suggestion: string): unknown {
  return {
    messages: [
      {
        type: 'assistant',
        requestId: `request-${suggestion}`,
        message: {
          content: [{ type: 'text', text: suggestion }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ],
    totalUsage: { output_tokens: 1 },
  }
}

function createContext(parent: AbortController): {
  context: Parameters<typeof executePromptSuggestion>[0]
  suggestions: string[]
} {
  const suggestions: string[] = []
  const state = {
    promptSuggestionEnabled: true,
    pendingWorkerRequest: null,
    pendingSandboxRequest: null,
    elicitation: { queue: [] },
    toolPermissionContext: { mode: 'default' },
  }
  const assistant = {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'done' }],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
      },
    },
  }

  return {
    suggestions,
    context: {
      messages: [assistant, assistant],
      systemPrompt: [],
      userContext: {},
      systemContext: {},
      querySource: 'repl_main_thread',
      toolUseContext: {
        abortController: parent,
        getAppState: () => state,
        setAppState: (updater: (prev: AppState) => AppState) => {
          const next = updater({
            ...state,
            promptSuggestion: {
              text: null,
              promptId: null,
              shownAt: 0,
              acceptedAt: 0,
              generationRequestId: null,
            },
          } as never)
          const text = next.promptSuggestion.text
          if (text) suggestions.push(text)
        },
      } as never,
    } as never,
  }
}

async function waitForRequestCount(count: number): Promise<void> {
  for (let attempt = 0; attempt < 20 && requests.length < count; attempt++) {
    await Promise.resolve()
  }
  expect(requests).toHaveLength(count)
}

afterEach(async () => {
  for (const request of requests) {
    request.resolve(modelResult('ignored result'))
  }
  for (const request of speculationRequests) request.resolve()
  await abortPromptSuggestion('test-cleanup')
  requests.length = 0
  speculationRequests.length = 0
  speculationEnabled = false
})

describe('prompt suggestion lifecycle', () => {
  test('normal parent drain waits without cancelling the suggestion', async () => {
    const parent = new AbortController()
    const { context, suggestions } = createContext(parent)
    const execution = executePromptSuggestion(context)
    await waitForRequestCount(1)

    let drained = false
    const drain = drainPromptSuggestionForParent(parent).then(() => {
      drained = true
    })
    await Promise.resolve()

    expect(requests[0]!.controller.signal.aborted).toBe(false)
    expect(drained).toBe(false)

    requests[0]!.resolve(modelResult('run the tests'))
    await Promise.all([execution, drain])
    expect(drained).toBe(true)
    expect(suggestions).toEqual(['run the tests'])
  })

  test('links the request to its turn and drains before cancellation resolves', async () => {
    const parent = new AbortController()
    const { context, suggestions } = createContext(parent)
    const execution = executePromptSuggestion(context)
    await waitForRequestCount(1)

    parent.abort('user-cancel')
    let drained = false
    const cancellation = cancelPromptSuggestionForParent(parent).then(() => {
      drained = true
    })

    await Promise.resolve()
    expect(requests[0]!.controller.signal.aborted).toBe(true)
    expect(drained).toBe(false)

    requests[0]!.resolve(modelResult('late suggestion'))
    await Promise.all([execution, cancellation])

    expect(drained).toBe(true)
    expect(suggestions).toEqual([])
  })

  test('serializes replacement and prevents the older generation from writing', async () => {
    const first = createContext(new AbortController())
    const second = createContext(new AbortController())

    const firstExecution = executePromptSuggestion(first.context)
    await waitForRequestCount(1)
    const secondExecution = executePromptSuggestion(second.context)

    await Promise.resolve()
    expect(requests[0]!.controller.signal.aborted).toBe(true)
    expect(requests).toHaveLength(1)

    requests[0]!.resolve(modelResult('old suggestion'))
    await waitForRequestCount(2)
    requests[1]!.resolve(modelResult('new suggestion'))
    await Promise.all([firstExecution, secondExecution])

    expect(first.suggestions).toEqual([])
    expect(second.suggestions).toEqual(['new suggestion'])
  })

  test('owns speculation and drains it after prompt cancellation', async () => {
    speculationEnabled = true
    const { context } = createContext(new AbortController())
    const execution = executePromptSuggestion(context)
    await waitForRequestCount(1)
    requests[0]!.resolve(modelResult('run the tests'))

    for (
      let attempt = 0;
      attempt < 20 && speculationRequests.length === 0;
      attempt++
    ) {
      await Promise.resolve()
    }
    expect(speculationRequests).toHaveLength(1)

    let drained = false
    const cancellation = abortPromptSuggestion('user-input').then(() => {
      drained = true
    })
    await Promise.resolve()

    expect(speculationRequests[0]!.owner.signal.aborted).toBe(true)
    expect(drained).toBe(false)

    speculationRequests[0]!.resolve()
    await Promise.all([execution, cancellation])
    expect(drained).toBe(true)
  })

  test('does not start a replacement after the previous Stop was unconfirmed', async () => {
    const first = createContext(new AbortController())
    const second = createContext(new AbortController())
    const third = createContext(new AbortController())
    const firstError = executePromptSuggestion(first.context).catch(
      error => error,
    )
    await waitForRequestCount(1)
    const secondError = executePromptSuggestion(second.context).catch(
      error => error,
    )
    const cancellationError = cancelPromptSuggestionForParent(
      first.context.toolUseContext.abortController,
    ).catch(error => error)

    const stopError = new StopConfirmationError(
      'previous suggestion remained active',
    )
    requests[0]!.reject(stopError)

    expect(await firstError).toBe(stopError)
    expect(await secondError).toBe(stopError)
    expect(await cancellationError).toBe(stopError)
    expect(requests).toHaveLength(1)
    expect(second.suggestions).toEqual([])

    await expect(
      executePromptSuggestion(third.context),
    ).resolves.toBeUndefined()
    expect(requests).toHaveLength(1)
    expect(third.suggestions).toEqual([])
  })
})
