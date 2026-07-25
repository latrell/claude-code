/**
 * Tests for queryModelOpenAI in index.ts.
 *
 * Focused on stream completion invariants:
 *  1. stop_reason was always null in the assembled AssistantMessage because
 *     partialMessage (from message_start) has stop_reason: null, and the
 *     stop_reason captured from message_delta was never applied.
 *  2. A stream without message_stop must be reported as incomplete instead of
 *     promoting partial text, thinking, or tool arguments to a successful
 *     AssistantMessage.
 *
 * Strategy: mock getOpenAIClient + adaptOpenAIStreamToAnthropic so we can
 * feed pre-built Anthropic events directly into queryModelOpenAI and inspect
 * what it emits — without any real HTTP calls.
 */
import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { APIError } from 'openai'
import type {
  AssistantMessage,
  StreamEvent,
} from '../../../../types/message.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal message_start event */
function makeMessageStart(
  overrides: Record<string, any> = {},
): BetaRawMessageStreamEvent {
  return {
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'test-model',
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      ...overrides,
    },
  } as any
}

/** Build a content_block_start event for the given block type */
function makeContentBlockStart(
  index: number,
  type: 'text' | 'tool_use' | 'thinking',
  extra: Record<string, any> = {},
): BetaRawMessageStreamEvent {
  const block =
    type === 'text'
      ? { type: 'text', text: '' }
      : type === 'tool_use'
        ? { type: 'tool_use', id: 'toolu_test', name: 'bash', input: {} }
        : { type: 'thinking', thinking: '', signature: '' }
  return {
    type: 'content_block_start',
    index,
    content_block: { ...block, ...extra },
  } as any
}

/** Build a text_delta content_block_delta event */
function makeTextDelta(index: number, text: string): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  } as any
}

/** Build an input_json_delta content_block_delta event */
function makeInputJsonDelta(
  index: number,
  json: string,
): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: json },
  } as any
}

/** Build a thinking_delta content_block_delta event */
function makeThinkingDelta(
  index: number,
  thinking: string,
): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'thinking_delta', thinking },
  } as any
}

/** Build a content_block_stop event */
function makeContentBlockStop(index: number): BetaRawMessageStreamEvent {
  return { type: 'content_block_stop', index } as any
}

/** Build a message_delta event with stop_reason and output_tokens */
function makeMessageDelta(
  stopReason: string,
  outputTokens: number,
): BetaRawMessageStreamEvent {
  return {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  } as any
}

/** Build a message_stop event */
function makeMessageStop(): BetaRawMessageStreamEvent {
  return { type: 'message_stop' } as any
}

/** Async generator from a fixed array of events */
async function* eventStream(events: BetaRawMessageStreamEvent[]) {
  for (const e of events) yield e
}

type StreamFactory = () => AsyncGenerator<BetaRawMessageStreamEvent, void>

/** Collect all outputs from queryModelOpenAI into typed buckets */
async function runQueryModel(
  events: BetaRawMessageStreamEvent[] = [],
  envOverrides: Record<string, string | undefined> = {},
  streamFactories: StreamFactory[] = [],
  optionsOverrides: Record<string, unknown> = {},
) {
  // Wire events into the mocked stream adapter
  _nextEvents = events
  _nextStreamFactories = [...streamFactories]
  _createCallCount = 0
  // Save + apply env overrides
  const defaultEnvOverrides = {
    OPENAI_API_KEY: 'test-key',
    OPENAI_AUTH_MODE: undefined,
    OPENAI_MODEL: undefined,
    OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT: undefined,
  } satisfies Record<string, string | undefined>
  const effectiveEnvOverrides = { ...defaultEnvOverrides, ...envOverrides }
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(effectiveEnvOverrides)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }

  try {
    // We inline mock.module inside the try block.
    // Bun resolves mock.module at the call site synchronously (hoisted),
    // so we register once per test file, then re-import each time.
    const { queryModelOpenAI } = await import('../index.js')

    const assistantMessages: AssistantMessage[] = []
    const streamEvents: StreamEvent[] = []
    const otherOutputs: any[] = []

    const minimalOptions: any = {
      model: 'test-model',
      tools: [],
      agents: [],
      querySource: 'main_loop',
      getToolPermissionContext: async () => ({
        alwaysAllow: [],
        alwaysDeny: [],
        needsPermission: [],
        mode: 'default',
        isBypassingPermissions: false,
      }),
      ...optionsOverrides,
    }

    for await (const item of queryModelOpenAI(
      [],
      { type: 'text', text: '' } as any,
      [],
      new AbortController().signal,
      minimalOptions,
    )) {
      if (item.type === 'assistant') {
        assistantMessages.push(item as AssistantMessage)
      } else if (item.type === 'stream_event') {
        streamEvents.push(item as StreamEvent)
      } else {
        otherOutputs.push(item)
      }
    }

    return { assistantMessages, streamEvents, otherOutputs }
  } finally {
    // Restore env
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// ─── mock setup ──────────────────────────────────────────────────────────────

// We mock at module level. Bun's mock.module replaces the module for the
// entire file, so we configure the stream per-test via a shared variable.
let _nextEvents: BetaRawMessageStreamEvent[] = []
let _nextStreamFactories: StreamFactory[] = []
let _searchExtraToolsEnabled = false
let _createCallCount = 0

/** Captured arguments from the last chat.completions.create() call */
let _lastCreateArgs: Record<string, any> | null = null

mock.module('@ant/model-provider', () => ({
  resolveOpenAIModel: (
    m: string,
    env: Record<string, string | undefined> = {},
  ) => env.OPENAI_MODEL ?? m,
  adaptOpenAIStreamToAnthropic: (_stream: any, _model: string) =>
    _nextStreamFactories.shift()?.() ?? eventStream(_nextEvents),
  anthropicMessagesToOpenAI: (messages: any[]) =>
    messages.map(msg => ({
      role: msg.message?.role ?? 'user',
      content: msg.message?.content ?? '',
    })),
  anthropicToolsToOpenAI: (tools: any[]) =>
    tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
    })),
  anthropicToolChoiceToOpenAI: () => undefined,
}))

mock.module('../chatgptAuth.js', () => ({
  forceRefreshChatGPTAuth: async () => ({
    accessToken: 'refreshed-test-token',
    accountId: 'account-test',
  }),
  getValidChatGPTAuth: async () => ({
    accessToken: 'test-token',
    accountId: 'account-test',
  }),
  isChatGPTAuthEnabled: (
    env: Record<string, string | undefined> = process.env,
  ) => env.OPENAI_AUTH_MODE === 'chatgpt',
}))

mock.module('../../errors.js', () => ({
  PROMPT_TOO_LONG_ERROR_MESSAGE: 'Prompt is too long',
}))

mock.module('../../../../utils/envUtils.js', () => ({
  getAWSRegion: () => 'us-east-1',
  getClaudeConfigHomeDir: () => '/tmp/ccb-test-home',
  getDefaultVertexRegion: () => 'us-east5',
  getTeamsDir: () => '/tmp/ccb-test-home/teams',
  getVertexRegionForModel: () => 'us-east5',
  hasNodeOption: () => false,
  isBareMode: () => false,
  isEnvTruthy: (value: string | boolean | undefined) =>
    value === true ||
    value === '1' ||
    value === 'true' ||
    value === 'yes' ||
    value === 'on',
  isEnvDefinedFalsy: (value: string | boolean | undefined) =>
    value === false ||
    value === '0' ||
    value === 'false' ||
    value === 'no' ||
    value === 'off',
  isInProtectedNamespace: () => false,
  isRunningOnHomespace: () => false,
  parseEnvVars: () => ({}),
  shouldMaintainProjectWorkingDir: () => false,
}))

mock.module('../../../../services/analytics/growthbook.js', () => ({
  checkGate_CACHED_OR_BLOCKING: async () => false,
  checkSecurityRestrictionGate: async () => false,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE: () => false,
  clearGrowthBookConfigOverrides: () => {},
  getAllGrowthBookFeatures: () => ({}),
  getApiBaseUrlHost: () => undefined,
  getDynamicConfig_BLOCKS_ON_INIT: async (_key: string, fallback: unknown) =>
    fallback,
  getDynamicConfig_CACHED_MAY_BE_STALE: (_key: string, fallback: unknown) =>
    fallback,
  getFeatureValue_CACHED_MAY_BE_STALE: (_key: string, fallback: unknown) =>
    fallback,
  getFeatureValue_CACHED_WITH_REFRESH: (_key: string, fallback: unknown) =>
    fallback,
  getFeatureValue_DEPRECATED: async (_key: string, fallback: unknown) =>
    fallback,
  getGrowthBookConfigOverrides: () => ({}),
  hasGrowthBookEnvOverride: () => false,
  initializeGrowthBook: async () => {},
  onGrowthBookRefresh: () => () => {},
  refreshGrowthBookAfterAuthChange: () => {},
  refreshGrowthBookFeatures: async () => {},
  resetGrowthBook: () => {},
  setGrowthBookConfigOverride: () => {},
  setupPeriodicGrowthBookRefresh: () => {},
  stopPeriodicGrowthBookRefresh: () => {},
}))

mock.module('src/utils/sleep.js', () => ({
  sleep: async () => {},
}))

mock.module('src/utils/slowOperations.js', () => ({
  callerFrame: () => '',
  clone: <T>(value: T) => value,
  cloneDeep: <T>(value: T) => value,
  jsonParse: JSON.parse,
  jsonStringify: JSON.stringify,
  measureSlowOperation: async <T>(_: string, fn: () => Promise<T>) => fn(),
  measureSlowOperationSync: <T>(_: string, fn: () => T) => fn(),
  slowLogging: <T>(_: string, fn: () => T) => fn(),
  writeFileSync_DEPRECATED: () => {},
}))

mock.module('src/bootstrap/state.js', () => ({
  addInvokedSkill: () => {},
  addSessionCronTask: () => {},
  addSlowOperation: () => {},
  addToInMemoryErrorLog: () => {},
  addToToolDuration: () => {},
  addToTotalCostState: () => {},
  addToTotalDurationState: () => {},
  addToTotalLinesChanged: () => {},
  addToTurnClassifierDuration: () => {},
  addToTurnHookDuration: () => {},
  clearBetaHeaderLatches: () => {},
  clearInvokedSkills: () => {},
  clearInvokedSkillsForAgent: () => {},
  clearRegisteredPluginHooks: () => {},
  clearSystemPromptSectionState: () => {},
  consumePostCompaction: () => false,
  flushInteractionTime: () => {},
  getActiveTimeCounter: () => null,
  getAdditionalDirectoriesForClaudeMd: () => [],
  getAfkModeHeaderLatched: () => null,
  getAgentColorMap: () => new Map(),
  getAllowedChannels: () => [],
  getAllowedSettingSources: () => ['project', 'user', 'local'],
  getApiKeyFromFd: () => null,
  getBudgetContinuationCount: () => 0,
  getCacheEditingHeaderLatched: () => null,
  getCachedClaudeMdContent: () => null,
  getChatGPTSubscriptionPlan: () => null,
  getChromeFlagOverride: () => undefined,
  getClientType: () => 'test',
  getCodeEditToolDecisionCounter: () => null,
  getCommitCounter: () => null,
  getCostCounter: () => null,
  getCurrentTurnTokenBudget: () => null,
  getCwdState: () => process.cwd(),
  getDirectConnectServerUrl: () => undefined,
  getEventLogger: () => null,
  getFastModeHeaderLatched: () => null,
  getFlagSettingsInline: () => null,
  getFlagSettingsPath: () => undefined,
  getHasDevChannels: () => false,
  getInitJsonSchema: () => null,
  getInitialMainLoopModel: () => undefined,
  getInvokedSkillsForAgent: () => [],
  getIsInteractive: () => false,
  getIsNonInteractiveSession: () => true,
  getIsRemoteMode: () => false,
  getIsScrollDraining: () => false,
  getKairosActive: () => false,
  getLastAPIRequest: () => null,
  getLastAPIRequestMessages: () => null,
  getLastApiCompletionTimestamp: () => null,
  getLastClassifierRequests: () => null,
  getLastEmittedDate: () => null,
  getLastInteractionTime: () => Date.now(),
  getLastMainRequestId: () => undefined,
  getLocCounter: () => null,
  getLoggerProvider: () => null,
  getMainLoopModelOverride: () => undefined,
  getMainThreadAgentType: () => undefined,
  getMeter: () => null,
  getMeterProvider: () => null,
  getModelStrings: () => null,
  getModelUsage: () => ({}),
  getOauthTokenFromFd: () => null,
  getOriginalCwd: () => process.cwd(),
  getParentSessionId: () => undefined,
  getPlanSlugCache: () => new Map(),
  getPrCounter: () => null,
  getProjectRoot: () => process.cwd(),
  getPromptCache1hAllowlist: () => null,
  getPromptCache1hEligible: () => null,
  getPromptId: () => null,
  getQuestionPreviewFormat: () => undefined,
  getSdkAgentProgressSummariesEnabled: () => false,
  getSdkBetas: () => undefined,
  getSessionBypassPermissionsMode: () => false,
  getSessionCounter: () => null,
  getSessionCreatedTeams: () => new Set(),
  getSessionCronTasks: () => [],
  getSessionId: () => 'test-session',
  getSessionIngressToken: () => null,
  getSessionPersistenceDisabled: () => false,
  getSessionProjectDir: () => null,
  getSessionTrustAccepted: () => true,
  getScheduledTasksEnabled: () => false,
  getSlowOperations: () => [],
  getStatsStore: () => null,
  getStrictToolResultPairing: () => false,
  getSystemPromptSectionCache: () => new Map(),
  getTeleportedSessionInfo: () => null,
  getTokenCounter: () => null,
  getTotalAPIDuration: () => 0,
  getTotalAPIDurationWithoutRetries: () => 0,
  getTotalCacheCreationInputTokens: () => 0,
  getTotalCacheReadInputTokens: () => 0,
  getTotalCostUSD: () => 0,
  getTotalDuration: () => 0,
  getTotalInputTokens: () => 0,
  getTotalLinesAdded: () => 0,
  getTotalLinesRemoved: () => 0,
  getTotalOutputTokens: () => 0,
  getTotalToolDuration: () => 0,
  getTotalWebSearchRequests: () => 0,
  getTracerProvider: () => null,
  getTurnClassifierCount: () => 0,
  getTurnClassifierDurationMs: () => 0,
  getTurnHookCount: () => 0,
  getTurnHookDurationMs: () => 0,
  getTurnOutputTokens: () => 0,
  getTurnToolCount: () => 0,
  getTurnToolDurationMs: () => 0,
  getUsageForModel: () => undefined,
  getUseCoworkPlugins: () => false,
  getUserMsgOptIn: () => false,
  hasExitedPlanModeInSession: () => false,
  hasShownLspRecommendationThisSession: () => false,
  hasUnknownModelCost: () => false,
  incrementBudgetContinuationCount: () => {},
  isReplBridgeActive: () => false,
  isSessionPersistenceDisabled: () => false,
  markFirstTeleportMessageLogged: () => {},
  markPostCompaction: () => {},
  needsAutoModeExitAttachment: () => false,
  needsPlanModeExitAttachment: () => false,
  onSessionSwitch: () => () => {},
  preferThirdPartyAuthentication: () => false,
  regenerateSessionId: () => 'test-session',
  registerHookCallbacks: () => {},
  removeSessionCronTasks: () => 0,
  resetCostState: () => {},
  resetModelStringsForTestingOnly: () => {},
  resetSdkInitState: () => {},
  resetStateForTests: () => {},
  resetTotalDurationStateAndCost_FOR_TESTS_ONLY: () => {},
  resetTurnClassifierDuration: () => {},
  resetTurnHookDuration: () => {},
  resetTurnToolDuration: () => {},
  setAfkModeHeaderLatched: () => {},
  setAllowedChannels: () => {},
  setAllowedSettingSources: () => {},
  setApiKeyFromFd: () => {},
  setCacheEditingHeaderLatched: () => {},
  setCachedClaudeMdContent: () => {},
  setChatGPTSubscriptionPlan: () => {},
  setChromeFlagOverride: () => {},
  setClientType: () => {},
  setCostStateForRestore: () => {},
  setDirectConnectServerUrl: () => {},
  setEventLogger: () => {},
  setFastModeHeaderLatched: () => {},
  setFlagSettingsInline: () => {},
  setFlagSettingsPath: () => {},
  setHasDevChannels: () => {},
  setHasExitedPlanMode: () => {},
  setInitJsonSchema: () => {},
  setInitialMainLoopModel: () => {},
  setIsInteractive: () => {},
  setIsRemoteMode: () => {},
  setKairosActive: () => {},
  setLastAPIRequest: () => {},
  setLastAPIRequestMessages: () => {},
  setLastApiCompletionTimestamp: () => {},
  setLastClassifierRequests: () => {},
  setLastEmittedDate: () => {},
  setLastMainRequestId: () => {},
  setLoggerProvider: () => {},
  setLspRecommendationShownThisSession: () => {},
  setMainLoopModelOverride: () => {},
  setMainThreadAgentType: () => {},
  setMeter: () => {},
  setMeterProvider: () => {},
  setModelStrings: () => {},
  setNeedsAutoModeExitAttachment: () => {},
  setNeedsPlanModeExitAttachment: () => {},
  setOauthTokenFromFd: () => {},
  setOriginalCwd: () => {},
  setPlanSlugCacheEntry: () => {},
  setProjectRoot: () => {},
  setPromptCache1hAllowlist: () => {},
  setPromptCache1hEligible: () => {},
  setPromptId: () => {},
  setQuestionPreviewFormat: () => {},
  setScheduledTasksEnabled: () => {},
  setSdkAgentProgressSummariesEnabled: () => {},
  setSdkBetas: () => {},
  setSessionBypassPermissionsMode: () => {},
  setSessionIngressToken: () => {},
  setSessionPersistenceDisabled: () => {},
  setSessionSource: () => {},
  setSessionTrustAccepted: () => {},
  setStatsStore: () => {},
  setStrictToolResultPairing: () => {},
  setSystemPromptSectionCacheEntry: () => {},
  setTeleportedSessionInfo: () => {},
  setTracerProvider: () => {},
  setUseCoworkPlugins: () => {},
  setUserMsgOptIn: () => {},
  snapshotOutputTokensForTurn: () => {},
  switchSession: () => {},
  updateLastInteractionTime: () => {},
  waitForScrollIdle: async () => {},
}))

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('../client.js', () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: async (args: Record<string, any>) => {
          _createCallCount++
          _lastCreateArgs = args
          return { [Symbol.asyncIterator]: async function* () {} }
        },
      },
    },
  }),
}))

mock.module('../streamAdapter.js', () => ({
  adaptOpenAIStreamToAnthropic: (_stream: any, _model: string) =>
    _nextStreamFactories.shift()?.() ?? eventStream(_nextEvents),
}))

mock.module('../modelMapping.js', () => ({
  resolveOpenAIModel: (m: string) => m,
}))

mock.module('../convertMessages.js', () => ({
  anthropicMessagesToOpenAI: (messages: any[]) =>
    messages.map(msg => ({
      role: msg.message?.role ?? 'user',
      content: msg.message?.content ?? '',
    })),
}))

mock.module('../convertTools.js', () => ({
  anthropicToolsToOpenAI: () => [],
  anthropicToolChoiceToOpenAI: () => undefined,
}))

mock.module('../../../../utils/context.js', () => ({
  MODEL_CONTEXT_WINDOW_DEFAULT: 200_000,
  COMPACT_MAX_OUTPUT_TOKENS: 20_000,
  CAPPED_DEFAULT_MAX_TOKENS: 8_000,
  ESCALATED_MAX_TOKENS: 64_000,
  is1mContextDisabled: () => false,
  has1mContext: () => false,
  modelSupports1M: () => false,
  getModelMaxOutputTokens: (model: string) =>
    model === 'deepseek-v4-flash'
      ? { upperLimit: 384_000, default: 32_000 }
      : { upperLimit: 8192, default: 8192 },
  getContextWindowForModel: () => 200_000,
  getSonnet1mExpTreatmentEnabled: () => false,
  calculateContextPercentages: () => ({
    usedPercent: 0,
    remainingPercent: 100,
  }),
  getMaxThinkingTokensForModel: () => 0,
}))

mock.module('../../../../utils/messages.js', () => ({
  normalizeMessagesForAPI: (msgs: any) => msgs,
  normalizeContentFromAPI: (blocks: any[]) => blocks,
  createUserMessage: (opts: any) => ({
    type: 'user',
    message: { role: 'user', content: opts.content },
    uuid: 'user-uuid',
    timestamp: new Date().toISOString(),
    isMeta: opts.isMeta,
  }),
  createAssistantAPIErrorMessage: (opts: any) => ({
    type: 'assistant',
    isApiErrorMessage: true,
    apiError: opts.apiError,
    error: opts.error,
    errorDetails: opts.errorDetails,
    message: {
      content: [{ type: 'text', text: opts.content }],
    },
    uuid: 'error-uuid',
    timestamp: new Date().toISOString(),
  }),
}))

mock.module('../../../../utils/api.js', () => ({
  toolToAPISchema: async (t: any) => t,
}))

const searchExtraToolsMock = () => ({
  isSearchExtraToolsEnabled: async () => _searchExtraToolsEnabled,
  extractDiscoveredToolNames: () => new Set(),
  isDeferredToolsDeltaEnabled: () => false,
})

mock.module('src/utils/searchExtraTools.js', searchExtraToolsMock)

mock.module('../../../utils/searchExtraTools.js', searchExtraToolsMock)

mock.module('../../../../utils/searchExtraTools.js', searchExtraToolsMock)

const searchExtraToolsPromptMock = () => ({
  formatDeferredToolLine: (tool: { name: string }) => tool.name,
  isDeferredTool: (tool: { isMcp?: boolean }) => tool.isMcp === true,
  SEARCH_EXTRA_TOOLS_TOOL_NAME: 'SearchExtraTools',
})

mock.module(
  '@claude-code-best/builtin-tools/tools/SearchExtraToolsTool/prompt.js',
  searchExtraToolsPromptMock,
)

mock.module(
  '../../../../tools/SearchExtraToolsTool/prompt.js',
  searchExtraToolsPromptMock,
)

mock.module(
  '../../../../../packages/builtin-tools/src/tools/SearchExtraToolsTool/prompt.ts',
  searchExtraToolsPromptMock,
)

mock.module('../../../../cost-tracker.js', () => ({
  addToTotalSessionCost: () => {},
}))

mock.module('../../../../utils/modelCost.js', () => ({
  COST_TIER_3_15: {},
  COST_TIER_15_75: {},
  COST_TIER_5_25: {},
  COST_TIER_30_150: {},
  COST_HAIKU_35: {},
  COST_HAIKU_45: {},
  getOpus46CostTier: () => ({}),
  MODEL_COSTS: {},
  getModelCosts: () => ({}),
  calculateUSDCost: () => 0,
  calculateCostFromTokens: () => 0,
  formatModelPricing: () => '',
  getModelPricingString: () => undefined,
}))

mock.module('../../../../services/langfuse/tracing.js', () => ({
  recordLLMObservation: () => {},
}))

mock.module('../../../../services/langfuse/convert.js', () => ({
  convertMessagesToLangfuse: () => [],
  convertOutputToLangfuse: () => ({}),
  convertToolsToLangfuse: () => [],
}))

mock.module('../../../../utils/debug.js', () => ({
  logForDebugging: () => {},
  logAntError: () => {},
  isDebugMode: () => false,
  isDebugToStdErr: () => false,
  getDebugFilePath: () => null,
  getDebugLogPath: () => '',
  getDebugFilter: () => null,
  getMinDebugLogLevel: () => 'debug',
  enableDebugLogging: () => false,
  setHasFormattedOutput: () => {},
  getHasFormattedOutput: () => false,
  flushDebugLogs: async () => {},
}))

// ─── tests ───────────────────────────────────────────────────────────────────

describe('queryModelOpenAI — stop_reason propagation', () => {
  test('assembled AssistantMessage has stop_reason end_turn (not null)', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'Hello'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 10),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.stop_reason).toBe('end_turn')
  })

  test('retries an empty completion and publishes only recovered text', async () => {
    const emptyCompletion = async function* () {
      yield makeMessageStart()
      yield makeMessageDelta('end_turn', 0)
      yield makeMessageStop()
    }
    const recoveredCompletion = async function* () {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 1)
      yield makeMessageStop()
    }

    const { assistantMessages, streamEvents, otherOutputs } =
      await runQueryModel([], {}, [emptyCompletion, recoveredCompletion])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'recovered' },
    ])
    expect(assistantMessages[0]!.message.stop_reason).toBe('end_turn')
    expect(JSON.stringify(streamEvents)).toContain('recovered')
    expect(otherOutputs.some(item => item.type === 'system')).toBe(true)
  })

  test('assembled AssistantMessage has stop_reason tool_use', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'tool_use'),
      makeInputJsonDelta(0, '{"cmd":"ls"}'),
      makeContentBlockStop(0),
      makeMessageDelta('tool_use', 20),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.stop_reason).toBe('tool_use')
  })

  test('assembled AssistantMessage has stop_reason max_tokens', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'truncated'),
      makeContentBlockStop(0),
      makeMessageDelta('max_tokens', 8192),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    // Two assistant-typed items: the content message + the max_output_tokens error signal.
    // The error signal is emitted as a synthetic assistant message by createAssistantAPIErrorMessage.
    expect(assistantMessages).toHaveLength(2)
    const contentMsg = assistantMessages[0]!
    expect(contentMsg.message.stop_reason).toBe('max_tokens')
    // Second item is the error signal (has apiError set)
    expect(assistantMessages[1]!.apiError).toBe('max_output_tokens')
  })

  test('preserves thinking-only max_tokens for output-limit recovery', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'thinking'),
      makeThinkingDelta(0, 'budget exhausted while reasoning'),
      makeContentBlockStop(0),
      makeMessageDelta('max_tokens', 8192),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents, {
      OPENAI_MODEL: 'deepseek-v4-flash',
      OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT: '1',
    })

    expect(_createCallCount).toBe(1)
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]!.message.content).toEqual([
      {
        type: 'thinking',
        thinking: 'budget exhausted while reasoning',
        signature: '',
      },
    ])
    expect(assistantMessages[1]!.apiError).toBe('max_output_tokens')
  })

  test('reports partial text as an API error when message_stop is missing', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'partial'),
      makeContentBlockStop(0),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.apiError).toBe('api_error')
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(assistantMessages[0]!.errorDetails).toContain('message_stop')
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'message_stop terminal event',
    )
    expect(JSON.stringify(assistantMessages[0]!.message)).not.toContain(
      'partial',
    )
  })

  test('reports a start-only stream as an API error', async () => {
    _nextEvents = [makeMessageStart()]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.apiError).toBe('api_error')
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'message_stop terminal event',
    )
  })

  test('does not accept message_delta without message_stop', async () => {
    _nextEvents = [makeMessageStart(), makeMessageDelta('end_turn', 0)]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.apiError).toBe('api_error')
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'message_stop terminal event',
    )
  })
})

describe('queryModelOpenAI — usage accumulation', () => {
  test('usage in assembled message reflects all four fields from message_delta', async () => {
    // message_start has all fields=0 (trailing-chunk pattern: usage not yet available).
    // message_delta carries the real values after stream ends.
    // The spread in the message_delta handler must override all zeros from message_start,
    // including cache_read_input_tokens which was previously missing from message_delta.
    _nextEvents = [
      makeMessageStart({
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'response'),
      makeContentBlockStop(0),
      // message_delta carries all four Anthropic usage fields (as emitted by the fixed streamAdapter)
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: {
          input_tokens: 30011,
          output_tokens: 190,
          cache_read_input_tokens: 19904,
          cache_creation_input_tokens: 0,
        },
      } as any,
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    const usage = assistantMessages[0]!.message.usage as any
    expect(usage.input_tokens).toBe(30011)
    expect(usage.output_tokens).toBe(190)
    // cache_read_input_tokens from message_delta overrides the 0 from message_start
    expect(usage.cache_read_input_tokens).toBe(19904)
    expect(usage.cache_creation_input_tokens).toBe(0)
  })

  test('usage is zero when no usage events arrive (prevents false autocompact)', async () => {
    // If usage stays 0, tokenCountWithEstimation will undercount — so at least
    // verify the field exists and is numeric (to detect regressions).
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hi'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 0),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    const usage = assistantMessages[0]!.message.usage as any
    expect(typeof usage.input_tokens).toBe('number')
    expect(typeof usage.output_tokens).toBe('number')
  })
})

describe('queryModelOpenAI — no duplicate AssistantMessage (partialMessage reset)', () => {
  test('yields exactly one AssistantMessage per message_stop when content is present', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'only once'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    // Before the fix, partialMessage was not reset to null, so the safety
    // fallback at the end of the loop would yield a second message with the
    // same message.id — causing mergeAssistantMessages to concatenate content.
    expect(assistantMessages).toHaveLength(1)
  })

  test('thinking + text response yields exactly one AssistantMessage', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'thinking'),
      makeThinkingDelta(0, 'let me think'),
      makeContentBlockStop(0),
      makeContentBlockStart(1, 'text'),
      makeTextDelta(1, 'answer'),
      makeContentBlockStop(1),
      makeMessageDelta('end_turn', 30),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
  })

  test('retries a completed thinking-only response without publishing it', async () => {
    const thinkingOnlyCompletion = async function* () {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'thinking')
      yield makeThinkingDelta(0, 'completed reasoning')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 8)
      yield makeMessageStop()
    }
    const recoveredCompletion = async function* () {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'visible answer')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 2)
      yield makeMessageStop()
    }

    const { assistantMessages, streamEvents } = await runQueryModel([], {}, [
      thinkingOnlyCompletion,
      recoveredCompletion,
    ])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).not.toBe(true)
    expect(assistantMessages[0]!.message.stop_reason).toBe('end_turn')
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'visible answer' },
    ])
    expect(JSON.stringify(streamEvents)).not.toContain('completed reasoning')
  })

  test('reports thinking-only EOF without publishing partial reasoning', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'thinking'),
      makeThinkingDelta(0, 'unfinished reasoning'),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents)

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.apiError).toBe('api_error')
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'message_stop terminal event',
    )
    expect(JSON.stringify(assistantMessages[0]!.message)).not.toContain(
      'unfinished reasoning',
    )
  })
})

describe('queryModelOpenAI — stream_events forwarded', () => {
  test('every adapted event is also yielded as stream_event for real-time display', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hello'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    const { streamEvents } = await runQueryModel(_nextEvents)

    const eventTypes = streamEvents.map(e => (e as any).event?.type)
    expect(eventTypes).toContain('message_start')
    expect(eventTypes).toContain('content_block_start')
    expect(eventTypes).toContain('content_block_delta')
    expect(eventTypes).toContain('content_block_stop')
    expect(eventTypes).toContain('message_delta')
    expect(eventTypes).toContain('message_stop')
  })
})

describe('queryModelOpenAI — stream recovery boundary', () => {
  test('propagates an AbortError when the provider aborts before the caller signal updates', async () => {
    async function* abortsBeforeSemanticEvent(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      if (false) yield makeMessageStart()
      throw new DOMException('provider aborted', 'AbortError')
    }

    expect(
      runQueryModel([], {}, [abortsBeforeSemanticEvent]),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('retries empty adapted stream before semantic output and then succeeds', async () => {
    async function* endsBeforeSemanticEvent(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      if (false) yield makeMessageStart()
    }

    async function* succeedsAfterRetry(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 5)
      yield makeMessageStop()
    }

    const { assistantMessages, otherOutputs } = await runQueryModel([], {}, [
      endsBeforeSemanticEvent,
      succeedsAfterRetry,
    ])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    const contentBlocks = assistantMessages[0]!.message.content as unknown[]
    expect((contentBlocks[0] as { text?: string }).text).toBe('recovered')
    expect(otherOutputs.some(item => item.type === 'system')).toBe(true)
  })

  test('retries terminated before the first adapted event and then succeeds', async () => {
    async function* failsBeforeSemanticEvent(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      if (false) yield makeMessageStart()
      throw new TypeError('terminated')
    }

    async function* succeedsAfterRetry(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 5)
      yield makeMessageStop()
    }

    const { assistantMessages, otherOutputs } = await runQueryModel([], {}, [
      failsBeforeSemanticEvent,
      succeedsAfterRetry,
    ])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    const contentBlocks = assistantMessages[0]!.message.content as unknown[]
    expect((contentBlocks[0] as { text?: string }).text).toBe('recovered')
    expect(
      assistantMessages.some(msg =>
        JSON.stringify(msg.message).includes('API Error: terminated'),
      ),
    ).toBe(false)
    expect(otherOutputs.some(item => item.type === 'system')).toBe(true)
  })

  test('retries the DeepSeek V4 HTTP 200 SSE semantic-empty server error', async () => {
    async function* failsWithServerSemanticEmpty(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'thinking')
      yield makeThinkingDelta(0, 'discarded failed attempt')
      throw new APIError(
        undefined,
        {
          type: 'InternalServerError',
          code: 500,
          message: 'DeepSeek V4 semantic-empty response; retry request',
        },
        undefined,
        undefined,
      )
    }

    async function* succeedsAfterRetry(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered answer')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 5)
      yield makeMessageStop()
    }

    const { assistantMessages, otherOutputs, streamEvents } =
      await runQueryModel([], {}, [
        failsWithServerSemanticEmpty,
        succeedsAfterRetry,
      ])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'recovered answer' },
    ])
    expect(JSON.stringify(streamEvents)).not.toContain(
      'discarded failed attempt',
    )
    const progress = otherOutputs.find(item => item.type === 'system')
    expect(progress).toBeDefined()
    expect(String(progress.message.content)).not.toContain('semantic-empty')
    expect(progress.error.code).toBe('deepseek_v4_semantic_empty')
  })

  test('discards cross-chunk DeepSeek V4 structural leakage and retries the whole attempt', async () => {
    async function* malformedAttempt(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'discarded <｜DS')
      yield makeTextDelta(0, 'ML｜tool_calls> attempt')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 8)
      yield makeMessageStop()
    }

    async function* recoveredAttempt(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'clean recovered answer')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 4)
      yield makeMessageStop()
    }

    const { assistantMessages, otherOutputs, streamEvents } =
      await runQueryModel(
        [],
        {
          OPENAI_MODEL: 'deepseek-v4-flash',
          OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT: '1',
        },
        [malformedAttempt, recoveredAttempt],
      )

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'clean recovered answer' },
    ])
    expect(JSON.stringify(streamEvents)).not.toContain('｜DSML｜')
    expect(JSON.stringify(streamEvents)).not.toContain('discarded')
    const progress = otherOutputs.find(item => item.type === 'system')
    expect(progress.error.code).toBe('deepseek_v4_malformed_output')
    expect(String(progress.message.content)).not.toContain(
      'malformed structural output',
    )
  })

  test('retries the exact statusless malformed-output server signal after partial text', async () => {
    async function* serverRejectedAttempt(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'discarded before parser failure')
      throw new APIError(
        undefined,
        {
          type: 'InternalServerError',
          code: 500,
          message: 'DeepSeek V4 malformed structural output; retry request',
        },
        undefined,
        undefined,
      )
    }

    async function* recoveredAttempt(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered from server signal')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 4)
      yield makeMessageStop()
    }

    const { assistantMessages, otherOutputs, streamEvents } =
      await runQueryModel(
        [],
        {
          OPENAI_MODEL: 'deepseek-v4-flash',
          OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT: '1',
        },
        [serverRejectedAttempt, recoveredAttempt],
      )

    expect(_createCallCount).toBe(2)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'recovered from server signal' },
    ])
    expect(JSON.stringify(streamEvents)).not.toContain('discarded')
    const progress = otherOutputs.find(item => item.type === 'system')
    expect(progress.error.code).toBe('deepseek_v4_malformed_output')
    expect(String(progress.message.content)).not.toContain('retry request')
  })

  test('keeps normal V4 streaming behavior when structural validation is disabled', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'ordinary model output <｜DS'),
      makeTextDelta(0, 'ML｜literal>'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 4),
      makeMessageStop(),
    ]

    const { assistantMessages } = await runQueryModel(_nextEvents, {
      OPENAI_MODEL: 'deepseek-v4-flash',
    })

    expect(_createCallCount).toBe(1)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'ordinary model output <｜DSML｜literal>' },
    ])
  })

  test('does not retry terminated after adapted output was yielded', async () => {
    async function* breaksAfterTextDelta(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'partial')
      throw new TypeError('terminated')
    }

    const { assistantMessages } = await runQueryModel([], {}, [
      breaksAfterTextDelta,
    ])

    expect(_createCallCount).toBe(1)
    expect(assistantMessages).toHaveLength(1)
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'API Error: terminated',
    )
  })

  test('retries missing finish_reason before visible output and recovers', async () => {
    async function* endsWithoutFinishReason(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'thinking')
      yield makeThinkingDelta(0, 'unfinished')
      const error = new TypeError(
        'OpenAI-compatible API stream ended before receiving a finish_reason terminal event; the response may be incomplete, please retry',
      )
      Object.assign(error, { retryable: true })
      throw error
    }

    async function* succeedsAfterRetry(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'recovered after incomplete reasoning')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 4)
      yield makeMessageStop()
    }

    const { assistantMessages, streamEvents } = await runQueryModel([], {}, [
      endsWithoutFinishReason,
      succeedsAfterRetry,
    ])

    expect(_createCallCount).toBe(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.content).toEqual([
      { type: 'text', text: 'recovered after incomplete reasoning' },
    ])
    expect(JSON.stringify(streamEvents)).not.toContain('unfinished')
  })

  test('reports persistent empty completions as an explicit server error', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeMessageDelta('end_turn', 0),
      makeMessageStop(),
    ]

    const { assistantMessages, streamEvents } = await runQueryModel(_nextEvents)

    expect(_createCallCount).toBe(4)
    expect(streamEvents).toEqual([])
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(assistantMessages[0]!.errorDetails).toContain(
      'completed without text or a tool call',
    )
  })

  test('localizes a persistent DeepSeek V4 server semantic-empty failure while retaining diagnostics', async () => {
    async function* failsWithServerSemanticEmpty(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      throw new APIError(
        undefined,
        {
          type: 'InternalServerError',
          code: 500,
          message: 'DeepSeek V4 semantic-empty response; retry request',
        },
        undefined,
        undefined,
      )
    }

    const { assistantMessages } = await runQueryModel([], {}, [
      failsWithServerSemanticEmpty,
      failsWithServerSemanticEmpty,
      failsWithServerSemanticEmpty,
      failsWithServerSemanticEmpty,
    ])

    expect(_createCallCount).toBe(4)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.isApiErrorMessage).toBe(true)
    expect(assistantMessages[0]!.error).toBe('server_error')
    expect(JSON.stringify(assistantMessages[0]!.message)).toContain(
      'DeepSeek V4',
    )
    expect(JSON.stringify(assistantMessages[0]!.message)).not.toContain(
      'semantic-empty response',
    )
    expect(assistantMessages[0]!.errorDetails).toBe(
      'DeepSeek V4 semantic-empty response; retry request',
    )
  })

  test('localizes persistent DeepSeek V4 malformed output without exposing markers', async () => {
    async function* malformedAttempt(): AsyncGenerator<
      BetaRawMessageStreamEvent,
      void
    > {
      yield makeMessageStart()
      yield makeContentBlockStart(0, 'text')
      yield makeTextDelta(0, 'bad ｜DSML｜ output')
      yield makeContentBlockStop(0)
      yield makeMessageDelta('end_turn', 4)
      yield makeMessageStop()
    }

    const { assistantMessages, streamEvents } = await runQueryModel(
      [],
      {
        OPENAI_MODEL: 'deepseek-v4-flash',
        OPENAI_VALIDATE_DEEPSEEK_V4_OUTPUT: '1',
      },
      [malformedAttempt, malformedAttempt, malformedAttempt, malformedAttempt],
    )

    expect(_createCallCount).toBe(4)
    expect(streamEvents).toEqual([])
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.error).toBe('server_error')
    const visibleMessage = JSON.stringify(assistantMessages[0]!.message)
    expect(visibleMessage).toContain('DeepSeek V4')
    expect(visibleMessage).not.toContain('｜DSML｜')
    expect(visibleMessage).not.toContain('malformed structural output')
    expect(visibleMessage).not.toContain('retry request')
    expect(assistantMessages[0]!.errorDetails).toBe(
      'DeepSeek V4 malformed structural output; retry request',
    )
  })
})

describe('queryModelOpenAI — max_tokens forwarded to request', () => {
  test('buildOpenAIRequestBody includes max_tokens in the request payload', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hi'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    await runQueryModel(_nextEvents)

    expect(_lastCreateArgs).not.toBeNull()
    expect(_lastCreateArgs!.max_tokens).toBe(8192)
    expect(_lastCreateArgs!.temperature).toBeUndefined()
  })

  test('uses the official DeepSeek V4 output limit and a separate reasoning ceiling', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hi'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    await runQueryModel(_nextEvents, { OPENAI_MODEL: 'deepseek-v4-flash' })

    expect(_lastCreateArgs).not.toBeNull()
    expect(_lastCreateArgs!.max_tokens).toBe(384000)
    expect(_lastCreateArgs!.thinking_token_budget).toBe(64000)
    expect(_lastCreateArgs!.temperature).toBe(1)
  })

  test('uses OPENAI_TEMPERATURE from the scoped DeepSeek connection', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hi'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    await runQueryModel(_nextEvents, {}, [], {
      providerRuntimeConfig: {
        env: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_MODEL: 'deepseek-v4-flash',
          OPENAI_TEMPERATURE: '0',
        },
      },
    })

    expect(_lastCreateArgs).not.toBeNull()
    expect(_lastCreateArgs!.temperature).toBe(0)
  })

  test('honors an explicit DeepSeek output-token override', async () => {
    _nextEvents = [
      makeMessageStart(),
      makeContentBlockStart(0, 'text'),
      makeTextDelta(0, 'hi'),
      makeContentBlockStop(0),
      makeMessageDelta('end_turn', 5),
      makeMessageStop(),
    ]

    await runQueryModel(_nextEvents, {
      OPENAI_MODEL: 'deepseek-v4-flash',
      OPENAI_MAX_TOKENS: '16000',
    })

    expect(_lastCreateArgs).not.toBeNull()
    expect(_lastCreateArgs!.max_tokens).toBe(16000)
    expect(_lastCreateArgs!.thinking_token_budget).toBe(8000)
  })
})

describe('queryModelOpenAI — ChatGPT model routing boundary', () => {
  test('ignores stale public OPENAI_MODEL for ChatGPT subscription requests', async () => {
    const { resolveOpenAITransportModel } = await import('../index.js')

    expect(
      resolveOpenAITransportModel('gpt-5.6-sol[1m]', {
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_MODEL: 'stale-public-api-model',
      }),
    ).toBe('gpt-5.6-sol')
    expect(
      resolveOpenAITransportModel('anthropic-alias', {
        OPENAI_MODEL: 'configured-compatible-model',
      }),
    ).toBe('configured-compatible-model')
  })

  test('discards a failed partial attempt before replaying the retry', async () => {
    let fetchCount = 0
    const fetchOverride = mock(() => {
      fetchCount += 1
      const events =
        fetchCount === 1
          ? [
              {
                type: 'response.output_text.delta',
                output_index: 0,
                delta: 'discarded partial text',
              },
              {
                type: 'response.failed',
                response: {
                  error: {
                    code: 'server_error',
                    message: 'temporary backend failure',
                  },
                },
              },
            ]
          : [
              {
                type: 'response.output_text.delta',
                output_index: 0,
                delta: 'successful retry text',
              },
              {
                type: 'response.completed',
                response: { id: 'resp-success', status: 'completed' },
              },
            ]
      const body = events
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .join('')
      return Promise.resolve(new Response(body, { status: 200 }))
    }) as unknown as typeof fetch

    const result = await runQueryModel(
      [],
      { OPENAI_AUTH_MODE: 'chatgpt', OPENAI_MODEL: 'stale-public-model' },
      [],
      {
        model: 'gpt-5.6-sol',
        fetchOverride,
      },
    )

    expect(fetchCount).toBe(2)
    expect(JSON.stringify(result.streamEvents)).toContain(
      'successful retry text',
    )
    expect(JSON.stringify(result.streamEvents)).not.toContain(
      'discarded partial text',
    )
    expect(result.assistantMessages).toHaveLength(1)
    expect(JSON.stringify(result.assistantMessages[0]!.message)).toContain(
      'successful retry text',
    )
  })

  test('maps Codex context_length_exceeded into reactive-compaction shape', async () => {
    const fetchOverride = mock(() =>
      Promise.resolve(
        new Response(
          `data: ${JSON.stringify({
            type: 'response.failed',
            response: {
              error: {
                code: 'context_length_exceeded',
                message: 'input exceeds the model context window',
              },
            },
          })}\n\n`,
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    const result = await runQueryModel(
      [],
      { OPENAI_AUTH_MODE: 'chatgpt' },
      [],
      { model: 'gpt-5.6-sol', fetchOverride },
    )

    expect(result.assistantMessages).toHaveLength(1)
    expect(result.assistantMessages[0]?.isApiErrorMessage).toBe(true)
    expect(result.assistantMessages[0]?.message.content).toEqual([
      { type: 'text', text: 'Prompt is too long' },
    ])
    expect(result.assistantMessages[0]?.errorDetails).toContain(
      'input exceeds the model context window',
    )
  })
})

describe('queryModelOpenAI — deferred MCP tool visibility', () => {
  test('prepends available deferred MCP tools to OpenAI messages', async () => {
    _searchExtraToolsEnabled = true
    _nextEvents = [makeMessageStart(), makeMessageStop()]
    _lastCreateArgs = null
    _createCallCount = 0
    const savedOpenAIAuthMode = process.env.OPENAI_AUTH_MODE
    const savedOpenAIAPIKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_AUTH_MODE
    process.env.OPENAI_API_KEY = 'test-key'

    try {
      const { queryModelOpenAI } = await import('../index.js')
      const tools: any[] = [
        {
          name: 'SearchExtraTools',
          isMcp: false,
          input_schema: { type: 'object', properties: {} },
          prompt: async () => 'Search deferred tools',
        },
        {
          name: 'mcp__wechat__send_message',
          isMcp: true,
          input_schema: { type: 'object', properties: {} },
          prompt: async () => 'Send a WeChat message',
        },
      ]

      const options: any = {
        model: 'test-model',
        tools: [],
        agents: [],
        querySource: 'main_loop',
        getToolPermissionContext: async () => ({
          alwaysAllow: [],
          alwaysDeny: [],
          needsPermission: [],
          mode: 'default',
          isBypassingPermissions: false,
        }),
      }

      for await (const _item of queryModelOpenAI(
        [],
        { type: 'text', text: '' } as any,
        tools as any,
        new AbortController().signal,
        options,
      )) {
        // Exhaust generator so request body is built.
      }

      expect(_lastCreateArgs).not.toBeNull()
      expect(JSON.stringify(_lastCreateArgs!.messages)).toContain(
        '<available-deferred-tools>\\nmcp__wechat__send_message\\n</available-deferred-tools>',
      )
    } finally {
      _searchExtraToolsEnabled = false
      if (savedOpenAIAuthMode === undefined) delete process.env.OPENAI_AUTH_MODE
      else process.env.OPENAI_AUTH_MODE = savedOpenAIAuthMode
      if (savedOpenAIAPIKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = savedOpenAIAPIKey
    }
  })
})
