import { feature } from 'bun:bundle';
import { stat } from 'fs/promises';
import {
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TOOL_USE_ID_TAG,
} from '../../constants/xml.js';
import { abortSpeculation } from '../../services/PromptSuggestion/speculation.js';
import type { AppState } from '../../state/AppState.js';
import type { LocalShellSpawnInput, SetAppState, Task, TaskContext, TaskHandle } from '../../Task.js';
import { createTaskStateBase } from '../../Task.js';
import type { AgentId } from '../../types/ids.js';
import { registerCleanup } from '../../utils/cleanupRegistry.js';
import { tailFile } from '../../utils/fsOperations.js';
import { logError } from '../../utils/log.js';
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js';
import type { ShellCommand } from '../../utils/ShellCommand.js';
import { evictTaskOutput, getTaskOutputPath } from '../../utils/task/diskOutput.js';
import { registerTask, updateTaskState } from '../../utils/task/framework.js';
import { escapeXml } from '../../utils/xml.js';
import { type BashTaskKind, isLocalShellTask, type LocalShellTaskState } from './guards.js';
import { killTask } from './killShellTasks.js';

/** Prefix that identifies a LocalShellTask summary to the UI collapse transform. */
export const BACKGROUND_BASH_SUMMARY_PREFIX = 'Background command ';

// A foreground command retained after an unconfirmed Stop owns exactly one
// late-settlement observer. Repeated Esc/TaskStop attempts must not enqueue
// duplicate notifications or race multiple terminal state transitions.
const retainedStopObservers = new WeakSet<ShellCommand>();

const STALL_CHECK_INTERVAL_MS = 5_000;
const STALL_THRESHOLD_MS = 45_000;
const STALL_TAIL_BYTES = 1024;

// Last-line patterns that suggest a command is blocked waiting for keyboard
// input. Used to gate the stall notification — we stay silent on commands that
// are merely slow (git log -S, long builds) and only notify when the tail
// looks like an interactive prompt the model can act on. See CC-1175.
const PROMPT_PATTERNS = [
  /\(y\/n\)/i, // (Y/n), (y/N)
  /\[y\/n\]/i, // [Y/n], [y/N]
  /\(yes\/no\)/i,
  /\b(?:Do you|Would you|Shall I|Are you sure|Ready to)\b.*\? *$/i, // directed questions
  /Press (any key|Enter)/i,
  /Continue\?/i,
  /Overwrite\?/i,
];

export function looksLikePrompt(tail: string): boolean {
  const lastLine = tail.trimEnd().split('\n').pop() ?? '';
  return PROMPT_PATTERNS.some(p => p.test(lastLine));
}

// Output-side analog of peekForStdinData (utils/process.ts): fire a one-shot
// notification if output stops growing and the tail looks like a prompt.
function startStallWatchdog(
  taskId: string,
  description: string,
  kind: BashTaskKind | undefined,
  toolUseId?: string,
  agentId?: AgentId,
): () => void {
  if (kind === 'monitor') return () => {};
  const outputPath = getTaskOutputPath(taskId);
  let lastSize = 0;
  let lastGrowth = Date.now();
  let cancelled = false;

  const timer = setInterval(() => {
    void stat(outputPath).then(
      s => {
        if (s.size > lastSize) {
          lastSize = s.size;
          lastGrowth = Date.now();
          return;
        }
        if (Date.now() - lastGrowth < STALL_THRESHOLD_MS) return;
        void tailFile(outputPath, STALL_TAIL_BYTES).then(
          ({ content }) => {
            if (cancelled) return;
            if (!looksLikePrompt(content)) {
              // Not a prompt — keep watching. Reset so the next check is
              // 45s out instead of re-reading the tail on every tick.
              lastGrowth = Date.now();
              return;
            }
            // Latch before the async-boundary-visible side effects so an
            // overlapping tick's callback sees cancelled=true and bails.
            cancelled = true;
            clearInterval(timer);
            const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
            const summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" appears to be waiting for interactive input`;
            // No <status> tag — print.ts treats <status> as a terminal
            // signal and an unknown value falls through to 'completed',
            // falsely closing the task for SDK consumers. Statusless
            // notifications are skipped by the SDK emitter (progress ping).
            const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
Last output:
${content.trimEnd()}

The command is likely blocked on an interactive prompt. Kill this task and re-run with piped input (e.g., \`echo y | command\`) or a non-interactive flag if one exists.`;
            enqueuePendingNotification({
              value: message,
              mode: 'task-notification',
              priority: 'next',
              agentId,
            });
          },
          () => {},
        );
      },
      () => {}, // File may not exist yet
    );
  }, STALL_CHECK_INTERVAL_MS);
  timer.unref();

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

function enqueueShellNotification(
  taskId: string,
  description: string,
  status: 'completed' | 'failed' | 'killed',
  exitCode: number | undefined,
  setAppState: SetAppState,
  toolUseId?: string,
  kind: BashTaskKind = 'bash',
  agentId?: AgentId,
): void {
  // Atomically check and set notified flag to prevent duplicate notifications.
  // If the task was already marked as notified (e.g., by TaskStopTool), skip
  // enqueueing to avoid sending redundant messages to the model.
  let shouldEnqueue = false;
  updateTaskState(taskId, setAppState, task => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return { ...task, notified: true };
  });

  if (!shouldEnqueue) {
    return;
  }

  // Abort any active speculation — background task state changed, so speculated
  // results may reference stale task output. The prompt suggestion text is
  // preserved; only the pre-computed response is discarded.
  abortSpeculation(setAppState);

  let summary: string;
  if (feature('MONITOR_TOOL') && kind === 'monitor') {
    // Monitor is streaming-only (post-#22764) — the script exiting means
    // the stream ended, not "condition met". Distinct from the bash prefix
    // so Monitor completions don't fold into the "N background commands
    // completed" collapse.
    switch (status) {
      case 'completed':
        summary = `Monitor "${description}" stream ended`;
        break;
      case 'failed':
        summary = `Monitor "${description}" script failed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}`;
        break;
      case 'killed':
        summary = `Monitor "${description}" stopped`;
        break;
    }
  } else {
    switch (status) {
      case 'completed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`;
        break;
      case 'failed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`;
        break;
      case 'killed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" was stopped`;
        break;
    }
  }

  const outputPath = getTaskOutputPath(taskId);
  const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`;

  enqueuePendingNotification({
    value: message,
    mode: 'task-notification',
    priority: feature('MONITOR_TOOL') ? 'next' : 'later',
    agentId,
  });
}

export const LocalShellTask: Task = {
  name: 'LocalShellTask',
  type: 'local_bash',
  async kill(taskId, setAppState) {
    await killTask(taskId, setAppState);
  },
};

export async function spawnShellTask(
  input: LocalShellSpawnInput & { shellCommand: ShellCommand },
  context: TaskContext,
): Promise<TaskHandle> {
  const { command, description, shellCommand, toolUseId, agentId, kind } = input;
  const { setAppState } = context;

  // TaskOutput owns the data — use its taskId so disk writes are consistent
  const { taskOutput } = shellCommand;
  const taskId = taskOutput.taskId;

  const unregisterCleanup = registerCleanup(async () => {
    await killTask(taskId, setAppState);
  });

  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: true,
    agentId,
    kind,
  };

  registerTask(taskState, setAppState);

  // Data flows through TaskOutput automatically — no stream listeners needed.
  // Just transition to backgrounded state so the process keeps running.
  shellCommand.background(taskId);

  const cancelStallWatchdog = startStallWatchdog(taskId, description, kind, toolUseId, agentId);

  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;

    updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
      if (task.status === 'killed') {
        wasKilled = true;
        return task;
      }

      return {
        ...task,
        status: result.code === 0 ? 'completed' : 'failed',
        result: { code: result.code, interrupted: result.interrupted },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      };
    });

    enqueueShellNotification(
      taskId,
      description,
      wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed',
      result.code,
      setAppState,
      toolUseId,
      kind,
      agentId,
    );

    void evictTaskOutput(taskId);
  });

  return {
    taskId,
    cleanup: () => {
      unregisterCleanup();
    },
  };
}

/**
 * Register a foreground task that could be backgrounded later.
 * Called when a bash command has been running long enough to show the BackgroundHint.
 * @returns taskId for the registered task
 */
export function registerForeground(
  input: LocalShellSpawnInput & { shellCommand: ShellCommand },
  setAppState: SetAppState,
  toolUseId?: string,
): string {
  const { command, description, shellCommand, agentId } = input;

  const taskId = shellCommand.taskOutput.taskId;

  const unregisterCleanup = registerCleanup(async () => {
    await killTask(taskId, setAppState);
  });

  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: false, // Not yet backgrounded - running in foreground
    agentId,
  };

  registerTask(taskState, setAppState);
  return taskId;
}

function failRetainedForegroundTask(
  taskId: string,
  shellCommand: ShellCommand,
  setAppState: SetAppState,
  result?: { code: number; interrupted: boolean },
  status: 'failed' | 'killed' = 'failed',
): void {
  let transitioned = false;
  let cleanupFn: (() => void) | undefined;
  let description = '';
  let toolUseId: string | undefined;
  let kind: BashTaskKind | undefined;
  let agentId: AgentId | undefined;

  updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
    // Identity-check the handle: a resumed/replaced task may reuse the ID, and
    // a late result from the old process must never close the replacement.
    if (task.status !== 'running' || task.shellCommand !== shellCommand) {
      return task;
    }

    transitioned = true;
    cleanupFn = task.unregisterCleanup;
    description = task.description;
    toolUseId = task.toolUseId;
    kind = task.kind;
    agentId = task.agentId;
    return {
      ...task,
      status,
      ...(result ? { result } : undefined),
      shellCommand: null,
      unregisterCleanup: undefined,
      endTime: Date.now(),
    };
  });

  if (!transitioned) return;

  cleanupFn?.();
  try {
    shellCommand.cleanup();
  } catch (error) {
    logError(error);
  }
  enqueueShellNotification(taskId, description, status, result?.code, setAppState, toolUseId, kind, agentId);
  void evictTaskOutput(taskId);
}

/**
 * A confirmed process-tree Stop whose output/result collection did not settle
 * has no live cancellation target left to retry. Close an already-registered
 * foreground task as failed instead of leaving it permanently running.
 */
export function failForegroundAfterConfirmedTermination(
  taskId: string,
  shellCommand: ShellCommand,
  setAppState: SetAppState,
): void {
  failRetainedForegroundTask(taskId, shellCommand, setAppState);
}

/**
 * Retain a genuinely live foreground process so TaskStop can retry, and close
 * the retained task if the original result settles later. The latter is a
 * failed cancellation lifecycle, not a successful command completion.
 */
export function retainForegroundAfterUnconfirmedStop(
  input: LocalShellSpawnInput & { shellCommand: ShellCommand },
  setAppState: SetAppState,
  toolUseId?: string,
  existingTaskId?: string,
): string {
  const taskId = existingTaskId ?? registerForeground(input, setAppState, toolUseId);
  const { shellCommand } = input;

  if (retainedStopObservers.has(shellCommand)) return taskId;
  retainedStopObservers.add(shellCommand);

  void shellCommand.result.then(
    result => {
      failRetainedForegroundTask(
        taskId,
        shellCommand,
        setAppState,
        {
          code: result.code,
          interrupted: result.interrupted,
        },
        shellCommand.terminationConfirmed ? 'killed' : 'failed',
      );
    },
    error => {
      logError(error);
      failRetainedForegroundTask(taskId, shellCommand, setAppState);
    },
  );

  return taskId;
}

/**
 * Background a specific foreground task.
 * @returns true if backgrounded successfully, false otherwise
 */
function backgroundTask(taskId: string, getAppState: () => AppState, setAppState: SetAppState): boolean {
  // Step 1: Get the task and shell command from current state
  const state = getAppState();
  const task = state.tasks[taskId];
  if (!isLocalShellTask(task) || task.isBackgrounded || !task.shellCommand) {
    return false;
  }

  const shellCommand = task.shellCommand;
  const description = task.description;
  const { toolUseId, kind, agentId } = task;

  // Transition to backgrounded — TaskOutput continues receiving data automatically
  if (!shellCommand.background(taskId)) {
    return false;
  }

  setAppState(prev => {
    const prevTask = prev.tasks[taskId];
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev;
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: { ...prevTask, isBackgrounded: true },
      },
    };
  });

  const cancelStallWatchdog = startStallWatchdog(taskId, description, kind, toolUseId, agentId);

  // Set up result handler
  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;
    let cleanupFn: (() => void) | undefined;

    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true;
        return t;
      }

      // Capture cleanup function to call outside of updater
      cleanupFn = t.unregisterCleanup;

      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: { code: result.code, interrupted: result.interrupted },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      };
    });

    // Call cleanup outside of the state updater (avoid side effects in updater)
    cleanupFn?.();

    if (wasKilled) {
      enqueueShellNotification(taskId, description, 'killed', result.code, setAppState, toolUseId, kind, agentId);
    } else {
      const finalStatus = result.code === 0 ? 'completed' : 'failed';
      enqueueShellNotification(taskId, description, finalStatus, result.code, setAppState, toolUseId, kind, agentId);
    }

    void evictTaskOutput(taskId);
  });

  return true;
}

/**
 * Check if there are any foreground shell tasks that can be backgrounded.
 * Running Agents cannot be safely converted in place: the current AgentTool
 * handoff aborts the foreground run and starts a fresh run from the original
 * prompt, which can repeat already-applied tool side effects. Agents that need
 * to run in the background must be launched there from the start.
 *
 * Used to determine whether Ctrl+B should background existing tasks vs. background the session.
 */
export function hasForegroundTasks(state: AppState): boolean {
  return Object.values(state.tasks).some(task => isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand);
}

export function backgroundAll(getAppState: () => AppState, setAppState: SetAppState): void {
  const state = getAppState();

  // Background all foreground bash tasks
  const foregroundBashTaskIds = Object.keys(state.tasks).filter(id => {
    const task = state.tasks[id];
    return isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand;
  });
  for (const taskId of foregroundBashTaskIds) {
    backgroundTask(taskId, getAppState, setAppState);
  }
}

/**
 * Background an already-registered foreground task in-place.
 * Unlike spawn(), this does NOT re-register the task — it flips isBackgrounded
 * on the existing registration and sets up a completion handler.
 * Used when the auto-background timer fires after registerForeground() has
 * already registered the task (avoiding duplicate task_started SDK events
 * and leaked cleanup callbacks).
 */
export function backgroundExistingForegroundTask(
  taskId: string,
  shellCommand: ShellCommand,
  description: string,
  setAppState: SetAppState,
  toolUseId?: string,
): boolean {
  if (!shellCommand.background(taskId)) {
    return false;
  }

  let agentId: AgentId | undefined;
  setAppState(prev => {
    const prevTask = prev.tasks[taskId];
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev;
    }
    agentId = prevTask.agentId;
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: { ...prevTask, isBackgrounded: true },
      },
    };
  });

  const cancelStallWatchdog = startStallWatchdog(taskId, description, undefined, toolUseId, agentId);

  // Set up result handler (mirrors backgroundTask's handler)
  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;
    let cleanupFn: (() => void) | undefined;

    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true;
        return t;
      }
      cleanupFn = t.unregisterCleanup;
      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: { code: result.code, interrupted: result.interrupted },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      };
    });

    cleanupFn?.();

    const finalStatus = wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed';
    enqueueShellNotification(taskId, description, finalStatus, result.code, setAppState, toolUseId, undefined, agentId);

    void evictTaskOutput(taskId);
  });

  return true;
}

/**
 * Mark a task as notified to suppress a pending enqueueShellNotification.
 * Used when backgrounding raced with completion — the tool result already
 * carries the full output, so the <task_notification> would be redundant.
 */
export function markTaskNotified(taskId: string, setAppState: SetAppState): void {
  updateTaskState(taskId, setAppState, t => (t.notified ? t : { ...t, notified: true }));
}

/**
 * Unregister a foreground task when the command completes without being backgrounded.
 */
export function unregisterForeground(taskId: string, setAppState: SetAppState): void {
  let cleanupFn: (() => void) | undefined;

  setAppState(prev => {
    const task = prev.tasks[taskId];
    // Only remove if it's a foreground task (not backgrounded)
    if (!isLocalShellTask(task) || task.isBackgrounded) {
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

async function flushAndCleanup(shellCommand: ShellCommand): Promise<void> {
  try {
    await shellCommand.taskOutput.flush();
    shellCommand.cleanup();
  } catch (error) {
    logError(error);
  }
}
