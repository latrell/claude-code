/**
 * In-process teammate spawning
 *
 * Creates and registers an in-process teammate task. Unlike process-based
 * teammates (tmux/iTerm2), in-process teammates run in the same Node.js
 * process using AsyncLocalStorage for context isolation.
 *
 * The actual agent execution loop is handled by InProcessTeammateTask
 * component (Task #14). This module handles:
 * 1. Creating TeammateContext
 * 2. Creating linked AbortController
 * 3. Registering InProcessTeammateTaskState in AppState
 * 4. Returning spawn result for backend
 */

import sample from 'lodash-es/sample.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getSpinnerVerbs } from '../../constants/spinnerVerbs.js'
import { TURN_COMPLETION_VERBS } from '../../constants/turnCompletionVerbs.js'
import type { AppState } from '../../state/AppState.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import type {
  InProcessTeammateTaskState,
  TeammateIdentity,
} from '../../tasks/InProcessTeammateTask/types.js'
import { createAbortController } from '../abortController.js'
import { markAutonomyRunFailed } from '../autonomyRuns.js'
import { formatAgentId } from '../agentId.js'
import { registerCleanup } from '../cleanupRegistry.js'
import { logForDebugging } from '../debug.js'
import { emitTaskTerminatedSdk } from '../sdkEventQueue.js'
import { evictTaskOutput } from '../task/diskOutput.js'
import {
  evictTerminalTask,
  registerTask,
  STOPPED_DISPLAY_MS,
} from '../task/framework.js'
import { createTeammateContext } from '../teammateContext.js'
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent,
} from '../telemetry/perfettoTracing.js'
import {
  cancelInProcessTeammateRunnerReservation,
  reserveInProcessTeammateRunner,
  waitForInProcessTeammateRunner,
} from './inProcessLifecycle.js'
import { removeMemberByAgentId } from './teamHelpers.js'

type SetAppStateFn = (updater: (prev: AppState) => AppState) => void

/**
 * Minimal context required for spawning an in-process teammate.
 * This is a subset of ToolUseContext - only what spawnInProcessTeammate actually uses.
 */
export type SpawnContext = {
  setAppState: SetAppStateFn
  toolUseId?: string
}

/**
 * Configuration for spawning an in-process teammate.
 */
export type InProcessSpawnConfig = {
  /** Display name for the teammate, e.g., "researcher" */
  name: string
  /** Team this teammate belongs to */
  teamName: string
  /** Initial prompt/task for the teammate */
  prompt: string
  /** Optional UI color for the teammate */
  color?: string
  /** Whether teammate must enter plan mode before implementing */
  planModeRequired: boolean
  /** Optional model override for this teammate */
  model?: string
}

/**
 * Result from spawning an in-process teammate.
 */
export type InProcessSpawnOutput = {
  /** Whether spawn was successful */
  success: boolean
  /** Full agent ID (format: "name@team") */
  agentId: string
  /** Task ID for tracking in AppState */
  taskId?: string
  /** AbortController for this teammate (linked to parent) */
  abortController?: AbortController
  /** Teammate context for AsyncLocalStorage */
  teammateContext?: ReturnType<typeof createTeammateContext>
  /** Error message if spawn failed */
  error?: string
}

/**
 * Spawns an in-process teammate.
 *
 * Creates the teammate's context, registers the task in AppState, and returns
 * the spawn result. The actual agent execution is driven by the
 * InProcessTeammateTask component which uses runWithTeammateContext() to
 * execute the agent loop with proper identity isolation.
 *
 * @param config - Spawn configuration
 * @param context - Context with setAppState for registering task
 * @returns Spawn result with teammate info
 */
export async function spawnInProcessTeammate(
  config: InProcessSpawnConfig,
  context: SpawnContext,
): Promise<InProcessSpawnOutput> {
  const { name, teamName, prompt, color, planModeRequired, model } = config
  const { setAppState } = context

  // Generate deterministic agent ID
  const agentId = formatAgentId(name, teamName)
  const taskId = generateTaskId('in_process_teammate')
  let runnerReserved = false

  logForDebugging(
    `[spawnInProcessTeammate] Spawning ${agentId} (taskId: ${taskId})`,
  )

  try {
    // Create independent AbortController for this teammate
    // Teammates should not be aborted when the leader's query is interrupted
    const abortController = createAbortController()

    // Get parent session ID for transcript correlation
    const parentSessionId = getSessionId()

    // Create teammate identity (stored as plain data in AppState)
    const identity: TeammateIdentity = {
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId,
    }

    // Create teammate context for AsyncLocalStorage
    // This will be used by runWithTeammateContext() during agent execution
    const teammateContext = createTeammateContext({
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId,
      abortController,
    })

    // Register agent in Perfetto trace for hierarchy visualization
    if (isPerfettoTracingEnabled()) {
      registerPerfettoAgent(agentId, name, parentSessionId)
    }

    // Create task state
    const description = `${name}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`

    const taskState: InProcessTeammateTaskState = {
      ...createTaskStateBase(
        taskId,
        'in_process_teammate',
        description,
        context.toolUseId,
      ),
      type: 'in_process_teammate',
      status: 'running',
      identity,
      prompt,
      model,
      abortController,
      awaitingPlanApproval: false,
      spinnerVerb: sample(getSpinnerVerbs()),
      pastTenseVerb: sample(TURN_COMPLETION_VERBS),
      permissionMode: planModeRequired ? 'plan' : 'default',
      isIdle: false,
      shutdownRequested: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      pendingUserMessages: [],
      messages: [], // Initialize to empty array so getDisplayedMessages works immediately
    }

    // Register cleanup handler for graceful shutdown
    const unregisterCleanup = registerCleanup(async () => {
      logForDebugging(`[spawnInProcessTeammate] Cleanup called for ${agentId}`)
      await killInProcessTeammate(taskId, setAppState)
    })
    taskState.unregisterCleanup = unregisterCleanup

    // Reserve runner settlement before making the task visible. A synchronous
    // Stop triggered during the spawn/start handoff must wait for the late
    // runner to attach and unwind instead of publishing a false killed state.
    reserveInProcessTeammateRunner(taskId)
    runnerReserved = true

    // Register task in AppState
    registerTask(taskState, setAppState)

    logForDebugging(
      `[spawnInProcessTeammate] Registered ${agentId} in AppState`,
    )

    return {
      success: true,
      agentId,
      taskId,
      abortController,
      teammateContext,
    }
  } catch (error) {
    if (runnerReserved) {
      cancelInProcessTeammateRunnerReservation(taskId)
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during spawn'
    logForDebugging(
      `[spawnInProcessTeammate] Failed to spawn ${agentId}: ${errorMessage}`,
    )
    return {
      success: false,
      agentId,
      error: errorMessage,
    }
  }
}

/**
 * Kills an in-process teammate by aborting its controller.
 *
 * Note: This is the implementation called by InProcessBackend.kill().
 *
 * @param taskId - Task ID of the teammate to kill
 * @param setAppState - AppState setter
 * @returns true only after the runner has exited and the task is marked killed
 */
export async function killInProcessTeammate(
  taskId: string,
  setAppState: SetAppStateFn,
): Promise<boolean> {
  let stopRequested = false

  setAppState((prev: AppState) => {
    const task = prev.tasks[taskId]
    if (
      !task ||
      task.type !== 'in_process_teammate' ||
      task.status !== 'running'
    ) {
      return prev
    }

    stopRequested = true
    const stopReason = new Error(`In-process teammate ${taskId} was stopped`)

    // Abort both controllers explicitly. The per-turn controller is linked to
    // the lifecycle controller, but aborting it first guarantees the active
    // HTTP/SSE request observes cancellation even if lifecycle propagation is
    // delayed by a custom signal implementation.
    task.currentWorkAbortController?.abort(stopReason)
    task.abortController?.abort(stopReason)

    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...task,
          stopRequested: true,
        },
      },
    }
  })

  if (!stopRequested) {
    return false
  }

  // Do not advertise a terminal state while runAgent/compaction may still be
  // unwinding. This settlement represents the complete runner, not merely UI
  // stream consumption.
  const runnerSettled = await waitForInProcessTeammateRunner(taskId)
  if (!runnerSettled) {
    // An aborted controller is only cancellation intent. Without a runner
    // reservation/settlement there is no proof execution stopped, so keep the
    // task tracked and retryable instead of falsely publishing `killed`.
    return false
  }

  const finalized = await finalizeKilledInProcessTeammate(taskId, setAppState)
  if (finalized) {
    return true
  }

  // Concurrent stop callers share the same runner settlement. The first one
  // performs finalization; later callers still succeed once they observe the
  // confirmed killed state.
  let alreadyKilled = false
  setAppState(prev => {
    alreadyKilled = prev.tasks[taskId]?.status === 'killed'
    return prev
  })
  return alreadyKilled
}

/**
 * Commits the killed terminal state after execution has stopped. The runner
 * also uses this for lifecycle aborts that did not originate from an explicit
 * task Stop request.
 */
export async function finalizeKilledInProcessTeammate(
  taskId: string,
  setAppState: SetAppStateFn,
): Promise<boolean> {
  let killed = false
  let teamName: string | null = null
  let agentId: string | null = null
  let toolUseId: string | undefined
  let description: string | undefined
  let unregisterCleanup: (() => void) | undefined
  let idleCallbacks: Array<() => void> = []
  let pendingAutonomyRuns: Array<{ runId: string; rootDir?: string }> = []

  setAppState((prev: AppState) => {
    const task = prev.tasks[taskId]
    if (!task || task.type !== 'in_process_teammate') {
      return prev
    }

    const teammateTask = task as InProcessTeammateTaskState

    if (
      teammateTask.status !== 'running' ||
      !teammateTask.abortController?.signal.aborted
    ) {
      return prev
    }

    // Capture identity for cleanup after state update
    teamName = teammateTask.identity.teamName
    agentId = teammateTask.identity.agentId
    toolUseId = teammateTask.toolUseId
    description = teammateTask.description
    unregisterCleanup = teammateTask.unregisterCleanup
    idleCallbacks = teammateTask.onIdleCallbacks ?? []

    // Capture pending autonomy run IDs before clearing them
    pendingAutonomyRuns = teammateTask.pendingUserMessages.flatMap(message =>
      message.autonomyRunId
        ? [
            {
              runId: message.autonomyRunId,
              ...(message.autonomyRootDir
                ? { rootDir: message.autonomyRootDir }
                : {}),
            },
          ]
        : [],
    )

    // Execution has already settled (or this is the runner's own finalizer).
    // Only now expose the terminal state and release runtime references.
    killed = true

    // Remove from teamContext.teammates using the agentId
    let updatedTeamContext = prev.teamContext
    if (prev.teamContext && prev.teamContext.teammates && agentId) {
      const { [agentId]: _, ...remainingTeammates } = prev.teamContext.teammates
      updatedTeamContext = {
        ...prev.teamContext,
        teammates: remainingTeammates,
      }
    }

    return {
      ...prev,
      teamContext: updatedTeamContext,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...teammateTask,
          status: 'killed' as const,
          notified: true,
          endTime: Date.now(),
          onIdleCallbacks: [], // Clear callbacks to prevent stale references
          messages: teammateTask.messages?.length
            ? [teammateTask.messages[teammateTask.messages.length - 1]!]
            : undefined,
          pendingUserMessages: [],
          inProgressToolUseIDs: undefined,
          abortController: undefined,
          unregisterCleanup: undefined,
          currentWorkAbortController: undefined,
          stopRequested: undefined,
        },
      },
    }
  })

  if (!killed) {
    return false
  }

  unregisterCleanup?.()
  idleCallbacks.forEach(callback => callback())

  // Remove from team file (outside state updater to avoid file I/O in callback)
  if (teamName && agentId) {
    removeMemberByAgentId(teamName, agentId)
  }

  const autonomyResults = await Promise.allSettled(
    pendingAutonomyRuns.map(run =>
      markAutonomyRunFailed(
        run.runId,
        `Teammate ${agentId ?? taskId} was stopped before it could consume the queued autonomy prompt.`,
        run.rootDir,
      ),
    ),
  )
  for (const result of autonomyResults) {
    if (result.status === 'rejected') {
      logForDebugging(
        `[killInProcessTeammate] Failed to finalize queued autonomy run for ${taskId}: ${String(result.reason)}`,
      )
    }
  }
  try {
    await evictTaskOutput(taskId)
  } catch (error) {
    logForDebugging(
      `[killInProcessTeammate] Failed to flush task output for ${taskId}: ${String(error)}`,
    )
  }
  // notified:true was pre-set so no XML notification fires; close the SDK
  // task_started bookend directly.
  emitTaskTerminatedSdk(taskId, 'stopped', {
    toolUseId,
    summary: description,
  })
  setTimeout(
    evictTerminalTask.bind(null, taskId, setAppState),
    STOPPED_DISPLAY_MS,
  )

  // Release perfetto agent registry entry
  if (agentId) {
    unregisterPerfettoAgent(agentId)
  }

  return true
}

/**
 * Kills an in-process teammate by logical agent ID.
 * Used by team-level UI/actions where the stable identifier is
 * "name@team", not the AppState task id.
 */
export async function killInProcessTeammateByAgentId(
  agentIdToKill: string,
  setAppState: SetAppStateFn,
): Promise<boolean> {
  let taskIdToKill: string | undefined

  setAppState((prev: AppState) => {
    for (const [taskId, task] of Object.entries(prev.tasks)) {
      if (
        task.type === 'in_process_teammate' &&
        task.identity.agentId === agentIdToKill &&
        task.status === 'running'
      ) {
        taskIdToKill = taskId
        break
      }
    }
    return prev
  })

  if (!taskIdToKill) {
    return false
  }

  return killInProcessTeammate(taskIdToKill, setAppState)
}
