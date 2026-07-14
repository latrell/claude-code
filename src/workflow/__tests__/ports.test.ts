import { expect, test } from 'bun:test'
// Note: this test does not mock bootstrap/state, utils/cwd, analytics, debug.
// Reason: mock.module is process-global (last-write-wins); mocking these common modules would pollute
// other tests in the same process (e.g. src/commands/__tests__/autonomy.test.ts imports the real
// bootstrap/state via its dependency chain). ports can resolve getProjectRoot/getCwd normally in the test env,
// logEvent/logForDebugging are silent no-ops when sink is not attached, no need to mock.

import { buildRegistry } from '../registry.js'
import { createWorkflowPorts } from '../ports.js'
import { createProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import type { SetAppState } from '../../Task.js'
import type { AppState } from '../../state/AppState.tsx'
import { killWorkflowTask } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'

test('buildRegistry registers claude-code as default and resolve hits', () => {
  const reg = buildRegistry()
  expect(reg.has('claude-code')).toBe(true)
  expect(reg.resolve({ prompt: 'x' }).id).toBe('claude-code')
  expect(reg.resolve({ prompt: 'x', agentType: 'whatever' }).id).toBe(
    'claude-code',
  )
})

test('createWorkflowPorts assembles full ports (incl. agentAdapterRegistry and progressEmitter→bus)', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })

  expect(ports.agentAdapterRegistry).toBeDefined()
  expect(ports.agentAdapterRegistry!.resolve({ prompt: 'x' }).id).toBe(
    'claude-code',
  )
  expect(typeof ports.taskRegistrar.register).toBe('function')
  expect(typeof ports.taskRegistrar.kill).toBe('function')
  expect(typeof ports.hostFactory).toBe('function')
  // agentRunner fallback fields still exist (WorkflowPorts required)
  expect(ports.agentRunner).toBeDefined()
  expect(typeof ports.agentRunner.runAgentToResult).toBe('function')

  // progressEmitter via bus → store: emit a run_started, store can see it
  ports.progressEmitter.emit({
    type: 'run_started',
    runId: 't',
    workflowName: 'w',
    meta: null,
  })
  expect(store.get('t')?.workflowName).toBe('w')
})

test('taskRegistrar.register/complete/kill routes via RunBinding (real setAppState, no mock)', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })

  // real setAppState: use a local AppState object to hold tasks, registerTask goes through the real code path.
  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }

  const hostCtx = ports.hostFactory({
    context: {
      agentId: 'a-1',
      toolUseId: 'tu-1',
      setAppState,
      abortController: new AbortController(),
    },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })

  const { runId, signal } = ports.taskRegistrar.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )
  expect(typeof runId).toBe('string')
  expect(signal).toBeInstanceOf(AbortSignal)
  expect((Object.values(state.tasks)[0] as { agentId?: string }).agentId).toBe(
    'a-1',
  )

  // complete/fail/kill do not throw (RunBinding hit)
  expect(() => ports.taskRegistrar.complete(runId, 'done')).not.toThrow()
  expect(() => ports.taskRegistrar.kill(runId)).not.toThrow()
  // unknown runId safe no-op
  expect(() => ports.taskRegistrar.complete('nope')).not.toThrow()
  expect(ports.taskRegistrar.pendingAction('nope')).toBeNull()

  // after terminal state binding is reclaimed: calling complete on the same runId again should be safe no-op (no throw, no repeated call to workflow task fn)
  ports.taskRegistrar.complete(runId)
  ports.taskRegistrar.kill(runId)
})

test('parent tool abort propagates to run signal and kill settles only on finishKill', async () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>
  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }
  const parentAbort = new AbortController()
  const hostCtx = ports.hostFactory({
    context: {
      agentId: 'a-1',
      toolUseId: 'tu-1',
      setAppState,
      abortController: parentAbort,
    },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId, signal } = tr.register(
    { workflowName: 'wf', toolUseId: 'tu-1' },
    hostCtx.handle,
  )

  parentAbort.abort()
  expect(signal.aborted).toBe(true)
  expect((Object.values(state.tasks)[0] as { status: string }).status).toBe(
    'running',
  )

  const settlement = Promise.resolve(tr.kill(runId))
  tr.finishKill(runId)
  expect(await settlement).toBe(true)
  expect((Object.values(state.tasks)[0] as { status: string }).status).toBe(
    'killed',
  )
})

test('workflow Stop rejects when terminal task state cannot be published and remains retryable', async () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>
  const state = { tasks: {} } as unknown as AppState
  const publicationError = new Error('state publication failed')
  let failKilledPublication = true
  const setAppState: SetAppState = f => {
    const next = f(state)
    const publishedKilled = Object.values(next.tasks).some(
      task => task.status === 'killed',
    )
    if (failKilledPublication && publishedKilled) throw publicationError
    Object.assign(state, next)
  }
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a-1', toolUseId: 'tu-1', setAppState },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId } = tr.register(
    { workflowName: 'wf', toolUseId: 'tu-1' },
    hostCtx.handle,
  )
  const taskId = Object.keys(state.tasks)[0]!

  const stopping = Promise.resolve(tr.kill(runId))
  expect(() => tr.finishKill(runId)).toThrow(publicationError)
  expect(await stopping.catch(error => error)).toBe(publicationError)
  expect(state.tasks[taskId]?.status).toBe('running')

  // The runner is already settled and the failed task remains visible. A
  // later TaskStop retries only the terminal state publication.
  failKilledPublication = false
  expect(await killWorkflowTask(taskId, setAppState)).toBe(true)
  expect(state.tasks[taskId]?.status).toBe('killed')
})

// agent-level kill bridge: register → killAgent precisely aborts; kill(runId) aborts all agents.
test('taskRegistrar kill aborts agents immediately and resolves after runner settlement', async () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  // impl always provides these — cast flattens optional to required (avoids per-line ! assertion)
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>

  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a-1', toolUseId: 'tu-1', setAppState },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId } = tr.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )

  // register AbortController for two agents (simulating backend calling when launching agent)
  const ac1 = new AbortController()
  const ac2 = new AbortController()
  tr.registerAgentAbort(runId, 1, ac1)
  tr.registerAgentAbort(runId, 2, ac2)
  expect(ac1.signal.aborted).toBe(false)
  expect(ac2.signal.aborted).toBe(false)

  // killAgent precisely aborts agent #1: only ac1 aborts, ac2 unaffected
  expect(tr.killAgent(runId, 1)).toBe(true)
  expect(ac1.signal.aborted).toBe(true)
  expect(ac2.signal.aborted).toBe(false)
  // repeat kill on same agent: controller already deleted, returns false (idempotent)
  expect(tr.killAgent(runId, 1)).toBe(false)

  // unknown agentId / unknown runId safe returns false
  expect(tr.killAgent(runId, 999)).toBe(false)
  expect(tr.killAgent('nope', 1)).toBe(false)

  // kill(runId) batch aborts remaining agent (ac2)
  let killSettled = false
  const killPromise = Promise.resolve(tr.kill(runId)).then(result => {
    killSettled = true
    return result
  })
  expect(ac2.signal.aborted).toBe(true)
  await Promise.resolve()
  expect(killSettled).toBe(false)

  tr.finishKill(runId)
  expect(await killPromise).toBe(true)

  // after run terminal state binding is reclaimed: killAgent returns false
  expect(tr.killAgent(runId, 2)).toBe(false)
})

test('unregisterAgentAbort retains cancellation intent across the backend retry gap', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>

  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a-1', toolUseId: 'tu-1', setAppState },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId } = tr.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )
  const ac = new AbortController()
  tr.registerAgentAbort(runId, 5, ac)
  // Keep the id known after unregister: this may be the gap before hooks retries the backend.
  tr.unregisterAgentAbort(runId, 5)
  expect(tr.killAgent(runId, 5)).toBe(true)
  const retryController = new AbortController()
  tr.registerAgentAbort(runId, 5, retryController)
  expect(retryController.signal.aborted).toBe(true)
  // repeat unregister idempotent (backend finally does not throw)
  expect(() => tr.unregisterAgentAbort(runId, 5)).not.toThrow()
  // unknown runId safe no-op
  expect(() => tr.unregisterAgentAbort('nope', 5)).not.toThrow()
})

test('hostFactory.cwd and journalStore share root (getProjectRoot) — fix K regression', () => {
  // historical bug: hostFactory.cwd used getCwd(), journalStore used getProjectRoot(),
  // when user enters worktree/subdirectory the two differ → named workflow resolution and journal persist out of sync.
  // After fix both use projectRoot, this test locks-in that choice, preventing regression.
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a', toolUseId: 'tu' },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  expect(hostCtx.cwd).toBe(getProjectRoot())
})
