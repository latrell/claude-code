// Background task entry for MCP resource monitoring.
// Tracks a long-running subscription to an MCP server resource so the
// otherwise-invisible stream is visible in the footer pill and Shift+Down
// dialog. Follows the DreamTask pattern: pure UI surfacing via the existing
// task registry.

import type { AppState } from '../../state/AppState.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import type { AgentId } from '../../types/ids.js'
import {
  AbortSettlementTimeoutError,
  waitForBoundedSettlement,
} from '../../utils/abortSettlement.js'
import { logForDebugging } from '../../utils/debug.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

type MonitorMcpSettlement = {
  abortController?: AbortController
  settled: Promise<void>
}

const monitorMcpSettlements = new Map<string, MonitorMcpSettlement>()
const MONITOR_MCP_SETTLEMENT_TIMEOUT_MS = 30_000
const MONITOR_MCP_ABORT_GRACE_MS = 2_000

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  /** The MCP server name being monitored. */
  serverName: string
  /** The resource URI being subscribed to. */
  resourceUri: string
  /** The shell command used to drive monitoring (if any). */
  command?: string
  /** Agent that spawned this task. Used to kill orphaned tasks on agent exit. */
  agentId?: AgentId
  /** Abort controller to cancel the subscription. */
  abortController?: AbortController
  /** Failure detail when the runner could not confirm remote termination. */
  error?: string
}

export function isMonitorMcpTask(task: unknown): task is MonitorMcpTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'monitor_mcp'
  )
}

export function registerMonitorMcpTask(
  setAppState: SetAppState,
  opts: {
    description: string
    serverName: string
    resourceUri: string
    command?: string
    toolUseId?: string
    agentId?: AgentId
    abortController?: AbortController
    /** Resolves/rejects only after the monitoring runner has fully unwound. */
    settlement?: Promise<unknown>
  },
): string {
  const id = generateTaskId('monitor_mcp')
  if (opts.settlement) {
    const settled = opts.settlement.then(
      () => undefined,
      error => {
        if (error instanceof StopConfirmationError) {
          failMonitorMcpTask(id, setAppState, error.message)
          throw error
        }
        // Other failures still prove the monitor runner has exited. Its owner
        // remains responsible for publishing the ordinary failed state.
        return undefined
      },
    )
    monitorMcpSettlements.set(id, {
      abortController: opts.abortController,
      settled,
    })
    // The task may fail without a concurrent Stop waiter.
    void settled.catch(() => undefined)
  }
  const task: MonitorMcpTaskState = {
    ...createTaskStateBase(id, 'monitor_mcp', opts.description, opts.toolUseId),
    type: 'monitor_mcp',
    status: 'running',
    serverName: opts.serverName,
    resourceUri: opts.resourceUri,
    command: opts.command,
    agentId: opts.agentId,
    abortController: opts.abortController,
  }
  try {
    registerTask(task, setAppState)
  } catch (error) {
    monitorMcpSettlements.delete(id)
    throw error
  }
  return id
}

export function completeMonitorMcpTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  monitorMcpSettlements.delete(taskId)
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'completed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
  }))
}

export function failMonitorMcpTask(
  taskId: string,
  setAppState: SetAppState,
  error?: string,
): void {
  monitorMcpSettlements.delete(taskId)
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'failed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
    ...(error !== undefined ? { error } : {}),
  }))
}

export async function killMonitorMcp(
  taskId: string,
  setAppState: SetAppState,
  settlementTiming: {
    timeoutMs?: number
    abortGraceMs?: number
  } = {},
): Promise<boolean> {
  let matched = false
  let abortController: AbortController | undefined

  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    matched = true
    abortController = task.abortController
    return task
  })

  if (!matched) return false

  const settlement = monitorMcpSettlements.get(taskId)
  const matchingSettlement =
    settlement && settlement.abortController === abortController
      ? settlement
      : undefined

  abortController?.abort(new Error(`MCP monitor task ${taskId} was stopped`))

  // An AbortController proves only that cancellation was requested, and the
  // absence of one is not proof that no runner exists. Without settlement,
  // publishing killed could hide a live subscription or HTTP/SSE stream.
  if (!matchingSettlement) return false
  try {
    await waitForBoundedSettlement(matchingSettlement.settled, {
      signal: abortController?.signal,
      timeoutMs:
        settlementTiming.timeoutMs ?? MONITOR_MCP_SETTLEMENT_TIMEOUT_MS,
      abortGraceMs: settlementTiming.abortGraceMs ?? MONITOR_MCP_ABORT_GRACE_MS,
      operation: `MCP monitor task ${taskId} runner settlement`,
    })
  } catch (error) {
    if (error instanceof StopConfirmationError) throw error
    const message =
      error instanceof AbortSettlementTimeoutError
        ? `MCP monitor task ${taskId} runner did not settle after cancellation`
        : `MCP monitor task ${taskId} runner settlement failed`
    throw new StopConfirmationError(message, [error])
  }

  let confirmedTerminal = false
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      confirmedTerminal = true
      return task
    }
    if (task.abortController !== abortController) return task
    confirmedTerminal = true
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      notified: true,
      abortController: undefined,
    }
  })

  if (monitorMcpSettlements.get(taskId) === matchingSettlement) {
    monitorMcpSettlements.delete(taskId)
  }
  return confirmedTerminal
}

/**
 * Kill all running monitor_mcp tasks spawned by a given agent.
 * Called from runAgent.ts finally block so subscriptions don't outlive
 * the agent that started them.
 */
export async function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
): Promise<void> {
  const tasks = getAppState().tasks ?? {}
  const kills: Array<Promise<boolean>> = []
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isMonitorMcpTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killMonitorMcpTasksForAgent: killing orphaned monitor task ${taskId} (agent ${agentId} exiting)`,
      )
      kills.push(killMonitorMcp(taskId, setAppState))
    }
  }

  const results = await Promise.allSettled(kills)
  const failures = results.flatMap(result => {
    if (result.status === 'rejected') return [result.reason]
    return result.value
      ? []
      : [new Error('MCP monitor termination was not confirmed')]
  })
  if (failures.length > 0) {
    throw new StopConfirmationError(
      `Failed to confirm termination of ${failures.length} MCP monitor task(s) owned by agent ${agentId}`,
      failures,
    )
  }
}

export const MonitorMcpTask: Task = {
  name: 'MonitorMcpTask',
  type: 'monitor_mcp',

  async kill(taskId, setAppState) {
    if (!(await killMonitorMcp(taskId, setAppState))) {
      throw new StopConfirmationError(
        `MCP monitor task ${taskId} termination could not be confirmed`,
      )
    }
  },
}
