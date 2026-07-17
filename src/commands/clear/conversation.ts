/**
 * Conversation clearing utility.
 * This module has heavier dependencies and should be lazy-loaded when possible.
 */
import { feature } from 'bun:bundle'
import { randomUUID, type UUID } from 'crypto'
import { getReplBridgeHandle } from '../../bridge/replBridgeHandle.js'
import {
  getLastMainRequestId,
  getOriginalCwd,
  getSessionId,
  regenerateSessionId,
  resetCostState,
  setHasExitedPlanMode,
  setLastAPIRequest,
  setLastAPIRequestMessages,
  setLastClassifierRequests,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
} from '../../bootstrap/state.js'
import type { SDKStatusMessage } from '../../entrypoints/sdk/coreTypes.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { AppState } from '../../state/AppState.js'
import { isTerminalTaskStatus } from '../../Task.js'
import { isInProcessTeammateTask } from '../../tasks/InProcessTeammateTask/types.js'
import {
  isLocalAgentTask,
  LocalAgentTask,
  type LocalAgentTaskState,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { LocalShellTask } from '../../tasks/LocalShellTask/LocalShellTask.js'
import { isLocalShellTask } from '../../tasks/LocalShellTask/guards.js'
import { asAgentId } from '../../types/ids.js'
import type { Message } from '../../types/message.js'
import type { QueuedCommand } from '../../types/textInputTypes.js'
import { createEmptyAttributionState } from '../../utils/commitAttribution.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import {
  executeSessionEndHooks,
  getSessionEndHookTimeoutMs,
} from '../../utils/hooks.js'
import { clearAllPlanSlugs } from '../../utils/plans.js'
import {
  captureConversationClearQueueBarrier,
  clearCommandsForConversationReset,
} from '../../utils/messageQueueManager.js'
import { setCwd } from '../../utils/Shell.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  clearSessionMetadata,
  getAgentTranscriptPath,
  resetSessionFilePointer,
  saveWorktreeState,
} from '../../utils/sessionStorage.js'
import {
  evictTaskOutput,
  initTaskOutputAsSymlink,
} from '../../utils/task/diskOutput.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'
import { clearSessionCaches } from './caches.js'
import {
  isForegroundTaskForClear,
  stopForegroundTasksBeforeClear,
} from './stopForegroundTasks.js'

function notifyRemoteConversationCleared(): void {
  const handle = getReplBridgeHandle()
  if (!handle) return
  handle.markTranscriptReset?.()

  const message: SDKStatusMessage = {
    type: 'status',
    subtype: 'status',
    status: 'conversation_cleared',
    message: 'conversation_cleared',
    uuid: randomUUID(),
  }
  handle.writeSdkMessages([message])
}

export async function clearConversation({
  setMessages,
  readFileState,
  discoveredSkillNames,
  loadedNestedMemoryPaths,
  getAppState,
  setAppState,
  setConversationId,
  onConversationClear,
  queuedCommand,
  preserveModeTransitionState = false,
}: {
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  readFileState: FileStateCache
  discoveredSkillNames?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  getAppState?: () => AppState
  setAppState?: (f: (prev: AppState) => AppState) => void
  setConversationId?: (id: UUID) => void
  onConversationClear?: () => void
  queuedCommand?: QueuedCommand
  /** Internal plan-exit clears carry one-shot transition guidance forward. */
  preserveModeTransitionState?: boolean
}): Promise<void> {
  // Invalidate session-scoped async UI work before the first await. A title
  // provider may ignore AbortSignal, so callers also guard late callbacks by
  // session/generation after this notification.
  onConversationClear?.()
  const queueBarrier = captureConversationClearQueueBarrier(queuedCommand)

  // Execute SessionEnd hooks before clearing (bounded by
  // CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS, default 1.5s)
  const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
  await executeSessionEndHooks('clear', {
    getAppState,
    setAppState,
    signal: AbortSignal.timeout(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs,
  })

  // Signal to inference that this conversation's cache can be evicted.
  const lastRequestId = getLastMainRequestId()
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'conversation_clear' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // Compute preserved tasks up front so their per-agent state survives the
  // cache wipe below. A task is preserved unless it explicitly has
  // isBackgrounded === false. Main-session tasks (Ctrl+B) are preserved —
  // they write to an isolated per-task transcript and run under an agent
  // context, so they're safe across session ID regeneration. See
  // LocalMainSessionTask.ts startBackgroundSession.
  const preservedAgentIds = new Set<string>()
  const preservedLocalAgents: LocalAgentTaskState[] = []
  const shouldKillTask = isForegroundTaskForClear
  if (getAppState) {
    for (const task of Object.values(getAppState().tasks)) {
      if (shouldKillTask(task)) continue
      if (isLocalAgentTask(task)) {
        preservedAgentIds.add(task.agentId)
        preservedLocalAgents.push(task)
      } else if (isInProcessTeammateTask(task)) {
        preservedAgentIds.add(task.identity.agentId)
      }
    }
  }

  // A clear is also a Stop operation for foreground tasks. Do not erase their
  // tracking or output until the task implementation has confirmed that its
  // complete runner/process tree has settled.
  let stoppedForegroundTaskIds = new Set<string>()
  if (setAppState) {
    if (!getAppState) {
      throw new Error(
        'Cannot safely clear foreground tasks without getAppState',
      )
    }
    stoppedForegroundTaskIds = await stopForegroundTasksBeforeClear({
      getAppState,
      stopTask: async (taskId, task) => {
        if (isLocalShellTask(task)) {
          await LocalShellTask.kill(taskId, setAppState)
          return
        }
        if (isLocalAgentTask(task)) {
          await LocalAgentTask.kill(taskId, setAppState)
          return
        }
        throw new Error(
          `Unsupported foreground task type while clearing conversation: ${task.type}`,
        )
      },
    })
  }

  setMessages(() => [])
  notifyRemoteConversationCleared()

  // Clear context-blocked flag so proactive ticks resume after /clear
  if (feature('PROACTIVE') || feature('KAIROS')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { setContextBlocked } = require('../../proactive/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    setContextBlocked(false)
  }

  // Force logo re-render by updating conversationId
  if (setConversationId) {
    setConversationId(randomUUID())
  }

  // Clear all session-related caches. Per-agent state for preserved background
  // tasks (invoked skills, pending permission callbacks, dump state, cache-break
  // tracking) is retained so those agents keep functioning.
  clearSessionCaches(preservedAgentIds)

  // Clear large STATE-held data that outlives the message array.
  // lastAPIRequestMessages can hold the full post-compaction conversation
  // (hundreds of KB–MB) for /share; resetCostState clears modelUsage.
  setLastAPIRequest(null)
  setLastAPIRequestMessages(null)
  setLastClassifierRequests(null)
  resetCostState()

  setCwd(getOriginalCwd())
  readFileState.clear()
  discoveredSkillNames?.clear()
  loadedNestedMemoryPaths?.clear()

  if (!preserveModeTransitionState) {
    setHasExitedPlanMode(false)
    setNeedsPlanModeExitAttachment(false)
    setNeedsAutoModeExitAttachment(false)
  }

  // Clean out necessary items from App State
  if (setAppState) {
    setAppState(prev => {
      // Remove only the foreground snapshot whose Stop calls were confirmed.
      // A task created while /clear was waiting is not part of this operation.
      const nextTasks: AppState['tasks'] = {}
      for (const [taskId, task] of Object.entries(prev.tasks)) {
        if (!stoppedForegroundTaskIds.has(taskId)) {
          nextTasks[taskId] = task
          continue
        }
        void evictTaskOutput(taskId)
      }

      return {
        ...prev,
        tasks: nextTasks,
        attribution: createEmptyAttributionState(),
        // Clear standalone agent context (name/color set by /rename, /color)
        // so the new session doesn't display the old session's identity badge
        standaloneAgentContext: undefined,
        // A user-issued /clear discards plan verification state. The internal
        // plan-exit clear keeps it for the new plan-execution conversation.
        pendingPlanVerification: preserveModeTransitionState
          ? prev.pendingPlanVerification
          : undefined,
        fileHistory: {
          snapshots: [],
          trackedFiles: new Set(),
          snapshotSequence: 0,
        },
        // Reset MCP state to default to trigger re-initialization.
        // Preserve pluginReconnectKey so /clear doesn't cause a no-op
        // (it's only bumped by /reload-plugins).
        mcp: {
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey,
        },
      }
    })
  }

  // Clear plan slug cache so a new plan file is used after /clear
  clearAllPlanSlugs()

  // Clear cached session metadata (title, tag, agent name/color)
  // so the new session doesn't inherit the previous session's identity
  clearSessionMetadata()

  // Generate new session ID to provide fresh state
  // Set the old session as parent for analytics lineage tracking
  regenerateSessionId({ setCurrentAsParent: true })
  // Update the environment variable so subprocesses use the new session ID
  if (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_CODE_SESSION_ID) {
    process.env.CLAUDE_CODE_SESSION_ID = getSessionId()
  }
  await resetSessionFilePointer()

  // Preserved local_agent tasks had their TaskOutput symlink baked against the
  // old session ID at spawn time, but post-clear transcript writes land under
  // the new session directory (appendEntry re-reads getSessionId()). Re-point
  // the symlinks so TaskOutput reads the live file instead of a frozen pre-clear
  // snapshot. Only re-point running tasks — finished tasks will never write
  // again, so re-pointing would replace a valid symlink with a dangling one.
  // Main-session tasks use the same per-agent path (they write via
  // recordSidechainTranscript to getAgentTranscriptPath), so no special case.
  for (const task of preservedLocalAgents) {
    if (task.status !== 'running') continue
    void initTaskOutputAsSymlink(
      task.id,
      getAgentTranscriptPath(asAgentId(task.agentId)),
    )
  }

  // Re-persist mode and worktree state after the clear so future --resume
  // knows what the new post-clear session was in. clearSessionMetadata
  // wiped both from the cache, but the process is still in the same mode
  // and (if applicable) the same worktree directory.
  if (feature('COORDINATOR_MODE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { saveMode } = require('../../utils/sessionStorage.js')
    const {
      isCoordinatorMode,
    } = require('../../coordinator/coordinatorMode.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
  }
  const worktreeSession = getCurrentWorktreeSession()
  if (worktreeSession) {
    saveWorktreeState(worktreeSession)
  }

  // Execute SessionStart hooks after clearing
  const hookMessages = await processSessionStartHooks('clear')

  // Update messages with hook results
  if (hookMessages.length > 0) {
    setMessages(() => hookMessages)
  }

  // Apply the submission-order boundary after the async clear finishes. Work
  // already queued when `/clear` was submitted is discarded; prompts and task
  // completions submitted later remain queued for the fresh conversation.
  // Re-read tasks so agents created while /clear awaited are included, while
  // agents that reached a terminal state no longer retain undrainable entries.
  const queueAgentIdsToPreserve = new Set<string>()
  if (getAppState) {
    for (const task of Object.values(getAppState().tasks)) {
      if (isTerminalTaskStatus(task.status)) continue
      if (isLocalAgentTask(task)) {
        queueAgentIdsToPreserve.add(task.agentId)
      } else if (isInProcessTeammateTask(task)) {
        queueAgentIdsToPreserve.add(task.identity.agentId)
      }
    }
  }
  clearCommandsForConversationReset(queueBarrier, queueAgentIdsToPreserve)
}
