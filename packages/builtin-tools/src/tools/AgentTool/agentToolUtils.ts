import { feature } from 'bun:bundle'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { z } from 'zod/v4'
import { clearInvokedSkillsForAgent } from 'src/bootstrap/state.js'
import {
  ALL_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
} from 'src/constants/tools.js'
import {
  AgentSummaryScope,
  type AgentSummaryStopResult,
  startAgentSummarization,
} from 'src/services/AgentSummary/agentSummary.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { clearDumpState } from 'src/services/api/dumpPrompts.js'
import { t } from 'src/i18n/t.js'
import type { AppState } from 'src/state/AppState.js'
import type {
  Tool,
  ToolPermissionContext,
  Tools,
  ToolUseContext,
} from 'src/Tool.js'
import { toolMatchesName } from 'src/Tool.js'
import {
  completeAgentTask as completeAsyncAgent,
  createActivityDescriptionResolver,
  createProgressTracker,
  enqueueAgentNotification,
  failAgentTask as failAsyncAgent,
  getProgressUpdate,
  getTokenCountFromTracker,
  isLocalAgentTask,
  publishAgentResult as publishAsyncAgentResult,
  type ProgressTracker,
  updateAgentProgress as updateAsyncAgentProgress,
  updateProgressFromMessage,
} from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import { asAgentId } from 'src/types/ids.js'
import type { Message as MessageType, ContentItem } from 'src/types/message.js'
import { isAgentSwarmsEnabled } from 'src/utils/agentSwarmsEnabled.js'
import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from 'src/utils/abortSettlement.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isInProtectedNamespace } from 'src/utils/envUtils.js'
import { AbortError, errorMessage } from 'src/utils/errors.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'
import { registerDetachedAuxiliaryWork } from 'src/utils/detachedAuxiliaryWork.js'
import type { CacheSafeParams } from 'src/utils/forkedAgent.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  extractTextContent,
  getLastAssistantMessage,
} from 'src/utils/messages.js'
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'
import { permissionRuleValueFromString } from 'src/utils/permissions/permissionRuleParser.js'
import {
  buildTranscriptForClassifier,
  classifyYoloAction,
} from 'src/utils/permissions/yoloClassifier.js'
import { emitTaskProgress as emitTaskProgressEvent } from 'src/utils/task/sdkProgress.js'
import { guardAsyncIterableCancellation } from 'src/services/api/providerCancellation.js'
import { isInProcessTeammate } from 'src/utils/teammateContext.js'
import { getTokenCountFromUsage } from 'src/utils/tokens.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../ExitPlanModeTool/constants.js'
import { AGENT_TOOL_NAME, LEGACY_AGENT_TOOL_NAME } from './constants.js'
import type { AgentDefinition } from './loadAgentsDir.js'

const HANDOFF_CLASSIFIER_TIMEOUT_MS = 30_000
const AGENT_FINALIZER_ABORT_GRACE_MS = 2_000
const HANDOFF_CLASSIFIER_UNAVAILABLE_WARNING =
  "Note: The safety classifier was cancelled but did not settle promptly. Please carefully verify the sub-agent's actions and output before acting on them."

type AgentWorktreeResult = {
  worktreePath?: string
  worktreeBranch?: string
}

export async function stopAgentSummaryScope({
  scope,
  abortSignal,
  taskId,
  allowUnconfirmed = false,
  abortGraceMs = AGENT_FINALIZER_ABORT_GRACE_MS,
}: {
  scope: AgentSummaryScope
  abortSignal: AbortSignal
  taskId: string
  allowUnconfirmed?: boolean
  /** @internal Deterministic lifecycle-test override. */
  abortGraceMs?: number
}): Promise<AgentSummaryStopResult> {
  if (abortSignal.aborted) {
    try {
      await waitForAbortSettlement(
        scope.stopAllExactly(),
        abortSignal,
        abortGraceMs,
        `Agent ${taskId} summary shutdown`,
      )
      return 'settled'
    } catch (error) {
      if (error instanceof AbortSettlementTimeoutError) {
        const message = `Agent ${taskId} summary request did not settle after abort`
        logForDebugging(message, { level: 'warn' })
        if (allowUnconfirmed) return 'timed_out'
        throw new StopConfirmationError(message, [error])
      }
      throw error
    }
  }

  const result = await scope.stopAll()
  if (result === 'timed_out') {
    const message = `Agent ${taskId} summary request did not settle ${
      abortSignal.aborted ? 'after abort' : 'during finalization'
    }`
    logForDebugging(message, { level: 'warn' })
    if (!allowUnconfirmed) {
      throw new StopConfirmationError(message)
    }
  }
  return result
}

/**
 * Stop progress summarization without keeping a successfully completed Agent
 * in its running state. The detached owner keeps the exact stop promise
 * Esc-routable and reports an abort-ignoring summary request honestly.
 */
export function registerDetachedAgentSummaryStop({
  scope,
  taskId,
  abortGraceMs,
}: {
  scope: AgentSummaryScope
  taskId: string
  /** @internal Deterministic lifecycle-test override. */
  abortGraceMs?: number
}): void {
  // stopAllExactly dispatches every summary abort synchronously and preserves
  // the real active-run promise. Do not register stopAll() here: its cached
  // 5s `timed_out` result is not termination evidence and can never observe a
  // later real settlement.
  const settlement = scope.stopAllExactly()

  registerDetachedAuxiliaryWork({
    operation: `Agent ${taskId} summary shutdown`,
    settlement,
    cancel: () => scope.stopAllExactly(),
    abortGraceMs,
    onError: error => {
      logForDebugging(
        `Agent ${taskId} detached summary shutdown failed: ${errorMessage(error)}`,
        { level: 'warn' },
      )
    },
  })
}

/**
 * Complete an Agent independently from worktree housekeeping. Notification is
 * emitted only after cleanup settles, while Esc owns a dedicated controller
 * and waits for this exact promise.
 */
export function registerDetachedAgentWorktreeCleanup({
  taskId,
  cleanup,
  onSettled,
}: {
  taskId: string
  cleanup: (abortSignal: AbortSignal) => Promise<AgentWorktreeResult>
  onSettled: (result: AgentWorktreeResult) => void
}): void {
  const abortController = new AbortController()
  const cleanupPromise = Promise.resolve().then(() =>
    cleanup(abortController.signal),
  )
  const settlement = cleanupPromise.then(
    result => {
      onSettled(result)
    },
    error => {
      // The model result is already terminal. Do not lose its notification
      // solely because auxiliary cleanup failed, but preserve the rejection
      // for the detached owner so Stop never reports false confirmation.
      try {
        onSettled({})
      } catch (notificationError) {
        logForDebugging(
          `Agent ${taskId} completion notification after worktree failure failed: ${errorMessage(notificationError)}`,
          { level: 'warn' },
        )
      }
      throw error
    },
  )

  registerDetachedAuxiliaryWork({
    operation: `Agent ${taskId} worktree cleanup`,
    settlement,
    cancel: reason => abortController.abort(reason),
    onError: error => {
      logForDebugging(
        `Agent ${taskId} detached worktree cleanup failed: ${errorMessage(error)}`,
        { level: 'warn' },
      )
    },
  })
}

/** @internal Exported for deterministic cancellation tests. */
export async function waitForAgentWorktreeOperation<T>({
  settlement,
  finalizerSignal,
  ownerSignal,
  operation,
  abortGraceMs = AGENT_FINALIZER_ABORT_GRACE_MS,
}: {
  settlement: Promise<T>
  finalizerSignal: AbortSignal
  ownerSignal?: AbortSignal
  operation: string
  abortGraceMs?: number
}): Promise<T> {
  try {
    return await waitForAbortSettlement(
      settlement,
      finalizerSignal,
      abortGraceMs,
      operation,
    )
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError && ownerSignal?.aborted) {
      throw new StopConfirmationError(
        `${operation} did not confirm termination after cancellation`,
        [error],
      )
    }
    throw error
  }
}
export type ResolvedAgentTools = {
  hasWildcard: boolean
  validTools: string[]
  invalidTools: string[]
  resolvedTools: Tools
  allowedAgentTypes?: string[]
}

export function filterToolsForAgent({
  tools,
  isBuiltIn,
  isAsync = false,
  permissionMode,
}: {
  tools: Tools
  isBuiltIn: boolean
  isAsync?: boolean
  permissionMode?: PermissionMode
}): Tools {
  return tools.filter(tool => {
    // Allow MCP tools for all agents
    if (tool.name.startsWith('mcp__')) {
      return true
    }
    // Allow ExitPlanMode for agents in plan mode (e.g., in-process teammates)
    // This bypasses both the ALL_AGENT_DISALLOWED_TOOLS and async tool filters
    if (
      toolMatchesName(tool, EXIT_PLAN_MODE_V2_TOOL_NAME) &&
      permissionMode === 'plan'
    ) {
      return true
    }
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
      return false
    }
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
      return false
    }
    if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) {
      if (isAgentSwarmsEnabled() && isInProcessTeammate()) {
        // Allow AgentTool for in-process teammates to spawn sync subagents.
        // Validation in AgentTool.call() prevents background agents and teammate spawning.
        if (toolMatchesName(tool, AGENT_TOOL_NAME)) {
          return true
        }
        // Allow task tools for in-process teammates to coordinate via shared task list
        if (IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) {
          return true
        }
      }
      return false
    }
    return true
  })
}

/**
 * Resolves and validates agent tools against available tools
 * Handles wildcard expansion and validation in one place
 */
export function resolveAgentTools(
  agentDefinition: Pick<
    AgentDefinition,
    'tools' | 'disallowedTools' | 'source' | 'permissionMode'
  >,
  availableTools: Tools,
  isAsync = false,
  isMainThread = false,
): ResolvedAgentTools {
  const {
    tools: agentTools,
    disallowedTools,
    source,
    permissionMode,
  } = agentDefinition
  // When isMainThread is true, skip filterToolsForAgent entirely — the main
  // thread's tool pool is already properly assembled by useMergedTools(), so
  // the sub-agent disallow lists shouldn't apply.
  const filteredAvailableTools = isMainThread
    ? availableTools
    : filterToolsForAgent({
        tools: availableTools,
        isBuiltIn: source === 'built-in',
        isAsync,
        permissionMode,
      })

  // Create a set of disallowed tool names for quick lookup
  const disallowedToolSet = new Set(
    disallowedTools?.map(toolSpec => {
      const { toolName } = permissionRuleValueFromString(toolSpec)
      return toolName
    }) ?? [],
  )

  // Filter available tools based on disallowed list
  const allowedAvailableTools = filteredAvailableTools.filter(
    tool => !disallowedToolSet.has(tool.name),
  )

  // If tools is undefined or ['*'], allow all tools (after filtering disallowed)
  const hasWildcard =
    agentTools === undefined ||
    (agentTools.length === 1 && agentTools[0] === '*')
  if (hasWildcard) {
    return {
      hasWildcard: true,
      validTools: [],
      invalidTools: [],
      resolvedTools: allowedAvailableTools,
    }
  }

  const availableToolMap = new Map<string, Tool>()
  for (const tool of allowedAvailableTools) {
    availableToolMap.set(tool.name, tool)
  }

  const validTools: string[] = []
  const invalidTools: string[] = []
  const resolved: Tool[] = []
  const resolvedToolsSet = new Set<Tool>()
  let allowedAgentTypes: string[] | undefined

  for (const toolSpec of agentTools) {
    // Parse the tool spec to extract the base tool name and any permission pattern
    const { toolName, ruleContent } = permissionRuleValueFromString(toolSpec)

    // Special case: Agent tool carries allowedAgentTypes metadata in its spec
    if (toolName === AGENT_TOOL_NAME) {
      if (ruleContent) {
        // Parse comma-separated agent types: "worker, researcher" → ["worker", "researcher"]
        allowedAgentTypes = ruleContent.split(',').map(s => s.trim())
      }
      // For sub-agents, Agent is excluded by filterToolsForAgent — mark the spec
      // valid for allowedAgentTypes tracking but skip tool resolution.
      if (!isMainThread) {
        validTools.push(toolSpec)
        continue
      }
      // For main thread, filtering was skipped so Agent is in availableToolMap —
      // fall through to normal resolution below.
    }

    const tool = availableToolMap.get(toolName)
    if (tool) {
      validTools.push(toolSpec)
      if (!resolvedToolsSet.has(tool)) {
        resolved.push(tool)
        resolvedToolsSet.add(tool)
      }
    } else {
      invalidTools.push(toolSpec)
    }
  }

  return {
    hasWildcard: false,
    validTools,
    invalidTools,
    resolvedTools: resolved,
    allowedAgentTypes,
  }
}

export const agentToolResultSchema = lazySchema(() =>
  z.object({
    agentId: z.string(),
    // Optional: older persisted sessions won't have this (resume replays
    // results verbatim without re-validation). Used to gate the sync
    // result trailer — one-shot built-ins skip the SendMessage hint.
    agentType: z.string().optional(),
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    totalToolUseCount: z.number(),
    totalDurationMs: z.number(),
    totalTokens: z.number(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().nullable(),
      cache_read_input_tokens: z.number().nullable(),
      server_tool_use: z
        .object({
          web_search_requests: z.number(),
          web_fetch_requests: z.number(),
        })
        .nullable(),
      service_tier: z.enum(['standard', 'priority', 'batch']).nullable(),
      cache_creation: z
        .object({
          ephemeral_1h_input_tokens: z.number(),
          ephemeral_5m_input_tokens: z.number(),
        })
        .nullable(),
    }),
  }),
)

export type AgentToolResult = z.input<ReturnType<typeof agentToolResultSchema>>

function normalizeAgentToolUsage(
  usage: Partial<BetaUsage> | undefined,
): AgentToolResult['usage'] {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? null,
    server_tool_use: usage?.server_tool_use
      ? {
          web_search_requests: usage.server_tool_use.web_search_requests ?? 0,
          web_fetch_requests: usage.server_tool_use.web_fetch_requests ?? 0,
        }
      : null,
    service_tier: usage?.service_tier ?? null,
    cache_creation: usage?.cache_creation
      ? {
          ephemeral_1h_input_tokens:
            usage.cache_creation.ephemeral_1h_input_tokens ?? 0,
          ephemeral_5m_input_tokens:
            usage.cache_creation.ephemeral_5m_input_tokens ?? 0,
        }
      : null,
  }
}

export function countToolUses(messages: MessageType[]): number {
  let count = 0
  for (const m of messages) {
    if (m.type === 'assistant') {
      const content = m.message?.content as ContentItem[] | undefined
      for (const block of content ?? []) {
        if (block.type === 'tool_use') {
          count++
        }
      }
    }
  }
  return count
}

export function finalizeAgentTool(
  agentMessages: MessageType[],
  agentId: string,
  metadata: {
    prompt: string
    resolvedAgentModel: string
    isBuiltInAgent: boolean
    startTime: number
    agentType: string
    isAsync: boolean
  },
): AgentToolResult {
  const {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent,
    startTime,
    agentType,
    isAsync,
  } = metadata

  const lastAssistantMessage = getLastAssistantMessage(agentMessages)
  if (lastAssistantMessage === undefined) {
    throw new Error(t('No assistant messages found'))
  }
  if (lastAssistantMessage.isApiErrorMessage) {
    if (lastAssistantMessage.error instanceof Error) {
      throw lastAssistantMessage.error
    }
    const detail =
      typeof lastAssistantMessage.errorDetails === 'string'
        ? lastAssistantMessage.errorDetails
        : typeof lastAssistantMessage.apiError === 'string'
          ? lastAssistantMessage.apiError
          : t('Agent request failed')
    throw new Error(detail)
  }
  // Extract text content from the agent's response. If the final assistant
  // message is a pure tool_use block (loop exited mid-turn), fall back to
  // the most recent assistant message that has text content.
  let content = (
    (lastAssistantMessage.message?.content as ContentItem[]) ?? []
  ).filter(_ => _.type === 'text')
  if (content.length === 0) {
    for (let i = agentMessages.length - 1; i >= 0; i--) {
      const m = agentMessages[i]!
      if (m.type !== 'assistant') continue
      const textBlocks = ((m.message?.content as ContentItem[]) ?? []).filter(
        _ => _.type === 'text',
      )
      if (textBlocks.length > 0) {
        content = textBlocks
        break
      }
    }
  }

  const rawUsage = lastAssistantMessage.message?.usage as
    | Partial<BetaUsage>
    | undefined
  const totalTokens = getTokenCountFromUsage(
    rawUsage as Parameters<typeof getTokenCountFromUsage>[0],
  )
  const usage = normalizeAgentToolUsage(rawUsage)
  const totalToolUseCount = countToolUses(agentMessages)

  logEvent('tengu_agent_tool_completed', {
    agent_type:
      agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    prompt_char_count: prompt.length,
    response_char_count: content.length,
    assistant_message_count: agentMessages.length,
    total_tool_uses: totalToolUseCount,
    duration_ms: Date.now() - startTime,
    total_tokens: totalTokens,
    is_built_in_agent: isBuiltInAgent,
    is_async: isAsync,
  })

  // Signal to inference that this subagent's cache chain can be evicted.
  const lastRequestId = lastAssistantMessage.requestId
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'subagent_end' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  return {
    agentId,
    agentType,
    content,
    totalDurationMs: Date.now() - startTime,
    totalTokens,
    totalToolUseCount,
    usage,
  }
}

/**
 * Keep TaskOutput and foreground task inspection behind the same auto-mode
 * handoff gate as the parent result. Both background and foreground paths use
 * this boundary so neither can leak an unclassified result.
 */
export async function publishAgentResultAfterHandoffSafety({
  agentResult,
  safetyGate,
  abortSignal,
  publish,
}: {
  agentResult: AgentToolResult
  safetyGate: Promise<string | null>
  abortSignal: AbortSignal
  publish: (result: AgentToolResult) => void
}): Promise<void> {
  const handoffWarning = await safetyGate
  if (handoffWarning) {
    agentResult.content = [
      { type: 'text' as const, text: handoffWarning },
      ...agentResult.content,
    ]
  }
  if (abortSignal.aborted) throw new AbortError()
  publish(agentResult)
}

/**
 * Returns the name of the last tool_use block in an assistant message,
 * or undefined if the message is not an assistant message with tool_use.
 */
export function getLastToolUseName(message: MessageType): string | undefined {
  if (message.type !== 'assistant') return undefined
  const block = ((message.message?.content as ContentItem[]) ?? []).findLast(
    b => b.type === 'tool_use',
  )
  return block?.type === 'tool_use' ? block.name : undefined
}

export function getForegroundAgentTerminalStatus({
  wasAborted,
  signalAborted,
  lifecycleError,
  runError,
}: {
  wasAborted: boolean
  signalAborted: boolean
  lifecycleError?: Error
  runError?: Error
}): 'completed' | 'failed' | 'stopped' {
  // An aborted signal is only proof that Stop was requested. A cleanup
  // confirmation failure must win so SDK clients do not report false success.
  if (
    lifecycleError instanceof StopConfirmationError ||
    runError instanceof StopConfirmationError
  ) {
    return 'failed'
  }
  if (wasAborted || signalAborted || lifecycleError instanceof AbortError) {
    return 'stopped'
  }
  return lifecycleError || runError ? 'failed' : 'completed'
}

export function emitTaskProgress(
  tracker: ProgressTracker,
  taskId: string,
  toolUseId: string | undefined,
  description: string,
  startTime: number,
  lastToolName: string,
): void {
  const progress = getProgressUpdate(tracker)
  emitTaskProgressEvent({
    taskId,
    toolUseId,
    description: progress.lastActivity?.activityDescription ?? description,
    startTime,
    totalTokens: progress.tokenCount,
    toolUses: progress.toolUseCount,
    lastToolName,
  })
}

export async function classifyHandoffIfNeeded({
  agentMessages,
  tools,
  toolPermissionContext,
  abortSignal,
  subagentType,
  totalToolUseCount,
  timeoutMs = HANDOFF_CLASSIFIER_TIMEOUT_MS,
  abortGraceMs = AGENT_FINALIZER_ABORT_GRACE_MS,
  forceEnabledForTests = false,
}: {
  agentMessages: MessageType[]
  tools: Tools
  toolPermissionContext: AppState['toolPermissionContext']
  abortSignal: AbortSignal
  subagentType: string
  totalToolUseCount: number
  /** @internal Deterministic lifecycle-test override. */
  timeoutMs?: number
  /** @internal Deterministic lifecycle-test override. */
  abortGraceMs?: number
  /** @internal Bun's feature intrinsic is compile-time in unit tests. */
  forceEnabledForTests?: boolean
}): Promise<string | null> {
  let classifierEnabled = forceEnabledForTests
  if (!classifierEnabled) {
    if (feature('TRANSCRIPT_CLASSIFIER')) classifierEnabled = true
  }
  if (classifierEnabled) {
    if (toolPermissionContext.mode !== 'auto') return null

    const agentTranscript = buildTranscriptForClassifier(agentMessages, tools)
    if (!agentTranscript) return null

    const classifierAbortController = new AbortController()
    const classifierSignal = classifierAbortController.signal
    let classifierResult: Awaited<ReturnType<typeof classifyYoloAction>>
    try {
      classifierResult = await waitForBoundedSettlement(
        classifyYoloAction(
          agentMessages,
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: "Sub-agent has finished and is handing back control to the main agent. Review the sub-agent's work based on the block rules and let the main agent know if any file is dangerous (the main agent will see the reason).",
              },
            ],
          },
          tools,
          toolPermissionContext as ToolPermissionContext,
          classifierSignal,
        ),
        {
          signal: abortSignal,
          timeoutMs,
          abortGraceMs,
          operation: 'Agent handoff classifier',
          onAbort: reason => classifierAbortController.abort(reason),
        },
      )
    } catch (error) {
      if (error instanceof AbortSettlementTimeoutError) {
        logForDebugging(error.message, { level: 'warn' })
        throw new StopConfirmationError(
          abortSignal.aborted
            ? 'Agent handoff classifier did not confirm termination after cancellation'
            : 'Agent handoff classifier did not confirm termination after its deadline',
          [error],
        )
      }
      if (classifierSignal.aborted && !abortSignal.aborted) {
        // The internal deadline fired and the provider confirmed settlement by
        // rejecting. Treat the classifier as unavailable instead of failing an
        // otherwise successful Agent. Parent cancellation still propagates.
        logForDebugging(
          `Handoff classifier exceeded ${timeoutMs}ms and settled after cancellation; continuing with unavailable warning`,
          { level: 'warn' },
        )
        return HANDOFF_CLASSIFIER_UNAVAILABLE_WARNING
      }
      throw error
    }

    if (classifierSignal.aborted && !abortSignal.aborted) {
      logForDebugging(
        `Handoff classifier exceeded ${timeoutMs}ms; continuing with unavailable warning`,
        { level: 'warn' },
      )
    }

    const handoffDecision = classifierResult.unavailable
      ? 'unavailable'
      : classifierResult.shouldBlock
        ? 'blocked'
        : 'allowed'
    logEvent('tengu_auto_mode_decision', {
      decision:
        handoffDecision as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      toolName:
        // Use legacy name for analytics continuity across the Task→Agent rename
        LEGACY_AGENT_TOOL_NAME as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      inProtectedNamespace: isInProtectedNamespace(),
      classifierModel:
        classifierResult.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      agentType:
        subagentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      toolUseCount: totalToolUseCount,
      isHandoff: true,
      // For handoff, the relevant agent completion is the subagent's final
      // assistant message — the last thing the classifier transcript shows
      // before the handoff review prompt.
      agentMsgId: getLastAssistantMessage(agentMessages)?.message
        .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage:
        classifierResult.stage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage1RequestId:
        classifierResult.stage1RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage1MsgId:
        classifierResult.stage1MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage2RequestId:
        classifierResult.stage2RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      classifierStage2MsgId:
        classifierResult.stage2MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    if (classifierResult.shouldBlock) {
      // When classifier is unavailable, still propagate the sub-agent's
      // results but with a warning so the parent agent can verify the work.
      if (classifierResult.unavailable) {
        logForDebugging(
          'Handoff classifier unavailable, allowing sub-agent output with warning',
          { level: 'warn' },
        )
        return `Note: The safety classifier was unavailable when reviewing this sub-agent's work. Please carefully verify the sub-agent's actions and output before acting on them.`
      }

      logForDebugging(
        `Handoff classifier flagged sub-agent output: ${classifierResult.reason}`,
        { level: 'warn' },
      )
      return `SECURITY WARNING: This sub-agent performed actions that may violate security policy. Reason: ${classifierResult.reason}. Review the sub-agent's actions carefully before acting on its output.`
    }
  }

  return null
}

/**
 * Extract a partial result string from an agent's accumulated messages.
 * Used when an async agent is killed to preserve what it accomplished.
 * Returns undefined if no text content is found.
 */
export function extractPartialResult(
  messages: MessageType[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type !== 'assistant') continue
    const text = extractTextContent(
      (m.message?.content as ContentItem[]) ?? [],
      '\n',
    )
    if (text) {
      return text
    }
  }
  return undefined
}

type SetAppState = (f: (prev: AppState) => AppState) => void

/**
 * Drives a background agent from spawn to terminal notification.
 * Shared between AgentTool's async-from-start path and resumeAgentBackground.
 */
export async function runAsyncAgentLifecycle({
  taskId,
  abortController,
  makeStream,
  metadata,
  description,
  toolUseContext,
  rootSetAppState,
  agentIdForCleanup,
  enableSummarization,
  getWorktreeResult,
  classifyHandoff,
}: {
  taskId: string
  abortController: AbortController
  makeStream: (
    onCacheSafeParams: ((p: CacheSafeParams) => void) | undefined,
  ) => AsyncGenerator<MessageType, void>
  metadata: Parameters<typeof finalizeAgentTool>[2]
  description: string
  toolUseContext: ToolUseContext
  rootSetAppState: SetAppState
  agentIdForCleanup: string
  enableSummarization: boolean
  getWorktreeResult: (abortSignal?: AbortSignal) => Promise<{
    worktreePath?: string
    worktreeBranch?: string
  }>
  /** @internal Deterministic safety-gate test override. */
  classifyHandoff?: () => Promise<string | null>
}): Promise<void> {
  const summaryScope = new AgentSummaryScope()
  let summariesDetached = false
  const stopSummaries = (allowUnconfirmed = false) =>
    stopAgentSummaryScope({
      scope: summaryScope,
      abortSignal: abortController.signal,
      taskId,
      allowUnconfirmed,
    })
  const agentMessages: MessageType[] = []
  try {
    const tracker = createProgressTracker()
    const resolveActivity = createActivityDescriptionResolver(
      toolUseContext.options.tools,
    )
    const onCacheSafeParams = enableSummarization
      ? (params: CacheSafeParams) => {
          summaryScope.add(
            startAgentSummarization(
              taskId,
              asAgentId(taskId),
              params,
              rootSetAppState,
            ),
          )
        }
      : undefined
    for await (const message of guardAsyncIterableCancellation(
      makeStream(onCacheSafeParams),
      abortController.signal,
      { operation: `Agent ${taskId} stream` },
    )) {
      agentMessages.push(message)
      // Append immediately when UI holds the task (retain). Bootstrap reads
      // disk in parallel and UUID-merges the prefix — disk-write-before-yield
      // means live is always a suffix of disk, so merge is order-correct.
      rootSetAppState(prev => {
        const t = prev.tasks[taskId]
        if (!isLocalAgentTask(t) || !t.retain) return prev
        const base = t.messages ?? []
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [taskId]: { ...t, messages: [...base, message] },
          },
        }
      })
      updateProgressFromMessage(
        tracker,
        message,
        resolveActivity,
        toolUseContext.options.tools,
      )
      updateAsyncAgentProgress(
        taskId,
        getProgressUpdate(tracker),
        rootSetAppState,
      )
      const lastToolName = getLastToolUseName(message)
      if (lastToolName) {
        emitTaskProgress(
          tracker,
          taskId,
          toolUseContext.toolUseId,
          description,
          metadata.startTime,
          lastToolName,
        )
      }
    }

    if (abortController.signal.aborted) {
      throw new AbortError()
    }

    // If the agent's final assistant message is an API error (e.g.
    // "API Error: terminated"), the stream was interrupted and the
    // model never produced a valid response. Fail the task instead of
    // marking it completed with partial/invalid output.
    const lastMsg = agentMessages.findLast(m => m.type === 'assistant')
    if (lastMsg?.isApiErrorMessage) {
      const errText =
        extractTextContent(
          (lastMsg.message?.content as ContentItem[]) ?? [],
          '\n',
        ) || 'API error'
      await stopSummaries()
      if (abortController.signal.aborted) {
        throw new AbortError()
      }
      const worktreeResult = await getWorktreeResult(abortController.signal)
      if (abortController.signal.aborted) {
        throw new AbortError()
      }
      failAsyncAgent(taskId, errText, rootSetAppState)
      enqueueAgentNotification({
        taskId,
        description,
        status: 'failed',
        error: errText,
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
        ...worktreeResult,
      })
      return
    }

    const agentResult = finalizeAgentTool(agentMessages, taskId, metadata)

    // Summary generation is display-only. Dispatch its abort immediately, but
    // let the detached owner prove settlement without holding this Agent open.
    registerDetachedAgentSummaryStop({
      scope: summaryScope,
      taskId,
    })
    summariesDetached = true

    let handoffSafetyGate = Promise.resolve<string | null>(null)
    if (classifyHandoff) {
      handoffSafetyGate = classifyHandoff()
    } else if (feature('TRANSCRIPT_CLASSIFIER')) {
      handoffSafetyGate = classifyHandoffIfNeeded({
        agentMessages,
        tools: toolUseContext.options.tools,
        toolPermissionContext:
          toolUseContext.getAppState().toolPermissionContext,
        abortSignal: abortController.signal,
        subagentType: metadata.agentType,
        totalToolUseCount: agentResult.totalToolUseCount,
      })
    }
    await publishAgentResultAfterHandoffSafety({
      agentResult,
      safetyGate: handoffSafetyGate,
      abortSignal: abortController.signal,
      publish: result => publishAsyncAgentResult(result, rootSetAppState),
    })
    const finalMessage = extractTextContent(agentResult.content, '\n')

    registerDetachedAgentWorktreeCleanup({
      taskId,
      cleanup: getWorktreeResult,
      onSettled: worktreeResult => {
        enqueueAgentNotification({
          taskId,
          description,
          status: 'completed',
          setAppState: rootSetAppState,
          finalMessage,
          usage: {
            totalTokens: getTokenCountFromTracker(tracker),
            toolUses: agentResult.totalToolUseCount,
            durationMs: agentResult.totalDurationMs,
          },
          toolUseId: toolUseContext.toolUseId,
          ...worktreeResult,
        })
      },
    })

    // Model execution and the safety gate are complete. Worktree housekeeping
    // now has its own cancellable owner and notification settlement.
    completeAsyncAgent(agentResult, rootSetAppState)
  } catch (caughtError) {
    let error = caughtError
    // Do not publish a terminal task state until the summary side query has
    // received abort and either settled or exhausted its bounded grace. A
    // timed-out summary during explicit Stop becomes the confirmation error.
    try {
      await stopSummaries()
    } catch (summaryError) {
      error = summaryError
    }
    if (error instanceof StopConfirmationError) {
      // The main runner has already unwound, so there is no execution left for
      // a later Stop to retry. Report an honest failed terminal state instead
      // of leaving the task permanently running. This deliberately does not
      // claim the remote request was killed or that the agent completed.
      const message = errorMessage(error)
      failAsyncAgent(taskId, message, rootSetAppState)
      enqueueAgentNotification({
        taskId,
        description,
        status: 'failed',
        error: message,
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
      })
      // Worktree finalization remains best-effort in the background. The
      // concrete AgentTool implementation has its own absolute deadline, and
      // observing the rejection prevents a late cleanup failure from becoming
      // unhandled or putting the task back into a running state.
      void Promise.resolve()
        .then(() => getWorktreeResult(abortController.signal))
        .catch(cleanupError => {
          logForDebugging(
            `Agent ${taskId} worktree cleanup after unconfirmed finalization failed: ${errorMessage(cleanupError)}`,
            { level: 'warn' },
          )
        })
      throw error
    }
    if (error instanceof AbortError || abortController.signal.aborted) {
      // The tracked execution owns the killed transition after this lifecycle
      // (including worktree cleanup) has fully settled. This catch still owns
      // the partial-result notification because it has the message buffer.
      logEvent('tengu_agent_tool_terminated', {
        agent_type:
          metadata.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model:
          metadata.resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        duration_ms: Date.now() - metadata.startTime,
        is_async: true,
        is_built_in_agent: metadata.isBuiltInAgent,
        reason:
          'user_kill_async' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      const worktreeResult = await getWorktreeResult(abortController.signal)
      const partialResult = extractPartialResult(agentMessages)
      enqueueAgentNotification({
        taskId,
        description,
        status: 'killed',
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
        finalMessage: partialResult,
        ...worktreeResult,
      })
      return
    }
    const msg = errorMessage(error)
    const worktreeResult = await getWorktreeResult(abortController.signal)
    if (abortController.signal.aborted) {
      const partialResult = extractPartialResult(agentMessages)
      enqueueAgentNotification({
        taskId,
        description,
        status: 'killed',
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
        finalMessage: partialResult,
        ...worktreeResult,
      })
      return
    }
    failAsyncAgent(taskId, msg, rootSetAppState)
    enqueueAgentNotification({
      taskId,
      description,
      status: 'failed',
      error: msg,
      setAppState: rootSetAppState,
      toolUseId: toolUseContext.toolUseId,
      ...worktreeResult,
    })
  } finally {
    if (!summariesDetached) {
      await stopSummaries(true)
    }
    clearInvokedSkillsForAgent(agentIdForCleanup)
    clearDumpState(agentIdForCleanup)
  }
}
