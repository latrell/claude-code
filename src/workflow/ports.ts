import {
  createFileJournalStore,
  type ProgressEvent,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'
import { logForDebugging } from '../utils/debug.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { getRunsDir } from './persistence.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import {
  completeWorkflowTask,
  failWorkflowTask,
  finishWorkflowTaskKill,
  registerLocalWorkflowTask,
  registerWorkflowTaskKillHandler,
} from '../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import {
  buildHostBundle,
  makeHostHandle,
  readHostBundle,
  type WorkflowHostBundle,
} from './hostHandle.js'
import { buildRegistry } from './registry.js'
import type { ProgressBus } from './progress/bus.js'
import type { ProgressStore } from './progress/store.js'
import type { SetAppState } from '../Task.js'
import type { AssistantMessage } from '../types/message.js'

type RunBinding = {
  runId: string
  taskId: string
  setAppState: SetAppState
  abortController: AbortController
  workflowName: string
  stopRequested: boolean
  settled: Promise<void>
  resolveSettled: () => void
  rejectSettled: (error: unknown) => void
  killPromise: Promise<boolean> | null
  detachKillHandler: () => void
  parentSignal: AbortSignal
  onParentAbort: () => void
  /** agentId → AbortController. Registered when backend starts an agent; killAgent uses it for precise abort. */
  agentAbortControllers: Map<number, AbortController>
  /** Retained across backend retry gaps so a killAgent request cannot miss the replacement controller. */
  knownAgentIds: Set<number>
  cancelledAgentIds: Set<number>
}

/** Constructs a WorkflowHostContext from toolUseContext on each tool invocation. */
function makeHostFactory(): WorkflowPorts['hostFactory'] {
  return ({ context, canUseTool, parentMessage }) => {
    const ctx = context as WorkflowHostBundle['toolUseContext'] & {
      agentId?: string
    }
    return {
      handle: makeHostHandle(
        buildHostBundle(
          ctx,
          canUseTool as WorkflowHostBundle['canUseTool'],
          parentMessage as AssistantMessage | undefined,
        ),
      ),
      // Use projectRoot rather than getCwd(): shares the same root as journalStore's runsDir,
      // otherwise named workflow resolution and journal persistence diverge when the user
      // enters a worktree/sub-directory. The engine's internal ctx.cwd is only used for
      // resolution (scriptPath/name) and does not affect the agent's execution cwd
      // (the agent gets its own cwd via the toolUseContext inside the host bundle).
      cwd: getProjectRoot(),
      budgetTotal: null, // turn-level budget injection point (read from settings in the future)
      ...(ctx.toolUseId ? { toolUseId: ctx.toolUseId } : {}),
    }
  }
}

/**
 * Assembles the complete WorkflowPorts. bus/store are passed in by the caller (shared via the service singleton).
 * taskRegistrar maintains runId → RunBinding for kill routing.
 */
export function createWorkflowPorts(opts: {
  bus: ProgressBus
  store: ProgressStore
}): WorkflowPorts {
  const bindings = new Map<string, RunBinding>()
  const runsDir = getRunsDir()
  const registry = buildRegistry()

  const finishBinding = (
    runId: string,
    terminal: 'completed' | 'failed' | 'killed',
    detail?: string,
  ): void => {
    const binding = bindings.get(runId)
    if (!binding) return
    let publicationFailed = false
    let publicationError: unknown

    try {
      if (
        terminal === 'killed' ||
        binding.stopRequested ||
        binding.abortController.signal.aborted
      ) {
        finishWorkflowTaskKill(binding.taskId, binding.setAppState)
        logForDebugging(`workflow ${runId} killed`)
      } else if (terminal === 'completed') {
        completeWorkflowTask(binding.taskId, binding.setAppState)
        logForDebugging(`workflow ${runId} completed: ${detail ?? ''}`)
      } else {
        failWorkflowTask(binding.taskId, binding.setAppState, detail)
        logForDebugging(`workflow ${runId} failed: ${detail ?? ''}`)
      }
    } catch (error) {
      // Runner settlement alone is not a successful Stop. If publishing the
      // terminal task state fails, reject the same promise awaited by the Stop
      // caller so the UI cannot report a false acknowledgement.
      publicationFailed = true
      publicationError = error
      binding.rejectSettled(error)
    } finally {
      // The runner delivered its terminal callback, so reclaim its runtime
      // binding even when AppState publication failed. In that case the task
      // remains visibly running and a later TaskStop can retry the now-safe
      // no-runner state transition.
      bindings.delete(runId)
      binding.detachKillHandler()
      binding.parentSignal.removeEventListener('abort', binding.onParentAbort)
      binding.agentAbortControllers.clear()
      binding.knownAgentIds.clear()
      binding.cancelledAgentIds.clear()
    }

    if (publicationFailed) {
      // The runner has definitively settled, but the terminal AppState write
      // failed. Replace the now-detached live-run handler with a narrowly
      // scoped publication retry. This is the only missing-handler case that
      // may safely mark the task killed without waiting for another runner.
      let detachRetryHandler = (): void => {}
      detachRetryHandler = registerWorkflowTaskKillHandler(
        binding.taskId,
        async () => {
          finishWorkflowTaskKill(binding.taskId, binding.setAppState)
          detachRetryHandler()
          return true
        },
      )
      throw publicationError
    }

    // Release Stop only after the terminal state update succeeded.
    binding.resolveSettled()
  }

  const requestKill = (runId: string): Promise<boolean> => {
    const binding = bindings.get(runId)
    if (!binding) return Promise.resolve(false)
    if (binding.killPromise) return binding.killPromise

    binding.stopRequested = true
    binding.abortController.abort()
    // Killing the run also aborts all in-flight agents. New controllers registered while the
    // runner unwinds are aborted immediately by registerAgentAbort below.
    for (const controller of binding.agentAbortControllers.values()) {
      controller.abort()
    }
    binding.killPromise = binding.settled.then(() => true)
    return binding.killPromise
  }

  // Telemetry subscription (independent of store). LogEventMetadata only accepts boolean/number/undefined,
  // and runId is a string — use the brand cast provided by the analytics module (verified non-code/path) to pass it through.
  opts.bus.subscribe((e: ProgressEvent) => {
    if (e.type === 'run_done') {
      logEvent('tengu_workflow_done', {
        status: e.status === 'completed' ? 0 : e.status === 'failed' ? 1 : 2,
        runId:
          e.runId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }
  })

  const taskRegistrar: WorkflowPorts['taskRegistrar'] = {
    register(regOpts, host) {
      const bundle = readHostBundle(host)
      const setAppState =
        bundle.toolUseContext.setAppStateForTasks ??
        bundle.toolUseContext.setAppState
      const abortController = new AbortController()
      const taskId = registerLocalWorkflowTask(setAppState, {
        description: regOpts.summary ?? regOpts.workflowName,
        workflowName: regOpts.workflowName,
        workflowFile: regOpts.workflowFile ?? '',
        summary: regOpts.summary,
        ...(regOpts.toolUseId ? { toolUseId: regOpts.toolUseId } : {}),
        ...(bundle.agentId ? { agentId: bundle.agentId } : {}),
        abortController,
      })
      const runId = regOpts.runId ?? taskId
      let resolveSettled!: () => void
      let rejectSettled!: (error: unknown) => void
      const settled = new Promise<void>((resolve, reject) => {
        resolveSettled = resolve
        rejectSettled = reject
      })
      // A workflow can finish without a Stop waiter. Keep publication failures
      // observable to future awaiters without a process-global unhandled
      // rejection in that no-waiter case.
      void settled.catch(() => undefined)
      // ToolUseContext always carries an AbortController in production. Keep the fallback for
      // embedders/tests that construct the host bundle manually.
      const parentSignal =
        bundle.toolUseContext.abortController?.signal ??
        new AbortController().signal
      const onParentAbort = (): void => {
        void requestKill(runId).catch(error => {
          // Parent cancellation has no direct caller to observe the rejected
          // Stop promise. Keep TaskStop's explicit path rejecting, but consume
          // and log this fire-and-forget path so a failed state publication
          // cannot become an unhandled rejection.
          logForDebugging(
            `workflow ${runId} parent cancellation failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        })
      }
      const binding: RunBinding = {
        runId,
        taskId,
        setAppState,
        abortController,
        workflowName: regOpts.workflowName,
        stopRequested: false,
        settled,
        resolveSettled,
        rejectSettled,
        killPromise: null,
        detachKillHandler: () => {},
        parentSignal,
        onParentAbort,
        agentAbortControllers: new Map(),
        knownAgentIds: new Set(),
        cancelledAgentIds: new Set(),
      }
      bindings.set(runId, binding)
      binding.detachKillHandler = registerWorkflowTaskKillHandler(taskId, () =>
        requestKill(runId),
      )
      if (parentSignal.aborted) {
        onParentAbort()
      } else {
        parentSignal.addEventListener('abort', onParentAbort, { once: true })
      }
      logForDebugging(
        `workflow task registered: ${runId} (${regOpts.workflowName})`,
      )
      return { runId, signal: abortController.signal }
    },
    complete(runId, summary) {
      finishBinding(runId, 'completed', summary)
    },
    fail(runId, error) {
      finishBinding(runId, 'failed', error)
    },
    kill: requestKill,
    finishKill(runId) {
      finishBinding(runId, 'killed')
    },
    registerAgentAbort(runId, agentId, ac) {
      const b = bindings.get(runId)
      if (!b) return
      b.knownAgentIds.add(agentId)
      if (b.stopRequested || b.cancelledAgentIds.has(agentId)) {
        ac.abort()
        return
      }
      b.agentAbortControllers.set(agentId, ac)
    },
    unregisterAgentAbort(runId, agentId) {
      const b = bindings.get(runId)
      if (!b) return
      b.agentAbortControllers.delete(agentId)
    },
    killAgent(runId, agentId) {
      const b = bindings.get(runId)
      if (!b) return false
      const ac = b.agentAbortControllers.get(agentId)
      // A known id can temporarily have no controller between the first backend attempt and its
      // retry. Retain the cancellation intent so the retry controller is aborted on registration.
      if (!ac && !b.knownAgentIds.has(agentId)) return false
      if (b.cancelledAgentIds.has(agentId)) return false
      b.cancelledAgentIds.add(agentId)
      ac?.abort()
      b.agentAbortControllers.delete(agentId)
      return true
    },
    pendingAction() {
      return null // v1: skip/retry not wired (seam retained)
    },
  }

  return {
    hostFactory: makeHostFactory(),
    agentAdapterRegistry: registry,
    agentRunner: {
      // Dead-code fallback: hooks always go through agentAdapterRegistry (required on ports). Reaching here means the registry was not registered — fail-fast.
      async runAgentToResult() {
        throw new Error(
          'workflow agentRunner fallback reached — agentAdapterRegistry must be set on ports',
        )
      },
    },
    progressEmitter: {
      emit(event) {
        opts.bus.emit(event) // → store reducer + telemetry
      },
    },
    taskRegistrar,
    journalStore: createFileJournalStore(runsDir),
    permissionGate: {
      isAborted: host =>
        readHostBundle(host).toolUseContext.abortController?.signal.aborted ??
        false,
    },
    logger: {
      debug: msg => logForDebugging(msg),
      warn: msg => logForDebugging(`[workflow warn] ${msg}`),
      event: name => logForDebugging(`workflow event: ${name}`),
    },
  }
}
