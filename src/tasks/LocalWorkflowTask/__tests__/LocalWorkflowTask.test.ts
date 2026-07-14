import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ─── Mocks（仅 mock 有副作用的依赖链）───

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

mock.module('src/constants/xml.js', () => ({
  TASK_NOTIFICATION_TAG: 'task_notification',
  TASK_ID_TAG: 'task_id',
  TOOL_USE_ID_TAG: 'tool_use_id',
  OUTPUT_FILE_TAG: 'output_file',
  STATUS_TAG: 'status',
  SUMMARY_TAG: 'summary',
  WORKTREE_TAG: 'worktree',
  WORKTREE_PATH_TAG: 'worktree_path',
  WORKTREE_BRANCH_TAG: 'worktree_branch',
  TASK_TYPE_TAG: 'task_type',
}))

mock.module('src/utils/messageQueueManager.js', () => ({
  enqueuePendingNotification: () => {},
}))

mock.module('src/utils/sdkEventQueue.js', () => ({
  enqueueSdkEvent: () => {},
}))

mock.module('src/utils/task/diskOutput.js', () => ({
  getTaskOutputDelta: async () => null,
  getTaskOutputPath: (id: string) => `/tmp/${id}`,
  evictTaskOutput: () => {},
  initTaskOutputAsSymlink: async () => {},
}))

// ─── Import after mocks ───

const {
  LocalWorkflowTask,
  registerLocalWorkflowTask,
  failWorkflowTask,
  finishWorkflowTaskKill,
  killWorkflowTask,
  killWorkflowTasksForAgent,
  registerWorkflowTaskKillHandler,
} = await import('../LocalWorkflowTask.js')
const { StopConfirmationError } = await import(
  '../../../utils/stopConfirmation.js'
)

// ─── Helpers ───

type AppStateLike = { tasks: Record<string, any> }
type SetAppStateLike = (f: (prev: AppStateLike) => AppStateLike) => void

function createSetState(): {
  setAppState: SetAppStateLike
  getState: () => AppStateLike
} {
  let state: AppStateLike = { tasks: {} }
  return {
    setAppState: f => {
      state = f(state)
    },
    getState: () => state,
  }
}

// ─── Tests ───

describe('failWorkflowTask', () => {
  test('保存 error 字符串到 state（供 BackgroundTasksDialog 显示失败原因）', () => {
    const { setAppState, getState } = createSetState()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'test',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
    })
    failWorkflowTask(taskId, setAppState as any, 'agent X 抛 Error: boom')
    const task = getState().tasks[taskId]
    expect(task.status).toBe('failed')
    expect(task.error).toBe('agent X 抛 Error: boom')
  })

  test('不传 error 时 state.error 保持 undefined（向后兼容现有调用）', () => {
    const { setAppState, getState } = createSetState()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'test',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
    })
    failWorkflowTask(taskId, setAppState as any)
    const task = getState().tasks[taskId]
    expect(task.status).toBe('failed')
    expect(task.error).toBeUndefined()
  })
})

describe('workflow cancellation settlement', () => {
  test('missing runner binding requests abort but does not claim the workflow stopped', async () => {
    const { setAppState, getState } = createSetState()
    const abortController = new AbortController()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'unbound',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
      abortController,
    })

    expect(await killWorkflowTask(taskId, setAppState as any)).toBe(false)
    expect(abortController.signal.aborted).toBe(true)
    expect(getState().tasks[taskId].status).toBe('running')
    await expect(
      LocalWorkflowTask.kill(taskId, setAppState as any),
    ).rejects.toThrow('termination could not be confirmed')
    expect(getState().tasks[taskId].status).toBe('running')
  })

  test('killWorkflowTask resolves only after the registered runner kill handler settles', async () => {
    const { setAppState, getState } = createSetState()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'test',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
    })
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const detach = registerWorkflowTaskKillHandler(taskId, async () => {
      await gate
      finishWorkflowTaskKill(taskId, setAppState as any)
      return true
    })

    const killing = killWorkflowTask(taskId, setAppState as any)
    await Promise.resolve()
    expect(getState().tasks[taskId].status).toBe('running')

    release()
    expect(await killing).toBe(true)
    expect(getState().tasks[taskId].status).toBe('killed')
    detach()
  })

  test('rejects a kill handler that ignores cancellation without publishing killed', async () => {
    const { setAppState, getState } = createSetState()
    const abortController = new AbortController()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'stuck workflow',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
      abortController,
    })
    const detach = registerWorkflowTaskKillHandler(taskId, async () => {
      abortController.abort()
      await new Promise<void>(() => {})
      return true
    })

    await expect(
      killWorkflowTask(taskId, setAppState as any, {
        timeoutMs: 1_000,
        abortGraceMs: 10,
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(abortController.signal.aborted).toBe(true)
    expect(getState().tasks[taskId].status).toBe('running')
    detach()
  })

  test('owner cleanup filters by agentId and awaits matching workflow settlement', async () => {
    const { setAppState, getState } = createSetState()
    const ownerId = 'owner-1' as any
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'owned',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
      agentId: ownerId,
    })
    const otherTaskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'other',
      workflowName: 'wf-other',
      workflowFile: '/tmp/other.ts',
      agentId: 'owner-2' as any,
    })
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let otherKilled = false
    const detachOwned = registerWorkflowTaskKillHandler(taskId, async () => {
      await gate
      finishWorkflowTaskKill(taskId, setAppState as any)
      return true
    })
    const detachOther = registerWorkflowTaskKillHandler(
      otherTaskId,
      async () => {
        otherKilled = true
        return true
      },
    )

    const cleanup = killWorkflowTasksForAgent(
      ownerId,
      getState as any,
      setAppState as any,
    )
    await Promise.resolve()
    expect(getState().tasks[taskId].status).toBe('running')
    expect(otherKilled).toBe(false)

    release()
    await cleanup
    expect(getState().tasks[taskId].status).toBe('killed')
    expect(getState().tasks[otherTaskId].status).toBe('running')
    detachOwned()
    detachOther()
  })

  test('owner cleanup rejects when any workflow stop is unconfirmed', async () => {
    const { setAppState, getState } = createSetState()
    const ownerId = 'owner-unconfirmed' as any
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'owned',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
      agentId: ownerId,
    })

    await expect(
      killWorkflowTasksForAgent(ownerId, getState as any, setAppState as any),
    ).rejects.toThrow('Failed to confirm termination')
    expect(getState().tasks[taskId].status).toBe('running')
  })
})
