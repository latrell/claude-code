// This suite installs module-level mocks and is launched by an isolated
// wrapper so the shared Bun test process is unaffected.
import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

const debugMessages: string[] = []
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', () => ({
  ...debugMock(),
  logForDebugging: (message: string) => debugMessages.push(message),
}))
mock.module('bun:bundle', () => ({ feature: () => false }))
mock.module('src/state/AppStateStore.ts', () => ({
  getDefaultAppState: () => ({}),
  IDLE_SPECULATION_STATE: { status: 'idle' },
}))
mock.module('src/utils/config.ts', () => ({
  CONFIG_WRITE_DISPLAY_THRESHOLD: 20,
  DEFAULT_GLOBAL_CONFIG: {},
  EDITOR_MODES: [],
  GLOBAL_CONFIG_KEYS: [],
  NOTIFICATION_CHANNELS: [],
  PROJECT_CONFIG_KEYS: [],
  _getConfigForTesting: () => ({}),
  _setGlobalConfigCacheForTesting: () => {},
  _wouldLoseAuthStateForTesting: () => false,
  checkHasTrustDialogAccepted: () => true,
  enableConfigs: () => {},
  formatAutoUpdaterDisabledReason: () => '',
  getAutoUpdaterDisabledReason: () => null,
  getCurrentProjectConfig: () => ({}),
  getCustomApiKeyStatus: () => ({ isCustom: false }),
  getGlobalConfig: () => ({ speculationEnabled: true }),
  getGlobalConfigWriteCount: () => 0,
  getManagedClaudeRulesDir: () => '',
  getMemoryPath: () => '',
  getOrCreateUserID: () => 'test-user',
  getProjectPathForConfig: () => '',
  getRemoteControlAtStartup: () => false,
  getUserClaudeRulesDir: () => '',
  isAutoUpdaterDisabled: () => false,
  isGlobalConfigKey: () => false,
  isPathTrusted: () => true,
  isProjectConfigKey: () => false,
  recordFirstStartTime: () => {},
  resetTrustDialogAcceptedCacheForTesting: () => {},
  saveCurrentProjectConfig: () => {},
  saveGlobalConfig: () => {},
  shouldSkipPluginAutoupdate: () => false,
}))
mock.module('src/services/PromptSuggestion/promptSuggestion.ts', () => ({
  abortPromptSuggestion: async () => {},
  cancelPromptSuggestionForParent: async () => {},
  drainPromptSuggestionForParent: async () => {},
  executePromptSuggestion: async () => {},
  generateSuggestion: async () => ({
    suggestion: null,
    generationRequestId: null,
  }),
  getPromptVariant: () => 'user_intent',
  getSuggestionSuppressReason: () => null,
  logSuggestionSuppressed: () => {},
  shouldFilterSuggestion: () => true,
  shouldEnablePromptSuggestion: () => false,
  tryGenerateSuggestion: async () => null,
}))

type DeferredRun = {
  controller: AbortController
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}
const runs: DeferredRun[] = []

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
      runs.push({
        controller: options.overrides.abortController,
        resolve,
        reject,
      })
    }),
}))

process.env.USER_TYPE = 'ant'

const { IDLE_SPECULATION_STATE } = await import(
  '../../../state/AppStateStore.js'
)
const {
  abortSpeculationAndWait,
  handleSpeculationAccept,
  isSpeculationEnabled,
  startSpeculation,
} = await import('../speculation.js')
const { createFileStateCacheWithSizeLimit } = await import(
  '../../../utils/fileStateCache.js'
)
const { StopConfirmationError } = await import(
  '../../../utils/stopConfirmation.js'
)

function createHarness(): {
  context: Parameters<typeof startSpeculation>[1]
  setAppState: Parameters<typeof startSpeculation>[2]
  getActiveSpeculation: () => Parameters<typeof handleSpeculationAccept>[0]
} {
  let state = {
    speculation: IDLE_SPECULATION_STATE,
    speculationSessionTimeSavedMs: 0,
    promptSuggestion: {
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null,
    },
    toolPermissionContext: {
      mode: 'default',
      isBypassPermissionsModeAvailable: false,
    },
  }
  const owner = new AbortController()
  const setAppState: Parameters<typeof startSpeculation>[2] = updater => {
    state = updater(state as never) as typeof state
  }
  return {
    context: {
      messages: [],
      systemPrompt: [],
      userContext: {},
      systemContext: {},
      querySource: 'repl_main_thread',
      toolUseContext: {
        abortController: owner,
        getAppState: () => state,
      },
    } as never,
    setAppState,
    getActiveSpeculation: () => {
      if (state.speculation.status !== 'active') {
        throw new Error('expected active speculation state')
      }
      return state.speculation as Parameters<typeof handleSpeculationAccept>[0]
    },
  }
}

async function waitForRunCount(count: number): Promise<void> {
  for (let attempt = 0; attempt < 20 && runs.length < count; attempt++) {
    await Bun.sleep(5)
  }
  if (runs.length !== count) {
    throw new Error(
      `Expected ${count} deferred speculation runs, received ${runs.length}. Debug: ${debugMessages.join(' | ')}`,
    )
  }
}

describe('speculation cancellation lifecycle', () => {
  test('allows a later speculation after ordinary abort settles', async () => {
    expect(process.env.USER_TYPE).toBe('ant')
    expect(isSpeculationEnabled()).toBe(true)
    const first = createHarness()
    const firstRunIndex = runs.length
    const firstExecution = startSpeculation(
      'first',
      first.context,
      first.setAppState,
    )
    await waitForRunCount(firstRunIndex + 1)

    const cancellation = abortSpeculationAndWait(first.setAppState)
    expect(runs[firstRunIndex]!.controller.signal.aborted).toBe(true)
    runs[firstRunIndex]!.resolve({ totalUsage: { output_tokens: 0 } })
    await Promise.all([firstExecution, cancellation])

    const second = createHarness()
    const secondRunIndex = runs.length
    const secondExecution = startSpeculation(
      'second',
      second.context,
      second.setAppState,
    )
    await waitForRunCount(secondRunIndex + 1)
    runs[secondRunIndex]!.resolve({ totalUsage: { output_tokens: 0 } })
    await secondExecution
  })

  test('accept injects captured state but waits for the exact run before continuing', async () => {
    const harness = createHarness()
    const runIndex = runs.length
    const execution = startSpeculation(
      'accepted while running',
      harness.context,
      harness.setAppState,
    )
    await waitForRunCount(runIndex + 1)

    let acceptanceSettled = false
    let messages: unknown[] = []
    const acceptance = handleSpeculationAccept(
      harness.getActiveSpeculation(),
      0,
      harness.setAppState,
      'accepted while running',
      {
        setMessages: updater => {
          messages = updater(messages as never)
        },
        readFileState: {
          current: createFileStateCacheWithSizeLimit(10),
        },
        cwd: process.cwd(),
      },
    ).then(result => {
      acceptanceSettled = true
      return result
    })

    for (
      let attempt = 0;
      attempt < 20 && !runs[runIndex]!.controller.signal.aborted;
      attempt++
    ) {
      await Bun.sleep(5)
    }
    expect(runs[runIndex]!.controller.signal.reason).toBe(
      'speculation-accepted',
    )
    expect(messages).toHaveLength(1)
    expect(acceptanceSettled).toBe(false)

    runs[runIndex]!.resolve({ totalUsage: { output_tokens: 0 } })
    await expect(acceptance).resolves.toEqual({ queryRequired: true })
    await execution
  })

  test('accepting a stale UI snapshot stops its unpublished successor', async () => {
    const harness = createHarness()
    const runIndex = runs.length
    const firstExecution = startSpeculation(
      'stale snapshot',
      harness.context,
      harness.setAppState,
    )
    await waitForRunCount(runIndex + 1)
    const staleState = harness.getActiveSpeculation()

    const successorExecution = startSpeculation(
      'successor',
      harness.context,
      harness.setAppState,
    )
    let acceptanceSettled = false
    const acceptance = handleSpeculationAccept(
      staleState,
      0,
      harness.setAppState,
      'stale snapshot',
      {
        setMessages: updater => {
          updater([])
        },
        readFileState: {
          current: createFileStateCacheWithSizeLimit(10),
        },
        cwd: process.cwd(),
      },
    ).then(result => {
      acceptanceSettled = true
      return result
    })

    await Bun.sleep(5)
    expect(acceptanceSettled).toBe(false)
    expect(runs[runIndex]!.controller.signal.aborted).toBe(true)

    runs[runIndex]!.resolve({ totalUsage: { output_tokens: 0 } })
    await Promise.all([firstExecution, successorExecution])
    await expect(acceptance).resolves.toEqual({ queryRequired: true })
    expect(runs).toHaveLength(runIndex + 1)
  })

  test('accept fails closed and suppresses replacements when Stop was unconfirmed', async () => {
    const first = createHarness()
    const runIndex = runs.length
    const execution = startSpeculation(
      'unconfirmed',
      first.context,
      first.setAppState,
    )
    await waitForRunCount(runIndex + 1)

    const acceptance = handleSpeculationAccept(
      first.getActiveSpeculation(),
      0,
      first.setAppState,
      'unconfirmed',
      {
        setMessages: updater => {
          updater([])
        },
        readFileState: {
          current: createFileStateCacheWithSizeLimit(10),
        },
        cwd: process.cwd(),
      },
    )
    for (
      let attempt = 0;
      attempt < 20 && !runs[runIndex]!.controller.signal.aborted;
      attempt++
    ) {
      await Bun.sleep(5)
    }
    const cancellation = abortSpeculationAndWait(first.setAppState)
    const executionError = execution.catch(error => error)
    const acceptanceError = acceptance.catch(error => error)
    const cancellationError = cancellation.catch(error => error)
    const stopError = new StopConfirmationError(
      'speculation transport did not confirm Stop',
    )
    runs[runIndex]!.reject(stopError)

    expect(await executionError).toBe(stopError)
    expect(await acceptanceError).toBe(stopError)
    expect(await cancellationError).toBe(stopError)
    await expect(abortSpeculationAndWait(first.setAppState)).rejects.toBe(
      stopError,
    )

    const replacement = createHarness()
    await expect(
      startSpeculation(
        'must not start',
        replacement.context,
        replacement.setAppState,
      ),
    ).resolves.toBeUndefined()
    expect(runs).toHaveLength(runIndex + 1)
  })
})
