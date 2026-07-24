// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { FallbackTriggeredError } from './services/api/withRetry.js'
import {
  calculateTokenWarningState,
  estimateMaxTurnGrowth,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  type AutoCompactTrackingState,
} from './services/compact/autoCompact.js'
import { buildPostCompactMessages } from './services/compact/compact.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? (require('./services/compact/reactiveCompact.js') as typeof import('./services/compact/reactiveCompact.js'))
  : null
const contextCollapse = feature('CONTEXT_COLLAPSE')
  ? (require('./services/contextCollapse/index.js') as typeof import('./services/contextCollapse/index.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { ImageSizeError } from './utils/imageValidation.js'
import { ImageResizeError } from './utils/imageResizer.js'
import { findToolByName, type ToolUseContext } from './Tool.js'
import { isTerminalTaskStatus } from './Task.js'
import { asSystemPrompt, type SystemPrompt } from './utils/systemPromptType.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  RequestStartEvent,
  StreamEvent,
  ToolUseSummaryMessage,
  UserMessage,
  TombstoneMessage,
} from './types/message.js'
import { logError } from './utils/log.js'
import {
  mapThinkingEffortToEffortValue,
  resolveQueryThinkingEffort,
  resolveQueryThinkingEffortTransport,
} from './services/connections/thinkingEffort.js'
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  isPromptTooLongMessage,
} from './services/api/errors.js'
import {
  guardAsyncIterableCancellation,
  guardProviderStreamCancellation,
} from './services/api/providerCancellation.js'
import { logAntError, logForDebugging } from './utils/debug.js'
import { isAbortError } from './utils/errors.js'
import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from './utils/abortSettlement.js'
import { createChildAbortController } from './utils/abortController.js'
import { StopConfirmationError } from './utils/stopConfirmation.js'
import { registerDetachedAuxiliaryWork } from './utils/detachedAuxiliaryWork.js'
import {
  type SettledPromise,
  trackPromiseSettlement,
} from './utils/settledPromise.js'
import {
  createUserMessage,
  createUserInterruptionMessage,
  normalizeMessagesForAPI,
  createSystemMessage,
  createAssistantAPIErrorMessage,
  getMessagesAfterCompactBoundary,
  createToolUseSummaryMessage,
  createMicrocompactBoundaryMessage,
  stripSignatureBlocks,
} from './utils/messages.js'
import { generateToolUseSummary } from './services/toolUseSummary/toolUseSummaryGenerator.js'
import { prependUserContext, appendSystemContext } from './utils/api.js'
import {
  createAttachmentMessage,
  filterDuplicateMemoryAttachments,
  getAttachments,
  getAttachmentMessages,
  startRelevantMemoryPrefetch,
} from './utils/attachments.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const skillPrefetch = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (require('./services/skillSearch/prefetch.js') as typeof import('./services/skillSearch/prefetch.js'))
  : null
const searchExtraToolsPrefetch = feature('EXPERIMENTAL_SEARCH_EXTRA_TOOLS')
  ? (require('./services/searchExtraTools/prefetch.js') as typeof import('./services/searchExtraTools/prefetch.js'))
  : null
const _jobClassifier = feature('TEMPLATES')
  ? (require('./jobs/classifier.js') as typeof import('./jobs/classifier.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  enqueue,
  getCommandQueue,
  remove as removeFromQueue,
  getCommandsByMaxPriorityBeforeConversationReset,
  hasParkedTaskNotificationDeliveryAddressedTo,
  hasRetryingTaskNotificationDeliveryAddressedTo,
  isQueuedCommandEditable,
  isSlashCommand,
  subscribeToCommandQueue,
} from './utils/messageQueueManager.js'
import { TaskNotificationDeliveryParkedError } from './utils/queueProcessor.js'
import {
  type AutonomyTurnOutcome,
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
} from './utils/autonomyQueueLifecycle.js'
import { notifyCommandLifecycle } from './utils/commandLifecycle.js'
import { headlessProfilerCheckpoint } from './utils/headlessProfiler.js'
import {
  getRuntimeMainLoopModel,
  modelDisplayString,
} from './utils/model/model.js'
import {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  tokenCountWithEstimation,
} from './utils/tokens.js'
import { ESCALATED_MAX_TOKENS } from './utils/context.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './services/analytics/growthbook.js'
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
import { PostSamplingHookLifecycle } from './utils/hooks/postSamplingHooks.js'
import { executeStopFailureHooks } from './utils/hooks.js'
import type { QuerySource } from './constants/querySource.js'
import type { QueuedCommand } from './types/textInputTypes.js'
import { createDumpPromptsFetch } from './services/api/dumpPrompts.js'
import { StreamingToolExecutor } from './services/tools/StreamingToolExecutor.js'
import { queryCheckpoint } from './utils/queryProfiler.js'
import { runTools } from './services/tools/toolOrchestration.js'
import { applyToolResultBudget } from './utils/toolResultStorage.js'
import { recordContentReplacement } from './utils/sessionStorage.js'
import { handleStopHooks } from './query/stopHooks.js'
import {
  cancelPromptSuggestionForParent,
  drainPromptSuggestionForParent,
} from './services/PromptSuggestion/promptSuggestion.js'
import { buildQueryConfig } from './query/config.js'
import { productionDeps, type QueryDeps } from './query/deps.js'
import type { Terminal, Continue } from './query/transitions.js'
import { feature } from 'bun:bundle'
import {
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  incrementBudgetContinuationCount,
  getSessionId,
} from './bootstrap/state.js'
import { createBudgetTracker, checkTokenBudget } from './query/tokenBudget.js'
import { count } from './utils/array.js'
import {
  createTrace,
  endTrace,
  flushLangfuse,
  isLangfuseEnabled,
} from './services/langfuse/index.js'
import { getAPIProvider } from './utils/model/providers.js'
import { isChatGPTAuthEnabled } from './services/api/openai/chatgptAuth.js'
import { fetchChatGPTCodexModels } from './services/api/openai/codexModels.js'
import type { ChatGPTCodexTurnSession } from './services/api/openai/responsesAdapter.js'
import { MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS } from './services/api/openai/serverContinuation.js'
import { getChatGPTCredentialScope } from './utils/model/chatgptModels.js'
import {
  createCacheWarningMessage,
  getCacheThreshold,
  isCacheWarningEnabled,
  shouldShowCacheWarning,
} from './utils/cacheWarning.js'
import { getTaskListId } from './utils/tasks.js'
import { sleep } from './utils/sleep.js'
import { hashContent } from './utils/hash.js'
import {
  buildUnfinishedTaskCoordinationPrompt,
  buildUnfinishedTaskContinuationPrompt,
  buildUnfinishedTaskNoProgressError,
  getTaskCompletionGuardProgressFingerprint,
  getTaskCompletionGuardRuntimeState,
  inspectUnfinishedTasks,
  isTaskCompletionGuardToolName,
  MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
  type UnfinishedTaskInspection,
} from './query/unfinishedTasks.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null
const taskSummaryModule = feature('BG_SESSIONS')
  ? (require('./utils/taskSummary.js') as typeof import('./utils/taskSummary.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
) {
  for (const assistantMessage of assistantMessages) {
    // Extract all tool use blocks from this assistant message
    const toolUseBlocks = (
      Array.isArray(assistantMessage.message?.content)
        ? assistantMessage.message.content
        : []
    ).filter(
      (content: { type: string }) => content.type === 'tool_use',
    ) as ToolUseBlock[]

    // Emit an interruption message for each tool use
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id,
          },
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
  }
}

/**
 * The rules of thinking are lengthy and fortuitous. They require plenty of thinking
 * of most long duration and deep meditation for a wizard to wrap one's noggin around.
 *
 * The rules follow:
 * 1. A message that contains a thinking or redacted_thinking block must be part of a query whose max_thinking_length > 0
 * 2. A thinking block may not be the last message in a block
 * 3. Thinking blocks must be preserved for the duration of an assistant trajectory (a single turn, or if that turn includes a tool_use block then also its subsequent tool_result and the following assistant message)
 *
 * Heed these rules well, young wizard. For they are the rules of thinking, and
 * the rules of thinking are the rules of the universe. If ye does not heed these
 * rules, ye will be punished with an entire day of debugging and hair pulling.
 */
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3
const QUERY_OWNED_SETTLEMENT_TIMEOUT_MS = 30_000
const QUERY_ABORT_SETTLEMENT_GRACE_MS = 2_000
const AUTONOMY_FINALIZATION_TIMEOUT_MS = 10_000
const AUTONOMY_ABORT_SETTLEMENT_GRACE_MS = 2_000

type QueryOwnedSettlementOptions = {
  signal: AbortSignal
  finishPostSamplingHooks: () => Promise<void>
  abortPostSamplingHooks: (reason: unknown) => void | Promise<void>
  settlePromptSuggestion?: () => Promise<void>
  abortPromptSuggestion?: (reason: unknown) => void | Promise<void>
  settleExtractMemories?: () => Promise<void>
  abortExtractMemories?: (reason: unknown) => void | Promise<void>
  thrownError?: unknown
  includeThrownError?: boolean
  timeoutMs?: number
  abortGraceMs?: number
}

type QueryOwnedDetachmentOptions = Pick<
  QueryOwnedSettlementOptions,
  | 'finishPostSamplingHooks'
  | 'abortPostSamplingHooks'
  | 'settlePromptSuggestion'
  | 'abortPromptSuggestion'
  | 'settleExtractMemories'
  | 'abortExtractMemories'
  | 'abortGraceMs'
>

function startCleanupPromise(start: () => Promise<void>): Promise<void> {
  try {
    return Promise.resolve(start())
  } catch (error) {
    return Promise.reject(error)
  }
}

function dispatchOwnedCancellation(start: () => void | Promise<void>): void {
  try {
    void Promise.resolve(start()).catch(error => {
      // The exact drain promise remains the termination evidence. This catch
      // only prevents a distinct cancellation wrapper from going unhandled.
      if (!(error instanceof StopConfirmationError)) logError(error)
    })
  } catch (error) {
    logError(error)
  }
}

function throwQueryOwnedFailures(
  operation: string,
  results: readonly PromiseSettledResult<void>[],
): void {
  const failures = [
    ...new Set(
      results.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      ),
    ),
  ]
  if (failures.length === 0) return
  const stopFailures = failures.filter(
    failure => failure instanceof StopConfirmationError,
  )
  if (stopFailures.length > 0) {
    if (failures.length === 1) throw stopFailures[0]
    throw new StopConfirmationError(operation, failures)
  }
  // These requests are settled, so an ordinary operational error must be
  // reported without falsely claiming that remote work is still alive.
  throw failures[0]
}

/**
 * Normal completion starts all turn-owned drains but transfers their lifetime
 * to the detached auxiliary owner. The foreground query can become idle
 * immediately; Esc still has a separate cancellation/confirmation route.
 */
export function detachQueryOwnedRequests({
  finishPostSamplingHooks,
  abortPostSamplingHooks,
  settlePromptSuggestion,
  abortPromptSuggestion,
  settleExtractMemories,
  abortExtractMemories,
  abortGraceMs = QUERY_ABORT_SETTLEMENT_GRACE_MS,
}: QueryOwnedDetachmentOptions): void {
  const settlements = [
    startCleanupPromise(finishPostSamplingHooks),
    ...(settlePromptSuggestion
      ? [startCleanupPromise(settlePromptSuggestion)]
      : []),
    ...(settleExtractMemories
      ? [startCleanupPromise(settleExtractMemories)]
      : []),
  ]
  const settlement = Promise.allSettled(settlements).then(results => {
    throwQueryOwnedFailures(
      'Query auxiliary work did not settle cleanly',
      results,
    )
  })

  registerDetachedAuxiliaryWork({
    operation: 'query auxiliary work',
    settlement,
    abortGraceMs,
    onError: error => logError(error),
    cancel: reason => {
      const cancellations = [
        startCleanupPromise(() =>
          Promise.resolve(abortPostSamplingHooks(reason)),
        ),
        ...(abortPromptSuggestion
          ? [
              startCleanupPromise(() =>
                Promise.resolve(abortPromptSuggestion(reason)),
              ),
            ]
          : []),
        ...(abortExtractMemories
          ? [
              startCleanupPromise(() =>
                Promise.resolve(abortExtractMemories(reason)),
              ),
            ]
          : []),
      ]
      return Promise.allSettled(cancellations).then(results => {
        throwQueryOwnedFailures(
          'Query auxiliary cancellation dispatch failed',
          results,
        )
      })
    },
  })
}

async function cancelExtractMemoriesOwnedByQuery(
  parentAbortController: AbortController,
  reason: unknown,
): Promise<void> {
  if (feature('EXTRACT_MEMORIES')) {
    const { cancelExtractMemoriesForParent } = await import(
      './services/extractMemories/extractMemories.js'
    )
    await cancelExtractMemoriesForParent(parentAbortController, reason)
  }
}

async function drainExtractMemoriesOwnedByQuery(
  parentAbortController: AbortController,
): Promise<void> {
  if (feature('EXTRACT_MEMORIES')) {
    const { drainExtractMemoriesForParent } = await import(
      './services/extractMemories/extractMemories.js'
    )
    await drainExtractMemoriesForParent(parentAbortController)
  }
}

async function executeOwnedStopFailureHooks(
  lastMessage: AssistantMessage,
  toolUseContext: ToolUseContext,
): Promise<void> {
  const hookAbortController = createChildAbortController(
    toolUseContext.abortController,
  )
  const hookToolUseContext: ToolUseContext = {
    ...toolUseContext,
    abortController: hookAbortController,
  }
  try {
    await waitForBoundedSettlement(
      executeStopFailureHooks(lastMessage, hookToolUseContext),
      {
        signal: toolUseContext.abortController.signal,
        timeoutMs: QUERY_OWNED_SETTLEMENT_TIMEOUT_MS,
        abortGraceMs: QUERY_ABORT_SETTLEMENT_GRACE_MS,
        operation: 'StopFailure hooks',
        onAbort: reason => hookAbortController.abort(reason),
      },
    )
  } catch (error) {
    if (error instanceof StopConfirmationError) throw error
    if (error instanceof AbortSettlementTimeoutError) {
      throw new StopConfirmationError(
        'StopFailure hooks did not confirm termination',
        [error],
      )
    }
    throw error
  } finally {
    if (!hookAbortController.signal.aborted) {
      hookAbortController.abort('StopFailure hooks settled')
    }
  }
}

/**
 * Start all turn-owned request drains before awaiting either one. A timeout is
 * a failed Stop confirmation, not permission to leave the query lifecycle
 * blocked forever. The returned error is thrown only after best-effort cleanup
 * (autonomy bookkeeping, tracing, and performance buffers) has also run.
 */
export async function settleQueryOwnedRequests({
  signal,
  finishPostSamplingHooks,
  abortPostSamplingHooks,
  settlePromptSuggestion,
  abortPromptSuggestion,
  settleExtractMemories,
  abortExtractMemories,
  thrownError,
  includeThrownError = false,
  timeoutMs = QUERY_OWNED_SETTLEMENT_TIMEOUT_MS,
  abortGraceMs = QUERY_ABORT_SETTLEMENT_GRACE_MS,
}: QueryOwnedSettlementOptions): Promise<StopConfirmationError | undefined> {
  const postSamplingPromise = startCleanupPromise(finishPostSamplingHooks)
  const promptSuggestionPromise = settlePromptSuggestion
    ? startCleanupPromise(settlePromptSuggestion)
    : undefined
  const extractMemoriesPromise = settleExtractMemories
    ? startCleanupPromise(settleExtractMemories)
    : undefined

  const settlements = [
    waitForBoundedSettlement(postSamplingPromise, {
      signal,
      timeoutMs,
      abortGraceMs,
      operation: 'post-sampling hooks',
      onAbort: reason => {
        dispatchOwnedCancellation(() => abortPostSamplingHooks(reason))
      },
    }),
    ...(promptSuggestionPromise
      ? [
          waitForBoundedSettlement(promptSuggestionPromise, {
            signal,
            timeoutMs,
            abortGraceMs,
            operation: 'prompt suggestion settlement',
            onAbort: reason =>
              dispatchOwnedCancellation(() => abortPromptSuggestion?.(reason)),
          }),
        ]
      : []),
    ...(extractMemoriesPromise
      ? [
          waitForBoundedSettlement(extractMemoriesPromise, {
            signal,
            timeoutMs,
            abortGraceMs,
            operation: 'memory extraction settlement',
            onAbort: reason =>
              dispatchOwnedCancellation(() => abortExtractMemories?.(reason)),
          }),
        ]
      : []),
  ]
  const results = await Promise.allSettled(settlements)
  const settlementFailures = results.flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  const unconfirmedFailures = settlementFailures.filter(
    failure =>
      failure instanceof StopConfirmationError ||
      failure instanceof AbortSettlementTimeoutError,
  )
  for (const failure of settlementFailures) {
    if (!unconfirmedFailures.includes(failure) && !isAbortError(failure)) {
      // A rejected drain is still exact settlement evidence. Preserve the
      // operational failure for diagnostics without claiming its work may be
      // alive after the promise has already reached a terminal state.
      logError(failure)
    }
  }
  if (unconfirmedFailures.length === 0) return undefined

  const failures = includeThrownError
    ? [thrownError, ...unconfirmedFailures]
    : unconfirmedFailures
  return new StopConfirmationError(
    `Query cleanup could not confirm ${unconfirmedFailures.length} owned request settlement${unconfirmedFailures.length === 1 ? '' : 's'}`,
    failures,
  )
}

/**
 * Is this a max_output_tokens error message? If so, the streaming loop should
 * withhold it from SDK callers until we know whether the recovery loop can
 * continue. Yielding early leaks an intermediate error to SDK callers (e.g.
 * cowork/desktop) that terminate the session on any `error` field — the
 * recovery loop keeps running but nobody is listening.
 *
 * Mirrors reactiveCompact.isWithheldPromptTooLong.
 */
function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

function hasQueuedMainThreadUserInput(): boolean {
  return getCommandQueue().some(
    command =>
      command.agentId === undefined && isQueuedCommandEditable(command),
  )
}

type TaskCompletionGuardQueueState = {
  taskNotifications: QueuedCommand[]
  requiresTurnHandoff: boolean
}

function getTaskCompletionGuardQueueState(): TaskCompletionGuardQueueState {
  const isMainThreadCommand = (command: QueuedCommand) =>
    command.agentId === undefined
  let nextBatch: QueuedCommand[] = []
  for (const priority of ['now', 'next', 'later'] as const) {
    nextBatch = getCommandsByMaxPriorityBeforeConversationReset(
      priority,
      isMainThreadCommand,
    )
    if (nextBatch.length > 0) break
  }

  const nextCommand = nextBatch[0]
  if (!nextCommand) {
    return { taskNotifications: [], requiresTurnHandoff: false }
  }
  if (nextCommand.mode !== 'task-notification' || isSlashCommand(nextCommand)) {
    return { taskNotifications: [], requiresTurnHandoff: true }
  }

  return {
    taskNotifications: getCommandsByMaxPriorityBeforeConversationReset(
      'later',
      isMainThreadCommand,
    ).filter(
      command =>
        command.mode === 'task-notification' && !isSlashCommand(command),
    ),
    requiresTurnHandoff: false,
  }
}

function getTaskCompletionGuardNotificationFingerprint(
  command: QueuedCommand,
): string {
  if (command.uuid) return `notification:${command.uuid}`
  const content =
    typeof command.value === 'string'
      ? command.value
      : JSON.stringify(command.value)
  return `notification:${hashContent(content)}`
}

async function waitForTaskCompletionGuardRuntimeChange(
  signal: AbortSignal,
): Promise<void> {
  let resolveQueueChange: (() => void) | undefined
  const queueChange = new Promise<void>(resolve => {
    resolveQueueChange = resolve
  })
  const unsubscribe = subscribeToCommandQueue(() => resolveQueueChange?.())
  try {
    await Promise.race([sleep(1_000, signal), queueChange])
  } finally {
    unsubscribe()
  }
}

function findSettledToolResultBlock(
  messages: readonly (UserMessage | AttachmentMessage)[],
  toolUseId: string,
): ToolResultBlockParam | undefined {
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      continue
    }
    const block = message.message.content.find(
      (content): content is ToolResultBlockParam =>
        content.type === 'tool_result' && content.tool_use_id === toolUseId,
    )
    if (block) return block
  }
  return undefined
}

function mergeUnfinishedTaskInspections(
  inspections: Array<{
    taskListId: string
    inspection: UnfinishedTaskInspection
  }>,
  currentTaskListId: string,
): UnfinishedTaskInspection {
  return {
    snapshotKey: JSON.stringify(
      inspections.map(({ taskListId, inspection }) => ({
        taskListId,
        snapshotKey: inspection.snapshotKey,
      })),
    ),
    hasPublicUnfinishedTasks: inspections.some(
      ({ inspection }) => inspection.hasPublicUnfinishedTasks,
    ),
    publicTasks: inspections.flatMap(
      ({ inspection }) => inspection.publicTasks,
    ),
    unfinishedTasks: inspections.flatMap(
      ({ inspection }) => inspection.unfinishedTasks,
    ),
    actionableTasks: inspections
      .flatMap(({ inspection }) => inspection.actionableTasks)
      .filter(task => task.taskListId === currentTaskListId),
  }
}

function getAutonomyTurnOutcome(params: {
  terminal?: Terminal
  thrownError?: unknown
}): AutonomyTurnOutcome {
  if (params.thrownError !== undefined) {
    return { type: 'failed', error: params.thrownError }
  }

  const terminal = params.terminal
  const reason = terminal?.reason
  switch (reason) {
    case 'completed':
      return { type: 'completed' }
    case undefined:
    case 'aborted_streaming':
    case 'aborted_tools':
      return { type: 'cancelled' }
    case 'model_error':
      return { type: 'failed', error: terminal.error }
    default:
      return {
        type: 'failed',
        message: `query ended without successful completion: ${reason}`,
      }
  }
}

export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  // API task_budget (output_config.task_budget, beta task-budgets-2026-03-13).
  // Distinct from the tokenBudget +500k auto-continue feature. `total` is the
  // budget for the whole agentic turn; `remaining` is computed per iteration
  // from cumulative API usage. See configureTaskBudgetParams in claude.ts.
  taskBudget?: { total: number }
  deps?: QueryDeps
  /** Internal: reuse Codex routing state for same-turn compaction/forks. */
  chatGPTCodexTurnSession?: ChatGPTCodexTurnSession
}

// -- query loop state

// Mutable state carried between loop iterations
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary:
    | SettledPromise<ToolUseSummaryMessage | null>
    | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  // Why the previous iteration continued. Undefined on first iteration.
  // Lets tests assert recovery paths fired without inspecting message contents.
  transition: Continue | undefined
}

export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  const consumedCommandUuids: string[] = []
  const consumedAutonomyCommands: QueuedCommand[] = []

  // Context-window, blocking-limit, auto-compact, and tool-search decisions
  // happen before queryModelOpenAI gets a chance to refresh the catalog. Make
  // the account-scoped Codex catalog available first, especially for restored
  // subagent/fast/sonnet runtimes whose model may not exist in the main account.
  const providerRuntime = params.toolUseContext.options.providerRuntimeConfig
  const providerEnv = providerRuntime?.env ?? process.env
  const provider = providerRuntime?.provider ?? getAPIProvider()
  if (provider === 'openai' && isChatGPTAuthEnabled(providerEnv)) {
    const credentialScope =
      providerRuntime?.credentialScope ?? getChatGPTCredentialScope(providerEnv)
    await fetchChatGPTCodexModels({ credentialScope }).catch(error => {
      logForDebugging(
        `[query] ChatGPT Codex model catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }

  // Create Langfuse trace for this query turn (no-op if not configured).
  // When called as a sub-agent, langfuseTrace is already set by runAgent()
  // — reuse it instead of creating an independent trace.
  const ownsTrace = !params.toolUseContext.langfuseTrace
  logForDebugging(
    `[query] ownsTrace=${ownsTrace} incoming langfuseTrace=${params.toolUseContext.langfuseTrace ? 'present' : 'null/undefined'} isLangfuseEnabled=${isLangfuseEnabled()}`,
  )
  const langfuseTrace =
    params.toolUseContext.langfuseTrace ??
    (isLangfuseEnabled()
      ? createTrace({
          sessionId: getSessionId(),
          model: params.toolUseContext.options.mainLoopModel,
          provider:
            params.toolUseContext.options.providerRuntimeConfig?.provider ??
            getAPIProvider(),
          input: params.messages,
          querySource: params.querySource,
        })
      : null)

  // Attach trace to toolUseContext so tool execution can record observations
  const paramsWithTrace: QueryParams = langfuseTrace
    ? {
        ...params,
        toolUseContext: { ...params.toolUseContext, langfuseTrace },
      }
    : params

  const postSamplingHooks = new PostSamplingHookLifecycle(
    paramsWithTrace.toolUseContext.abortController,
  )

  let terminal: Terminal | undefined
  let didThrow = false
  let thrownError: unknown
  let stopConfirmationError: StopConfirmationError | undefined
  try {
    terminal = yield* queryLoop(
      paramsWithTrace,
      consumedCommandUuids,
      consumedAutonomyCommands,
      postSamplingHooks,
    )
  } catch (error) {
    didThrow = true
    thrownError = error
  } finally {
    const isAborted =
      terminal?.reason === 'aborted_streaming' ||
      terminal?.reason === 'aborted_tools'
    const shouldAbortPostSamplingHooks =
      didThrow ||
      terminal === undefined ||
      isAborted ||
      paramsWithTrace.toolUseContext.abortController.signal.aborted
    const cleanupReason =
      paramsWithTrace.toolUseContext.abortController.signal.reason ??
      (didThrow ? thrownError : 'query-closed')
    const ownedRequestCallbacks: QueryOwnedDetachmentOptions = {
      finishPostSamplingHooks: () =>
        postSamplingHooks.finish({
          abort: shouldAbortPostSamplingHooks,
          reason: cleanupReason,
        }),
      abortPostSamplingHooks: reason =>
        postSamplingHooks.finish({ abort: true, reason }),
      settlePromptSuggestion: () =>
        drainPromptSuggestionForParent(
          paramsWithTrace.toolUseContext.abortController,
        ),
      abortPromptSuggestion: reason =>
        cancelPromptSuggestionForParent(
          paramsWithTrace.toolUseContext.abortController,
          reason,
        ),
      settleExtractMemories: () =>
        drainExtractMemoriesOwnedByQuery(
          paramsWithTrace.toolUseContext.abortController,
        ),
      abortExtractMemories: reason =>
        cancelExtractMemoriesOwnedByQuery(
          paramsWithTrace.toolUseContext.abortController,
          reason,
        ),
    }
    const completedNormally =
      !didThrow &&
      terminal?.reason === 'completed' &&
      !paramsWithTrace.toolUseContext.abortController.signal.aborted

    if (completedNormally) {
      // Suggestions, memory extraction, and post-sampling hooks are useful
      // background work, but they are not part of the foreground completion
      // gate. Their owner keeps Esc cancellation independently routable.
      detachQueryOwnedRequests(ownedRequestCallbacks)
    } else {
      // Abort, failure, and generator.return() still require synchronous,
      // bounded settlement before the query lifecycle may close.
      stopConfirmationError = await settleQueryOwnedRequests({
        signal: paramsWithTrace.toolUseContext.abortController.signal,
        ...ownedRequestCallbacks,
        ...(didThrow ? { thrownError } : {}),
        includeThrownError: didThrow,
      })
    }

    try {
      const nextCommands = await waitForBoundedSettlement(
        finalizeAutonomyCommandsForTurn({
          commands: consumedAutonomyCommands,
          outcome: getAutonomyTurnOutcome({
            terminal,
            ...(didThrow ? { thrownError } : {}),
          }),
          priority: 'later',
        }),
        {
          signal: paramsWithTrace.toolUseContext.abortController.signal,
          timeoutMs: AUTONOMY_FINALIZATION_TIMEOUT_MS,
          abortGraceMs: AUTONOMY_ABORT_SETTLEMENT_GRACE_MS,
          operation: 'autonomy command finalization',
        },
      )
      for (const command of nextCommands) {
        enqueue(command)
      }
    } catch (error) {
      if (
        error instanceof StopConfirmationError ||
        (paramsWithTrace.toolUseContext.abortController.signal.aborted &&
          error instanceof AbortSettlementTimeoutError)
      ) {
        const failures = stopConfirmationError
          ? [...stopConfirmationError.failures, error]
          : [error]
        stopConfirmationError = new StopConfirmationError(
          'Query cleanup could not confirm autonomy finalization after cancellation',
          failures,
        )
      } else {
        logError(error)
      }
    }

    // Only end the trace if we created it — sub-agents own their traces
    if (ownsTrace) {
      try {
        endTrace(
          langfuseTrace,
          undefined,
          isAborted ? 'interrupted' : undefined,
        )
      } catch (error) {
        logError(error)
      }
      // Telemetry flushing is neither inference nor semantic turn state. It
      // must never retain the user-visible completion gate.
      void flushLangfuse().catch(error => {
        logForDebugging(`[query] Langfuse flush failed: ${String(error)}`, {
          level: 'warn',
        })
      })
    }

    // Break the closure chain: toolUseContext captures langfuseTrace which
    // holds SpanImpl → otperformance (the 571MB Performance object). Nulling
    // these after endTrace allows GC to reclaim the span tree.
    if (paramsWithTrace !== params) {
      paramsWithTrace.toolUseContext.langfuseTrace = null
      paramsWithTrace.toolUseContext.langfuseRootTrace = null
      paramsWithTrace.toolUseContext.langfuseBatchSpan = null
    }

    // Clear JSC's native Performance buffers. OTel (otperformance) references
    // globalThis.performance which stores marks/measures/resource timings in a
    // C++ Vector that never shrinks. Long-running sessions accumulate hundreds
    // of MB of dead capacity even after spans are flushed and nullified.
    const gPerf = globalThis.performance
    if (gPerf && typeof gPerf.clearMarks === 'function') {
      try {
        gPerf.clearMarks()
        gPerf.clearMeasures?.()
        gPerf.clearResourceTimings?.()
      } catch {
        // Non-critical — some environments may not support all methods
      }
    }

    if (stopConfirmationError) {
      // biome-ignore lint/correctness/noUnsafeFinally: an unconfirmed Stop must override AbortError and generator.return() so callers cannot report a false killed state.
      throw stopConfirmationError
    }
  }

  // Preserve the query's original thrown value exactly (including
  // `undefined`) after bounded cleanup has completed.
  if (didThrow) throw thrownError

  // Only reached if queryLoop returned normally. Skipped on throw (error
  // propagates through yield*) and on .return() (Return completion closes
  // both generators). This gives the same asymmetric started-without-completed
  // signal as print.ts's drainCommandQueue when the turn fails.
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal!
}

async function* queryLoop(
  params: QueryParams,
  consumedCommandUuids: string[],
  consumedAutonomyCommands: QueuedCommand[],
  postSamplingHooks: PostSamplingHookLifecycle,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  // Immutable params — never reassigned during the query loop.
  const {
    systemPrompt,
    userContext,
    systemContext,
    canUseTool,
    fallbackModel,
    querySource,
    maxTurns,
    skipCacheWrite,
  } = params
  const deps = params.deps ?? productionDeps()
  const chatGPTCodexTurnSession = params.chatGPTCodexTurnSession ?? {}
  let chatGPTCodexServerContinuationCount = 0
  const taskCompletionGuardTaskListIds = new Set<string>()
  const taskCompletionGuardRuntimeTaskIds = new Set<string>()
  const taskCompletionGuardProgressFingerprints = new Set<string>()
  let taskCompletionGuardSnapshotKey: string | undefined
  let taskCompletionGuardContinuationCount = 0
  let taskCompletionGuardContinuationAttempt = 0
  let taskCompletionGuardContinuationInFlight = false
  let taskCompletionGuardContinuationMadeProgress = false

  // Mutable cross-iteration state. The loop body destructures this at the top
  // of each iteration so reads stay bare-name (`messages`, `toolUseContext`).
  // Continue sites write `state = { ... }` instead of 9 separate assignments.
  let state: State = {
    messages: params.messages,
    toolUseContext: params.toolUseContext,
    maxOutputTokensOverride: params.maxOutputTokensOverride,
    autoCompactTracking: undefined,
    stopHookActive: undefined,
    maxOutputTokensRecoveryCount: 0,
    hasAttemptedReactiveCompact: false,
    turnCount: 1,
    pendingToolUseSummary: undefined,
    transition: undefined,
  }
  const budgetTracker = feature('TOKEN_BUDGET') ? createBudgetTracker() : null

  // task_budget.remaining tracking across compaction boundaries. Undefined
  // until first compact fires — while context is uncompacted the server can
  // see the full history and handles the countdown from {total} itself (see
  // api/api/sampling/prompt/renderer.py:292). After a compact, the server sees
  // only the summary and would under-count spend; remaining tells it the
  // pre-compact final window that got summarized away. Cumulative across
  // multiple compacts: each subtracts the final context at that compact's
  // trigger point. Loop-local (not on State) to avoid touching the 7 continue
  // sites.
  let taskBudgetRemaining: number | undefined

  // Snapshot immutable env/statsig/session state once at entry. See QueryConfig
  // for what's included and why feature() gates are intentionally excluded.
  const config = buildQueryConfig()

  // Fired once per user turn — the prompt is invariant across loop iterations,
  // so per-iteration firing would ask sideQuery the same question N times.
  // Consume point polls settledAt (never blocks). `using` disposes on all
  // generator exit paths — see MemoryPrefetch for dispose/telemetry semantics.
  using pendingMemoryPrefetch = startRelevantMemoryPrefetch(
    state.messages,
    state.toolUseContext,
  )

  // eslint-disable-next-line no-constant-condition
  queryLoopIterations: while (true) {
    // Destructure state at the top of each iteration. toolUseContext alone
    // is reassigned within an iteration (queryTracking, messages updates);
    // the rest are read-only between continue sites.
    let { toolUseContext } = state
    const {
      messages,
      autoCompactTracking,
      maxOutputTokensRecoveryCount,
      hasAttemptedReactiveCompact,
      maxOutputTokensOverride,
      pendingToolUseSummary,
      stopHookActive,
      turnCount,
    } = state

    // Skill discovery prefetch — per-iteration (uses findWritePivot guard
    // that returns early on non-write iterations). Discovery runs while the
    // model streams and tools execute; awaited post-tools alongside the
    // memory prefetch consume. Replaces the blocking assistant_turn path
    // that ran inside getAttachmentMessages (97% of those calls found
    // nothing in prod). Turn-0 user-input discovery still blocks in
    // userInputAttachments — that's the one signal where there's no prior
    // work to hide under.
    const pendingSkillPrefetch = skillPrefetch
      ? trackPromiseSettlement(
          skillPrefetch.startSkillDiscoveryPrefetch(
            null,
            messages,
            toolUseContext,
            postSamplingHooks.signal,
          ),
        )
      : undefined
    const pendingToolPrefetch = searchExtraToolsPrefetch
      ? trackPromiseSettlement(
          searchExtraToolsPrefetch.startSearchExtraToolsPrefetch(
            toolUseContext.options.tools ?? [],
            messages,
            postSamplingHooks.signal,
          ),
        )
      : undefined
    if (pendingSkillPrefetch) {
      postSamplingHooks.trackOwnedRequest(pendingSkillPrefetch.promise)
    }
    if (pendingToolPrefetch) {
      postSamplingHooks.trackOwnedRequest(pendingToolPrefetch.promise)
    }

    yield { type: 'stream_request_start' }

    queryCheckpoint('query_fn_entry')

    // Record query start for headless latency tracking (skip for subagents)
    if (!toolUseContext.agentId) {
      headlessProfilerCheckpoint('query_started')
    }

    // Initialize or increment query chain tracking
    const queryTracking = toolUseContext.queryTracking
      ? {
          chainId: toolUseContext.queryTracking.chainId,
          depth: toolUseContext.queryTracking.depth + 1,
        }
      : {
          chainId: deps.uuid(),
          depth: 0,
        }

    const queryChainIdForAnalytics =
      queryTracking.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    toolUseContext = {
      ...toolUseContext,
      queryTracking,
    }

    let messagesForQuery = getMessagesAfterCompactBoundary(messages)

    // Release toolUseResult payloads from previous turns — the next API call
    // only needs message.message.content (tool_result blocks), not the raw
    // output object. This prevents unbounded memory growth in long sessions
    // before compact triggers (a single FileRead of a 400KB file would
    // otherwise stay in mutableMessages forever).
    //
    // IMPORTANT: shallow-copy rather than mutate. messagesForQuery elements
    // are references shared with mutableMessages (UI state); deleting
    // toolUseResult in place strips it from the live message while React may
    // still be rendering it. The next query can start within milliseconds of
    // tool_result creation (model immediately calls the next tool), before
    // the UI commit lands — UserToolSuccessMessage reads
    // message.toolUseResult to delegate to tool.renderToolResultMessage, so a
    // mutation race makes tool-result rows render blank. Map to a stripped
    // copy so mutableMessages keeps the original for the UI; downstream API
    // transformations (applyToolResultBudget, snip, microcompact) already
    // build new arrays via .map(), so they compose cleanly with this copy.
    messagesForQuery = messagesForQuery.map(msg => {
      if (
        msg.type !== 'user' ||
        !('toolUseResult' in msg) ||
        (msg as { toolUseResult?: unknown }).toolUseResult === undefined
      ) {
        return msg
      }
      const copy: typeof msg = { ...msg }
      delete (copy as Message & { toolUseResult?: unknown }).toolUseResult
      return copy
    })

    let tracking = autoCompactTracking

    // Enforce per-message budget on aggregate tool result size. Runs BEFORE
    // microcompact — cached MC operates purely by tool_use_id (never inspects
    // content), so content replacement is invisible to it and the two compose
    // cleanly. No-ops when contentReplacementState is undefined (feature off).
    // Persist only for querySources that read records back on resume: agentId
    // routes to sidechain file (AgentTool resume) or session file (/resume).
    // Ephemeral runForkedAgent callers (agent_summary etc.) don't persist.
    const persistReplacements =
      querySource.startsWith('agent:') ||
      querySource.startsWith('repl_main_thread')
    messagesForQuery = await applyToolResultBudget(
      messagesForQuery,
      toolUseContext.contentReplacementState,
      persistReplacements
        ? records =>
            void recordContentReplacement(
              records,
              toolUseContext.agentId,
            ).catch(logError)
        : undefined,
      new Set(
        toolUseContext.options.tools
          .filter(t => !Number.isFinite(t.maxResultSizeChars))
          .map(t => t.name),
      ),
    )

    // Apply snip before microcompact (both may run — they are not mutually exclusive).
    // snipTokensFreed is plumbed to autocompact so its threshold check reflects
    // what snip removed; tokenCountWithEstimation alone can't see it (reads usage
    // from the protected-tail assistant, which survives snip unchanged).
    let snipTokensFreed = 0
    if (feature('HISTORY_SNIP')) {
      queryCheckpoint('query_snip_start')
      const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
      messagesForQuery = snipResult.messages
      snipTokensFreed = snipResult.tokensFreed
      if (snipResult.boundaryMessage) {
        yield snipResult.boundaryMessage
      }
      queryCheckpoint('query_snip_end')
    }

    // Apply microcompact before autocompact
    queryCheckpoint('query_microcompact_start')
    const microcompactResult = await deps.microcompact(
      messagesForQuery,
      toolUseContext,
      querySource,
    )
    messagesForQuery = microcompactResult.messages
    // Release original strings from contentReplacementState.replacements for
    // tool results whose content was replaced with the cleared message.
    if (microcompactResult.clearedToolUseIds?.length) {
      const replacements = toolUseContext?.contentReplacementState?.replacements
      if (replacements) {
        for (const id of microcompactResult.clearedToolUseIds) {
          replacements.delete(id)
        }
      }
    }
    // For cached microcompact (cache editing), defer boundary message until after
    // the API response so we can use actual cache_deleted_input_tokens.
    // Gated behind feature() so the string is eliminated from external builds.
    const pendingCacheEdits = feature('CACHED_MICROCOMPACT')
      ? microcompactResult.compactionInfo?.pendingCacheEdits
      : undefined
    queryCheckpoint('query_microcompact_end')

    // Project the collapsed context view and maybe commit more collapses.
    // Runs BEFORE autocompact so that if collapse gets us under the
    // autocompact threshold, autocompact is a no-op and we keep granular
    // context instead of a single summary.
    //
    // Nothing is yielded — the collapsed view is a read-time projection
    // over the REPL's full history. Summary messages live in the collapse
    // store, not the REPL array. This is what makes collapses persist
    // across turns: projectView() replays the commit log on every entry.
    // Within a turn, the view flows forward via state.messages at the
    // continue site (query.ts:1192), and the next projectView() no-ops
    // because the archived messages are already gone from its input.
    if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
      const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
        messagesForQuery,
        toolUseContext,
        querySource,
      )
      messagesForQuery = collapseResult.messages
    }

    const fullSystemPrompt = asSystemPrompt(
      appendSystemContext(systemPrompt, systemContext),
    )

    queryCheckpoint('query_autocompact_start')
    const { compactionResult, consecutiveFailures } = await deps.autocompact(
      messagesForQuery,
      toolUseContext,
      {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        forkContextMessages: messagesForQuery,
        chatGPTCodexTurnSession,
      },
      querySource,
      tracking,
      snipTokensFreed,
    )
    queryCheckpoint('query_autocompact_end')

    if (compactionResult) {
      const {
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionUsage,
      } = compactionResult

      logEvent('tengu_auto_compact_succeeded', {
        originalMessageCount: messages.length,
        compactedMessageCount:
          compactionResult.summaryMessages.length +
          compactionResult.attachments.length +
          compactionResult.hookResults.length,
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionInputTokens: compactionUsage?.input_tokens,
        compactionOutputTokens: compactionUsage?.output_tokens,
        compactionCacheReadTokens:
          compactionUsage?.cache_read_input_tokens ?? 0,
        compactionCacheCreationTokens:
          compactionUsage?.cache_creation_input_tokens ?? 0,
        compactionTotalTokens: compactionUsage
          ? compactionUsage.input_tokens +
            (compactionUsage.cache_creation_input_tokens ?? 0) +
            (compactionUsage.cache_read_input_tokens ?? 0) +
            compactionUsage.output_tokens
          : 0,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // task_budget: capture pre-compact final context window before
      // messagesForQuery is replaced with postCompactMessages below.
      // iterations[-1] is the authoritative final window (post server tool
      // loops); see #304930.
      if (params.taskBudget) {
        const preCompactContext =
          finalContextTokensFromLastResponse(messagesForQuery)
        taskBudgetRemaining = Math.max(
          0,
          (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext,
        )
      }

      // Reset on every compact so turnCounter/turnId reflect the MOST RECENT
      // compact. recompactionInfo (autoCompact.ts:190) already captured the
      // old values for turnsSincePreviousCompact/previousCompactTurnId before
      // the call, so this reset doesn't lose those.
      tracking = {
        compacted: true,
        turnId: deps.uuid(),
        turnCounter: 0,
        consecutiveFailures: 0,
      }

      const postCompactMessages = buildPostCompactMessages(compactionResult)

      for (const message of postCompactMessages) {
        yield message
      }

      // Continue on with the current query call using the post compact messages
      messagesForQuery = postCompactMessages
    } else if (consecutiveFailures !== undefined) {
      // Autocompact failed — propagate failure count so the circuit breaker
      // can stop retrying on the next iteration.
      tracking = {
        ...(tracking ?? { compacted: false, turnId: '', turnCounter: 0 }),
        consecutiveFailures,
      }
    }

    //TODO: no need to set toolUseContext.messages during set-up since it is updated here
    toolUseContext = {
      ...toolUseContext,
      messages: messagesForQuery,
    }

    const assistantMessages: AssistantMessage[] = []
    const toolResults: (UserMessage | AttachmentMessage)[] = []
    // @see https://docs.claude.com/en/docs/build-with-claude/tool-use
    // Note: stop_reason === 'tool_use' is unreliable -- it's not always set correctly.
    // Set during streaming whenever a tool_use block arrives — the sole
    // loop-exit signal. If false after streaming, we're done (modulo stop-hook retry).
    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false
    let serverRequestedContinuation = false

    queryCheckpoint('query_setup_start')
    const useStreamingToolExecution = config.gates.streamingToolExecution
    let streamingToolExecutor = useStreamingToolExecution
      ? new StreamingToolExecutor(
          toolUseContext.options.tools,
          canUseTool,
          toolUseContext,
        )
      : null

    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode
    let currentModel = getRuntimeMainLoopModel({
      permissionMode,
      mainLoopModel: toolUseContext.options.mainLoopModel,
      exceeds200kTokens:
        permissionMode === 'plan' &&
        doesMostRecentAssistantMessageExceed200k(messagesForQuery),
    })

    queryCheckpoint('query_setup_end')

    // Create fetch wrapper once per query session to avoid memory retention.
    // Each call to createDumpPromptsFetch creates a closure that captures the request body.
    // Creating it once means only the latest request body is retained (~700KB),
    // instead of all request bodies from the session (~500MB for long sessions).
    // Note: agentId is effectively constant during a query() call - it only changes
    // between queries (e.g., /clear command or session resume).
    const dumpPromptsFetch = config.gates.isAnt
      ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)
      : undefined

    // Block if we've hit the hard blocking limit (only applies when auto-compact is OFF)
    // This reserves space so users can still run /compact manually
    // Skip this check if compaction just happened - the compaction result is already
    // validated to be under the threshold, and tokenCountWithEstimation would use
    // stale input_tokens from kept messages that reflect pre-compaction context size.
    // Same staleness applies to snip: subtract snipTokensFreed (otherwise we'd
    // falsely block in the window where snip brought us under autocompact threshold
    // but the stale usage is still above blocking limit — before this PR that
    // window never existed because autocompact always fired on the stale count).
    // Also skip for compact/session_memory queries — these are forked agents that
    // inherit the full conversation and would deadlock if blocked here (the compact
    // agent needs to run to REDUCE the token count).
    // Also skip when reactive compact is enabled and automatic compaction is
    // allowed — the preempt's synthetic error returns before the API call,
    // so reactive compact would never see a prompt-too-long to react to.
    // Widened to walrus so RC can act as fallback when proactive fails.
    //
    // Same skip for context-collapse: its recoverFromOverflow drains
    // staged collapses on a REAL API 413, then falls through to
    // reactiveCompact. A synthetic preempt here would return before the
    // API call and starve both recovery paths. The isAutoCompactEnabled()
    // conjunct preserves the user's explicit "no automatic anything"
    // config — if they set DISABLE_AUTO_COMPACT, they get the preempt.
    let collapseOwnsIt = false
    if (feature('CONTEXT_COLLAPSE')) {
      collapseOwnsIt =
        (contextCollapse?.isContextCollapseEnabled() ?? false) &&
        isAutoCompactEnabled()
    }
    // Hoist media-recovery gate once per turn. Withholding (inside the
    // stream loop) and recovery (after) must agree; CACHED_MAY_BE_STALE can
    // flip during the 5-30s stream, and withhold-without-recover would eat
    // the message. PTL doesn't hoist because its withholding is ungated —
    // it predates the experiment and is already the control-arm baseline.
    const mediaRecoveryEnabled =
      reactiveCompact?.isReactiveCompactEnabled() ?? false
    if (
      !compactionResult &&
      querySource !== 'compact' &&
      querySource !== 'session_memory' &&
      !(
        reactiveCompact?.isReactiveCompactEnabled() && isAutoCompactEnabled()
      ) &&
      !collapseOwnsIt
    ) {
      const { isAtBlockingLimit } = calculateTokenWarningState(
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed,
        toolUseContext.options.mainLoopModel,
        toolUseContext.options.providerRuntimeConfig,
      )
      if (isAtBlockingLimit) {
        yield createAssistantAPIErrorMessage({
          content: PROMPT_TOO_LONG_ERROR_MESSAGE,
          error: 'invalid_request',
        })
        return { reason: 'blocking_limit' }
      }
    }

    // Predictive autocompact: estimate if this turn's growth will push
    // us past the context window. Uses effectiveContextWindow directly
    // (without the autocompact buffer) to avoid double-reserving with
    // getAutoCompactThreshold which already subtracts buffer.
    if (!compactionResult && isAutoCompactEnabled()) {
      const model = toolUseContext.options.mainLoopModel
      const currentTokens =
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed
      const estimatedGrowth = estimateMaxTurnGrowth(model)
      const predictiveThreshold =
        getEffectiveContextWindowSize(
          model,
          toolUseContext.options.providerRuntimeConfig,
        ) - estimatedGrowth
      if (currentTokens > predictiveThreshold) {
        const predictiveResult = await deps.autocompact(
          messagesForQuery,
          toolUseContext,
          {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
            chatGPTCodexTurnSession,
          },
          querySource,
          tracking,
          snipTokensFreed,
        )
        if (predictiveResult.compactionResult) {
          messagesForQuery = buildPostCompactMessages(
            predictiveResult.compactionResult,
          )
          snipTokensFreed = 0
          tracking = tracking
            ? {
                ...tracking,
                compacted: true,
                consecutiveFailures: predictiveResult.consecutiveFailures ?? 0,
              }
            : tracking
        }
      }
    }

    let attemptWithFallback = true

    // Slot-aware connection thinking effort. Subagent queries carry a
    // providerRuntimeConfig — use its pinned effort (possibly undefined when
    // the subagent connection pins none) INSTEAD of the main slot's, so a
    // main-slot 'off' cannot disable subagent thinking and a subagent never
    // inherits the main profile's effort. Main-agent queries (no
    // providerRuntimeConfig) resolve the main slot's connection as before.
    const connectionThinkingEffort = resolveQueryThinkingEffort(
      toolUseContext.options.providerRuntimeConfig,
    )
    const connectionThinkingEffortTransport =
      resolveQueryThinkingEffortTransport(
        toolUseContext.options.providerRuntimeConfig,
      )

    queryCheckpoint('query_api_loop_start')
    try {
      while (attemptWithFallback) {
        attemptWithFallback = false
        try {
          let streamingFallbackOccured = false
          chatGPTCodexTurnSession.lastResponseEndTurn = undefined
          serverRequestedContinuation = false
          queryCheckpoint('query_api_streaming_start')
          for await (const message of guardProviderStreamCancellation(
            deps.callModel({
              messages: prependUserContext(messagesForQuery, userContext),
              systemPrompt: fullSystemPrompt,
              // A connection profile pinned to 'off' suppresses thinking for
              // every provider (the Anthropic/Gemini paths key off
              // thinkingConfig; OpenAI-compat additionally gets
              // OPENAI_ENABLE_THINKING=0 injected at activation).
              thinkingConfig:
                connectionThinkingEffort === 'off'
                  ? { type: 'disabled' as const }
                  : toolUseContext.options.thinkingConfig,
              tools: toolUseContext.options.tools,
              signal: toolUseContext.abortController.signal,
              options: {
                async getToolPermissionContext() {
                  const appState = toolUseContext.getAppState()
                  return appState.toolPermissionContext
                },
                model: currentModel,
                ...(config.gates.fastModeEnabled && {
                  fastMode: appState.fastMode,
                }),
                toolChoice: undefined,
                isNonInteractiveSession:
                  toolUseContext.options.isNonInteractiveSession,
                fallbackModel,
                onStreamingFallback: () => {
                  streamingFallbackOccured = true
                },
                querySource,
                agents: toolUseContext.options.agentDefinitions.activeAgents,
                allowedAgentTypes:
                  toolUseContext.options.agentDefinitions.allowedAgentTypes,
                hasAppendSystemPrompt:
                  !!toolUseContext.options.appendSystemPrompt,
                maxOutputTokensOverride,
                fetchOverride: dumpPromptsFetch,
                mcpTools: appState.mcp.tools,
                hasPendingMcpServers: appState.mcp.clients.some(
                  c => c.type === 'pending',
                ),
                queryTracking,
                // Effort precedence: env CLAUDE_CODE_EFFORT_LEVEL (applied
                // downstream in resolveAppliedEffort) > user /effort (appState)
                // > connection profile thinkingEffort (slot-aware, see above)
                // > model default.
                effortValue:
                  appState.effortValue ??
                  mapThinkingEffortToEffortValue(connectionThinkingEffort),
                thinkingEffortTransport: connectionThinkingEffortTransport,
                advisorModel: appState.advisorModel,
                skipCacheWrite,
                agentId: toolUseContext.agentId,
                addNotification: toolUseContext.addNotification,
                ...(params.taskBudget && {
                  taskBudget: {
                    total: params.taskBudget.total,
                    ...(taskBudgetRemaining !== undefined && {
                      remaining: taskBudgetRemaining,
                    }),
                  },
                }),
                langfuseTrace: toolUseContext.langfuseTrace,
                providerRuntimeConfig:
                  toolUseContext.options.providerRuntimeConfig,
                chatGPTCodexTurnSession,
              },
            }),
            toolUseContext.abortController.signal,
          )) {
            // We won't use the tool_calls from the first attempt
            // We could.. but then we'd have to merge assistant messages
            // with different ids and double up on full the tool_results
            if (streamingFallbackOccured) {
              // Yield tombstones for orphaned messages so they're removed from UI and transcript.
              // These partial messages (especially thinking blocks) have invalid signatures
              // that would cause "thinking blocks cannot be modified" API errors.
              for (const msg of assistantMessages) {
                yield { type: 'tombstone' as const, message: msg }
              }
              logEvent('tengu_orphaned_messages_tombstoned', {
                orphanedMessageCount: assistantMessages.length,
                queryChainId: queryChainIdForAnalytics,
                queryDepth: queryTracking.depth,
              })

              assistantMessages.length = 0
              toolResults.length = 0
              toolUseBlocks.length = 0
              needsFollowUp = false

              // Discard pending results from the failed streaming attempt and create
              // a fresh executor. This prevents orphan tool_results (with old tool_use_ids)
              // from being yielded after the fallback response arrives.
              if (streamingToolExecutor) {
                await streamingToolExecutor.discard()
                streamingToolExecutor = new StreamingToolExecutor(
                  toolUseContext.options.tools,
                  canUseTool,
                  toolUseContext,
                )
              }
            }
            // Backfill tool_use inputs on a cloned message before yield so
            // SDK stream output and transcript serialization see legacy/derived
            // fields. The original `message` is left untouched for
            // assistantMessages.push below — it flows back to the API and
            // mutating it would break prompt caching (byte mismatch).
            let yieldMessage: typeof message = message
            if (message.type === 'assistant') {
              const assistantMsg = message as AssistantMessage
              const contentArr = Array.isArray(assistantMsg.message?.content)
                ? (assistantMsg.message.content as unknown as Array<{
                    type: string
                    input?: unknown
                    name?: string
                    [key: string]: unknown
                  }>)
                : []
              let clonedContent: typeof contentArr | undefined
              for (let i = 0; i < contentArr.length; i++) {
                const block = contentArr[i]!
                if (
                  block.type === 'tool_use' &&
                  typeof block.input === 'object' &&
                  block.input !== null
                ) {
                  const tool = findToolByName(
                    toolUseContext.options.tools,
                    block.name as string,
                  )
                  if (tool?.backfillObservableInput) {
                    const originalInput = block.input as Record<string, unknown>
                    const inputCopy = { ...originalInput }
                    tool.backfillObservableInput(inputCopy)
                    // Only yield a clone when backfill ADDED fields; skip if
                    // it only OVERWROTE existing ones (e.g. file tools
                    // expanding file_path). Overwrites change the serialized
                    // transcript and break VCR fixture hashes on resume,
                    // while adding nothing the SDK stream needs — hooks get
                    // the expanded path via toolExecution.ts separately.
                    const addedFields = Object.keys(inputCopy).some(
                      k => !(k in originalInput),
                    )
                    if (addedFields) {
                      clonedContent ??= [...contentArr]
                      clonedContent[i] = { ...block, input: inputCopy }
                    }
                  }
                }
              }
              if (clonedContent) {
                yieldMessage = {
                  ...message,
                  message: {
                    ...(assistantMsg.message ?? {}),
                    content: clonedContent,
                  },
                } as typeof message
              }
            }
            // Withhold recoverable errors (prompt-too-long, max-output-tokens)
            // until we know whether recovery (collapse drain / reactive
            // compact / truncation retry) can succeed. Still pushed to
            // assistantMessages so the recovery checks below find them.
            // Either subsystem's withhold is sufficient — they're
            // independent so turning one off doesn't break the other's
            // recovery path.
            //
            // feature() only works in if/ternary conditions (bun:bundle
            // tree-shaking constraint), so the collapse check is nested
            // rather than composed.
            let withheld = false
            if (feature('CONTEXT_COLLAPSE')) {
              if (
                contextCollapse?.isWithheldPromptTooLong(
                  message as Message,
                  isPromptTooLongMessage as (msg: Message) => boolean,
                  querySource,
                )
              ) {
                withheld = true
              }
            }
            if (reactiveCompact?.isWithheldPromptTooLong(message as Message)) {
              withheld = true
            }
            if (
              mediaRecoveryEnabled &&
              reactiveCompact?.isWithheldMediaSizeError(message as Message)
            ) {
              withheld = true
            }
            if (isWithheldMaxOutputTokens(message)) {
              withheld = true
            }
            if (!withheld) {
              yield yieldMessage
            }
            if (message.type === 'assistant') {
              const assistantMessage = message as AssistantMessage
              assistantMessages.push(assistantMessage)

              const msgToolUseBlocks = (
                Array.isArray(assistantMessage.message?.content)
                  ? assistantMessage.message.content
                  : []
              ).filter(
                (content: { type: string }) => content.type === 'tool_use',
              ) as ToolUseBlock[]
              if (msgToolUseBlocks.length > 0) {
                toolUseBlocks.push(...msgToolUseBlocks)
                needsFollowUp = true
              }

              if (
                streamingToolExecutor &&
                !toolUseContext.abortController.signal.aborted
              ) {
                for (const toolBlock of msgToolUseBlocks) {
                  streamingToolExecutor.addTool(toolBlock, assistantMessage)
                }
              }
            }

            if (
              streamingToolExecutor &&
              !toolUseContext.abortController.signal.aborted
            ) {
              for (const result of streamingToolExecutor.getCompletedResults()) {
                if (result.message) {
                  yield result.message
                  toolResults.push(
                    ...normalizeMessagesForAPI(
                      [result.message],
                      toolUseContext.options.tools,
                    ).filter(_ => _.type === 'user'),
                  )
                }
              }
            }
          }
          serverRequestedContinuation =
            chatGPTCodexTurnSession.lastResponseEndTurn === false
          if (serverRequestedContinuation) {
            needsFollowUp = true
            if (toolUseBlocks.length === 0) {
              chatGPTCodexServerContinuationCount += 1
            }
          }
          queryCheckpoint('query_api_streaming_end')

          // Yield deferred microcompact boundary message using actual API-reported
          // token deletion count instead of client-side estimates.
          // Entire block gated behind feature() so the excluded string
          // is eliminated from external builds.
          if (feature('CACHED_MICROCOMPACT') && pendingCacheEdits) {
            const lastAssistant = assistantMessages.at(-1)
            // The API field is cumulative/sticky across requests, so we
            // subtract the baseline captured before this request to get the delta.
            const usage = lastAssistant?.message.usage
            const cumulativeDeleted = usage
              ? ((usage as unknown as Record<string, number>)
                  .cache_deleted_input_tokens ?? 0)
              : 0
            const deletedTokens = Math.max(
              0,
              cumulativeDeleted - pendingCacheEdits.baselineCacheDeletedTokens,
            )
            if (deletedTokens > 0) {
              yield createMicrocompactBoundaryMessage(
                pendingCacheEdits.trigger,
                0,
                deletedTokens,
                pendingCacheEdits.deletedToolIds,
                [],
              )
            }
          }
        } catch (innerError) {
          if (innerError instanceof FallbackTriggeredError && fallbackModel) {
            // Fallback was triggered - switch model and retry
            currentModel = fallbackModel
            attemptWithFallback = true

            // Clear assistant messages since we'll retry the entire request
            yield* yieldMissingToolResultBlocks(
              assistantMessages,
              'Model fallback triggered',
            )
            assistantMessages.length = 0
            toolResults.length = 0
            toolUseBlocks.length = 0
            needsFollowUp = false
            serverRequestedContinuation = false

            // Discard pending results from the failed attempt and create a
            // fresh executor. This prevents orphan tool_results (with old
            // tool_use_ids) from leaking into the retry.
            if (streamingToolExecutor) {
              await streamingToolExecutor.discard()
              streamingToolExecutor = new StreamingToolExecutor(
                toolUseContext.options.tools,
                canUseTool,
                toolUseContext,
              )
            }

            // Update tool use context with new model
            toolUseContext.options.mainLoopModel = fallbackModel

            // Thinking signatures are model-bound: replaying a protected-thinking
            // block (e.g. capybara) to an unprotected fallback (e.g. opus) 400s.
            // Strip before retry so the fallback model gets clean history.
            if (process.env.USER_TYPE === 'ant') {
              messagesForQuery = stripSignatureBlocks(messagesForQuery)
            }

            // Log the fallback event
            logEvent('tengu_model_fallback_triggered', {
              original_model:
                innerError.originalModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fallback_model:
                fallbackModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              entrypoint:
                'cli' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              queryChainId: queryChainIdForAnalytics,
              queryDepth: queryTracking.depth,
            })

            // Yield system message about fallback — use 'warning' level so
            // users see the notification without needing verbose mode
            yield createSystemMessage(
              `Switched to ${modelDisplayString(innerError.fallbackModel)} due to high demand for ${modelDisplayString(innerError.originalModel)}`,
              'warning',
            )

            continue
          }
          throw innerError
        }
      }
    } catch (error) {
      if (error instanceof StopConfirmationError) {
        throw error
      }
      // Some transports throw while their AbortSignal is being torn down.
      // Cancellation is control flow, not a model failure: let the unified
      // abort path below synthesize missing tool results and the interruption
      // marker without logging or surfacing a spurious API error.
      if (isAbortError(error)) {
        // A provider can report AbortError just before its signal listener has
        // propagated the abort to this turn. Normalize that ordering race so
        // execution cannot fall through to cache warnings or post-sampling
        // side queries as though the request completed successfully.
        if (!toolUseContext.abortController.signal.aborted) {
          toolUseContext.abortController.abort(error)
        }
      } else if (!toolUseContext.abortController.signal.aborted) {
        logError(error)
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logEvent('tengu_query_error', {
          assistantMessages: assistantMessages.length,
          toolUses: assistantMessages.flatMap(_ =>
            (Array.isArray(_.message?.content)
              ? (_.message.content as Array<{ type: string }>)
              : []
            ).filter(content => content.type === 'tool_use'),
          ).length,

          queryChainId: queryChainIdForAnalytics,
          queryDepth: queryTracking.depth,
        })

        // Handle image size/resize errors with user-friendly messages
        if (
          error instanceof ImageSizeError ||
          error instanceof ImageResizeError
        ) {
          yield createAssistantAPIErrorMessage({
            content: error.message,
          })
          return { reason: 'image_error' }
        }

        // Generally queryModelWithStreaming should not throw errors but instead
        // yield them as synthetic assistant messages. However if it does throw
        // due to a bug, we may end up in a state where we have already emitted
        // a tool_use block but will stop before emitting the tool_result.
        yield* yieldMissingToolResultBlocks(assistantMessages, errorMessage)

        // Surface the real error instead of a misleading "[Request interrupted
        // by user]" — this path is a model/runtime failure, not a user action.
        // SDK consumers were seeing phantom interrupts on e.g. Node 18's missing
        // Array.prototype.with(), masking the actual cause.
        yield createAssistantAPIErrorMessage({
          content: errorMessage,
        })

        // To help track down bugs, log loudly for ants
        logAntError('Query error', error)
        return { reason: 'model_error', error }
      }
    }

    // Handle cancellation before cache warnings or post-sampling hooks. Those
    // hooks may start their own model requests; running them for a cancelled
    // partial response made remote inference continue after Esc.
    if (toolUseContext.abortController.signal.aborted) {
      if (streamingToolExecutor) {
        // Consume remaining results - executor generates synthetic tool_results for
        // aborted tools since it checks the abort signal in executeTool()
        for await (const update of streamingToolExecutor.getRemainingResults()) {
          if (update.message) {
            yield update.message
          }
        }
      } else {
        yield* yieldMissingToolResultBlocks(
          assistantMessages,
          'Interrupted by user',
        )
      }
      // chicago MCP: auto-unhide + lock release on interrupt. Same cleanup
      // as the natural turn-end path in stopHooks.ts. Main thread only —
      // see stopHooks.ts for the subagent-releasing-main's-lock rationale.
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // Failures are silent — this is dogfooding cleanup, not critical path
        }
      }

      // Skip the interruption message for submit-interrupts — the queued
      // user message that follows provides sufficient context.
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: false,
        })
      }
      return { reason: 'aborted_streaming' }
    }

    // 检测缓存命中率并在需要时 yield 警告消息
    // 必须在 executePostSamplingHooks 之前执行，确保警告消息在工具结果之前显示
    if (
      assistantMessages.length > 0 &&
      !toolUseContext.options.isNonInteractiveSession
    ) {
      const lastAssistant = assistantMessages.at(-1)
      const usage = lastAssistant?.message?.usage as
        | {
            input_tokens: number
            cache_creation_input_tokens: number
            cache_read_input_tokens: number
          }
        | undefined
      if (usage && isCacheWarningEnabled()) {
        const warningInfo = shouldShowCacheWarning(
          usage,
          querySource,
          getCacheThreshold(),
        )
        if (warningInfo) {
          yield createCacheWarningMessage(warningInfo)
        }
      }
    }

    // Execute post-sampling hooks after model response is complete
    const isInputlessCodexServerContinuation =
      serverRequestedContinuation && toolUseBlocks.length === 0
    if (
      isInputlessCodexServerContinuation &&
      chatGPTCodexServerContinuationCount >
        MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS
    ) {
      const error = new Error(
        `ChatGPT Codex exceeded ${MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS} server continuations`,
      )
      const errorMessage = createAssistantAPIErrorMessage({
        content: error.message,
        apiError: 'api_error',
        errorDetails: error.message,
      })
      yield errorMessage
      await executeOwnedStopFailureHooks(errorMessage, toolUseContext)
      return { reason: 'model_error', error }
    }
    if (assistantMessages.length > 0 && !isInputlessCodexServerContinuation) {
      postSamplingHooks.schedule(
        messagesForQuery.concat(assistantMessages),
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
      )
    }

    // Yield the previous turn's optional tool-use summary only when it already
    // resolved under model streaming. A slow/hung Haiku request must not retain
    // the foreground completion gate after the final assistant text is shown;
    // PostSamplingHookLifecycle still owns its exact promise for cancellation.
    if (pendingToolUseSummary) {
      const settlement = pendingToolUseSummary.peek()
      if (settlement.status === 'fulfilled') {
        if (settlement.value) {
          yield settlement.value
        }
      } else if (settlement.status === 'rejected') {
        throw settlement.reason
      }
    }

    // API error check must fire regardless of needsFollowUp: if the last
    // assistant message is an API error (e.g. "API Error: terminated" from
    // a mid-stream disconnect), the model never produced a valid response.
    // Skipping this when needsFollowUp is true (because a prior partial
    // tool_use needs execution) creates a tool-execution death spiral on a
    // truncated/invalid assistant turn.
    const lastAssistantMsg = assistantMessages.at(-1)
    if (lastAssistantMsg?.isApiErrorMessage) {
      await executeOwnedStopFailureHooks(lastAssistantMsg, toolUseContext)
      return {
        reason: 'model_error' as const,
        error:
          lastAssistantMsg.error ?? lastAssistantMsg.apiError ?? 'api_error',
      }
    }

    // The Codex backend may explicitly request another sample with
    // response.completed.end_turn=false even though it emitted no tool call.
    // This is a server continuation inside the same user turn: append only the
    // assistant output and sample again. Running the ordinary post-tool path
    // here would consume queued user input and inject attachment/memory/skill
    // messages that the official Codex client deliberately leaves for later.
    if (isInputlessCodexServerContinuation) {
      const continuationMessages = assistantMessages.filter(
        message =>
          Array.isArray(message.message?.content) &&
          message.message.content.length > 0,
      )
      state = {
        // Empty Codex completions carry no replayable input. The sticky turn
        // state header is sufficient for the next sample; retaining empty
        // assistant messages only grows local history while the Responses
        // converter drops them from the wire request.
        messages: messagesForQuery.concat(continuationMessages),
        toolUseContext: { ...toolUseContext, queryTracking },
        autoCompactTracking: tracking,
        maxOutputTokensRecoveryCount: 0,
        hasAttemptedReactiveCompact: false,
        maxOutputTokensOverride: undefined,
        pendingToolUseSummary: undefined,
        stopHookActive,
        // response.completed.end_turn=false is another sample within the
        // current user turn, not an autonomous/tool turn. It must not consume
        // maxTurns (notably compact forks deliberately use maxTurns=1).
        turnCount,
        transition: { reason: 'codex_server_continuation' },
      }
      continue
    }

    if (!needsFollowUp) {
      const lastMessage = assistantMessages.at(-1)

      // Prompt-too-long recovery: the streaming loop withheld the error
      // (see withheldByCollapse / withheldByReactive above). Try collapse
      // drain first (cheap, keeps granular context), then reactive compact
      // (full summary). Single-shot on each — if a retry still 413's,
      // the next stage handles it or the error surfaces.
      const isWithheld413 =
        lastMessage?.type === 'assistant' &&
        lastMessage.isApiErrorMessage &&
        isPromptTooLongMessage(lastMessage)
      // Media-size rejections (image/PDF/many-image) are recoverable via
      // reactive compact's strip-retry. Unlike PTL, media errors skip the
      // collapse drain — collapse doesn't strip images. mediaRecoveryEnabled
      // is the hoisted gate from before the stream loop (same value as the
      // withholding check — these two must agree or a withheld message is
      // lost). If the oversized media is in the preserved tail, the
      // post-compact turn will media-error again; hasAttemptedReactiveCompact
      // prevents a spiral and the error surfaces.
      const isWithheldMedia =
        mediaRecoveryEnabled &&
        reactiveCompact?.isWithheldMediaSizeError(lastMessage as Message)
      if (isWithheld413) {
        // First: drain all staged context-collapses. Gated on the PREVIOUS
        // transition not being collapse_drain_retry — if we already drained
        // and the retry still 413'd, fall through to reactive compact.
        if (
          feature('CONTEXT_COLLAPSE') &&
          contextCollapse &&
          state.transition?.reason !== 'collapse_drain_retry'
        ) {
          const drained = contextCollapse.recoverFromOverflow(
            messagesForQuery,
            querySource,
          )
          if (drained.committed > 0) {
            const next: State = {
              messages: drained.messages,
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount,
              transition: {
                reason: 'collapse_drain_retry',
                committed: drained.committed,
              },
            }
            state = next
            continue
          }
        }
      }
      if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
        const compacted = await reactiveCompact.tryReactiveCompact({
          hasAttempted: hasAttemptedReactiveCompact,
          querySource,
          aborted: toolUseContext.abortController.signal.aborted,
          messages: messagesForQuery,
          cacheSafeParams: {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
            chatGPTCodexTurnSession,
          },
        })

        if (compacted) {
          // task_budget: same carryover as the proactive path above.
          // messagesForQuery still holds the pre-compact array here (the
          // 413-failed attempt's input).
          if (params.taskBudget) {
            const preCompactContext =
              finalContextTokensFromLastResponse(messagesForQuery)
            taskBudgetRemaining = Math.max(
              0,
              (taskBudgetRemaining ?? params.taskBudget.total) -
                preCompactContext,
            )
          }

          const postCompactMessages = buildPostCompactMessages(compacted)
          for (const msg of postCompactMessages) {
            yield msg
          }
          const next: State = {
            messages: postCompactMessages,
            toolUseContext,
            autoCompactTracking: undefined,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact: true,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'reactive_compact_retry' },
          }
          state = next
          continue
        }

        // No recovery — surface the withheld error and exit. Do NOT fall
        // through to stop hooks: the model never produced a valid response,
        // so hooks have nothing meaningful to evaluate. Running stop hooks
        // on prompt-too-long creates a death spiral: error → hook blocking
        // → retry → error → … (the hook injects more tokens each cycle).
        yield lastMessage!
        await executeOwnedStopFailureHooks(lastMessage!, toolUseContext)
        return { reason: isWithheldMedia ? 'image_error' : 'prompt_too_long' }
      } else if (feature('CONTEXT_COLLAPSE') && isWithheld413) {
        // reactiveCompact compiled out but contextCollapse withheld and
        // couldn't recover (staged queue empty/stale). Surface. Same
        // early-return rationale — don't fall through to stop hooks.
        yield lastMessage
        await executeOwnedStopFailureHooks(lastMessage, toolUseContext)
        return { reason: 'prompt_too_long' }
      }

      // Check for max_output_tokens and inject recovery message. The error
      // was withheld from the stream above; only surface it if recovery
      // exhausts.
      if (isWithheldMaxOutputTokens(lastMessage)) {
        // Escalating retry: if we used the capped 8k default and hit the
        // limit, retry the SAME request at 64k — no meta message, no
        // multi-turn dance. This fires once per turn (guarded by the
        // override check), then falls through to multi-turn recovery if
        // 64k also hits the cap.
        // 3P default: false (not validated on Bedrock/Vertex)
        const capEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_otk_slot_v1',
          false,
        )
        if (
          capEnabled &&
          maxOutputTokensOverride === undefined &&
          !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
        ) {
          logEvent('tengu_max_tokens_escalate', {
            escalatedTo: ESCALATED_MAX_TOKENS,
          })
          const next: State = {
            messages: messagesForQuery,
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'max_output_tokens_escalate' },
          }
          state = next
          continue
        }

        if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
          const recoveryMessage = createUserMessage({
            content:
              `Output token limit hit. Resume directly — no apology, no recap of what you were doing. ` +
              `Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.`,
            isMeta: true,
          })

          const next: State = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              recoveryMessage,
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: {
              reason: 'max_output_tokens_recovery',
              attempt: maxOutputTokensRecoveryCount + 1,
            },
          }
          state = next
          continue
        }

        // Recovery exhausted — surface the withheld error now.
        yield lastMessage
      }

      const stopHookResult = yield* handleStopHooks(
        messagesForQuery,
        assistantMessages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
        stopHookActive,
      )

      if (stopHookResult.preventContinuation) {
        return { reason: 'stop_hook_prevented' }
      }

      if (stopHookResult.blockingErrors.length > 0) {
        const next: State = {
          messages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...stopHookResult.blockingErrors,
          ],
          toolUseContext,
          autoCompactTracking: tracking,
          maxOutputTokensRecoveryCount: 0,
          // Preserve the reactive compact guard — if compact already ran and
          // couldn't recover from prompt-too-long, retrying after a stop-hook
          // blocking error will produce the same result. Resetting to false
          // here caused an infinite loop: compact → still too long → error →
          // stop hook blocking → compact → … burning thousands of API calls.
          hasAttemptedReactiveCompact,
          maxOutputTokensOverride: undefined,
          pendingToolUseSummary: undefined,
          stopHookActive: true,
          turnCount,
          transition: { reason: 'stop_hook_blocking' },
        }
        state = next
        continue
      }

      let tokenBudgetOwnsCompletion = false
      if (feature('TOKEN_BUDGET')) {
        const configuredTurnTokenBudget = getCurrentTurnTokenBudget()
        const decision = checkTokenBudget(
          budgetTracker!,
          toolUseContext.agentId,
          configuredTurnTokenBudget,
          getTurnOutputTokens(),
        )

        if (decision.action === 'continue') {
          incrementBudgetContinuationCount()
          logForDebugging(
            `Token budget continuation #${decision.continuationCount}: ${decision.pct}% (${decision.turnTokens.toLocaleString()} / ${decision.budget.toLocaleString()})`,
          )
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              createUserMessage({
                content: decision.nudgeMessage,
                isMeta: true,
              }),
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'token_budget_continuation' },
          }
          continue
        }

        if (decision.completionEvent) {
          if (decision.completionEvent.diminishingReturns) {
            logForDebugging(
              `Token budget early stop: diminishing returns at ${decision.completionEvent.pct}%`,
            )
          }
          logEvent('tengu_token_budget_completed', {
            ...decision.completionEvent,
            queryChainId: queryChainIdForAnalytics,
            queryDepth: queryTracking.depth,
          })
        }

        tokenBudgetOwnsCompletion =
          configuredTurnTokenBudget !== null && configuredTurnTokenBudget > 0
      }

      if (tokenBudgetOwnsCompletion) {
        return { reason: 'completed' }
      }

      if (
        taskCompletionGuardTaskListIds.size > 0 &&
        toolUseContext.agentId === undefined &&
        toolUseContext.getAppState().toolPermissionContext.mode !== 'plan' &&
        !hasQueuedMainThreadUserInput()
      ) {
        while (true) {
          if (toolUseContext.abortController.signal.aborted) {
            return { reason: 'aborted_streaming' }
          }
          if (hasQueuedMainThreadUserInput()) {
            return { reason: 'completed' }
          }

          // A completion notification is already committed to this query once
          // it becomes an attachment. Keep the generator open so REPL/SDK/ACP
          // do not publish a false success between background completion and
          // the model turn that consumes that completion.
          const queueState = getTaskCompletionGuardQueueState()
          if (queueState.taskNotifications.length > 0) {
            const nextTurnCount = turnCount + 1
            if (maxTurns && nextTurnCount > maxTurns) {
              yield createAttachmentMessage({
                type: 'max_turns_reached',
                maxTurns,
                turnCount: nextTurnCount,
              })
              return { reason: 'max_turns', turnCount: nextTurnCount }
            }

            // Build all ambient attachments before claiming or removing queue
            // entries. This preserves teammate inbox messages and still lets
            // us verify every notification's exact queued-command attachment.
            const builtAttachments = await getAttachments(
              null,
              toolUseContext,
              null,
              queueState.taskNotifications,
              messagesForQuery.concat(assistantMessages),
              querySource,
            )
            const notificationAttachments = builtAttachments.filter(
              attachment =>
                attachment.type === 'queued_command' &&
                attachment.commandMode === 'task-notification',
            )
            const ambientAttachments = builtAttachments.filter(
              attachment =>
                attachment.type !== 'queued_command' ||
                attachment.commandMode !== 'task-notification',
            )
            const notificationMessages: AttachmentMessage[] = []
            let notificationMadeProgress = ambientAttachments.some(
              attachment => attachment.type === 'teammate_mailbox',
            )
            for (const attachment of ambientAttachments) {
              const message = createAttachmentMessage(attachment)
              yield message
              notificationMessages.push(message)
            }

            if (
              notificationAttachments.length !==
              queueState.taskNotifications.length
            ) {
              const error = new Error(
                'Task completion guard could not build every task-notification attachment',
              )
              const errorMessage = createAssistantAPIErrorMessage({
                content: error.message,
                apiError: 'api_error',
                error: 'unknown',
                errorDetails: error.message,
              })
              yield errorMessage
              await executeOwnedStopFailureHooks(errorMessage, toolUseContext)
              return { reason: 'model_error', error }
            }

            for (const [
              index,
              command,
            ] of queueState.taskNotifications.entries()) {
              const notificationAttachment = notificationAttachments[index]
              if (!notificationAttachment) continue

              const claim = await claimConsumableQueuedAutonomyCommands([
                command,
              ])
              if (claim.staleCommands.length > 0) {
                removeFromQueue(claim.staleCommands)
              }
              if (!claim.attachmentCommands.includes(command)) {
                continue
              }
              if (claim.claimedCommands.includes(command)) {
                consumedAutonomyCommands.push(command)
              }
              if (command.uuid) {
                consumedCommandUuids.push(command.uuid)
                notifyCommandLifecycle(command.uuid, 'started')
              }
              const notificationMessage = createAttachmentMessage(
                notificationAttachment,
              )
              const notificationFingerprint =
                getTaskCompletionGuardNotificationFingerprint(command)
              if (
                !taskCompletionGuardProgressFingerprints.has(
                  notificationFingerprint,
                )
              ) {
                taskCompletionGuardProgressFingerprints.add(
                  notificationFingerprint,
                )
                notificationMadeProgress = true
              }
              // This is the commit boundary: the exact attachment already
              // exists, and the following yield publishes it atomically with
              // removal. If the consumer closes afterward, later commands in
              // the batch remain untouched and recoverable.
              removeFromQueue([command])
              yield notificationMessage
              notificationMessages.push(notificationMessage)
            }
            if (notificationMessages.length === 0) continue
            if (
              taskCompletionGuardContinuationInFlight &&
              notificationMadeProgress
            ) {
              taskCompletionGuardContinuationMadeProgress = true
            }

            state = {
              messages: messagesForQuery.concat(
                assistantMessages,
                notificationMessages,
              ),
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount: 0,
              hasAttemptedReactiveCompact: false,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount: nextTurnCount,
              transition: { reason: 'next_turn' },
            }
            continue queryLoopIterations
          }
          if (queueState.requiresTurnHandoff) {
            return { reason: 'completed' }
          }
          const nextMailboxTurnCount = turnCount + 1
          const mailboxAttachments =
            (await deps.getTaskCompletionGuardMailboxAttachments?.(
              toolUseContext,
              querySource,
            )) ?? []
          if (mailboxAttachments.length > 0) {
            const mailboxMessages = mailboxAttachments.map(
              createAttachmentMessage,
            )
            for (const message of mailboxMessages) yield message
            // The helper commits mailbox delivery while building these
            // attachments. Publish them before enforcing maxTurns so the
            // transcript keeps the result even when no further model call is
            // allowed, and report max_turns instead of false completion.
            if (maxTurns && nextMailboxTurnCount > maxTurns) {
              yield createAttachmentMessage({
                type: 'max_turns_reached',
                maxTurns,
                turnCount: nextMailboxTurnCount,
              })
              return {
                reason: 'max_turns',
                turnCount: nextMailboxTurnCount,
              }
            }
            if (taskCompletionGuardContinuationInFlight) {
              taskCompletionGuardContinuationMadeProgress = true
            }
            state = {
              messages: messagesForQuery.concat(
                assistantMessages,
                mailboxMessages,
              ),
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount: 0,
              hasAttemptedReactiveCompact: false,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount: nextMailboxTurnCount,
              transition: { reason: 'next_turn' },
            }
            continue queryLoopIterations
          }
          if (hasRetryingTaskNotificationDeliveryAddressedTo(undefined)) {
            await waitForTaskCompletionGuardRuntimeChange(
              toolUseContext.abortController.signal,
            )
            continue
          }
          if (hasParkedTaskNotificationDeliveryAddressedTo(undefined)) {
            const error = new TaskNotificationDeliveryParkedError()
            const errorMessage = createAssistantAPIErrorMessage({
              content: error.message,
              apiError: 'api_error',
              error: 'unknown',
              errorDetails: error.message,
            })
            yield errorMessage
            await executeOwnedStopFailureHooks(errorMessage, toolUseContext)
            return { reason: 'model_error', error }
          }

          // Task tools resolve their list implicitly. TeamCreate/TeamDelete can
          // change that identity during one query, so keep every list touched
          // instead of inspecting only the list that happens to be current.
          const currentTaskListId = getTaskListId()
          taskCompletionGuardTaskListIds.add(currentTaskListId)
          let inspection: UnfinishedTaskInspection
          try {
            const inspections: Array<{
              taskListId: string
              inspection: UnfinishedTaskInspection
            }> = []
            for (const taskListId of taskCompletionGuardTaskListIds) {
              inspections.push({
                taskListId,
                inspection: inspectUnfinishedTasks(
                  taskListId,
                  await deps.listTasks(taskListId),
                ),
              })
            }
            inspection = mergeUnfinishedTaskInspections(
              inspections,
              currentTaskListId,
            )
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error)
            logError(error)
            const errorMessage = createAssistantAPIErrorMessage({
              content: `Task completion guard could not inspect TaskList: ${detail}`,
              apiError: 'api_error',
              error: 'unknown',
              errorDetails: detail,
            })
            yield errorMessage
            await executeOwnedStopFailureHooks(errorMessage, toolUseContext)
            return { reason: 'model_error', error }
          }

          if (toolUseContext.abortController.signal.aborted) {
            return { reason: 'aborted_streaming' }
          }
          if (hasQueuedMainThreadUserInput()) {
            return { reason: 'completed' }
          }
          const refreshedQueueState = getTaskCompletionGuardQueueState()
          if (
            refreshedQueueState.taskNotifications.length > 0 ||
            refreshedQueueState.requiresTurnHandoff ||
            hasRetryingTaskNotificationDeliveryAddressedTo(undefined) ||
            hasParkedTaskNotificationDeliveryAddressedTo(undefined)
          ) {
            continue
          }

          const previousSnapshotKey = taskCompletionGuardSnapshotKey
          const snapshotChanged = inspection.snapshotKey !== previousSnapshotKey
          if (snapshotChanged) {
            taskCompletionGuardSnapshotKey = inspection.snapshotKey
            taskCompletionGuardContinuationCount = 0
            taskCompletionGuardProgressFingerprints.clear()
            taskCompletionGuardContinuationMadeProgress = false
            taskCompletionGuardContinuationInFlight = false
            taskCompletionGuardContinuationAttempt = 0
          }

          const runtimeTasks = toolUseContext.getAppState().tasks ?? {}
          for (const taskId of taskCompletionGuardRuntimeTaskIds) {
            const task = runtimeTasks[taskId]
            if (!task || (isTerminalTaskStatus(task.status) && task.notified)) {
              taskCompletionGuardRuntimeTaskIds.delete(taskId)
            }
          }
          const guardedOwners = new Set(
            inspection.publicTasks.flatMap(task =>
              task.owner ? [task.owner] : [],
            ),
          )
          const runtimeState = getTaskCompletionGuardRuntimeState(
            runtimeTasks,
            taskCompletionGuardRuntimeTaskIds,
            guardedOwners,
          )
          let hasRunningExternalTeammate = false
          for (const taskListId of taskCompletionGuardTaskListIds) {
            for (const teammate of deps.getTeammateStatuses?.(taskListId) ??
              []) {
              if (teammate.status !== 'running') continue
              // In-process teammates publish exact liveness in AppState. Their
              // team-file isActive flag is legacy/sticky and can remain true
              // while the runner is idle. Trust file status only for external
              // pane backends; old records without either discriminator are
              // also in-process.
              if (
                teammate.backendType === 'in-process' ||
                (!teammate.tmuxPaneId && !teammate.backendType)
              ) {
                continue
              }
              hasRunningExternalTeammate = true
            }
          }
          if (!inspection.hasPublicUnfinishedTasks) {
            if (
              runtimeState.hasActiveWork ||
              runtimeState.hasPendingDelivery ||
              hasRunningExternalTeammate
            ) {
              await waitForTaskCompletionGuardRuntimeChange(
                toolUseContext.abortController.signal,
              )
              continue
            }
            taskCompletionGuardContinuationInFlight = false
            break
          }
          if (
            inspection.actionableTasks.length === 0 &&
            (runtimeState.hasActiveWork ||
              runtimeState.hasPendingDelivery ||
              hasRunningExternalTeammate)
          ) {
            await waitForTaskCompletionGuardRuntimeChange(
              toolUseContext.abortController.signal,
            )
            continue
          }

          const tasksForGuard =
            inspection.actionableTasks.length > 0
              ? inspection.actionableTasks
              : inspection.unfinishedTasks
          const nextTurnCount = turnCount + 1
          if (maxTurns && nextTurnCount > maxTurns) {
            yield createAttachmentMessage({
              type: 'max_turns_reached',
              maxTurns,
              turnCount: nextTurnCount,
            })
            return { reason: 'max_turns', turnCount: nextTurnCount }
          }

          if (!snapshotChanged && taskCompletionGuardContinuationInFlight) {
            taskCompletionGuardContinuationCount =
              taskCompletionGuardContinuationMadeProgress
                ? 0
                : taskCompletionGuardContinuationCount + 1
          }
          taskCompletionGuardContinuationMadeProgress = false

          if (
            taskCompletionGuardContinuationCount >=
            MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS
          ) {
            // Actionable main-thread work may coexist with a slow background
            // worker. Let the model use the normal continuation budget for
            // parallel progress, but never turn that budget into a false
            // terminal while correlated runtime work is still genuinely
            // active or its completion notification is being assembled.
            if (
              runtimeState.hasActiveWork ||
              runtimeState.hasPendingDelivery ||
              hasRunningExternalTeammate
            ) {
              await waitForTaskCompletionGuardRuntimeChange(
                toolUseContext.abortController.signal,
              )
              continue
            }
            const content = buildUnfinishedTaskNoProgressError(tasksForGuard)
            const errorMessage = createAssistantAPIErrorMessage({
              content,
              apiError: 'api_error',
              error: 'unknown',
              errorDetails: content,
            })
            yield errorMessage
            await executeOwnedStopFailureHooks(errorMessage, toolUseContext)
            return {
              reason: 'unfinished_tasks',
              taskIds: tasksForGuard.map(task => task.id),
              noProgressContinuations: taskCompletionGuardContinuationCount,
            }
          }

          taskCompletionGuardContinuationInFlight = true
          taskCompletionGuardContinuationAttempt++
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              createUserMessage({
                content:
                  inspection.actionableTasks.length > 0
                    ? buildUnfinishedTaskContinuationPrompt(
                        inspection.actionableTasks,
                        currentTaskListId,
                      )
                    : buildUnfinishedTaskCoordinationPrompt(
                        inspection.unfinishedTasks,
                        currentTaskListId,
                      ),
                isMeta: true,
              }),
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount: nextTurnCount,
            transition: {
              reason: 'unfinished_tasks_continuation',
              attempt: taskCompletionGuardContinuationAttempt,
            },
          }
          continue queryLoopIterations
        }
      }

      return { reason: 'completed' }
    }

    let shouldPreventContinuation = false
    let updatedToolUseContext = toolUseContext

    const taskCompletionGuardToolUsedThisRound =
      toolUseContext.agentId === undefined &&
      toolUseBlocks.some(block => isTaskCompletionGuardToolName(block.name))
    const taskListIdBeforeToolExecution = taskCompletionGuardToolUsedThisRound
      ? getTaskListId()
      : undefined

    queryCheckpoint('query_tool_execution_start')

    if (streamingToolExecutor) {
      logEvent('tengu_streaming_tool_execution_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    } else {
      logEvent('tengu_streaming_tool_execution_not_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    const toolUpdates = streamingToolExecutor
      ? streamingToolExecutor.getRemainingResults()
      : guardAsyncIterableCancellation(
          runTools(
            toolUseBlocks,
            assistantMessages,
            canUseTool,
            toolUseContext,
          ),
          toolUseContext.abortController.signal,
          { operation: 'non-streaming tool execution' },
        )

    for await (const update of toolUpdates) {
      if (update.message) {
        yield update.message

        if (
          update.message.type === 'attachment' &&
          update.message.attachment!.type === 'hook_stopped_continuation'
        ) {
          shouldPreventContinuation = true
        }

        toolResults.push(
          ...normalizeMessagesForAPI(
            [update.message],
            toolUseContext.options.tools,
          ).filter(_ => _.type === 'user'),
        )
      }
      if (update.newContext) {
        updatedToolUseContext = {
          ...update.newContext,
          queryTracking,
        }
      }
    }
    queryCheckpoint('query_tool_execution_end')

    if (taskListIdBeforeToolExecution !== undefined) {
      // Capture both sides of the batch. Normally they are identical; keeping
      // both also covers a Task tool batched with TeamCreate/TeamDelete.
      taskCompletionGuardTaskListIds.add(taskListIdBeforeToolExecution)
      taskCompletionGuardTaskListIds.add(getTaskListId())
    }

    // Keep finite background work spawned anywhere in this query available to
    // a later TaskList guard. The Task tool may be called after the worker was
    // launched, and an actionable continuation may delegate before updating
    // the public owner. Runtime filtering excludes monitors and other
    // intentionally long-lived tasks when the completion gate is evaluated.
    const executedToolUseIds = new Set(toolUseBlocks.map(block => block.id))
    for (const task of Object.values(
      updatedToolUseContext.getAppState().tasks ?? {},
    )) {
      if (task.toolUseId && executedToolUseIds.has(task.toolUseId)) {
        taskCompletionGuardRuntimeTaskIds.add(task.id)
      }
    }

    if (taskCompletionGuardContinuationInFlight) {
      for (const block of toolUseBlocks) {
        const resultBlock = findSettledToolResultBlock(toolResults, block.id)
        if (!resultBlock || resultBlock.is_error === true) continue
        const fingerprint = getTaskCompletionGuardProgressFingerprint({
          toolName: block.name,
          input: block.input,
        })
        if (
          fingerprint &&
          !taskCompletionGuardProgressFingerprints.has(fingerprint)
        ) {
          taskCompletionGuardProgressFingerprints.add(fingerprint)
          taskCompletionGuardContinuationMadeProgress = true
        }
      }
    }

    // Generate tool use summary after tool batch completes — passed to next recursive call
    let nextPendingToolUseSummary:
      | SettledPromise<ToolUseSummaryMessage | null>
      | undefined
    if (
      config.gates.emitToolUseSummaries &&
      toolUseBlocks.length > 0 &&
      !toolUseContext.abortController.signal.aborted &&
      !toolUseContext.agentId // subagents don't surface in mobile UI — skip the Haiku call
    ) {
      // Extract the last assistant text block for context
      const lastAssistantMessage = assistantMessages.at(-1)
      let lastAssistantText: string | undefined
      if (lastAssistantMessage) {
        const textBlocks = (
          Array.isArray(lastAssistantMessage.message?.content)
            ? (lastAssistantMessage.message.content as Array<{
                type: string
                text?: string
              }>)
            : []
        ).filter(block => block.type === 'text')
        if (textBlocks.length > 0) {
          const lastTextBlock = textBlocks.at(-1)
          if (lastTextBlock && 'text' in lastTextBlock) {
            lastAssistantText = lastTextBlock.text
          }
        }
      }

      // Collect tool info for summary generation
      const toolUseIds = toolUseBlocks.map(block => block.id)
      const toolInfoForSummary = toolUseBlocks.map(block => {
        // Find the corresponding tool result
        const toolResult = toolResults.find(
          result =>
            result.type === 'user' &&
            Array.isArray(result.message.content) &&
            result.message.content.some(
              content =>
                content.type === 'tool_result' &&
                content.tool_use_id === block.id,
            ),
        )
        const resultContent =
          toolResult?.type === 'user' &&
          Array.isArray(toolResult.message.content)
            ? toolResult.message.content.find(
                (c): c is ToolResultBlockParam =>
                  c.type === 'tool_result' && c.tool_use_id === block.id,
              )
            : undefined
        return {
          name: block.name,
          input: block.input,
          output:
            resultContent && 'content' in resultContent
              ? resultContent.content
              : null,
        }
      })

      // Fire off summary generation without blocking the next API call
      nextPendingToolUseSummary = trackPromiseSettlement(
        generateToolUseSummary({
          tools: toolInfoForSummary,
          signal: postSamplingHooks.signal,
          isNonInteractiveSession:
            toolUseContext.options.isNonInteractiveSession,
          lastAssistantText,
        })
          .then(summary => {
            if (summary) {
              return createToolUseSummaryMessage(summary, toolUseIds)
            }
            return null
          })
          .catch(error => {
            if (error instanceof StopConfirmationError) throw error
            return null
          }),
      )
      // The summary runs concurrently with the next model turn. Keep it in the
      // query-owned lifecycle so an early return/abort cannot orphan its HTTP
      // request merely because pendingToolUseSummary was never consumed.
      postSamplingHooks.trackOwnedRequest(nextPendingToolUseSummary.promise)
    }

    // We were aborted during tool calls
    if (toolUseContext.abortController.signal.aborted) {
      // chicago MCP: auto-unhide + lock release when aborted mid-tool-call.
      // This is the most likely Ctrl+C path for CU (e.g. slow screenshot).
      // Main thread only — see stopHooks.ts for the subagent rationale.
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // Failures are silent — this is dogfooding cleanup, not critical path
        }
      }
      // Skip the interruption message for submit-interrupts — the queued
      // user message that follows provides sufficient context.
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: true,
        })
      }
      // Check maxTurns before returning when aborted
      const nextTurnCountOnAbort = turnCount + 1
      if (maxTurns && nextTurnCountOnAbort > maxTurns) {
        yield createAttachmentMessage({
          type: 'max_turns_reached',
          maxTurns,
          turnCount: nextTurnCountOnAbort,
        })
      }
      return { reason: 'aborted_tools' }
    }

    // If a hook indicated to prevent continuation, stop here
    if (shouldPreventContinuation) {
      return { reason: 'hook_stopped' }
    }

    if (tracking?.compacted) {
      tracking.turnCounter++
      logEvent('tengu_post_autocompact_turn', {
        turnId:
          tracking.turnId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        turnCounter: tracking.turnCounter,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    // Be careful to do this after tool calls are done, because the API
    // will error if we interleave tool_result messages with regular user messages.

    // Instrumentation: Track message count before attachments
    logEvent('tengu_query_before_attachments', {
      messagesForQueryCount: messagesForQuery.length,
      assistantMessagesCount: assistantMessages.length,
      toolResultsCount: toolResults.length,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // Get queued commands snapshot before processing attachments.
    // These will be sent as attachments so Claude can respond to them in the current turn.
    //
    // Drain pending notifications. LocalShellTask completions are 'next'
    // (when MONITOR_TOOL is on) and drain without Sleep. Other task types
    // (agent/workflow/framework) still default to 'later' — the Sleep flush
    // covers those. If all task types move to 'next', this branch could go.
    //
    // Conversation-reset commands (/clear and aliases) and everything queued
    // after the first one are excluded from mid-turn drain. The reset must run
    // between turns (via useQueueProcessor), and later prompts belong on the
    // other side of that control-flow boundary. Other slash commands are still
    // excluded from the snapshot below. Bash-mode commands are excluded later
    // by INLINE_NOTIFICATION_MODES in getQueuedCommandAttachments.
    //
    // Agent scoping: the queue is a process-global singleton shared by the
    // coordinator and all in-process subagents. Each loop drains only what's
    // addressed to it — main thread drains agentId===undefined, subagents
    // drain their own agentId. User prompts (mode:'prompt') still go to main
    // only; subagents never see the prompt stream.
    // eslint-disable-next-line custom-rules/require-tool-match-name -- ToolUseBlock.name has no aliases
    const sleepRan = toolUseBlocks.some(b => b.name === SLEEP_TOOL_NAME)
    const isMainThread =
      querySource.startsWith('repl_main_thread') || querySource === 'sdk'
    const currentAgentId = toolUseContext.agentId
    const queuedCommandsSnapshot =
      getCommandsByMaxPriorityBeforeConversationReset(
        sleepRan ? 'later' : 'next',
        cmd =>
          isMainThread
            ? cmd.agentId === undefined
            : cmd.agentId === currentAgentId,
      ).filter(cmd => {
        if (isSlashCommand(cmd)) return false
        if (isMainThread) return true
        // Subagents only drain task-notifications addressed to them — never
        // user prompts, even if someone stamps an agentId on one.
        return cmd.mode === 'task-notification'
      })
    const queuedAutonomyClaim = await claimConsumableQueuedAutonomyCommands(
      queuedCommandsSnapshot,
    )
    if (queuedAutonomyClaim.staleCommands.length > 0) {
      removeFromQueue(queuedAutonomyClaim.staleCommands)
    }

    const claimedConsumedCommands = queuedAutonomyClaim.claimedCommands.filter(
      cmd => cmd.mode === 'prompt' || cmd.mode === 'task-notification',
    )
    if (claimedConsumedCommands.length > 0) {
      consumedAutonomyCommands.push(...claimedConsumedCommands)
      for (const cmd of claimedConsumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(claimedConsumedCommands)
    }

    for await (const attachment of getAttachmentMessages(
      null,
      updatedToolUseContext,
      null,
      queuedAutonomyClaim.attachmentCommands,
      messagesForQuery.concat(assistantMessages, toolResults),
      querySource,
    )) {
      yield attachment
      toolResults.push(attachment)
    }

    // Memory prefetch consume: only if settled and not already consumed on
    // an earlier iteration. If not settled yet, skip (zero-wait) and retry
    // next iteration — the prefetch gets as many chances as there are loop
    // iterations before the turn ends. readFileState (cumulative across
    // iterations) filters out memories the model already Read/Wrote/Edited
    // — including in earlier iterations, which the per-iteration
    // toolUseBlocks array would miss.
    if (
      pendingMemoryPrefetch &&
      pendingMemoryPrefetch.settledAt !== null &&
      pendingMemoryPrefetch.consumedOnIteration === -1
    ) {
      const memoryAttachments = filterDuplicateMemoryAttachments(
        await pendingMemoryPrefetch.promise,
        toolUseContext.readFileState,
      )
      for (const memAttachment of memoryAttachments) {
        const msg = createAttachmentMessage(memAttachment)
        yield msg
        toolResults.push(msg)
      }
      pendingMemoryPrefetch.consumedOnIteration = turnCount - 1
    }

    // Consume discovery prefetches only if they already settled under model or
    // tool work. They are optional hints, not completion gates; unresolved
    // promises remain query-owned and cancellable through postSamplingHooks.
    if (skillPrefetch && pendingSkillPrefetch) {
      const settlement = pendingSkillPrefetch.peek()
      if (settlement.status === 'fulfilled') {
        for (const att of settlement.value) {
          const msg = createAttachmentMessage(att)
          yield msg
          toolResults.push(msg)
        }
      }
    }

    if (searchExtraToolsPrefetch && pendingToolPrefetch) {
      const settlement = pendingToolPrefetch.peek()
      if (settlement.status === 'fulfilled') {
        for (const att of settlement.value) {
          const msg = createAttachmentMessage(att)
          yield msg
          toolResults.push(msg)
        }
      }
    }

    // Remove only commands that were actually consumed as attachments.
    // Prompt and task-notification commands are converted to attachments above.
    const claimedCommandSet = new Set(claimedConsumedCommands)
    const consumedCommands = queuedAutonomyClaim.attachmentCommands.filter(
      cmd =>
        (cmd.mode === 'prompt' || cmd.mode === 'task-notification') &&
        !claimedCommandSet.has(cmd),
    )
    if (consumedCommands.length > 0) {
      for (const cmd of consumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(consumedCommands)
    }

    // Instrumentation: Track file change attachments after they're added
    const fileChangeAttachmentCount = count(
      toolResults,
      tr =>
        tr.type === 'attachment' && tr.attachment.type === 'edited_text_file',
    )

    logEvent('tengu_query_after_attachments', {
      totalToolResultsCount: toolResults.length,
      fileChangeAttachmentCount,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // Refresh tools between turns so newly-connected MCP servers become available
    if (updatedToolUseContext.options.refreshTools) {
      const refreshedTools = updatedToolUseContext.options.refreshTools()
      if (refreshedTools !== updatedToolUseContext.options.tools) {
        updatedToolUseContext = {
          ...updatedToolUseContext,
          options: {
            ...updatedToolUseContext.options,
            tools: refreshedTools,
          },
        }
      }
    }

    const toolUseContextWithQueryTracking = {
      ...updatedToolUseContext,
      queryTracking,
    }

    // Each time we have tool results and are about to recurse, that's a turn
    const nextTurnCount = turnCount + 1

    // Periodic task summary for `claude ps` — fires mid-turn so a
    // long-running agent still refreshes what it's working on. Gated
    // only on !agentId so every top-level conversation (REPL, SDK, HFI,
    // remote) generates summaries; subagents/forks don't.
    if (feature('BG_SESSIONS')) {
      if (
        !toolUseContext.agentId &&
        taskSummaryModule!.shouldGenerateTaskSummary()
      ) {
        taskSummaryModule!.maybeGenerateTaskSummary({
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          forkContextMessages: messagesForQuery.concat(
            assistantMessages,
            toolResults,
          ),
        })
      }
    }

    // Check if we've reached the max turns limit
    if (maxTurns && nextTurnCount > maxTurns) {
      yield createAttachmentMessage({
        type: 'max_turns_reached',
        maxTurns,
        turnCount: nextTurnCount,
      })
      return { reason: 'max_turns', turnCount: nextTurnCount }
    }

    queryCheckpoint('query_recursive_call')
    const next: State = {
      messages: messagesForQuery.concat(assistantMessages, toolResults),
      toolUseContext: toolUseContextWithQueryTracking,
      autoCompactTracking: tracking,
      turnCount: nextTurnCount,
      maxOutputTokensRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
      pendingToolUseSummary: nextPendingToolUseSummary,
      maxOutputTokensOverride: undefined,
      stopHookActive,
      transition: { reason: 'next_turn' },
    }
    state = next
  } // while (true)
}
