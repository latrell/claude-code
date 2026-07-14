import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ─── Mocks ───

const noop = () => {}

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

// Capture enqueuePendingNotification calls for verification
const enqueuedNotifications: string[] = []
const diskOutput = await import('src/utils/task/diskOutput.js')
const messageQueueManager = await import('src/utils/messageQueueManager.js')
const speculation = await import('src/services/PromptSuggestion/speculation.js')
const diskPathSpy = spyOn(diskOutput, 'getTaskOutputPath').mockImplementation(
  (id: string) => `/tmp/output/${id}`,
)
const diskEvictionSpy = spyOn(diskOutput, 'evictTaskOutput').mockImplementation(
  async () => {},
)
const diskSymlinkSpy = spyOn(
  diskOutput,
  'initTaskOutputAsSymlink',
).mockImplementation(async (_taskId, targetPath) => targetPath)
const notificationSpy = spyOn(
  messageQueueManager,
  'enqueuePendingNotification',
).mockImplementation(cmd => {
  if (typeof cmd.value === 'string') {
    enqueuedNotifications.push(cmd.value)
  }
})
const abortSpeculationSpy = spyOn(
  speculation,
  'abortSpeculation',
).mockImplementation(noop)

// ─── Import after mocks ───

const {
  createProgressTracker,
  updateProgressFromMessage,
  getProgressUpdate,
  completeAgentTask,
  failAgentTask,
  killAsyncAgent,
  killAllRunningAgentTasks,
  backgroundAgentTask,
  enqueueAgentNotification,
  suppressAgentNotification,
  registerAgentForeground,
  registerAsyncAgent,
  trackLocalAgentExecution,
  updateAgentProgress,
  isLocalAgentTask,
} = await import('../LocalAgentTask.js')

// ─── Helpers ───

type AppStateLike = { tasks: Record<string, any> }
type SetAppStateLike = (f: (prev: AppStateLike) => AppStateLike) => void

function createSetAppState(initial: AppStateLike = { tasks: {} }): {
  setAppState: SetAppStateLike
  getState: () => AppStateLike
} {
  let state = initial
  return {
    setAppState: f => {
      state = f(state)
    },
    getState: () => state,
  }
}

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve!: () => void
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function makeRunningTask(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-agent-001',
    type: 'local_agent',
    status: 'running',
    description: 'Test agent',
    agentId: 'test-agent-001',
    prompt: 'do something',
    agentType: 'general-purpose',
    abortController: new AbortController(),
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    notified: false,
    startTime: Date.now(),
    outputFile: '/tmp/output/test-agent-001',
    outputOffset: 0,
    ...overrides,
  }
}

function makeAssistantMessage(usage: any, content: any[] = []): any {
  return {
    type: 'assistant',
    message: {
      usage,
      content,
    },
  }
}

afterEach(() => {
  enqueuedNotifications.length = 0
})

afterAll(() => {
  diskPathSpy.mockRestore()
  diskEvictionSpy.mockRestore()
  diskSymlinkSpy.mockRestore()
  notificationSpy.mockRestore()
  abortSpeculationSpy.mockRestore()
})

// ─── Tests ───

describe('createProgressTracker', () => {
  test('returns initial state with zero counts', () => {
    const tracker = createProgressTracker()
    expect(tracker.toolUseCount).toBe(0)
    expect(tracker.latestInputTokens).toBe(0)
    expect(tracker.cumulativeOutputTokens).toBe(0)
    expect(tracker.recentActivities).toEqual([])
  })
})

describe('updateProgressFromMessage', () => {
  test('skips non-assistant messages', () => {
    const tracker = createProgressTracker()
    updateProgressFromMessage(tracker, { type: 'user', message: {} } as any)
    expect(tracker.toolUseCount).toBe(0)
    expect(tracker.latestInputTokens).toBe(0)
  })

  test('updates token counts from assistant message usage', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30,
    })
    updateProgressFromMessage(tracker, msg)
    expect(tracker.latestInputTokens).toBe(150) // 100 + 20 + 30
    expect(tracker.cumulativeOutputTokens).toBe(50)
  })

  test('counts tool_use blocks and tracks recent activities', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage({ input_tokens: 0, output_tokens: 0 }, [
      { type: 'tool_use', name: 'Read', input: { file_path: '/foo.ts' } },
      { type: 'text', text: 'thinking...' },
      { type: 'tool_use', name: 'Write', input: { file_path: '/bar.ts' } },
    ])
    updateProgressFromMessage(tracker, msg)
    expect(tracker.toolUseCount).toBe(2)
    expect(tracker.recentActivities).toHaveLength(2)
    expect(tracker.recentActivities[0]!.toolName).toBe('Read')
    expect(tracker.recentActivities[1]!.toolName).toBe('Write')
  })

  test('caps recentActivities at 5', () => {
    const tracker = createProgressTracker()
    for (let i = 0; i < 7; i++) {
      const msg = makeAssistantMessage({ input_tokens: 0, output_tokens: 0 }, [
        { type: 'tool_use', name: `Tool${i}`, input: {} },
      ])
      updateProgressFromMessage(tracker, msg)
    }
    expect(tracker.recentActivities).toHaveLength(5)
  })

  test('skips without usage', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage(null)
    updateProgressFromMessage(tracker, msg)
    expect(tracker.latestInputTokens).toBe(0)
  })
})

describe('getProgressUpdate', () => {
  test('returns correct progress snapshot', () => {
    const tracker = createProgressTracker()
    tracker.toolUseCount = 3
    tracker.latestInputTokens = 100
    tracker.cumulativeOutputTokens = 50
    tracker.recentActivities.push({ toolName: 'Read', input: {} })

    const progress = getProgressUpdate(tracker)
    expect(progress.toolUseCount).toBe(3)
    expect(progress.tokenCount).toBe(150)
    expect(progress.lastActivity).toBeDefined()
    expect(progress.lastActivity!.toolName).toBe('Read')
  })

  test('returns undefined lastActivity when no activities', () => {
    const tracker = createProgressTracker()
    const progress = getProgressUpdate(tracker)
    expect(progress.lastActivity).toBeUndefined()
  })
})

describe('completeAgentTask', () => {
  test('transitions running task to completed', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask() },
    })

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
    expect(task.endTime).toBeDefined()
    expect(task.evictAfter).toBeDefined()
  })

  test('records endTime for completed task (fixed duration display)', () => {
    const startTime = Date.now() - 5000 // 5s ago
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ startTime }) },
    })

    const beforeComplete = Date.now()
    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )
    const afterComplete = Date.now()

    const task = getState().tasks['test-agent-001']
    expect(task.endTime).toBeDefined()
    expect(task.endTime! >= beforeComplete).toBe(true)
    expect(task.endTime! <= afterComplete).toBe(true)
    // Duration should be approximately 5 seconds (endTime - startTime)
    const duration = task.endTime! - task.startTime
    expect(duration >= 5000).toBe(true)
  })

  test('sets evictAfter=undefined when retain=true (viewing)', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ retain: true }) },
    })

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
    expect(task.retain).toBe(true)
    expect(task.evictAfter).toBeUndefined()
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'completed' }) },
    })

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
  })
})

describe('failAgentTask', () => {
  test('transitions running task to failed with error message', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask() },
    })

    failAgentTask('test-agent-001', 'Stream idle timeout', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('failed')
    expect(task.error).toBe('Stream idle timeout')
    expect(task.endTime).toBeDefined()
  })

  test('records endTime for failed task', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({ startTime: Date.now() - 3000 }),
      },
    })

    failAgentTask('test-agent-001', 'error', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.endTime).toBeDefined()
    expect(task.endTime! >= task.startTime).toBe(true)
  })

  test('sets evictAfter=undefined when retain=true (viewing a failed task)', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ retain: true }) },
    })

    failAgentTask('test-agent-001', 'error', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('failed')
    expect(task.retain).toBe(true)
    expect(task.evictAfter).toBeUndefined()
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'killed' }) },
    })

    failAgentTask('test-agent-001', 'error', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('killed')
    expect(task.error).toBeUndefined()
  })
})

describe('killAsyncAgent', () => {
  test('transitions running task to killed', async () => {
    const ac = new AbortController()
    const cleanup = mock(() => {})
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          abortController: ac,
          unregisterCleanup: cleanup,
        }),
      },
    })

    await killAsyncAgent('test-agent-001', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('killed')
    expect(ac.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalled()
    expect(task.abortController).toBeUndefined()
    expect(task.endTime).toBeDefined()
  })

  test('sets evictAfter=undefined when retain=true (viewing a killed task)', async () => {
    const ac = new AbortController()
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          abortController: ac,
          retain: true,
        }),
      },
    })

    await killAsyncAgent('test-agent-001', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('killed')
    expect(task.retain).toBe(true)
    expect(task.evictAfter).toBeUndefined()
  })

  test('no-op if task not running', async () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'completed' }) },
    })

    await killAsyncAgent('test-agent-001', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
  })

  test('waits for an initial background run to settle before reporting killed', async () => {
    const { setAppState, getState } = createSetAppState()
    const task = registerAsyncAgent({
      agentId: 'initial-agent',
      description: 'Initial background agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
    })
    const execution = createDeferred()
    const trackedExecution = trackLocalAgentExecution({
      taskId: task.agentId,
      abortController: task.abortController!,
      startExecution: () => execution.promise,
      setAppState: setAppState as any,
    })

    let stopResolved = false
    const stop = killAsyncAgent(task.agentId, setAppState as any).then(() => {
      stopResolved = true
    })

    expect(task.abortController!.signal.aborted).toBe(true)
    expect(getState().tasks[task.agentId].status).toBe('running')
    expect(stopResolved).toBe(false)

    execution.resolve()
    await trackedExecution
    await stop

    expect(stopResolved).toBe(true)
    expect(getState().tasks[task.agentId].status).toBe('killed')
  })

  test('waits for a resumed background run registered under the same task id', async () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'resumed-agent': makeRunningTask({
          id: 'resumed-agent',
          agentId: 'resumed-agent',
          status: 'completed',
          retain: true,
        }),
      },
    })
    const task = registerAsyncAgent({
      agentId: 'resumed-agent',
      description: 'Resumed background agent',
      prompt: 'continue',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
    })
    const execution = createDeferred()
    const trackedExecution = trackLocalAgentExecution({
      taskId: task.agentId,
      abortController: task.abortController!,
      startExecution: () => execution.promise,
      setAppState: setAppState as any,
    })

    const stop = killAsyncAgent(task.agentId, setAppState as any)
    expect(getState().tasks[task.agentId].status).toBe('running')

    execution.resolve()
    await trackedExecution
    await stop

    expect(getState().tasks[task.agentId].status).toBe('killed')
    expect(getState().tasks[task.agentId].retain).toBe(true)
  })

  test('does not start a delayed execution after TaskStop already completed', async () => {
    const { setAppState } = createSetAppState()
    const task = registerAsyncAgent({
      agentId: 'cancel-before-start',
      description: 'Delayed background agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
    })

    await killAsyncAgent(task.agentId, setAppState as any)
    let started = false
    await trackLocalAgentExecution({
      taskId: task.agentId,
      abortController: task.abortController!,
      startExecution: () => {
        started = true
        return Promise.resolve()
      },
      setAppState: setAppState as any,
    })

    expect(started).toBe(false)
  })

  test('TaskStop rejects a terminal-state publication failure without replacing the runner error', async () => {
    const taskId = 'publication-failure-agent'
    const abortController = new AbortController()
    const { setAppState, getState } = createSetAppState({
      tasks: {
        [taskId]: makeRunningTask({
          id: taskId,
          agentId: taskId,
          abortController,
        }),
      },
    })
    const publicationError = new Error('state publication failed')
    const runnerError = new Error('runner failed')
    let failKilledPublication = true
    const publishingSetAppState: SetAppStateLike = updater => {
      const prev = getState()
      const next = updater(prev)
      if (
        failKilledPublication &&
        prev.tasks[taskId]?.status === 'running' &&
        next.tasks[taskId]?.status === 'killed'
      ) {
        throw publicationError
      }
      setAppState(() => next)
    }

    const tracked = trackLocalAgentExecution({
      taskId,
      abortController,
      startExecution: () => Promise.reject(runnerError),
      setAppState: publishingSetAppState as any,
    })
    const trackedOutcome = tracked.catch((error: unknown) => error)
    const stopOutcome = killAsyncAgent(
      taskId,
      publishingSetAppState as any,
    ).catch((error: unknown) => error)

    expect(await trackedOutcome).toBe(runnerError)
    expect(await stopOutcome).toBe(publicationError)
    expect(getState().tasks[taskId].status).toBe('running')

    // The failed generation was reclaimed, so a later Stop can retry the
    // terminal publication instead of hanging on an already-settled record.
    failKilledPublication = false
    await killAsyncAgent(taskId, publishingSetAppState as any)
    expect(getState().tasks[taskId].status).toBe('killed')
  })
})

describe('killAllRunningAgentTasks', () => {
  test('waits for every stop and reports partial failures independently', async () => {
    const successfulStop = createDeferred()
    const failedStop = new Error('termination was not confirmed')
    const tasks = {
      'agent-ok': makeRunningTask({ id: 'agent-ok', agentId: 'agent-ok' }),
      'agent-failed': makeRunningTask({
        id: 'agent-failed',
        agentId: 'agent-failed',
      }),
    }
    let settled = false

    const resultPromise = killAllRunningAgentTasks(
      tasks,
      (() => {}) as any,
      async taskId => {
        if (taskId === 'agent-failed') throw failedStop
        await successfulStop.promise
      },
    ).then(result => {
      settled = true
      return result
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    successfulStop.resolve()
    const result = await resultPromise
    expect(result.succeeded).toEqual(['agent-ok'])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toEqual({
      taskId: 'agent-failed',
      error: failedStop,
    })
  })
})

describe('foreground agent cancellation', () => {
  test('registers the task with a child controller that TaskStop aborts', async () => {
    const parentAbortController = new AbortController()
    const { setAppState, getState } = createSetAppState()

    const registration = registerAgentForeground({
      agentId: 'test-agent-001',
      description: 'Test agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
      parentAbortController,
    })

    expect(getState().tasks['test-agent-001'].abortController).toBe(
      registration.abortController,
    )
    expect(registration.abortController.signal.aborted).toBe(false)

    await killAsyncAgent('test-agent-001', setAppState as any)

    expect(registration.abortController.signal.aborted).toBe(true)
    expect(parentAbortController.signal.aborted).toBe(false)
  })

  test('parent cancellation aborts the foreground child controller', () => {
    const parentAbortController = new AbortController()
    const { setAppState } = createSetAppState()
    const registration = registerAgentForeground({
      agentId: 'test-agent-001',
      description: 'Test agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
      parentAbortController,
    })

    parentAbortController.abort()

    expect(registration.abortController.signal.aborted).toBe(true)
  })

  test('TaskStop waits for the foreground iterator settlement', async () => {
    const parentAbortController = new AbortController()
    const { setAppState, getState } = createSetAppState()
    const registration = registerAgentForeground({
      agentId: 'foreground-agent',
      description: 'Foreground agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
      parentAbortController,
    })
    const execution = createDeferred()
    const trackedExecution = trackLocalAgentExecution({
      taskId: registration.taskId,
      abortController: registration.abortController,
      startExecution: () => execution.promise,
      setAppState: setAppState as any,
    })

    let stopResolved = false
    const stop = killAsyncAgent(registration.taskId, setAppState as any).then(
      () => {
        stopResolved = true
      },
    )
    expect(registration.abortController.signal.aborted).toBe(true)
    expect(getState().tasks[registration.taskId].status).toBe('running')
    expect(stopResolved).toBe(false)

    execution.resolve()
    await trackedExecution
    await stop

    expect(getState().tasks[registration.taskId].status).toBe('killed')
    expect(stopResolved).toBe(true)
  })

  test('backgrounding aborts the foreground run and installs an unlinked controller', async () => {
    const parentAbortController = new AbortController()
    const { setAppState, getState } = createSetAppState()
    const registration = registerAgentForeground({
      agentId: 'test-agent-001',
      description: 'Test agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
      parentAbortController,
    })

    expect(
      backgroundAgentTask(
        'test-agent-001',
        getState as any,
        setAppState as any,
      ),
    ).toBe(true)
    await registration.backgroundSignal

    const backgroundController = getState().tasks['test-agent-001']
      .abortController as AbortController
    expect(registration.abortController.signal.aborted).toBe(true)
    expect(backgroundController).not.toBe(registration.abortController)
    expect(backgroundController.signal.aborted).toBe(false)

    // Existing background agents intentionally survive a later parent ESC.
    parentAbortController.abort()
    expect(backgroundController.signal.aborted).toBe(false)

    // TaskStop still owns and aborts the replacement background controller.
    await killAsyncAgent('test-agent-001', setAppState as any)
    expect(backgroundController.signal.aborted).toBe(true)
  })

  test('background handoff waits for the replacement run, not the old foreground generation', async () => {
    const parentAbortController = new AbortController()
    const { setAppState, getState } = createSetAppState()
    const registration = registerAgentForeground({
      agentId: 'handoff-agent',
      description: 'Handoff agent',
      prompt: 'do something',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState: setAppState as any,
      parentAbortController,
    })
    const foregroundExecution = createDeferred()
    const trackedForeground = trackLocalAgentExecution({
      taskId: registration.taskId,
      abortController: registration.abortController,
      startExecution: () => foregroundExecution.promise,
      setAppState: setAppState as any,
    })

    expect(
      backgroundAgentTask(
        registration.taskId,
        getState as any,
        setAppState as any,
      ),
    ).toBe(true)
    await registration.backgroundSignal
    const backgroundController = getState().tasks[registration.taskId]
      .abortController as AbortController
    const backgroundExecution = createDeferred()
    const trackedBackground = trackLocalAgentExecution({
      taskId: registration.taskId,
      abortController: backgroundController,
      startExecution: () => backgroundExecution.promise,
      setAppState: setAppState as any,
    })

    let stopResolved = false
    const stop = killAsyncAgent(registration.taskId, setAppState as any).then(
      () => {
        stopResolved = true
      },
    )

    foregroundExecution.resolve()
    await trackedForeground
    expect(getState().tasks[registration.taskId].status).toBe('running')
    expect(stopResolved).toBe(false)

    backgroundExecution.resolve()
    await trackedBackground
    await stop

    expect(getState().tasks[registration.taskId].status).toBe('killed')
    expect(stopResolved).toBe(true)
  })
})

describe('enqueueAgentNotification', () => {
  test('suppresses per-agent publication while an aggregate stop is pending', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })
    const release = suppressAgentNotification('test-agent-001')

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'killed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(0)
    expect(getState().tasks['test-agent-001'].notified).toBe(false)

    release()
    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'killed',
      setAppState: setAppState as any,
    })
    expect(enqueuedNotifications).toHaveLength(1)
  })

  test('enqueues completed notification with correct XML format', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'refactor auth',
      status: 'completed',
      setAppState: setAppState as any,
      finalMessage: 'Done!',
      usage: { totalTokens: 5000, toolUses: 3, durationMs: 10000 },
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<task-notification>')
    expect(enqueuedNotifications[0]).toContain(
      '<task-id>test-agent-001</task-id>',
    )
    expect(enqueuedNotifications[0]).toContain('<status>completed</status>')
    expect(enqueuedNotifications[0]).toContain(
      'Agent "refactor auth" completed',
    )
    expect(enqueuedNotifications[0]).toContain('<result>Done!</result>')
    expect(enqueuedNotifications[0]).toContain(
      '<total_tokens>5000</total_tokens>',
    )
  })

  test('enqueues failed notification with error', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'failed',
      error: 'Stream idle timeout',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<status>failed</status>')
    expect(enqueuedNotifications[0]).toContain(
      'Agent "test" failed: Stream idle timeout',
    )
  })

  test('enqueues killed notification', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'killed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<status>killed</status>')
    expect(enqueuedNotifications[0]).toContain('Agent "test" was stopped')
  })

  test('prevents duplicate notifications', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    // Second call — notified flag already set by first call
    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
  })

  test('skips if task already notified', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: true }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(0)
  })
})

describe('isLocalAgentTask', () => {
  test('returns true for local_agent type', () => {
    expect(isLocalAgentTask(makeRunningTask())).toBe(true)
  })

  test('returns false for other types', () => {
    expect(isLocalAgentTask({ type: 'local_bash' })).toBe(false)
  })

  test('returns false for null/undefined', () => {
    expect(isLocalAgentTask(null)).toBe(false)
    expect(isLocalAgentTask(undefined)).toBe(false)
  })
})

describe('updateAgentProgress', () => {
  test('updates progress while preserving summary', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          progress: { summary: 'Working on auth' },
        }),
      },
    })

    updateAgentProgress(
      'test-agent-001',
      {
        toolUseCount: 5,
        tokenCount: 1000,
        lastActivity: { toolName: 'Write', input: {} },
      },
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.progress.toolUseCount).toBe(5)
    expect(task.progress.tokenCount).toBe(1000)
    expect(task.progress.summary).toBe('Working on auth')
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          status: 'completed',
          progress: {},
        }),
      },
    })

    updateAgentProgress(
      'test-agent-001',
      { toolUseCount: 5, tokenCount: 1000 },
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.progress.toolUseCount).toBeUndefined()
  })
})
