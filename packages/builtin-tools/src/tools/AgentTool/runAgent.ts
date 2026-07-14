import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getProjectRoot, getSessionId } from 'src/bootstrap/state.js'
import { getCommand, getSkillToolCommands, hasCommand } from 'src/commands.js'
import {
  DEFAULT_AGENT_PROMPT,
  enhanceSystemPromptWithEnvDetails,
} from 'src/constants/prompts.js'
import type { QuerySource } from 'src/constants/querySource.js'
import { getSystemContext, getUserContext } from 'src/context.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { query } from 'src/query.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { guardAsyncIterableCancellation } from 'src/services/api/providerCancellation.js'
import { getDumpPromptsPath } from 'src/services/api/dumpPrompts.js'
import { cleanupAgentTracking } from 'src/services/api/promptCacheBreakDetection.js'
import {
  connectToServer,
  fetchToolsForClient,
} from 'src/services/mcp/client.js'
import { getMcpConfigByName } from 'src/services/mcp/config.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from 'src/services/mcp/types.js'
import type { Tool, Tools, ToolUseContext } from 'src/Tool.js'
import { killShellTasksForAgent } from 'src/tasks/LocalShellTask/killShellTasks.js'
import type { Command } from 'src/types/command.js'
import type { AgentId } from 'src/types/ids.js'
import type {
  AssistantMessage,
  Message,
  ProgressMessage,
  RequestStartEvent,
  StreamEvent,
  SystemCompactBoundaryMessage,
  TombstoneMessage,
  ToolUseSummaryMessage,
  UserMessage,
} from 'src/types/message.js'
import { createAttachmentMessage } from 'src/utils/attachments.js'
import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
  waitForBoundedSettlement,
} from 'src/utils/abortSettlement.js'
import { AbortError } from 'src/utils/errors.js'
import { StopConfirmationError } from 'src/utils/stopConfirmation.js'
import { getDisplayPath } from 'src/utils/file.js'
import {
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from 'src/utils/fileStateCache.js'
import {
  type CacheSafeParams,
  createSubagentContext,
} from 'src/utils/forkedAgent.js'
import { registerFrontmatterHooks } from 'src/utils/hooks/registerFrontmatterHooks.js'
import { clearSessionHooks } from 'src/utils/hooks/sessionHooks.js'
import { executeSubagentStartHooks } from 'src/utils/hooks.js'
import { createUserMessage } from 'src/utils/messages.js'
import { getAgentModel } from 'src/utils/model/agent.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import { getSubagentProviderRuntimeConfig } from 'src/utils/model/subagentProvider.js'
import { mapThinkingEffortToEffortValue } from 'src/services/connections/thinkingEffort.js'
import { resolveSubagentThinkingConfig } from './resolveSubagentThinkingConfig.js'
import {
  createSubagentTrace,
  endTrace,
  isLangfuseEnabled,
} from 'src/services/langfuse/index.js'
import type { ModelAlias } from 'src/utils/model/aliases.js'
import {
  clearAgentTranscriptSubdir,
  recordSidechainTranscript,
  setAgentTranscriptSubdir,
  writeAgentMetadata,
} from 'src/utils/sessionStorage.js'
import {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted,
} from 'src/utils/settings/pluginOnlyPolicy.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from 'src/utils/systemPromptType.js'
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent,
} from 'src/utils/telemetry/perfettoTracing.js'
import type { ContentReplacementState } from 'src/utils/toolResultStorage.js'
import { createAgentId } from 'src/utils/uuid.js'
import { resolveAgentTools } from './agentToolUtils.js'
import { filterIncompleteToolCalls } from './filterIncompleteToolCalls.js'
import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'

export { filterIncompleteToolCalls } from './filterIncompleteToolCalls.js'

const AGENT_OWNED_CLEANUP_TIMEOUT_MS = 30_000
const AGENT_OWNED_CLEANUP_ABORT_GRACE_MS = 2_000
const AGENT_OPERATION_ABORT_GRACE_MS = 2_000

type AgentOperationSettlementOptions<T> = {
  abortGraceMs?: number
  /** Dispose a resource that resolves only after Stop was unconfirmed. */
  onUnconfirmedResolve?: (value: T) => void | Promise<void>
}

/**
 * Bound one agent-owned await after cancellation. The underlying APIs do not
 * all accept AbortSignal, so a missed grace period is surfaced as an
 * unconfirmed Stop. If a resource arrives later, its disposer still runs.
 *
 * @internal Exported for deterministic lifecycle tests.
 */
export async function waitForAgentOperation<T>(
  settlement: Promise<T>,
  signal: AbortSignal | undefined,
  operation: string,
  {
    abortGraceMs = AGENT_OPERATION_ABORT_GRACE_MS,
    onUnconfirmedResolve,
  }: AgentOperationSettlementOptions<T> = {},
): Promise<T> {
  if (!signal) return settlement

  let abandoned = false
  let didResolve = false
  let resolvedValue: T | undefined
  let disposalStarted = false
  const disposeLateValue = (value: T): void => {
    if (!onUnconfirmedResolve || disposalStarted) return
    disposalStarted = true
    void Promise.resolve()
      .then(() => onUnconfirmedResolve(value))
      .catch(error => {
        logForDebugging(
          `${operation} late-result rollback failed: ${String(error)}`,
          { level: 'warn' },
        )
      })
  }
  const observed = settlement.then(value => {
    didResolve = true
    resolvedValue = value
    if (abandoned) disposeLateValue(value)
    return value
  })

  try {
    return await waitForAbortSettlement(
      observed,
      signal,
      abortGraceMs,
      operation,
    )
  } catch (error) {
    if (error instanceof AbortSettlementTimeoutError) {
      abandoned = true
      if (didResolve) disposeLateValue(resolvedValue as T)
      throw new StopConfirmationError(
        `${operation} did not settle within ${abortGraceMs}ms after abort`,
        [error],
      )
    }
    throw error
  }
}

type AgentCleanupStep = {
  operation: string
  cleanup: () => void | Promise<void>
}

type AgentCleanupSettlementOptions = {
  timeoutMs?: number
  abortGraceMs?: number
}

/** @internal Exported for deterministic lifecycle tests. */
export async function settleAgentCleanupSteps(
  steps: readonly AgentCleanupStep[],
  signal: AbortSignal,
  options: AgentCleanupSettlementOptions = {},
): Promise<unknown[]> {
  const failures: unknown[] = []
  const pending: Array<{ operation: string; promise: Promise<void> }> = []
  const timeoutMs = options.timeoutMs ?? AGENT_OWNED_CLEANUP_TIMEOUT_MS
  const abortGraceMs =
    options.abortGraceMs ?? AGENT_OWNED_CLEANUP_ABORT_GRACE_MS

  try {
    for (const step of steps) {
      try {
        const result = step.cleanup()
        if (result !== undefined) {
          pending.push({
            operation: step.operation,
            promise: waitForBoundedSettlement(result, {
              signal,
              timeoutMs,
              abortGraceMs,
              operation: step.operation,
            }),
          })
        }
      } catch (error) {
        failures.push(error)
        logForDebugging(
          `Agent cleanup scheduling failed for ${step.operation}: ${error}`,
          {
            level: 'warn',
          },
        )
      }
    }
  } finally {
    const results = await Promise.allSettled(pending.map(item => item.promise))
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') continue
      const item = pending[index]!
      failures.push(result.reason)
      logForDebugging(
        `Agent cleanup failed for ${item.operation}: ${result.reason}`,
        {
          level: 'warn',
        },
      )
    }
  }

  return failures
}

/**
 * Initialize agent-specific MCP servers
 * Agents can define their own MCP servers in their frontmatter that are additive
 * to the parent's MCP clients. These servers are connected when the agent starts
 * and cleaned up when the agent finishes.
 *
 * @param agentDefinition The agent definition with optional mcpServers
 * @param parentClients MCP clients inherited from parent context
 * @returns Merged clients (parent + agent-specific), agent MCP tools, and cleanup function
 */
type AgentMcpInitializationDependencies = {
  connectToServer: typeof connectToServer
  fetchToolsForClient: typeof fetchToolsForClient
  getMcpConfigByName: typeof getMcpConfigByName
}

type AgentMcpInitializationOptions = {
  abortGraceMs?: number
}

/** @internal Exported for deterministic lifecycle tests. */
export async function initializeAgentMcpServers(
  agentDefinition: AgentDefinition,
  parentClients: MCPServerConnection[],
  signal?: AbortSignal,
  dependencies?: AgentMcpInitializationDependencies,
  options: AgentMcpInitializationOptions = {},
): Promise<{
  clients: MCPServerConnection[]
  tools: Tools
  cleanup: () => Promise<void>
}> {
  // If no agent-specific servers defined, return parent clients as-is
  if (!agentDefinition.mcpServers?.length) {
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  // When MCP is locked to plugin-only, skip frontmatter MCP servers for
  // USER-CONTROLLED agents only. Plugin, built-in, and policySettings agents
  // are admin-trusted — their frontmatter MCP is part of the admin-approved
  // surface. Blocking them (as the first cut did) breaks plugin agents that
  // legitimately need MCP, contradicting "plugin-provided always loads."
  const agentIsAdminTrusted = isSourceAdminTrusted(agentDefinition.source)
  if (isRestrictedToPluginOnly('mcp') && !agentIsAdminTrusted) {
    logForDebugging(
      `[Agent: ${agentDefinition.agentType}] Skipping MCP servers: strictPluginOnlyCustomization locks MCP to plugin-only (agent source: ${agentDefinition.source})`,
    )
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  const agentClients: MCPServerConnection[] = []
  // Track which clients were newly created (inline definitions) vs. shared from parent
  // Only newly created clients should be cleaned up when the agent finishes
  const newlyCreatedClients: MCPServerConnection[] = []
  const agentTools: Tool[] = []
  const resolvedDependencies = dependencies ?? {
    connectToServer,
    fetchToolsForClient,
    getMcpConfigByName,
  }

  // Create cleanup function for agent-specific servers
  // Only clean up newly created clients (inline definitions), not shared/referenced ones
  // Shared clients (referenced by string name) are memoized and used by the parent context
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      const connectedClients = newlyCreatedClients.filter(
        client => client.type === 'connected',
      )
      const results = await Promise.allSettled(
        connectedClients.map(client => client.cleanup()),
      )
      const failures: unknown[] = []
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') continue
        const client = connectedClients[index]!
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Error cleaning up MCP server '${client.name}': ${result.reason}`,
          { level: 'warn' },
        )
        failures.push(result.reason)
      }
      if (failures.length > 0) {
        throw new StopConfirmationError(
          `Failed to confirm cleanup of ${failures.length} MCP server(s) owned by agent ${agentDefinition.agentType}`,
          failures,
        )
      }
    })()
    return cleanupPromise
  }

  try {
    for (const spec of agentDefinition.mcpServers) {
      signal?.throwIfAborted()

      let config: ScopedMcpServerConfig | null = null
      let name: string
      let isNewlyCreated = false

      if (typeof spec === 'string') {
        // Reference by name - look up in existing MCP configs
        // This uses the memoized connectToServer, so we may get a shared client
        name = spec
        config = resolvedDependencies.getMcpConfigByName(spec)
        if (!config) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] MCP server not found: ${spec}`,
            { level: 'warn' },
          )
          continue
        }
      } else {
        // Inline definition as { [name]: config }
        // These are agent-specific servers that should be cleaned up
        const entries = Object.entries(spec)
        if (entries.length !== 1) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Invalid MCP server spec: expected exactly one key`,
            { level: 'warn' },
          )
          continue
        }
        const [serverName, serverConfig] = entries[0]!
        name = serverName
        config = {
          ...serverConfig,
          scope: 'dynamic' as const,
        } as ScopedMcpServerConfig
        isNewlyCreated = true
      }

      // Connect to the server
      const connection = Promise.resolve(
        resolvedDependencies.connectToServer(name, config),
      )
      const client = await waitForAgentOperation(
        connection,
        signal,
        `Agent ${agentDefinition.agentType} MCP server '${name}' connection`,
        {
          abortGraceMs: options.abortGraceMs,
          ...(isNewlyCreated
            ? {
                onUnconfirmedResolve: async (
                  lateClient: MCPServerConnection,
                ) => {
                  if (lateClient.type === 'connected') {
                    await lateClient.cleanup()
                  }
                },
              }
            : {}),
        },
      )
      agentClients.push(client)
      if (isNewlyCreated) {
        newlyCreatedClients.push(client)
      }
      signal?.throwIfAborted()

      // Fetch tools if connected
      if (client.type === 'connected') {
        const tools = await waitForAgentOperation(
          Promise.resolve(resolvedDependencies.fetchToolsForClient(client)),
          signal,
          `Agent ${agentDefinition.agentType} MCP server '${name}' tool discovery`,
          { abortGraceMs: options.abortGraceMs },
        )
        signal?.throwIfAborted()
        agentTools.push(...tools)
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Connected to MCP server '${name}' with ${tools.length} tools`,
        )
      } else {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Failed to connect to MCP server '${name}': ${client.type}`,
          { level: 'warn' },
        )
      }
    }
  } catch (error) {
    try {
      await waitForAgentOperation(
        cleanup(),
        signal,
        `Agent ${agentDefinition.agentType} MCP initialization rollback`,
        { abortGraceMs: options.abortGraceMs },
      )
    } catch (cleanupError) {
      const cleanupFailures =
        cleanupError instanceof StopConfirmationError
          ? cleanupError.failures
          : [cleanupError]
      throw new StopConfirmationError(
        `Agent ${agentDefinition.agentType} MCP initialization failed and cleanup could not be confirmed`,
        [error, ...cleanupFailures],
      )
    }
    throw error
  }

  // Return merged clients (parent + agent-specific) and agent tools
  return {
    clients: [...parentClients, ...agentClients],
    tools: agentTools,
    cleanup,
  }
}

type QueryMessage =
  | StreamEvent
  | RequestStartEvent
  | Message
  | ToolUseSummaryMessage
  | TombstoneMessage

/**
 * Type guard to check if a message from query() is a recordable Message type.
 * Matches the types we want to record: assistant, user, progress, or system compact_boundary.
 */
function isRecordableMessage(
  msg: QueryMessage,
): msg is
  | AssistantMessage
  | UserMessage
  | ProgressMessage
  | SystemCompactBoundaryMessage {
  return (
    msg.type === 'assistant' ||
    msg.type === 'user' ||
    msg.type === 'progress' ||
    (msg.type === 'system' &&
      'subtype' in msg &&
      msg.subtype === 'compact_boundary')
  )
}

export async function* runAgent({
  agentDefinition,
  promptMessages,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  override,
  model,
  maxTurns,
  preserveToolUseResults,
  availableTools,
  allowedTools,
  onCacheSafeParams,
  contentReplacementState,
  useExactTools,
  worktreePath,
  description,
  transcriptSubdir,
  onQueryProgress,
}: {
  agentDefinition: AgentDefinition
  promptMessages: Message[]
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  isAsync: boolean
  /** Whether this agent can show permission prompts. Defaults to !isAsync.
   * Set to true for in-process teammates that run async but share the terminal. */
  canShowPermissionPrompts?: boolean
  forkContextMessages?: Message[]
  querySource: QuerySource
  override?: {
    userContext?: { [k: string]: string }
    systemContext?: { [k: string]: string }
    systemPrompt?: SystemPrompt
    abortController?: AbortController
    agentId?: AgentId
  }
  model?: ModelAlias
  maxTurns?: number
  /** Preserve toolUseResult on messages for subagents with viewable transcripts */
  preserveToolUseResults?: boolean
  /** Precomputed tool pool for the worker agent. Computed by the caller
   * (AgentTool.tsx) to avoid a circular dependency between runAgent and tools.ts.
   * Always contains the full tool pool assembled with the worker's own permission
   * mode, independent of the parent's tool restrictions. */
  availableTools: Tools
  /** Tool permission rules to add to the agent's session allow rules.
   * When provided, replaces ALL allow rules so the agent only has what's
   * explicitly listed (parent approvals don't leak through). */
  allowedTools?: string[]
  /** Optional callback invoked with CacheSafeParams after constructing the agent's
   * system prompt, context, and tools. Used by background summarization to fork
   * the agent's conversation for periodic progress summaries. */
  onCacheSafeParams?: (params: CacheSafeParams) => void
  /** Replacement state reconstructed from a resumed sidechain transcript so
   * the same tool results are re-replaced (prompt cache stability). When
   * omitted, createSubagentContext clones the parent's state. */
  contentReplacementState?: ContentReplacementState
  /** When true, use availableTools directly without filtering through
   * resolveAgentTools(). Also inherits the parent's thinkingConfig and
   * isNonInteractiveSession instead of overriding them. Used by the fork
   * subagent path to produce byte-identical API request prefixes for
   * prompt cache hits. */
  useExactTools?: boolean
  /** Worktree path if the agent was spawned with isolation: "worktree".
   * Persisted to metadata so resume can restore the correct cwd. */
  worktreePath?: string
  /** Original task description from AgentTool input. Persisted to metadata
   * so a resumed agent's notification can show the original description. */
  description?: string
  /** Optional subdirectory under subagents/ to group this agent's transcript
   * with related ones (e.g. workflows/<runId> for workflow subagents). */
  transcriptSubdir?: string
  /** Optional callback fired on every message yielded by query() — including
   * stream_event deltas that runAgent otherwise drops. Use to detect liveness
   * during long single-block streams (e.g. thinking) where no assistant
   * message is yielded for >60s. */
  onQueryProgress?: () => void
}): AsyncGenerator<Message, void> {
  // Track subagent usage for feature discovery

  const appState = toolUseContext.getAppState()
  const permissionMode = appState.toolPermissionContext.mode
  // Always-shared channel to the root AppState store. toolUseContext.setAppState
  // is a no-op when the *parent* is itself an async agent (nested async→async),
  // so session-scoped writes (hooks, bash tasks) must go through this instead.
  const rootSetAppState =
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState

  const providerRuntimeConfig =
    toolUseContext.options.providerRuntimeConfig ??
    getSubagentProviderRuntimeConfig()

  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    toolUseContext.options.mainLoopModel,
    model,
    permissionMode,
    providerRuntimeConfig,
  )

  const agentId = override?.agentId ? override.agentId : createAgentId()

  // Determine abortController before acquiring any agent-owned resources so
  // cancellation during initialization enters the same lifecycle finalizer.
  // - Override takes precedence
  // - Async agents get a new unlinked controller (runs independently)
  // - Sync agents share parent's controller
  const agentAbortController = override?.abortController
    ? override.abortController
    : isAsync
      ? new AbortController()
      : toolUseContext.abortController

  let runError: unknown
  let didRunError = false
  let cleanupError: StopConfirmationError | undefined
  let mcpCleanup: () => Promise<void> = async () => {}
  const cleanupSteps: AgentCleanupStep[] = [
    {
      operation: `Agent ${agentId} workflow cleanup`,
      cleanup: () => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        if (!feature('WORKFLOW_SCRIPTS')) return
        const workflowMod =
          require('src/tasks/LocalWorkflowTask/LocalWorkflowTask.js') as typeof import('src/tasks/LocalWorkflowTask/LocalWorkflowTask.js')
        return workflowMod.killWorkflowTasksForAgent(
          agentId,
          toolUseContext.getAppState,
          rootSetAppState,
        )
        /* eslint-enable @typescript-eslint/no-require-imports */
      },
    },
    {
      operation: `Agent ${agentId} MCP cleanup`,
      cleanup: () => mcpCleanup(),
    },
    {
      operation: `Agent ${agentId} shell cleanup`,
      cleanup: () =>
        killShellTasksForAgent(
          agentId,
          toolUseContext.getAppState,
          rootSetAppState,
        ),
    },
    {
      operation: `Agent ${agentId} monitor cleanup`,
      cleanup: () => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        if (!feature('MONITOR_TOOL')) return
        const monitorMod =
          require('src/tasks/MonitorMcpTask/MonitorMcpTask.js') as typeof import('src/tasks/MonitorMcpTask/MonitorMcpTask.js')
        return monitorMod.killMonitorMcpTasksForAgent(
          agentId,
          toolUseContext.getAppState,
          rootSetAppState,
        )
        /* eslint-enable @typescript-eslint/no-require-imports */
      },
    },
    {
      operation: `Agent ${agentId} session hook cleanup`,
      cleanup: () => {
        if (agentDefinition.hooks) clearSessionHooks(rootSetAppState, agentId)
      },
    },
    {
      operation: `Agent ${agentId} prompt cache cleanup`,
      cleanup: () => {
        if (feature('PROMPT_CACHE_BREAK_DETECTION'))
          cleanupAgentTracking(agentId)
      },
    },
    {
      operation: `Agent ${agentId} Perfetto cleanup`,
      cleanup: () => unregisterPerfettoAgent(agentId),
    },
    {
      operation: `Agent ${agentId} transcript mapping cleanup`,
      cleanup: () => clearAgentTranscriptSubdir(agentId),
    },
    {
      operation: `Agent ${agentId} todo cleanup`,
      cleanup: () => {
        rootSetAppState(prev => {
          if (!(agentId in prev.todos)) return prev
          const { [agentId]: _removed, ...todos } = prev.todos
          return { ...prev, todos }
        })
      },
    },
  ]

  try {
    agentAbortController.signal.throwIfAborted()

    // Route this agent's transcript into a grouping subdirectory if requested
    // (e.g. workflow subagents write to subagents/workflows/<runId>/).
    if (transcriptSubdir) {
      setAgentTranscriptSubdir(agentId, transcriptSubdir)
    }

    // Register agent in Perfetto trace for hierarchy visualization
    if (isPerfettoTracingEnabled()) {
      const parentId = toolUseContext.agentId ?? getSessionId()
      registerPerfettoAgent(agentId, agentDefinition.agentType, parentId)
    }

    // Log API calls path for subagents (ant-only)
    if (process.env.USER_TYPE === 'ant') {
      logForDebugging(
        `[Subagent ${agentDefinition.agentType}] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}`,
      )
    }

    // Handle message forking for context sharing
    // Filter out incomplete tool calls from parent messages to avoid API errors
    const contextMessages: Message[] = forkContextMessages
      ? filterIncompleteToolCalls(forkContextMessages)
      : []
    const initialMessages: Message[] = [...contextMessages, ...promptMessages]
    cleanupSteps.push({
      operation: `Agent ${agentId} initial message cleanup`,
      cleanup: () => {
        initialMessages.length = 0
      },
    })

    const agentReadFileState =
      forkContextMessages !== undefined
        ? cloneFileStateCache(toolUseContext.readFileState)
        : createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)
    cleanupSteps.push({
      operation: `Agent ${agentId} file state cleanup`,
      cleanup: () => agentReadFileState.clear(),
    })

    const [baseUserContext, baseSystemContext] = await waitForAgentOperation(
      Promise.all([
        override?.userContext ?? getUserContext(),
        override?.systemContext ?? getSystemContext(),
      ]),
      agentAbortController.signal,
      `Agent ${agentId} context loading`,
    )
    agentAbortController.signal.throwIfAborted()

    // Read-only agents (Explore, Plan) don't act on commit/PR/lint rules from
    // CLAUDE.md — the main agent has full context and interprets their output.
    // Dropping claudeMd here saves ~5-15 Gtok/week across 34M+ Explore spawns.
    // Explicit override.userContext from callers is preserved untouched.
    // Kill-switch defaults true; flip tengu_slim_subagent_claudemd=false to revert.
    const shouldOmitClaudeMd =
      agentDefinition.omitClaudeMd &&
      !override?.userContext &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_slim_subagent_claudemd', true)
    const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } =
      baseUserContext
    const resolvedUserContext = shouldOmitClaudeMd
      ? userContextNoClaudeMd
      : baseUserContext

    // Explore/Plan are read-only search agents — the parent-session-start
    // gitStatus (up to 40KB, explicitly labeled stale) is dead weight. If they
    // need git info they run `git status` themselves and get fresh data.
    // Saves ~1-3 Gtok/week fleet-wide.
    const { gitStatus: _omittedGitStatus, ...systemContextNoGit } =
      baseSystemContext
    const resolvedSystemContext =
      agentDefinition.agentType === 'Explore' ||
      agentDefinition.agentType === 'Plan'
        ? systemContextNoGit
        : baseSystemContext

    // Override permission mode if agent defines one
    // However, don't override if parent is in bypassPermissions or acceptEdits mode - those should always take precedence
    // For async agents, also set shouldAvoidPermissionPrompts since they can't show UI
    const agentPermissionMode = agentDefinition.permissionMode
    const agentGetAppState = () => {
      const state = toolUseContext.getAppState()
      let toolPermissionContext = state.toolPermissionContext

      // Override permission mode if agent defines one (unless parent is bypassPermissions, acceptEdits, or auto)
      if (
        agentPermissionMode &&
        state.toolPermissionContext.mode !== 'bypassPermissions' &&
        state.toolPermissionContext.mode !== 'acceptEdits' &&
        !(
          feature('TRANSCRIPT_CLASSIFIER') &&
          state.toolPermissionContext.mode === 'auto'
        )
      ) {
        toolPermissionContext = {
          ...toolPermissionContext,
          mode: agentPermissionMode,
        }
      }

      // Set flag to auto-deny prompts for agents that can't show UI
      // Use explicit canShowPermissionPrompts if provided, otherwise:
      //   - bubble mode: always show prompts (bubbles to parent terminal)
      //   - default: !isAsync (sync agents show prompts, async agents don't)
      const shouldAvoidPrompts =
        canShowPermissionPrompts !== undefined
          ? !canShowPermissionPrompts
          : agentPermissionMode === 'bubble'
            ? false
            : isAsync
      if (shouldAvoidPrompts) {
        toolPermissionContext = {
          ...toolPermissionContext,
          shouldAvoidPermissionPrompts: true,
        }
      }

      // For background agents that can show prompts, await automated checks
      // (classifier, permission hooks) before showing the permission dialog.
      // Since these are background agents, waiting is fine — the user should
      // only be interrupted when automated checks can't resolve the permission.
      // This applies to bubble mode (always) and explicit canShowPermissionPrompts.
      if (isAsync && !shouldAvoidPrompts) {
        toolPermissionContext = {
          ...toolPermissionContext,
          awaitAutomatedChecksBeforeDialog: true,
        }
      }

      // Scope tool permissions: when allowedTools is provided, use them as session rules.
      // IMPORTANT: Preserve cliArg rules (from SDK's --allowedTools) since those are
      // explicit permissions from the SDK consumer that should apply to all agents.
      // Only clear session-level rules from the parent to prevent unintended leakage.
      if (allowedTools !== undefined) {
        toolPermissionContext = {
          ...toolPermissionContext,
          alwaysAllowRules: {
            // Preserve SDK-level permissions from --allowedTools
            cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
            // Use the provided allowedTools as session-level permissions
            session: [...allowedTools],
          },
        }
      }

      // Override effort level: agent definition wins, then the subagent
      // connection profile's pinned thinking effort, then the parent state.
      const effortValue =
        agentDefinition.effort !== undefined
          ? agentDefinition.effort
          : (mapThinkingEffortToEffortValue(
              providerRuntimeConfig?.thinkingEffort,
            ) ?? state.effortValue)

      if (
        toolPermissionContext === state.toolPermissionContext &&
        effortValue === state.effortValue
      ) {
        return state
      }
      return {
        ...state,
        toolPermissionContext,
        effortValue,
      }
    }

    const resolvedTools = useExactTools
      ? availableTools
      : resolveAgentTools(agentDefinition, availableTools, isAsync)
          .resolvedTools

    const additionalWorkingDirectories = Array.from(
      appState.toolPermissionContext.additionalWorkingDirectories.keys(),
    )

    const agentSystemPrompt = override?.systemPrompt
      ? override.systemPrompt
      : asSystemPrompt(
          await waitForAgentOperation(
            getAgentSystemPrompt(
              agentDefinition,
              toolUseContext,
              resolvedAgentModel,
              additionalWorkingDirectories,
              resolvedTools,
            ),
            agentAbortController.signal,
            `Agent ${agentId} system prompt loading`,
          ),
        )
    agentAbortController.signal.throwIfAborted()

    // Execute SubagentStart hooks and collect additional context
    const additionalContexts: string[] = []
    for await (const hookResult of guardAsyncIterableCancellation(
      executeSubagentStartHooks(
        agentId,
        agentDefinition.agentType,
        agentAbortController.signal,
      ),
      agentAbortController.signal,
      {
        abortGraceMs: AGENT_OPERATION_ABORT_GRACE_MS,
        returnTimeoutMs: AGENT_OPERATION_ABORT_GRACE_MS,
        operation: `Agent ${agentId} SubagentStart hooks`,
      },
    )) {
      if (
        hookResult.additionalContexts &&
        hookResult.additionalContexts.length > 0
      ) {
        additionalContexts.push(...hookResult.additionalContexts)
      }
    }
    agentAbortController.signal.throwIfAborted()

    // Add SubagentStart hook context as a user message (consistent with SessionStart/UserPromptSubmit)
    if (additionalContexts.length > 0) {
      const contextMessage = createAttachmentMessage({
        type: 'hook_additional_context',
        content: additionalContexts,
        hookName: 'SubagentStart',
        toolUseID: randomUUID(),
        hookEvent: 'SubagentStart',
      })
      initialMessages.push(contextMessage)
    }

    // Register agent's frontmatter hooks (scoped to agent lifecycle)
    // Pass isAgent=true to convert Stop hooks to SubagentStop (since subagents trigger SubagentStop)
    // Same admin-trusted gate for frontmatter hooks: under ["hooks"] alone
    // (skills/agents not locked), user agents still load — block their
    // frontmatter-hook REGISTRATION here where source is known, rather than
    // blanket-blocking all session hooks at execution time (which would
    // also kill plugin agents' hooks).
    const hooksAllowedForThisAgent =
      !isRestrictedToPluginOnly('hooks') ||
      isSourceAdminTrusted(agentDefinition.source)
    if (agentDefinition.hooks && hooksAllowedForThisAgent) {
      registerFrontmatterHooks(
        rootSetAppState,
        agentId,
        agentDefinition.hooks,
        `agent '${agentDefinition.agentType}'`,
        true, // isAgent - converts Stop to SubagentStop
      )
    }

    // Preload skills from agent frontmatter
    const skillsToPreload = agentDefinition.skills ?? []
    if (skillsToPreload.length > 0) {
      const allSkills = await getSkillToolCommands(getProjectRoot())
      agentAbortController.signal.throwIfAborted()

      // Filter valid skills and warn about missing ones
      const validSkills: Array<{
        skillName: string
        skill: (typeof allSkills)[0] & { type: 'prompt' }
      }> = []

      for (const skillName of skillsToPreload) {
        // Resolve the skill name, trying multiple strategies:
        // 1. Exact match (hasCommand checks name, userFacingName, aliases)
        // 2. Fully-qualified with agent's plugin prefix (e.g., "my-skill" → "plugin:my-skill")
        // 3. Suffix match on ":skillName" for plugin-namespaced skills
        const resolvedName = resolveSkillName(
          skillName,
          allSkills,
          agentDefinition,
        )
        if (!resolvedName) {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' specified in frontmatter was not found`,
            { level: 'warn' },
          )
          continue
        }

        const skill = getCommand(resolvedName, allSkills)
        if (skill.type !== 'prompt') {
          logForDebugging(
            `[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' is not a prompt-based skill`,
            { level: 'warn' },
          )
          continue
        }
        validSkills.push({ skillName, skill })
      }

      // Load all skill contents concurrently and add to initial messages
      const { formatSkillLoadingMetadata } = await import(
        'src/utils/processUserInput/processSlashCommand.js'
      )
      agentAbortController.signal.throwIfAborted()
      const loaded = await Promise.all(
        validSkills.map(async ({ skillName, skill }) => ({
          skillName,
          skill,
          content: await skill.getPromptForCommand('', toolUseContext),
        })),
      )
      agentAbortController.signal.throwIfAborted()
      for (const { skillName, skill, content } of loaded) {
        logForDebugging(
          `[Agent: ${agentDefinition.agentType}] Preloaded skill '${skillName}'`,
        )

        // Add command-message metadata so the UI shows which skill is loading
        const metadata = formatSkillLoadingMetadata(
          skillName,
          skill.progressMessage,
        )

        initialMessages.push(
          createUserMessage({
            content: [{ type: 'text', text: metadata }, ...content],
            isMeta: true,
          }),
        )
      }
    }

    // Initialize agent-specific MCP servers (additive to parent's servers)
    const mcpInitialization = await initializeAgentMcpServers(
      agentDefinition,
      toolUseContext.options.mcpClients,
      agentAbortController.signal,
    )
    mcpCleanup = mcpInitialization.cleanup
    const { clients: mergedMcpClients, tools: agentMcpTools } =
      mcpInitialization
    agentAbortController.signal.throwIfAborted()

    // Merge agent MCP tools with resolved agent tools, deduplicating by name.
    // resolvedTools is already deduplicated (see resolveAgentTools), so skip
    // the spread + uniqBy overhead when there are no agent-specific MCP tools.
    const allTools =
      agentMcpTools.length > 0
        ? uniqBy([...resolvedTools, ...agentMcpTools], 'name')
        : resolvedTools

    // Build agent-specific options
    const agentOptions: ToolUseContext['options'] = {
      isNonInteractiveSession: useExactTools
        ? toolUseContext.options.isNonInteractiveSession
        : isAsync
          ? true
          : (toolUseContext.options.isNonInteractiveSession ?? false),
      appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
      tools: allTools,
      commands: [],
      debug: toolUseContext.options.debug,
      verbose: toolUseContext.options.verbose,
      mainLoopModel: resolvedAgentModel,
      // Fork children inherit the parent's thinking config (prompt cache);
      // regular sub-agents follow the subagent connection profile's
      // thinkingEffort ('off' disables, anything else keeps the parent/default
      // config — see resolveSubagentThinkingConfig).
      thinkingConfig: resolveSubagentThinkingConfig({
        useExactTools,
        parentThinkingConfig: toolUseContext.options.thinkingConfig,
        providerRuntimeConfig,
      }),
      mcpClients: mergedMcpClients,
      mcpResources: toolUseContext.options.mcpResources,
      agentDefinitions: toolUseContext.options.agentDefinitions,
      ...(providerRuntimeConfig && { providerRuntimeConfig }),
      // Fork children (useExactTools path) need querySource on context.options
      // for the recursive-fork guard at AgentTool.tsx call() — it checks
      // options.querySource === 'agent:builtin:fork'. This survives autocompact
      // (which rewrites messages, not context.options). Without this, the guard
      // reads undefined and only the message-scan fallback fires — which
      // autocompact defeats by replacing the fork-boilerplate message.
      ...(useExactTools && { querySource }),
    }

    // Create subagent context using shared helper
    // - Sync agents share setAppState, setResponseLength, abortController with parent
    // - Async agents are fully isolated (but with explicit unlinked abortController)
    const agentToolUseContext = createSubagentContext(toolUseContext, {
      options: agentOptions,
      agentId,
      agentType: agentDefinition.agentType,
      messages: initialMessages,
      readFileState: agentReadFileState,
      abortController: agentAbortController,
      getAppState: agentGetAppState,
      // Sync agents share these callbacks with parent
      shareSetAppState: !isAsync,
      shareSetResponseLength: true, // Both sync and async contribute to response metrics
      criticalSystemReminder_EXPERIMENTAL:
        agentDefinition.criticalSystemReminder_EXPERIMENTAL,
      contentReplacementState,
    })

    // Preserve tool use results for subagents with viewable transcripts (in-process teammates)
    if (preserveToolUseResults) {
      agentToolUseContext.preserveToolUseResults = true
    }

    // Expose cache-safe params for background summarization (prompt cache sharing)
    if (onCacheSafeParams) {
      onCacheSafeParams({
        systemPrompt: agentSystemPrompt,
        userContext: resolvedUserContext,
        systemContext: resolvedSystemContext,
        toolUseContext: agentToolUseContext,
        forkContextMessages: initialMessages,
      })
    }

    // Record initial messages before the query loop starts, plus the agentType
    // so resume can route correctly when subagent_type is omitted. Transcript
    // failures remain best-effort, but an abort-ignoring write must not pin the
    // agent iterator forever or be mistaken for a confirmed Stop.
    try {
      await waitForAgentOperation(
        recordSidechainTranscript(initialMessages, agentId),
        agentAbortController.signal,
        `Agent ${agentId} initial transcript write`,
      )
    } catch (error) {
      if (error instanceof StopConfirmationError) throw error
      logForDebugging(`Failed to record sidechain transcript: ${error}`)
    }
    agentAbortController.signal.throwIfAborted()
    void writeAgentMetadata(agentId, {
      agentType: agentDefinition.agentType,
      ...(worktreePath && { worktreePath }),
      ...(description && { description }),
    }).catch(_err => logForDebugging(`Failed to write agent metadata: ${_err}`))

    // Track the last recorded message UUID for parent chain continuity
    let lastRecordedUuid: UUID | null = initialMessages.at(-1)?.uuid ?? null

    // Create Langfuse sub-agent trace (no-op if not configured).
    // Sub-agent trace shares the same sessionId as the parent, so Langfuse
    // groups them under the same Session view.
    const subTrace = isLangfuseEnabled()
      ? createSubagentTrace({
          sessionId: getSessionId(),
          agentType: agentDefinition.agentType,
          agentId,
          model: resolvedAgentModel,
          provider: providerRuntimeConfig?.provider ?? getAPIProvider(),
          input: initialMessages,
        })
      : null
    cleanupSteps.push({
      operation: `Agent ${agentId} trace cleanup`,
      cleanup: () => endTrace(subTrace),
    })

    // Attach sub-agent trace to toolUseContext so query() reuses it
    if (subTrace) {
      agentToolUseContext.langfuseTrace = subTrace
    }

    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      canUseTool,
      toolUseContext: agentToolUseContext,
      querySource,
      maxTurns: maxTurns ?? agentDefinition.maxTurns,
    })) {
      onQueryProgress?.()
      // Forward subagent API request starts to parent's metrics display
      // so TTFT/OTPS update during subagent execution.
      if (
        message.type === 'stream_event' &&
        (message as any).event.type === 'message_start' &&
        (message as any).ttftMs != null
      ) {
        toolUseContext.pushApiMetricsEntry?.((message as any).ttftMs)
        continue
      }

      // Yield attachment messages (e.g., structured_output) without recording them
      if (message.type === 'attachment') {
        // Handle max turns reached signal from query.ts
        if ((message as any).attachment.type === 'max_turns_reached') {
          logForDebugging(
            `[Agent
: $
{
  agentDefinition.agentType
}
] Reached max turns limit ($
{
  (message as any).attachment.maxTurns
}
)`,
          )
          break
        }
        yield message as Message
        continue
      }

      if (isRecordableMessage(message)) {
        // Record only the new message with correct parent (O(1) per message)
        try {
          await waitForAgentOperation(
            recordSidechainTranscript([message], agentId, lastRecordedUuid),
            agentAbortController.signal,
            `Agent ${agentId} transcript write`,
          )
        } catch (error) {
          if (error instanceof StopConfirmationError) throw error
          logForDebugging(`Failed to record sidechain transcript: ${error}`)
        }
        agentAbortController.signal.throwIfAborted()
        if (message.type !== 'progress') {
          lastRecordedUuid = message.uuid
        }
        yield message
      }
    }

    if (agentAbortController.signal.aborted) {
      throw new AbortError()
    }

    // Run callback if provided (only built-in agents have callbacks)
    if (isBuiltInAgent(agentDefinition) && agentDefinition.callback) {
      agentDefinition.callback()
    }
  } catch (error) {
    didRunError = true
    runError = error
  } finally {
    const stopFailures = await settleAgentCleanupSteps(
      cleanupSteps,
      agentAbortController.signal,
    )
    if (stopFailures.length > 0) {
      cleanupError = new StopConfirmationError(
        `Agent ${agentId} cleanup could not confirm all owned executions stopped`,
        didRunError ? [runError, ...stopFailures] : stopFailures,
      )
    }
  }
  if (cleanupError) throw cleanupError
  if (didRunError) throw runError
}

async function getAgentSystemPrompt(
  agentDefinition: AgentDefinition,
  toolUseContext: Pick<ToolUseContext, 'options'>,
  resolvedAgentModel: string,
  additionalWorkingDirectories: string[],
  resolvedTools: readonly Tool[],
): Promise<string[]> {
  const enabledToolNames = new Set(resolvedTools.map(t => t.name))
  try {
    const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext })
    const prompts = [agentPrompt]

    return await enhanceSystemPromptWithEnvDetails(
      prompts,
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  } catch (_error) {
    return enhanceSystemPromptWithEnvDetails(
      [DEFAULT_AGENT_PROMPT],
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  }
}

/**
 * Resolve a skill name from agent frontmatter to a registered command name.
 *
 * Plugin skills are registered with namespaced names (e.g., "my-plugin:my-skill")
 * but agents reference them with bare names (e.g., "my-skill"). This function
 * tries multiple resolution strategies:
 *
 * 1. Exact match via hasCommand (name, userFacingName, aliases)
 * 2. Prefix with agent's plugin name (e.g., "my-skill" → "my-plugin:my-skill")
 * 3. Suffix match — find any command whose name ends with ":skillName"
 */
function resolveSkillName(
  skillName: string,
  allSkills: Command[],
  agentDefinition: AgentDefinition,
): string | null {
  // 1. Direct match
  if (hasCommand(skillName, allSkills)) {
    return skillName
  }

  // 2. Try prefixing with the agent's plugin name
  // Plugin agents have agentType like "pluginName:agentName"
  const pluginPrefix = agentDefinition.agentType.split(':')[0]
  if (pluginPrefix) {
    const qualifiedName = `${pluginPrefix}:${skillName}`
    if (hasCommand(qualifiedName, allSkills)) {
      return qualifiedName
    }
  }

  // 3. Suffix match — find a skill whose name ends with ":skillName"
  const suffix = `:${skillName}`
  const match = allSkills.find(cmd => cmd.name.endsWith(suffix))
  if (match) {
    return match.name
  }

  return null
}
