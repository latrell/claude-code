import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import { getSdkAgentProgressSummariesEnabled } from '../../bootstrap/state.js';
import {
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TOOL_USE_ID_TAG,
  WORKTREE_BRANCH_TAG,
  WORKTREE_PATH_TAG,
  WORKTREE_TAG,
} from '../../constants/xml.js';
import { abortSpeculation } from '../../services/PromptSuggestion/speculation.js';
import type { AppState } from '../../state/AppState.js';
import type { SetAppState, Task, TaskStateBase } from '../../Task.js';
import { createTaskStateBase } from '../../Task.js';
import type { Tools } from '../../Tool.js';
import { findToolByName } from '../../Tool.js';
import type { AgentToolResult } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js';
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js';
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js';
import { asAgentId } from '../../types/ids.js';
import type { Message } from '../../types/message.js';
import { createAbortController, createChildAbortController } from '../../utils/abortController.js';
import { registerCleanup } from '../../utils/cleanupRegistry.js';
import { getSearchExtraToolsOrReadInfo } from '../../utils/collapseReadSearch.js';
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js';
import { getAgentTranscriptPath } from '../../utils/sessionStorage.js';
import { StopConfirmationError } from '../../utils/stopConfirmation.js';
import { evictTaskOutput, getTaskOutputPath, initTaskOutputAsSymlink } from '../../utils/task/diskOutput.js';
import { PANEL_GRACE_MS, registerTask, updateTaskState } from '../../utils/task/framework.js';
import { emitTaskProgress } from '../../utils/task/sdkProgress.js';
import type { TaskState } from '../types.js';

export type ToolActivity = {
  toolName: string;
  input: Record<string, unknown>;
  /** Pre-computed activity description from the tool, e.g. "Reading src/foo.ts" */
  activityDescription?: string;
  /** Pre-computed: true if this is a search operation (Grep, Glob, etc.) */
  isSearch?: boolean;
  /** Pre-computed: true if this is a read operation (Read, cat, etc.) */
  isRead?: boolean;
};

export type AgentProgress = {
  toolUseCount: number;
  tokenCount: number;
  lastActivity?: ToolActivity;
  recentActivities?: ToolActivity[];
  summary?: string;
};

const suppressedAgentNotifications = new Map<string, number>();

/** Temporarily suppress lifecycle notifications during an aggregate Stop. */
export function suppressAgentNotification(taskId: string): () => void {
  suppressedAgentNotifications.set(taskId, (suppressedAgentNotifications.get(taskId) ?? 0) + 1);
  return () => {
    const remaining = (suppressedAgentNotifications.get(taskId) ?? 1) - 1;
    if (remaining <= 0) suppressedAgentNotifications.delete(taskId);
    else suppressedAgentNotifications.set(taskId, remaining);
  };
}

const MAX_RECENT_ACTIVITIES = 5;

export type ProgressTracker = {
  toolUseCount: number;
  // Track input and output separately to avoid double-counting.
  // input_tokens in Claude API is cumulative per turn (includes all previous context),
  // so we keep the latest value. output_tokens is per-turn, so we sum those.
  latestInputTokens: number;
  cumulativeOutputTokens: number;
  recentActivities: ToolActivity[];
};

export function createProgressTracker(): ProgressTracker {
  return {
    toolUseCount: 0,
    latestInputTokens: 0,
    cumulativeOutputTokens: 0,
    recentActivities: [],
  };
}

export function getTokenCountFromTracker(tracker: ProgressTracker): number {
  return tracker.latestInputTokens + tracker.cumulativeOutputTokens;
}

/**
 * Resolver function that returns a human-readable activity description
 * for a given tool name and input. Used to pre-compute descriptions
 * from Tool.getActivityDescription() at recording time.
 */
export type ActivityDescriptionResolver = (toolName: string, input: Record<string, unknown>) => string | undefined;

export function updateProgressFromMessage(
  tracker: ProgressTracker,
  message: Message,
  resolveActivityDescription?: ActivityDescriptionResolver,
  tools?: Tools,
): void {
  if (message.type !== 'assistant') {
    return;
  }
  const usage = message.message!.usage as BetaUsage | undefined;
  if (!usage) {
    return;
  }
  // Keep latest input (it's cumulative in the API), sum outputs
  tracker.latestInputTokens =
    (usage.input_tokens as number) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  tracker.cumulativeOutputTokens += usage.output_tokens as number;
  for (const content of (message.message!.content ?? []) as Array<{ type: string; name?: string; input?: unknown }>) {
    if (content.type === 'tool_use') {
      tracker.toolUseCount++;
      // Omit StructuredOutput from preview - it's an internal tool
      if (content.name !== SYNTHETIC_OUTPUT_TOOL_NAME) {
        const input = content.input as Record<string, unknown>;
        const classification = tools ? getSearchExtraToolsOrReadInfo(content.name!, input, tools) : undefined;
        tracker.recentActivities.push({
          toolName: content.name!,
          input,
          activityDescription: resolveActivityDescription?.(content.name!, input),
          isSearch: classification?.isSearch,
          isRead: classification?.isRead,
        });
      }
    }
  }
  while (tracker.recentActivities.length > MAX_RECENT_ACTIVITIES) {
    tracker.recentActivities.shift();
  }
}

export function getProgressUpdate(tracker: ProgressTracker): AgentProgress {
  return {
    toolUseCount: tracker.toolUseCount,
    tokenCount: getTokenCountFromTracker(tracker),
    lastActivity:
      tracker.recentActivities.length > 0 ? tracker.recentActivities[tracker.recentActivities.length - 1] : undefined,
    recentActivities: [...tracker.recentActivities],
  };
}

/**
 * Creates an ActivityDescriptionResolver from a tools list.
 * Looks up the tool by name and calls getActivityDescription if available.
 */
export function createActivityDescriptionResolver(tools: Tools): ActivityDescriptionResolver {
  return (toolName, input) => {
    const tool = findToolByName(tools, toolName);
    return tool?.getActivityDescription?.(input) ?? undefined;
  };
}

export type LocalAgentTaskState = TaskStateBase & {
  type: 'local_agent';
  agentId: string;
  prompt: string;
  selectedAgent?: AgentDefinition;
  agentType: string;
  model?: string;
  abortController?: AbortController;
  unregisterCleanup?: () => void;
  error?: string;
  result?: AgentToolResult;
  progress?: AgentProgress;
  retrieved: boolean;
  messages?: Message[];
  // Track what we last reported for computing deltas
  lastReportedToolCount: number;
  lastReportedTokenCount: number;
  // Whether the task has been backgrounded (false = foreground running, true = backgrounded)
  isBackgrounded: boolean;
  // Messages queued mid-turn via SendMessage, drained at tool-round boundaries
  pendingMessages: string[];
  // UI is holding this task: blocks eviction, enables stream-append, triggers
  // disk bootstrap. Set by enterTeammateView. Separate from viewingAgentTaskId
  // (which is "what am I LOOKING at") — retain is "what am I HOLDING."
  retain: boolean;
  // Bootstrap has read the sidechain JSONL and UUID-merged into messages.
  // One-shot per retain cycle; stream appends from there.
  diskLoaded: boolean;
  // Panel visibility deadline. undefined = no deadline (running or retained);
  // timestamp = hide + GC-eligible after this time. Set at terminal transition
  // and on unselect; cleared on retain.
  evictAfter?: number;
};

type LocalAgentExecutionRecord = {
  taskId: string;
  abortController: AbortController;
  setAppState: SetAppState;
  attached: boolean;
  stopRequested: boolean;
  didSettle: boolean;
  settled: Promise<void>;
  resolveSettled: () => void;
  rejectSettled: (error: unknown) => void;
};

// A task can have more than one execution generation over its lifetime (for
// example, a foreground agent that is handed off to a replacement background
// run). Only the current generation is addressable by TaskStop. Older
// generations keep their own record through the promise closure that tracks
// them, so a late foreground finally cannot release the newer background run.
const localAgentExecutions = new Map<string, LocalAgentExecutionRecord>();

function beginLocalAgentExecution(
  taskId: string,
  abortController: AbortController,
  setAppState: SetAppState,
): LocalAgentExecutionRecord {
  const existing = localAgentExecutions.get(taskId);
  if (existing?.abortController === abortController) {
    return existing;
  }

  let resolveSettled!: () => void;
  let rejectSettled!: (error: unknown) => void;
  const settled = new Promise<void>((resolve, reject) => {
    resolveSettled = resolve;
    rejectSettled = reject;
  });
  // The runner can settle without a concurrent TaskStop waiter. Preserve a
  // rejected state-publication result for Stop without creating an unhandled
  // rejection solely because nobody was waiting yet.
  void settled.catch(() => undefined);
  const record: LocalAgentExecutionRecord = {
    taskId,
    abortController,
    setAppState,
    attached: false,
    stopRequested: false,
    didSettle: false,
    settled,
    resolveSettled,
    rejectSettled,
  };
  localAgentExecutions.set(taskId, record);
  return record;
}

function getLocalAgentExecution(
  taskId: string,
  abortController: AbortController | undefined,
): LocalAgentExecutionRecord | undefined {
  const record = localAgentExecutions.get(taskId);
  return record?.abortController === abortController ? record : undefined;
}

function finalizeKilledAgentTask(
  taskId: string,
  setAppState: SetAppState,
  expectedAbortController?: AbortController,
): void {
  let killed = false;
  let unregisterCleanup: (() => void) | undefined;
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (
      task.status !== 'running' ||
      (expectedAbortController !== undefined && task.abortController !== expectedAbortController)
    ) {
      return task;
    }
    killed = true;
    unregisterCleanup = task.unregisterCleanup;
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    };
  });

  unregisterCleanup?.();
  if (killed) {
    void evictTaskOutput(taskId);
  }
}

function settleLocalAgentExecution(record: LocalAgentExecutionRecord): void {
  if (record.didSettle) {
    return;
  }
  record.didSettle = true;

  try {
    if (record.stopRequested || record.abortController.signal.aborted) {
      finalizeKilledAgentTask(record.taskId, record.setAppState, record.abortController);
    }
    record.resolveSettled();
  } catch (error) {
    // Do not throw from execution.finally: that would replace the agent
    // runner's original result/error. TaskStop awaits this independent
    // settlement and receives the publication failure directly.
    record.rejectSettled(error);
  } finally {
    if (localAgentExecutions.get(record.taskId) === record) {
      localAgentExecutions.delete(record.taskId);
    }
  }
}

/**
 * Attach the actual agent execution to its task lifecycle. The returned
 * promise preserves the execution's value/error, while TaskStop waits on the
 * internal settlement promise that is resolved only after this finally runs.
 */
export function trackLocalAgentExecution<T>({
  taskId,
  abortController,
  startExecution,
  setAppState,
}: {
  taskId: string;
  abortController: AbortController;
  startExecution: () => Promise<T>;
  setAppState: SetAppState;
}): Promise<T | undefined> {
  const record = beginLocalAgentExecution(taskId, abortController, setAppState);
  record.attached = true;
  if (abortController.signal.aborted) {
    record.stopRequested = true;
    settleLocalAgentExecution(record);
    return Promise.resolve(undefined);
  }

  let execution: Promise<T>;
  try {
    execution = startExecution();
  } catch (error) {
    settleLocalAgentExecution(record);
    failAgentTask(taskId, error instanceof Error ? error.message : String(error), setAppState);
    throw error;
  }
  return execution.finally(() => settleLocalAgentExecution(record));
}

export function isLocalAgentTask(task: unknown): task is LocalAgentTaskState {
  return typeof task === 'object' && task !== null && 'type' in task && task.type === 'local_agent';
}

/**
 * A local_agent task that the CoordinatorTaskPanel manages (not main-session).
 * For ants, these render in the panel instead of the background-task pill.
 * This is the ONE predicate that all pill/panel filters must agree on — if
 * the gate changes, change it here.
 */
export function isPanelAgentTask(t: unknown): t is LocalAgentTaskState {
  return isLocalAgentTask(t) && t.agentType !== 'main-session';
}

export function queuePendingMessage(
  taskId: string,
  msg: string,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => ({
    ...task,
    pendingMessages: [...task.pendingMessages, msg],
  }));
}

/**
 * Append a message to task.messages so it appears in the viewed transcript
 * immediately. Caller constructs the Message (breaks the messages.ts cycle).
 * queuePendingMessage and resumeAgentBackground route the prompt to the
 * agent's API input but don't touch the display.
 */
export function appendMessageToLocalAgent(
  taskId: string,
  message: Message,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => ({
    ...task,
    messages: [...(task.messages ?? []), message],
  }));
}

export function drainPendingMessages(
  taskId: string,
  getAppState: () => AppState,
  setAppState: (f: (prev: AppState) => AppState) => void,
): string[] {
  const task = getAppState().tasks[taskId];
  if (!isLocalAgentTask(task) || task.pendingMessages.length === 0) {
    return [];
  }
  const drained = task.pendingMessages;
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, t => ({
    ...t,
    pendingMessages: [],
  }));
  return drained;
}

/**
 * Enqueue an agent notification to the message queue.
 */
export function enqueueAgentNotification({
  taskId,
  description,
  status,
  error,
  setAppState,
  finalMessage,
  usage,
  toolUseId,
  worktreePath,
  worktreeBranch,
}: {
  taskId: string;
  description: string;
  status: 'completed' | 'failed' | 'killed';
  error?: string;
  setAppState: SetAppState;
  finalMessage?: string;
  usage?: {
    totalTokens: number;
    toolUses: number;
    durationMs: number;
  };
  toolUseId?: string;
  worktreePath?: string;
  worktreeBranch?: string;
}): void {
  if (suppressedAgentNotifications.has(taskId)) return;

  // Atomically check and set notified flag to prevent duplicate notifications.
  // If the task was already marked as notified (e.g., by TaskStopTool), skip
  // enqueueing to avoid sending redundant messages to the model.
  let shouldEnqueue = false;
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return {
      ...task,
      notified: true,
    };
  });

  if (!shouldEnqueue) {
    return;
  }

  // Abort any active speculation — background task state changed, so speculated
  // results may reference stale task output. The prompt suggestion text is
  // preserved; only the pre-computed response is discarded.
  abortSpeculation(setAppState);

  const summary =
    status === 'completed'
      ? `Agent "${description}" completed`
      : status === 'failed'
        ? `Agent "${description}" failed: ${error || 'Unknown error'}`
        : `Agent "${description}" was stopped`;

  const outputPath = getTaskOutputPath(taskId);
  const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
  const resultSection = finalMessage ? `\n<result>${finalMessage}</result>` : '';
  const usageSection = usage
    ? `\n<usage><total_tokens>${usage.totalTokens}</total_tokens><tool_uses>${usage.toolUses}</tool_uses><duration_ms>${usage.durationMs}</duration_ms></usage>`
    : '';
  const worktreeSection = worktreePath
    ? `\n<${WORKTREE_TAG}><${WORKTREE_PATH_TAG}>${worktreePath}</${WORKTREE_PATH_TAG}>${worktreeBranch ? `<${WORKTREE_BRANCH_TAG}>${worktreeBranch}</${WORKTREE_BRANCH_TAG}>` : ''}</${WORKTREE_TAG}>`
    : '';

  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${summary}</${SUMMARY_TAG}>${resultSection}${usageSection}${worktreeSection}
</${TASK_NOTIFICATION_TAG}>`;

  enqueuePendingNotification({ value: message, mode: 'task-notification' });
}

/**
 * LocalAgentTask - Handles background agent execution.
 *
 * Replaces the AsyncAgent implementation from src/tools/AgentTool/asyncAgentUtils.ts
 * with a unified Task interface.
 */
export const LocalAgentTask: Task = {
  name: 'LocalAgentTask',
  type: 'local_agent',

  async kill(taskId, setAppState) {
    await killAsyncAgent(taskId, setAppState);
  },
};

/**
 * Kill an agent task. No-op if already killed/completed.
 */
export async function killAsyncAgent(taskId: string, setAppState: SetAppState): Promise<void> {
  let abortController: AbortController | undefined;
  let unregisterCleanup: (() => void) | undefined;
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task;
    }
    abortController = task.abortController;
    unregisterCleanup = task.unregisterCleanup;
    return task;
  });

  if (!abortController) {
    finalizeKilledAgentTask(taskId, setAppState);
    return;
  }

  const execution = getLocalAgentExecution(taskId, abortController);
  if (execution) {
    execution.stopRequested = true;
  }

  // Abort is synchronous, so all concurrent executions receive the stop
  // before this function reaches its first await.
  abortController.abort();
  unregisterCleanup?.();

  if (execution?.attached) {
    await execution.settled;
  } else if (execution) {
    // Registration and execution attachment happen in the same JavaScript
    // turn. An unattached record therefore represents work that never started.
    settleLocalAgentExecution(execution);
  } else {
    // Backward-compatible fallback for restored/test-created task state that
    // predates execution tracking: there is no live runner to await.
    finalizeKilledAgentTask(taskId, setAppState, abortController);
  }

  // The tracked finally normally owns this transition. Keep the idempotent
  // fallback for a task removed/replaced while its runner was unwinding.
  finalizeKilledAgentTask(taskId, setAppState, abortController);

  let terminalStatus: LocalAgentTaskState['status'] | undefined;
  setAppState(prev => {
    const task = prev.tasks[taskId];
    if (isLocalAgentTask(task)) {
      terminalStatus = task.status;
    }
    return prev;
  });
  if (terminalStatus === 'running' || terminalStatus === 'failed') {
    throw new StopConfirmationError(
      `Agent task ${taskId} termination could not be confirmed (status: ${terminalStatus})`,
    );
  }
}

/**
 * Kill all running agent tasks.
 * Used by ESC cancellation in coordinator mode to stop all subagents.
 */
export async function killAllRunningAgentTasks(
  tasks: Record<string, TaskState>,
  setAppState: SetAppState,
  killTask: (taskId: string, setAppState: SetAppState) => Promise<void> = killAsyncAgent,
): Promise<{
  succeeded: string[];
  failures: Array<{ taskId: string; error: unknown }>;
}> {
  const runningTaskIds = Object.entries(tasks).flatMap(([taskId, task]) =>
    task.type === 'local_agent' && task.status === 'running' ? [taskId] : [],
  );
  const results = await Promise.allSettled(runningTaskIds.map(taskId => killTask(taskId, setAppState)));
  const succeeded: string[] = [];
  const failures: Array<{ taskId: string; error: unknown }> = [];
  for (let index = 0; index < results.length; index++) {
    const taskId = runningTaskIds[index]!;
    const result = results[index]!;
    if (result.status === 'fulfilled') succeeded.push(taskId);
    else failures.push({ taskId, error: result.reason });
  }
  return { succeeded, failures };
}

/**
 * Mark a task as notified without enqueueing a notification.
 * Used by chat:killAgents bulk kill to suppress per-agent async notifications
 * when a single aggregate message is sent instead.
 */
export function markAgentsNotified(taskId: string, setAppState: SetAppState): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task;
    }
    return {
      ...task,
      notified: true,
    };
  });
}

/**
 * Update progress for an agent task.
 * Preserves the existing summary field so that background summarization
 * results are not clobbered by progress updates from assistant messages.
 */
export function updateAgentProgress(taskId: string, progress: AgentProgress, setAppState: SetAppState): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task;
    }

    const existingSummary = task.progress?.summary;
    return {
      ...task,
      progress: existingSummary ? { ...progress, summary: existingSummary } : progress,
    };
  });
}

/**
 * Update the background summary for an agent task.
 * Called by the periodic summarization service to store a 1-2 sentence progress summary.
 */
export function updateAgentSummary(taskId: string, summary: string, setAppState: SetAppState): void {
  let captured: {
    tokenCount: number;
    toolUseCount: number;
    startTime: number;
    toolUseId: string | undefined;
  } | null = null;

  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task;
    }

    captured = {
      tokenCount: task.progress?.tokenCount ?? 0,
      toolUseCount: task.progress?.toolUseCount ?? 0,
      startTime: task.startTime,
      toolUseId: task.toolUseId,
    };

    return {
      ...task,
      progress: {
        ...task.progress,
        toolUseCount: task.progress?.toolUseCount ?? 0,
        tokenCount: task.progress?.tokenCount ?? 0,
        summary,
      },
    };
  });

  // Emit summary to SDK consumers (e.g. VS Code subagent panel). No-op in TUI.
  // Gate on the SDK option so coordinator-mode sessions without the flag don't
  // leak summary events to consumers who didn't opt in.
  if (captured && getSdkAgentProgressSummariesEnabled()) {
    const { tokenCount, toolUseCount, startTime, toolUseId } = captured;
    emitTaskProgress({
      taskId,
      toolUseId,
      description: summary,
      startTime,
      totalTokens: tokenCount,
      toolUses: toolUseCount,
      summary,
    });
  }
}

/**
 * Complete an agent task with result.
 */
export function completeAgentTask(result: AgentToolResult, setAppState: SetAppState): void {
  const taskId = result.agentId;
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task;
    }

    task.unregisterCleanup?.();

    return {
      ...task,
      status: 'completed',
      result,
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    };
  });
  void evictTaskOutput(taskId);
  // Note: Notification is sent by AgentTool via enqueueAgentNotification
}

/**
 * Fail an agent task with error.
 */
export function failAgentTask(taskId: string, error: string, setAppState: SetAppState): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task;
    }

    task.unregisterCleanup?.();

    return {
      ...task,
      status: 'failed',
      error,
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    };
  });
  void evictTaskOutput(taskId);
  // Note: Notification is sent by AgentTool via enqueueAgentNotification
}

/**
 * Register an agent task.
 * Called by AgentTool to create a new background agent.
 *
 * @param parentAbortController - Optional parent abort controller. If provided,
 *   the agent's abort controller will be a child that auto-aborts when parent aborts.
 *   This ensures subagents are aborted when their parent (e.g., in-process teammate) aborts.
 */
export function registerAsyncAgent({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  parentAbortController,
  toolUseId,
}: {
  agentId: string;
  description: string;
  prompt: string;
  selectedAgent: AgentDefinition;
  setAppState: SetAppState;
  parentAbortController?: AbortController;
  toolUseId?: string;
}): LocalAgentTaskState {
  void initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)));

  // Create abort controller - if parent provided, create child that auto-aborts with parent
  const abortController = parentAbortController
    ? createChildAbortController(parentAbortController)
    : createAbortController();
  beginLocalAgentExecution(agentId, abortController, setAppState);

  const taskState: LocalAgentTaskState = {
    ...createTaskStateBase(agentId, 'local_agent', description, toolUseId),
    type: 'local_agent',
    status: 'running',
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType ?? 'general-purpose',
    abortController,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true, // registerAsyncAgent immediately backgrounds
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  };

  // Register cleanup handler
  const unregisterCleanup = registerCleanup(async () => {
    await killAsyncAgent(agentId, setAppState);
  });

  taskState.unregisterCleanup = unregisterCleanup;

  // Register task in AppState
  registerTask(taskState, setAppState);

  return taskState;
}

// Map of taskId -> resolve function for background signals
// When backgroundAgentTask is called, it resolves the corresponding promise
const backgroundSignalResolvers = new Map<string, () => void>();

/**
 * Register a foreground agent task that could be backgrounded later.
 * Called when an agent has been running long enough to show the BackgroundHint.
 * @returns object with taskId and backgroundSignal promise
 */
export function registerAgentForeground({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  parentAbortController,
  autoBackgroundMs,
  toolUseId,
}: {
  agentId: string;
  description: string;
  prompt: string;
  selectedAgent: AgentDefinition;
  setAppState: SetAppState;
  parentAbortController: AbortController;
  autoBackgroundMs?: number;
  toolUseId?: string;
}): {
  taskId: string;
  abortController: AbortController;
  backgroundSignal: Promise<void>;
  cancelAutoBackground?: () => void;
} {
  void initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)));

  // Foreground agents must stop with their parent (ESC) and through TaskStop.
  // The registered task and runAgent both use this exact child controller.
  const abortController = createChildAbortController(parentAbortController);
  beginLocalAgentExecution(agentId, abortController, setAppState);

  const unregisterCleanup = registerCleanup(async () => {
    await killAsyncAgent(agentId, setAppState);
  });

  const taskState: LocalAgentTaskState = {
    ...createTaskStateBase(agentId, 'local_agent', description, toolUseId),
    type: 'local_agent',
    status: 'running',
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType ?? 'general-purpose',
    abortController,
    unregisterCleanup,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: false, // Not yet backgrounded - running in foreground
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  };

  // Create background signal promise
  let resolveBackgroundSignal: () => void;
  const backgroundSignal = new Promise<void>(resolve => {
    resolveBackgroundSignal = resolve;
  });
  backgroundSignalResolvers.set(agentId, resolveBackgroundSignal!);

  registerTask(taskState, setAppState);

  // Auto-background after timeout if configured
  let cancelAutoBackground: (() => void) | undefined;
  if (autoBackgroundMs !== undefined && autoBackgroundMs > 0) {
    const timer = setTimeout(
      (setAppState, agentId) => {
        transitionAgentToBackground(agentId, setAppState);
      },
      autoBackgroundMs,
      setAppState,
      agentId,
    );
    cancelAutoBackground = () => clearTimeout(timer);
  }

  return { taskId: agentId, abortController, backgroundSignal, cancelAutoBackground };
}

/**
 * Switch a foreground task to an independently cancellable background task.
 *
 * Resolving the background race before aborting the old controller ensures the
 * AgentTool handoff path wins over the expected AbortError from the foreground
 * request. The new controller is intentionally not linked to the parent so an
 * existing background agent continues to survive a later parent ESC.
 */
function transitionAgentToBackground(taskId: string, setAppState: SetAppState): boolean {
  const backgroundAbortController = createAbortController();
  let foregroundAbortController: AbortController | undefined;
  let transitioned = false;

  setAppState(prev => {
    const task = prev.tasks[taskId];
    if (!isLocalAgentTask(task) || task.status !== 'running' || task.isBackgrounded) {
      return prev;
    }

    transitioned = true;
    foregroundAbortController = task.abortController;
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...task,
          isBackgrounded: true,
          abortController: backgroundAbortController,
        },
      },
    };
  });

  if (!transitioned) {
    return false;
  }

  beginLocalAgentExecution(taskId, backgroundAbortController, setAppState);

  const resolver = backgroundSignalResolvers.get(taskId);
  if (resolver) {
    resolver();
    backgroundSignalResolvers.delete(taskId);
  }

  // Abort only after resolving the race. AgentTool waits for the pending next()
  // and iterator cleanup before it starts the replacement background run.
  foregroundAbortController?.abort();
  return true;
}

/**
 * Background a specific foreground agent task.
 * @returns true if backgrounded successfully, false otherwise
 */
export function backgroundAgentTask(taskId: string, getAppState: () => AppState, setAppState: SetAppState): boolean {
  const state = getAppState();
  const task = state.tasks[taskId];
  if (!isLocalAgentTask(task) || task.status !== 'running' || task.isBackgrounded) {
    return false;
  }

  return transitionAgentToBackground(taskId, setAppState);
}

/**
 * Unregister a foreground agent task when the agent completes without being backgrounded.
 */
export function unregisterAgentForeground(taskId: string, setAppState: SetAppState): void {
  // Clean up the background signal resolver
  backgroundSignalResolvers.delete(taskId);

  let cleanupFn: (() => void) | undefined;

  setAppState(prev => {
    const task = prev.tasks[taskId];
    // Only remove if it's a foreground task (not backgrounded)
    if (!isLocalAgentTask(task) || task.isBackgrounded) {
      return prev;
    }

    // TaskStop and parent cancellation keep the task visible until the
    // foreground iterator has actually unwound. Its tracked finally performs
    // the terminal transition and releases TaskStop.
    const execution = getLocalAgentExecution(taskId, task.abortController);
    if (execution && (execution.stopRequested || execution.abortController.signal.aborted)) {
      return prev;
    }

    // Capture cleanup function to call outside of updater
    cleanupFn = task.unregisterCleanup;

    const { [taskId]: removed, ...rest } = prev.tasks;
    return { ...prev, tasks: rest };
  });

  // Call cleanup outside of the state updater (avoid side effects in updater)
  cleanupFn?.();
}
