// This suite intentionally mocks broad shared modules and must run in the
// subprocess launched by agentToolUtils.test.ts.
import { beforeEach, mock, describe, expect, test } from 'bun:test'
import { debugMock } from '../../../../../../tests/mocks/debug'
import { AbortError } from 'src/utils/errors.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'

// ─── Mocks for agentToolUtils.ts dependencies ───
// Only mock modules that are truly unavailable or cause side effects.
// Do NOT mock common/shared modules (zod/v4, bootstrap/state, etc.) to avoid
// corrupting the module cache for other test files in the same Bun process.

const noop = () => {}
type SummaryStopResult = 'settled' | 'timed_out'

let summaryStopImpl: () => Promise<SummaryStopResult> = async () => 'settled'
let summaryExactStopImpl: () => Promise<void> = async () => {}
let publishedAgentResults = 0
let completedAgentResults = 0
let failedAgentResults = 0
let failedAgentNotifications = 0
let completedAgentNotifications = 0
let killedAgentNotifications = 0
let failedAgentErrors: string[] = []
let failedAgentNotificationErrors: string[] = []
let classifierStarted: (() => void) | undefined
let classifierImpl: () => Promise<Record<string, unknown>> = async () => ({
  shouldBlock: false,
  unavailable: false,
  model: 'test-classifier',
  stage: 'single',
})

mock.module('bun:bundle', () => ({
  feature: (name: string) => name === 'TRANSCRIPT_CLASSIFIER',
}))

mock.module('src/constants/tools.js', () => ({
  ALL_AGENT_DISALLOWED_TOOLS: new Set(),
  ASYNC_AGENT_ALLOWED_TOOLS: new Set(),
  CUSTOM_AGENT_DISALLOWED_TOOLS: new Set(),
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS: new Set(),
}))

mock.module('src/services/AgentSummary/agentSummary.js', () => {
  type SummaryHandle = {
    stop: () => Promise<SummaryStopResult>
    stopExactly: () => Promise<void>
  }

  class AgentSummaryScope {
    private readonly handles: SummaryHandle[] = []
    private stoppingHandles: SummaryHandle[] | null = null
    private stopped = false
    private stopPromise: Promise<SummaryStopResult> | null = null
    private exactStopPromise: Promise<void> | null = null

    add(handle: SummaryHandle): void {
      if (this.stopped) {
        void handle.stopExactly()
        return
      }
      this.handles.push(handle)
    }

    stopAll(): Promise<SummaryStopResult> {
      if (this.stopPromise) return this.stopPromise

      const handles = this.beginStop()
      this.stopPromise = Promise.all(handles.map(handle => handle.stop())).then(
        results => (results.includes('timed_out') ? 'timed_out' : 'settled'),
      )
      return this.stopPromise
    }

    stopAllExactly(): Promise<void> {
      if (this.exactStopPromise) return this.exactStopPromise
      const handles = this.beginStop()
      this.exactStopPromise = Promise.all(
        handles.map(handle => handle.stopExactly()),
      ).then(() => undefined)
      return this.exactStopPromise
    }

    private beginStop(): SummaryHandle[] {
      if (this.stoppingHandles) return this.stoppingHandles
      this.stopped = true
      this.stoppingHandles = [...this.handles]
      this.handles.length = 0
      return this.stoppingHandles
    }
  }

  return {
    AgentSummaryScope,
    startAgentSummarization: () => ({
      stop: () => summaryStopImpl(),
      stopExactly: () => summaryExactStopImpl(),
    }),
  }
})

mock.module('src/services/analytics/index.js', () => ({
  logEvent: noop,
  logEventAsync: async () => {},
  stripProtoFields: (v: any) => v,
  attachAnalyticsSink: noop,
  _resetForTesting: noop,
  AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS: undefined,
}))

mock.module('src/services/api/dumpPrompts.js', () => ({
  clearDumpState: noop,
}))

mock.module('src/Tool.js', () => ({
  toolMatchesName: () => false,
  findToolByName: noop,
}))

// messages.ts is complex - provide stubs for all named exports
mock.module('src/utils/messages.ts', () => ({
  extractTextContent: (content: any[]) =>
    content
      ?.filter?.((b: any) => b.type === 'text')
      ?.map?.((b: any) => b.text)
      ?.join('') ?? '',
  getLastAssistantMessage: (messages: any[]) =>
    messages.findLast(message => message.type === 'assistant'),
  SYNTHETIC_MESSAGES: new Set(),
  INTERRUPT_MESSAGE: '',
  INTERRUPT_MESSAGE_FOR_TOOL_USE: '',
  CANCEL_MESSAGE: '',
  REJECT_MESSAGE: '',
  REJECT_MESSAGE_WITH_REASON_PREFIX: '',
  SUBAGENT_REJECT_MESSAGE: '',
  SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX: '',
  PLAN_REJECTION_PREFIX: '',
  DENIAL_WORKAROUND_GUIDANCE: '',
  NO_RESPONSE_REQUESTED: '',
  SYNTHETIC_TOOL_RESULT_PLACEHOLDER: '',
  SYNTHETIC_MODEL: '',
  AUTO_REJECT_MESSAGE: noop,
  DONT_ASK_REJECT_MESSAGE: noop,
  withMemoryCorrectionHint: (s: string) => s,
  deriveShortMessageId: () => '',
  isClassifierDenial: () => false,
  buildYoloRejectionMessage: () => '',
  buildClassifierUnavailableMessage: () => '',
  isEmptyMessageText: () => true,
  createAssistantMessage: noop,
  createAssistantAPIErrorMessage: noop,
  createUserMessage: noop,
  prepareUserContent: noop,
  createUserInterruptionMessage: noop,
  createSyntheticUserCaveatMessage: noop,
  formatCommandInputTags: noop,
}))

mock.module('src/tasks/LocalAgentTask/LocalAgentTask.js', () => ({
  completeAgentTask: () => {
    completedAgentResults++
  },
  createActivityDescriptionResolver: () => ({}),
  createProgressTracker: () => ({}),
  enqueueAgentNotification: (input: { status?: string; error?: string }) => {
    if (input.status === 'failed') {
      failedAgentNotifications++
      if (input.error) failedAgentNotificationErrors.push(input.error)
    }
    if (input.status === 'completed') completedAgentNotifications++
    if (input.status === 'killed') killedAgentNotifications++
  },
  failAgentTask: (_taskId: string, error: string) => {
    failedAgentResults++
    failedAgentErrors.push(error)
  },
  getProgressUpdate: () => ({ tokenCount: 0, toolUseCount: 0 }),
  getTokenCountFromTracker: () => 0,
  isLocalAgentTask: () => false,
  killAsyncAgent: noop,
  publishAgentResult: () => {
    publishedAgentResults++
  },
  updateAgentProgress: noop,
  updateProgressFromMessage: noop,
}))

mock.module('src/utils/debug.ts', debugMock)

mock.module('src/utils/errors.js', () => ({
  ClaudeError: class extends Error {},
  MalformedCommandError: class extends Error {},
  AbortError: class extends Error {},
  ConfigParseError: class extends Error {},
  ShellError: class extends Error {},
  TeleportOperationError: class extends Error {},
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS: class extends Error {},
  isAbortError: () => false,
  hasExactErrorMessage: () => false,
  toError: (e: any) => (e instanceof Error ? e : new Error(String(e))),
  errorMessage: (e: any) => String(e),
  getErrnoCode: () => undefined,
  isENOENT: () => false,
  getErrnoPath: () => undefined,
  shortErrorStack: () => '',
  isFsInaccessible: () => false,
  classifyAxiosError: () => ({ category: 'unknown' }),
}))

mock.module('src/utils/forkedAgent.js', () => ({}))

mock.module('src/utils/permissions/yoloClassifier.js', () => ({
  buildTranscriptForClassifier: () => 'agent transcript',
  classifyYoloAction: () => {
    classifierStarted?.()
    return classifierImpl()
  },
}))

mock.module('src/utils/task/sdkProgress.js', () => ({
  emitTaskProgress: noop,
}))

mock.module('src/utils/tokens.js', () => ({
  getTokenCountFromUsage: () => 0,
}))

mock.module('src/tools/ExitPlanModeTool/constants.js', () => ({
  EXIT_PLAN_MODE_V2_TOOL_NAME: 'exit_plan_mode',
}))

mock.module('src/tools/AgentTool/constants.js', () => ({
  AGENT_TOOL_NAME: 'agent',
  LEGACY_AGENT_TOOL_NAME: 'task',
}))

mock.module('src/tools/AgentTool/loadAgentsDir.js', () => ({}))

mock.module('src/state/AppState.js', () => ({}))

mock.module('src/types/ids.js', () => ({
  asAgentId: (id: string) => id,
}))

// Break circular dep
mock.module('src/tools/AgentTool/AgentTool.tsx', () => ({
  AgentTool: {},
  inputSchema: {},
  outputSchema: {},
  default: {},
}))

const { AgentSummaryScope } = await import(
  'src/services/AgentSummary/agentSummary.js'
)

const {
  countToolUses,
  agentToolResultSchema,
  classifyHandoffIfNeeded,
  finalizeAgentTool,
  getForegroundAgentTerminalStatus,
  getLastToolUseName,
  publishAgentResultAfterHandoffSafety,
  runAsyncAgentLifecycle,
  registerDetachedAgentSummaryStop,
  shouldRunAgentAsync,
  stopAgentSummaryScope,
  waitForAgentWorktreeOperation,
} = await import('../agentToolUtils')

const {
  cancelAndWaitForDetachedAuxiliaryWork,
  hasActiveDetachedAuxiliaryWork,
  resetDetachedAuxiliaryWorkForTests,
} = await import('src/utils/detachedAuxiliaryWork.js')

beforeEach(() => {
  resetDetachedAuxiliaryWorkForTests()
  classifierStarted = undefined
  classifierImpl = async () => ({
    shouldBlock: false,
    unavailable: false,
    model: 'test-classifier',
    stage: 'single',
  })
  summaryStopImpl = async () => 'settled'
  summaryExactStopImpl = async () => {}
  publishedAgentResults = 0
  completedAgentResults = 0
  failedAgentResults = 0
  failedAgentNotifications = 0
  completedAgentNotifications = 0
  killedAgentNotifications = 0
  failedAgentErrors = []
  failedAgentNotificationErrors = []
})

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function makeAssistantMessage(content: any[]): any {
  return { type: 'assistant', message: { content } }
}

function makeUserMessage(text: string): any {
  return { type: 'user', message: { content: text } }
}

describe('shouldRunAgentAsync', () => {
  const defaults = {
    runInBackground: false,
    agentBackground: false,
    isCoordinator: false,
    forceAsync: false,
    assistantForceAsync: false,
    proactiveActive: false,
    backgroundTasksDisabled: false,
    inProcessTeammate: false,
  }

  test('allows every supported force mode outside an in-process teammate', () => {
    const forceModes = [
      'isCoordinator',
      'forceAsync',
      'assistantForceAsync',
      'proactiveActive',
    ] as const

    for (const mode of forceModes) {
      expect(shouldRunAgentAsync({ ...defaults, [mode]: true })).toBe(true)
    }
  })

  test('keeps in-process teammate subagents synchronous under every force mode', () => {
    const asyncTriggers = [
      'runInBackground',
      'agentBackground',
      'isCoordinator',
      'forceAsync',
      'assistantForceAsync',
      'proactiveActive',
    ] as const

    for (const trigger of asyncTriggers) {
      expect(
        shouldRunAgentAsync({
          ...defaults,
          [trigger]: true,
          inProcessTeammate: true,
        }),
      ).toBe(false)
    }
  })

  test('honors the global background-task disable gate', () => {
    expect(
      shouldRunAgentAsync({
        ...defaults,
        runInBackground: true,
        backgroundTasksDisabled: true,
      }),
    ).toBe(false)
  })
})

const finalizationMetadata = {
  prompt: 'test prompt',
  resolvedAgentModel: 'gpt-5.6-luna',
  isBuiltInAgent: true,
  startTime: Date.now(),
  agentType: 'worker',
  isAsync: true,
}

describe('finalizeAgentTool', () => {
  test('normalizes ChatGPT usage into the stable Agent result schema', () => {
    const result = finalizeAgentTool(
      [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'done' }],
            usage: {
              input_tokens: 12,
              output_tokens: 4,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 3,
            },
          },
        } as any,
      ],
      'agent-chatgpt',
      finalizationMetadata,
    )

    expect(result.usage.server_tool_use).toBeNull()
    expect(result.usage.service_tier).toBeNull()
    expect(result.usage.cache_creation).toBeNull()
    expect(agentToolResultSchema().safeParse(result).success).toBe(true)
  })

  test('rejects a terminal API error instead of reporting agent completion', () => {
    expect(() =>
      finalizeAgentTool(
        [
          {
            type: 'assistant',
            isApiErrorMessage: true,
            errorDetails: 'provider continuation failed',
            message: { content: [{ type: 'text', text: 'API Error' }] },
          } as any,
        ],
        'agent-api-error',
        finalizationMetadata,
      ),
    ).toThrow('provider continuation failed')
  })
})

describe('countToolUses', () => {
  test('counts tool_use blocks in messages', () => {
    const messages = [
      makeAssistantMessage([
        { type: 'tool_use', name: 'Read' },
        { type: 'text', text: 'hello' },
      ]),
    ]
    expect(countToolUses(messages)).toBe(1)
  })

  test('returns 0 for messages without tool_use', () => {
    const messages = [makeAssistantMessage([{ type: 'text', text: 'hello' }])]
    expect(countToolUses(messages)).toBe(0)
  })

  test('returns 0 for empty array', () => {
    expect(countToolUses([])).toBe(0)
  })

  test('counts multiple tool_use blocks across messages', () => {
    const messages = [
      makeAssistantMessage([{ type: 'tool_use', name: 'Read' }]),
      makeUserMessage('ok'),
      makeAssistantMessage([{ type: 'tool_use', name: 'Write' }]),
    ]
    expect(countToolUses(messages)).toBe(2)
  })

  test('counts tool_use in single message with multiple blocks', () => {
    const messages = [
      makeAssistantMessage([
        { type: 'tool_use', name: 'Read' },
        { type: 'tool_use', name: 'Grep' },
        { type: 'tool_use', name: 'Write' },
      ]),
    ]
    expect(countToolUses(messages)).toBe(3)
  })
})

describe('getLastToolUseName', () => {
  test('returns last tool name from assistant message', () => {
    const msg = makeAssistantMessage([
      { type: 'tool_use', name: 'Read' },
      { type: 'tool_use', name: 'Write' },
    ])
    expect(getLastToolUseName(msg)).toBe('Write')
  })

  test('returns undefined for message without tool_use', () => {
    const msg = makeAssistantMessage([{ type: 'text', text: 'hello' }])
    expect(getLastToolUseName(msg)).toBeUndefined()
  })

  test('returns the last tool when multiple tool_uses present', () => {
    const msg = makeAssistantMessage([
      { type: 'tool_use', name: 'Read' },
      { type: 'tool_use', name: 'Grep' },
      { type: 'tool_use', name: 'Edit' },
    ])
    expect(getLastToolUseName(msg)).toBe('Edit')
  })

  test('returns undefined for non-assistant message', () => {
    const msg = makeUserMessage('hello')
    expect(getLastToolUseName(msg)).toBeUndefined()
  })

  test('handles message with null content', () => {
    const msg = { type: 'assistant', message: { content: null } } as any
    expect(getLastToolUseName(msg)).toBeUndefined()
  })
})

describe('getForegroundAgentTerminalStatus', () => {
  test('reports unconfirmed cleanup as failed even after an abort request', () => {
    expect(
      getForegroundAgentTerminalStatus({
        wasAborted: false,
        signalAborted: true,
        runError: new StopConfirmationError('cleanup still running'),
      }),
    ).toBe('failed')
  })

  test('reports a confirmed abort as stopped', () => {
    expect(
      getForegroundAgentTerminalStatus({
        wasAborted: true,
        signalAborted: true,
        lifecycleError: new AbortError(),
      }),
    ).toBe('stopped')
  })
})

describe('stopAgentSummaryScope', () => {
  test('uses the exact summary settlement instead of its timed-out view', async () => {
    const scope = new AgentSummaryScope()
    scope.add({
      stop: async () => 'timed_out',
      stopExactly: async () => {},
    })

    await expect(
      stopAgentSummaryScope({
        scope,
        abortSignal: new AbortController().signal,
        taskId: 'agent-summary-normal-completion',
      }),
    ).resolves.toBe('settled')
  })

  test('rejects when the fresh summary finalizer deadline expires', async () => {
    const scope = new AgentSummaryScope()
    scope.add({
      stop: async () => 'timed_out',
      stopExactly: () => new Promise<void>(() => {}),
    })
    const abortController = new AbortController()
    abortController.abort()

    await expect(
      stopAgentSummaryScope({
        scope,
        abortSignal: abortController.signal,
        taskId: 'agent-summary-cancelled',
        timeoutMs: 1,
        abortGraceMs: 1,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
  })

  test('accepts delayed summary settlement after its owner was aborted', async () => {
    const scope = new AgentSummaryScope()
    let summarySettled = false
    scope.add({
      stop: async () => 'timed_out',
      stopExactly: async () => {
        await Bun.sleep(25)
        summarySettled = true
      },
    })
    const abortController = new AbortController()
    abortController.abort('user stop')

    await expect(
      stopAgentSummaryScope({
        scope,
        abortSignal: abortController.signal,
        taskId: 'agent-summary-delayed-stop',
        timeoutMs: 250,
        abortGraceMs: 1,
      }),
    ).resolves.toBe('settled')
    expect(summarySettled).toBe(true)
  })
})

describe('runAsyncAgentLifecycle', () => {
  test('completes without waiting for detached summary shutdown', async () => {
    const exactSummary = deferred()
    summaryExactStopImpl = () => exactSummary.promise

    const lifecycle = runAsyncAgentLifecycle({
      taskId: 'agent-unconfirmed-summary',
      abortController: new AbortController(),
      makeStream: async function* (onCacheSafeParams) {
        onCacheSafeParams?.({} as any)
        yield makeAssistantMessage([{ type: 'text', text: 'done' }])
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-1',
        getAppState: () => ({ toolPermissionContext: {} }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-unconfirmed-summary',
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    })

    await lifecycle
    expect(publishedAgentResults).toBe(1)
    expect(completedAgentResults).toBe(1)
    expect(failedAgentResults).toBe(0)
    expect(failedAgentNotifications).toBe(0)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)
    exactSummary.resolve()
    await Bun.sleep(1)
  })

  test('dispatches summary stop but does not gate the result on its settlement', async () => {
    const stopStarted = deferred()
    const stopSettlement = deferred()
    summaryExactStopImpl = () => {
      stopStarted.resolve()
      return stopSettlement.promise
    }

    const lifecycle = runAsyncAgentLifecycle({
      taskId: 'agent-1',
      abortController: new AbortController(),
      makeStream: async function* (onCacheSafeParams) {
        onCacheSafeParams?.({} as any)
        yield makeAssistantMessage([{ type: 'text', text: 'done' }])
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-1',
        getAppState: () => ({ toolPermissionContext: {} }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-1',
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    })

    await stopStarted.promise
    await lifecycle
    expect(publishedAgentResults).toBe(1)
    expect(completedAgentResults).toBe(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)

    stopSettlement.resolve()
    await Bun.sleep(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('does not let summary shutdown replace a primary stream failure', async () => {
    summaryExactStopImpl = async () => {
      throw new StopConfirmationError('summary shutdown was unconfirmed')
    }

    await runAsyncAgentLifecycle({
      taskId: 'agent-primary-failure',
      abortController: new AbortController(),
      makeStream: async function* (onCacheSafeParams) {
        onCacheSafeParams?.({} as any)
        yield makeAssistantMessage([{ type: 'text', text: 'partial' }])
        throw new Error('primary stream failure')
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-primary-failure',
        getAppState: () => ({ toolPermissionContext: {} }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-primary-failure',
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    })

    expect(failedAgentResults).toBe(1)
    expect(failedAgentNotifications).toBe(1)
    expect(failedAgentErrors).toEqual(['Error: primary stream failure'])
    expect(failedAgentNotificationErrors).toEqual([
      'Error: primary stream failure',
    ])
    expect(killedAgentNotifications).toBe(0)
    await Promise.resolve()
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('does not let summary shutdown replace an Abort result', async () => {
    const exactSummary = deferred()
    summaryExactStopImpl = () => exactSummary.promise
    const abortController = new AbortController()

    await runAsyncAgentLifecycle({
      taskId: 'agent-primary-abort',
      abortController,
      makeStream: async function* (onCacheSafeParams) {
        onCacheSafeParams?.({} as any)
        yield makeAssistantMessage([{ type: 'text', text: 'partial' }])
        abortController.abort('user stop')
        throw new AbortError()
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-primary-abort',
        getAppState: () => ({ toolPermissionContext: {} }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-primary-abort',
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    })

    expect(failedAgentResults).toBe(0)
    expect(failedAgentNotifications).toBe(0)
    expect(killedAgentNotifications).toBe(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)

    exactSummary.resolve()
    await Bun.sleep(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('completes before worktree cleanup and keeps the exact cleanup Esc-routable', async () => {
    let worktreeSignal: AbortSignal | undefined

    const lifecycle = runAsyncAgentLifecycle({
      taskId: 'agent-finalizing',
      abortController: new AbortController(),
      makeStream: async function* () {
        yield makeAssistantMessage([{ type: 'text', text: 'done' }])
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-1',
        getAppState: () => ({ toolPermissionContext: {} }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-finalizing',
      enableSummarization: false,
      getWorktreeResult: signal =>
        new Promise(resolve => {
          worktreeSignal = signal
          signal?.addEventListener('abort', () => resolve({}), {
            once: true,
          })
        }),
    })

    await lifecycle
    expect(publishedAgentResults).toBe(1)
    expect(completedAgentResults).toBe(1)
    expect(completedAgentNotifications).toBe(0)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)

    await cancelAndWaitForDetachedAuxiliaryWork('test stop')
    expect(worktreeSignal?.aborted).toBe(true)
    expect(completedAgentNotifications).toBe(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
  })

  test('does not publish a background result before the handoff classifier settles', async () => {
    const classifier = deferred<string | null>()
    const started = deferred()

    const lifecycle = runAsyncAgentLifecycle({
      taskId: 'agent-classifying',
      abortController: new AbortController(),
      makeStream: async function* () {
        yield makeAssistantMessage([{ type: 'text', text: 'done' }])
      },
      metadata: {
        prompt: 'test',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: false,
        startTime: Date.now(),
        agentType: 'test',
        isAsync: true,
      },
      description: 'test agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'tool-use-1',
        getAppState: () => ({
          toolPermissionContext: { mode: 'auto' },
        }),
      } as any,
      rootSetAppState: noop as any,
      agentIdForCleanup: 'agent-classifying',
      enableSummarization: false,
      getWorktreeResult: async () => ({}),
      classifyHandoff: () => {
        started.resolve()
        return classifier.promise
      },
    })

    await Promise.race([
      started.promise,
      Bun.sleep(50).then(() => {
        throw new Error('classifier did not start')
      }),
    ])
    expect(publishedAgentResults).toBe(0)
    expect(completedAgentResults).toBe(0)

    classifier.resolve(null)
    await lifecycle
    expect(publishedAgentResults).toBe(1)
    expect(completedAgentResults).toBe(1)
  })
})

describe('Agent finalizer cancellation confirmation', () => {
  test('keeps foreground TaskOutput unpublished until its safety gate settles', async () => {
    const safetyGate = deferred<string | null>()
    const agentResult = {
      agentId: 'foreground-agent',
      agentType: 'test',
      content: [{ type: 'text', text: 'done' }],
      totalDurationMs: 1,
      totalTokens: 1,
      totalToolUseCount: 0,
    } as any
    let published = false

    const publishing = publishAgentResultAfterHandoffSafety({
      agentResult,
      safetyGate: safetyGate.promise,
      abortSignal: new AbortController().signal,
      publish: () => {
        published = true
      },
    })
    await Promise.resolve()
    expect(published).toBe(false)

    safetyGate.resolve('review warning')
    await publishing
    expect(published).toBe(true)
    expect(agentResult.content[0]?.text).toBe('review warning')
  })

  test('detached summary observes a late exact settlement after an earlier Esc timeout', async () => {
    const exactSettlement = deferred()
    const scope = new AgentSummaryScope()
    let stopDispatches = 0
    scope.add({
      stop: async () => 'timed_out',
      stopExactly: () => {
        stopDispatches++
        return exactSettlement.promise
      },
    })

    registerDetachedAgentSummaryStop({
      scope,
      taskId: 'late-summary',
      abortGraceMs: 1,
    })
    expect(stopDispatches).toBe(1)

    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('first Esc'),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(true)

    exactSettlement.resolve()
    await Bun.sleep(1)
    expect(hasActiveDetachedAuxiliaryWork()).toBe(false)
    await expect(
      cancelAndWaitForDetachedAuxiliaryWork('second Esc'),
    ).resolves.toBeUndefined()
  })

  test('does not treat an abort-ignoring worktree operation as stopped', async () => {
    const finalizer = new AbortController()
    const owner = new AbortController()
    owner.abort('user stop')
    finalizer.abort('user stop')

    await expect(
      waitForAgentWorktreeOperation({
        settlement: new Promise<void>(() => {}),
        finalizerSignal: finalizer.signal,
        ownerSignal: owner.signal,
        operation: 'worktree cleanup',
        abortGraceMs: 1,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
  })

  test('lets an independent worktree finalizer settle after its owner was aborted', async () => {
    const finalizer = new AbortController()
    const owner = new AbortController()
    owner.abort('user stop')

    await expect(
      waitForAgentWorktreeOperation({
        settlement: Bun.sleep(25).then(() => 'removed'),
        finalizerSignal: finalizer.signal,
        ownerSignal: owner.signal,
        operation: 'delayed worktree cleanup',
        abortGraceMs: 1,
      }),
    ).resolves.toBe('removed')
  })

  test('does not complete when the classifier ignores its internal deadline', async () => {
    classifierImpl = () => new Promise(() => {})

    await expect(
      classifyHandoffIfNeeded({
        agentMessages: [makeAssistantMessage([{ type: 'text', text: 'done' }])],
        tools: [],
        toolPermissionContext: { mode: 'auto' } as any,
        abortSignal: new AbortController().signal,
        subagentType: 'test',
        totalToolUseCount: 0,
        timeoutMs: 1,
        abortGraceMs: 1,
        forceEnabledForTests: true,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
  })
})
