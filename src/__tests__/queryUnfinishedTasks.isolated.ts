import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { z } from 'zod/v4'
import type { TaskState } from '../tasks/types'
import type { AssistantMessage } from '../types/message'
import type { Task } from '../utils/tasks'

const {
  addToTotalCostState,
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
  snapshotOutputTokensForTurn,
} = await import('../bootstrap/state')
const { query } = await import('../query')
const { buildTool, getEmptyToolPermissionContext } = await import('../Tool')
const { asSystemPrompt } = await import('../utils/systemPromptType')
const { createUserMessage } = await import('../utils/messages')
const { getTaskCompletionGuardMailboxAttachments } = await import(
  '../utils/attachments'
)
const {
  enqueue,
  enqueuePendingNotification,
  getCommandQueue,
  hasParkedTaskNotificationDeliveryAddressedTo,
  leaseTaskNotificationBatch,
  peek,
  reactivateParkedTaskNotifications,
  releaseDueTaskNotificationRetries,
  resetCommandQueue,
  retryTaskNotificationLease,
} = await import('../utils/messageQueueManager')
const { clearLeaderTeamName, getTaskListId, setLeaderTeamName } = await import(
  '../utils/tasks'
)
const {
  MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
  getTaskCompletionGuardRuntimeState,
  isTaskCompletionGuardToolName,
} = await import('../query/unfinishedTasks')
const { cleanupTempDir, createTempDir } = await import(
  '../../tests/mocks/file-system'
)

let tempDir = ''
let originalProcessCwd = ''
let previousDisableAttachments: string | undefined
let previousTaskListId: string | undefined
let previousTeamName: string | undefined

beforeEach(async () => {
  originalProcessCwd = process.cwd()
  previousDisableAttachments = process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
  previousTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID
  previousTeamName = process.env.CLAUDE_CODE_TEAM_NAME
  process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
  delete process.env.CLAUDE_CODE_TASK_LIST_ID
  delete process.env.CLAUDE_CODE_TEAM_NAME
  tempDir = await createTempDir('query-unfinished-tasks-')
  resetStateForTests()
  resetCommandQueue()
  clearLeaderTeamName()
  setOriginalCwd(tempDir)
  setCwdState(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  clearLeaderTeamName()
  if (previousDisableAttachments === undefined) {
    delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
  } else {
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
  }
  if (previousTaskListId === undefined) {
    delete process.env.CLAUDE_CODE_TASK_LIST_ID
  } else {
    process.env.CLAUDE_CODE_TASK_LIST_ID = previousTaskListId
  }
  if (previousTeamName === undefined) {
    delete process.env.CLAUDE_CODE_TEAM_NAME
  } else {
    process.env.CLAUDE_CODE_TEAM_NAME = previousTeamName
  }
  if (originalProcessCwd) process.chdir(originalProcessCwd)
  if (tempDir) await cleanupTempDir(tempDir)
})

const taskListTool = buildTool({
  name: 'TaskList',
  inputSchema: z.strictObject({}),
  maxResultSizeChars: 10_000,
  async call() {
    return { data: { ok: true } }
  },
  async description() {
    return 'List tasks for a test'
  },
  async prompt() {
    return 'List tasks'
  },
  mapToolResultToToolResultBlockParam(_content, toolUseID) {
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: 'Tasks listed',
    }
  },
  renderToolUseMessage() {
    return null
  },
})

function createImmediateTool(
  name: string,
  onCall: () => void = () => {},
  resultContent: () => string = () => `${name} completed`,
) {
  return buildTool({
    name,
    inputSchema: z.strictObject({}),
    maxResultSizeChars: 10_000,
    async call() {
      onCall()
      return { data: { ok: true } }
    },
    async description() {
      return `${name} test tool`
    },
    async prompt() {
      return `${name} test tool`
    },
    mapToolResultToToolResultBlockParam(_content, toolUseID) {
      return {
        type: 'tool_result' as const,
        tool_use_id: toolUseID,
        content: resultContent(),
      }
    },
    renderToolUseMessage() {
      return null
    },
  })
}

function createAssistantMessage(params: {
  id: string
  text?: string
  toolName?: string
}): AssistantMessage {
  const content = params.toolName
    ? [
        {
          type: 'tool_use' as const,
          id: `toolu_${params.id}`,
          name: params.toolName,
          input: {},
        },
      ]
    : [{ type: 'text' as const, text: params.text ?? 'done', citations: null }]
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: undefined,
    message: {
      id: params.id,
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      stop_reason: params.toolName ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content,
    },
  } as unknown as AssistantMessage
}

function createTask(
  id: string,
  status: Task['status'],
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    subject: `Task ${id}`,
    description: `Description ${id}`,
    status,
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

type RuntimeLocalAgent = Extract<TaskState, { type: 'local_agent' }>

function createRuntimeLocalAgent(
  id: string,
  overrides: Partial<RuntimeLocalAgent> = {},
): RuntimeLocalAgent {
  return {
    id,
    type: 'local_agent',
    status: 'running',
    description: `Runtime ${id}`,
    startTime: Date.now(),
    outputFile: '',
    outputOffset: 0,
    notified: false,
    agentId: id,
    prompt: 'Finish assigned work',
    agentType: 'general-purpose',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    ...overrides,
  }
}

function createToolUseContext(
  params: {
    mode?: 'default' | 'plan'
    agentId?: string
    runtimeTasks?: Record<string, TaskState>
    tools?: any[]
  } = {},
): any {
  let inProgressToolUseIds = new Set<string>()
  let responseLength = 0
  let appState = {
    toolPermissionContext: {
      ...getEmptyToolPermissionContext(),
      mode: params.mode ?? 'default',
    },
    fastMode: false,
    mcp: { tools: [], clients: [] },
    effortValue: undefined,
    advisorModel: undefined,
    sessionHooks: new Map(),
    tasks: params.runtimeTasks ?? {},
  }

  return {
    agentId: params.agentId,
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4-5-20250929',
      tools: params.tools ?? [taskListTool],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allowedAgentTypes: [] },
    },
    abortController: new AbortController(),
    readFileState: new Map(),
    getAppState: () => appState,
    setAppState: (updater: (state: any) => any) => {
      appState = updater(appState as never)
    },
    setInProgressToolUseIDs: (updater: (state: Set<string>) => Set<string>) => {
      inProgressToolUseIds = updater(inProgressToolUseIds)
    },
    setResponseLength: (updater: (state: number) => number) => {
      responseLength = updater(responseLength)
    },
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}

function messageText(message: any): string {
  const content = message?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join('\n')
}

type ScenarioParams = {
  responses: (callCount: number, toolUseContext: any) => AssistantMessage
  listTasks: (
    inspectionCount: number,
    taskListId: string,
  ) => Promise<Task[]> | Task[]
  maxTurns?: number
  mode?: 'default' | 'plan'
  agentId?: string
  runtimeTasks?: Record<string, TaskState>
  tools?: any[]
  teammateStatuses?: (taskListId: string) => any[]
  mailboxAttachments?: () => Promise<any[]> | any[]
}

async function runScenario(params: ScenarioParams) {
  let callCount = 0
  let inspectionCount = 0
  const inputs: any[][] = []
  const inspectedTaskListIds: string[] = []
  const toolUseContext = createToolUseContext({
    mode: params.mode,
    agentId: params.agentId,
    runtimeTasks: params.runtimeTasks,
    tools: params.tools,
  })
  const deps = {
    uuid: () => 'query-chain-id',
    microcompact: async (messages: unknown[]) => ({ messages }),
    autocompact: async () => ({
      compactionResult: undefined,
      consecutiveFailures: 0,
    }),
    listTasks: async (taskListId: string) => {
      inspectionCount++
      inspectedTaskListIds.push(taskListId)
      return params.listTasks(inspectionCount, taskListId)
    },
    getTeammateStatuses: (taskListId: string) =>
      params.teammateStatuses?.(taskListId) ?? [],
    getTaskCompletionGuardMailboxAttachments: async () =>
      (await params.mailboxAttachments?.()) ?? [],
    callModel: async function* ({ messages }: any) {
      callCount++
      inputs.push(messages)
      yield params.responses(callCount, toolUseContext)
    },
  }

  const emitted: any[] = []
  const generator = query({
    messages: [createUserMessage({ content: 'Finish every task' })],
    systemPrompt: asSystemPrompt([]),
    userContext: {},
    systemContext: {},
    canUseTool: async (_tool, input) => ({
      behavior: 'allow' as const,
      updatedInput: input,
    }),
    toolUseContext,
    querySource: 'sdk',
    maxTurns: params.maxTurns,
    deps: deps as never,
  })
  let next = await generator.next()
  while (!next.done) {
    emitted.push(next.value)
    next = await generator.next()
  }
  return {
    terminal: next.value,
    emitted,
    inputs,
    callCount,
    inspectionCount,
    inspectedTaskListIds,
  }
}

function taskThenText(callCount: number): AssistantMessage {
  return callCount === 1
    ? createAssistantMessage({ id: 'task-list', toolName: 'TaskList' })
    : createAssistantMessage({ id: `final-${callCount}`, text: 'All done' })
}

describe('query unfinished TaskList completion guard', () => {
  test('recognizes every Task tool name', () => {
    for (const name of ['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']) {
      expect(isTaskCompletionGuardToolName(name)).toBe(true)
    }
    expect(isTaskCompletionGuardToolName('Bash')).toBe(false)
  })

  test('continues pending and in-progress work, then completes after progress', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: inspectionCount =>
        inspectionCount === 1
          ? [createTask('1', 'pending'), createTask('2', 'in_progress')]
          : [createTask('1', 'completed'), createTask('2', 'completed')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    expect(result.inspectionCount).toBe(2)
    const continuation = messageText(result.inputs[2]?.at(-1))
    expect(continuation).toContain('#1 [pending]')
    expect(continuation).toContain('#2 [in_progress]')
  })

  test('does not continue when all public tasks are completed', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'completed')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(2)
    expect(result.inspectionCount).toBe(1)
  })

  test('old unfinished tasks do not activate the guard without a Task tool use', async () => {
    const result = await runScenario({
      responses: callCount =>
        createAssistantMessage({ id: `final-${callCount}`, text: 'Done' }),
      listTasks: () => [createTask('old', 'pending')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(1)
    expect(result.inspectionCount).toBe(0)
  })

  test('coordinates assigned and blocked tasks without taking them over', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: inspectionCount =>
        inspectionCount === 1
          ? [
              createTask('1', 'in_progress', { owner: 'worker-1' }),
              createTask('2', 'pending', { blockedBy: ['1'] }),
            ]
          : [createTask('1', 'completed'), createTask('2', 'completed')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    const continuation = messageText(result.inputs[2]?.at(-1))
    expect(continuation).toContain('none are currently safe')
    expect(continuation).toContain('owner=worker-1')
    expect(continuation).toContain('blocked by #1')
    expect(continuation).toContain('Do not take over assigned work')
  })

  test('skips the guard in plan mode and for subagents', async () => {
    for (const context of [
      { mode: 'plan' as const },
      { agentId: 'subagent-1' },
    ]) {
      const result = await runScenario({
        responses: taskThenText,
        listTasks: () => [createTask('1', 'pending')],
        ...context,
      })
      expect(result.terminal.reason).toBe('completed')
      expect(result.callCount).toBe(2)
      expect(result.inspectionCount).toBe(0)
    }
  })

  test('maxTurns prevents an automatic unfinished-task continuation', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'pending')],
      maxTurns: 2,
    })

    expect(result.terminal).toEqual({ reason: 'max_turns', turnCount: 3 })
    expect(result.callCount).toBe(2)
    expect(
      result.emitted.some(
        message => message.attachment?.type === 'max_turns_reached',
      ),
    ).toBe(true)
  })

  test('queued human input takes priority over the completion guard', async () => {
    const result = await runScenario({
      responses: (callCount, _context) => {
        if (callCount === 2) {
          enqueue({
            value: 'Please change direction',
            mode: 'prompt',
            priority: 'later',
            uuid: randomUUID(),
          })
        }
        return taskThenText(callCount)
      },
      listTasks: () => [createTask('1', 'pending')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.inspectionCount).toBe(0)
    expect(getCommandQueue()).toHaveLength(1)
  })

  test('consumes a queued task notification before completing the same query', async () => {
    const result = await runScenario({
      responses: (callCount, _context) => {
        if (callCount === 2) {
          enqueuePendingNotification({
            value: '<task-notification>worker finished</task-notification>',
            mode: 'task-notification',
          })
        }
        return taskThenText(callCount)
      },
      listTasks: () => [createTask('1', 'completed', { owner: 'worker-1' })],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    expect(result.inspectionCount).toBe(1)
    expect(getCommandQueue()).toHaveLength(0)
    expect(result.inputs[2]?.at(-1)?.attachment?.prompt).toContain(
      'worker finished',
    )
  })

  test('passively waits for correlated runtime work and consumes its notification', async () => {
    let publicTaskCompleted = false
    const runtimeAgent = createRuntimeLocalAgent('worker-1')
    const result = await runScenario({
      responses: (callCount, context) => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 2) {
          setTimeout(() => {
            publicTaskCompleted = true
            context.setAppState((previous: any) => ({
              ...previous,
              tasks: {
                ...previous.tasks,
                [runtimeAgent.id]: {
                  ...previous.tasks[runtimeAgent.id],
                  status: 'completed',
                  notified: true,
                },
              },
            }))
            enqueuePendingNotification({
              value:
                '<task-notification>correlated worker finished</task-notification>',
              mode: 'task-notification',
            })
          }, 10)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', publicTaskCompleted ? 'completed' : 'in_progress', {
          owner: runtimeAgent.agentId,
        }),
      ],
      runtimeTasks: { [runtimeAgent.id]: runtimeAgent },
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    expect(result.inspectionCount).toBe(2)
    expect(result.inputs[2]?.at(-1)?.attachment?.prompt).toContain(
      'correlated worker finished',
    )
  })

  test('keeps runtime correlation across coordination tool rounds and TaskList progress', async () => {
    let contextForAgent: any
    let publicTaskStarted = false
    let publicTaskCompleted = false
    const runtimeAgent = createRuntimeLocalAgent('runtime-worker', {
      toolUseId: 'toolu_spawn-agent',
    })
    const readTool = createImmediateTool('Read')
    const agentTool = createImmediateTool('Agent', () => {
      publicTaskStarted = true
      contextForAgent.setAppState((previous: any) => ({
        ...previous,
        tasks: {
          ...previous.tasks,
          [runtimeAgent.id]: runtimeAgent,
        },
      }))
    })

    const result = await runScenario({
      responses: (callCount, context) => {
        contextForAgent = context
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3) {
          return createAssistantMessage({ id: 'read-first', toolName: 'Read' })
        }
        if (callCount === 4) {
          return createAssistantMessage({
            id: 'spawn-agent',
            toolName: 'Agent',
          })
        }
        if (callCount === 5) {
          setTimeout(() => {
            publicTaskCompleted = true
            context.setAppState((previous: any) => ({
              ...previous,
              tasks: {
                ...previous.tasks,
                [runtimeAgent.id]: {
                  ...previous.tasks[runtimeAgent.id],
                  status: 'completed',
                  notified: true,
                },
              },
            }))
            enqueuePendingNotification({
              value:
                '<task-notification>multi-round worker finished</task-notification>',
              mode: 'task-notification',
            })
          }, 30)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask(
          '1',
          publicTaskCompleted
            ? 'completed'
            : publicTaskStarted
              ? 'in_progress'
              : 'pending',
          { owner: 'public-owner' },
        ),
      ],
      tools: [taskListTool, readTool, agentTool],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(6)
    expect(result.inspectionCount).toBe(3)
    expect(result.inputs[5]?.at(-1)?.attachment?.prompt).toContain(
      'multi-round worker finished',
    )
  })

  test('retains a background worker launched before the first TaskList tool', async () => {
    let contextForAgent: any
    let publicTaskCompleted = false
    const runtimeAgent = createRuntimeLocalAgent('early-worker', {
      toolUseId: 'toolu_early-agent',
    })
    const agentTool = createImmediateTool('Agent', () => {
      contextForAgent.setAppState((previous: any) => ({
        ...previous,
        tasks: {
          ...previous.tasks,
          [runtimeAgent.id]: runtimeAgent,
        },
      }))
    })

    const result = await runScenario({
      responses: (callCount, context) => {
        contextForAgent = context
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'early-agent',
            toolName: 'Agent',
          })
        }
        if (callCount === 2) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3) {
          setTimeout(() => {
            publicTaskCompleted = true
            context.setAppState((previous: any) => ({
              ...previous,
              tasks: {
                ...previous.tasks,
                [runtimeAgent.id]: {
                  ...previous.tasks[runtimeAgent.id],
                  status: 'completed',
                  notified: true,
                },
              },
            }))
            enqueuePendingNotification({
              value:
                '<task-notification>early worker finished</task-notification>',
              mode: 'task-notification',
            })
          }, 30)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', publicTaskCompleted ? 'completed' : 'in_progress', {
          owner: 'public-owner',
        }),
      ],
      tools: [taskListTool, agentTool],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(4)
    expect(result.inspectionCount).toBe(2)
    expect(result.inputs[3]?.at(-1)?.attachment?.prompt).toContain(
      'early worker finished',
    )
  })

  test('does not exhaust the idle guard while an unassigned task has active runtime work', async () => {
    let contextForAgent: any
    let publicTaskCompleted = false
    const runtimeAgent = createRuntimeLocalAgent('unassigned-worker', {
      toolUseId: 'toolu_unassigned-agent',
    })
    const agentTool = createImmediateTool('Agent', () => {
      contextForAgent.setAppState((previous: any) => ({
        ...previous,
        tasks: {
          ...previous.tasks,
          [runtimeAgent.id]: runtimeAgent,
        },
      }))
    })

    const result = await runScenario({
      responses: (callCount, context) => {
        contextForAgent = context
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'unassigned-agent',
            toolName: 'Agent',
          })
        }
        if (callCount === 2) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3) {
          setTimeout(() => {
            publicTaskCompleted = true
            context.setAppState((previous: any) => ({
              ...previous,
              tasks: {
                ...previous.tasks,
                [runtimeAgent.id]: {
                  ...previous.tasks[runtimeAgent.id],
                  status: 'completed',
                  notified: true,
                },
              },
            }))
            enqueuePendingNotification({
              value:
                '<task-notification>unassigned worker finished</task-notification>',
              mode: 'task-notification',
            })
          }, 50)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', publicTaskCompleted ? 'completed' : 'pending'),
      ],
      tools: [taskListTool, agentTool],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(7)
    expect(result.inspectionCount).toBe(5)
    expect(result.inputs[6]?.at(-1)?.attachment?.prompt).toContain(
      'unassigned worker finished',
    )
  })

  test('waits for an unassigned pane teammate and consumes its mailbox result in the same query', async () => {
    let teammateRunning = true
    let publicTaskCompleted = false
    let mailboxPending = false
    let mailboxDelivered = false

    const result = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 5) {
          setTimeout(() => {
            // Match the teammate producer invariant: mailbox commit happens
            // before idle becomes visible to the leader.
            mailboxPending = true
            publicTaskCompleted = true
            teammateRunning = false
            enqueuePendingNotification({
              value: 'wake main guard for pane mailbox',
              mode: 'task-notification',
              agentId: 'other-agent' as any,
            })
          }, 20)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', publicTaskCompleted ? 'completed' : 'pending'),
      ],
      teammateStatuses: () => [
        {
          name: 'pane-worker',
          agentId: 'pane-worker@team',
          status: teammateRunning ? 'running' : 'idle',
          tmuxPaneId: '%1',
          cwd: tempDir,
        },
      ],
      mailboxAttachments: () => {
        if (!mailboxPending || mailboxDelivered) return []
        mailboxDelivered = true
        return [
          {
            type: 'teammate_mailbox',
            messages: [
              {
                from: 'pane-worker',
                text: 'pane worker finished the task',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        ]
      },
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(6)
    expect(result.inspectionCount).toBe(5)
    expect(result.inputs[5]?.at(-1)?.attachment).toMatchObject({
      type: 'teammate_mailbox',
      messages: [
        {
          from: 'pane-worker',
          text: 'pane worker finished the task',
        },
      ],
    })
  })

  test('waits for a running external pane after its unowned public task is already completed', async () => {
    let teammateRunning = true
    let mailboxPending = false
    let mailboxDelivered = false

    const result = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 2) {
          setTimeout(() => {
            mailboxPending = true
            teammateRunning = false
            enqueuePendingNotification({
              value: 'wake completed pane guard for mailbox',
              mode: 'task-notification',
              agentId: 'other-agent' as any,
            })
          }, 20)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [createTask('1', 'completed')],
      teammateStatuses: () => [
        {
          name: 'pane-worker',
          agentId: 'pane-worker@team',
          status: teammateRunning ? 'running' : 'idle',
          backendType: 'tmux',
          tmuxPaneId: '%2',
          cwd: tempDir,
        },
      ],
      mailboxAttachments: () => {
        if (!mailboxPending || mailboxDelivered) return []
        mailboxDelivered = true
        return [
          {
            type: 'teammate_mailbox',
            messages: [
              {
                from: 'pane-worker',
                text: 'result written after the public task completed',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        ]
      },
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    expect(result.inspectionCount).toBe(2)
    expect(result.inputs[2]?.at(-1)?.attachment).toMatchObject({
      type: 'teammate_mailbox',
      messages: [
        {
          text: 'result written after the public task completed',
        },
      ],
    })
  })

  test('ignores sticky team-file running status for idle in-process teammates', async () => {
    const idleTeammate = {
      id: 'in-process-idle',
      type: 'in_process_teammate',
      status: 'running',
      notified: false,
      isIdle: true,
      identity: {
        agentId: 'idle-agent@team',
        agentName: 'idle-agent',
        teamName: 'team',
      },
    } as unknown as TaskState
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [
        createTask('1', 'completed', { owner: 'idle-agent@team' }),
      ],
      runtimeTasks: { [idleTeammate.id]: idleTeammate },
      teammateStatuses: () => [
        {
          name: 'idle-agent',
          agentId: 'idle-agent@team',
          status: 'running',
          backendType: 'in-process',
          tmuxPaneId: '',
          cwd: tempDir,
        },
        {
          name: 'legacy-idle-agent',
          agentId: 'legacy-idle-agent@team',
          status: 'running',
          tmuxPaneId: '',
          cwd: tempDir,
        },
      ],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(2)
    expect(result.inspectionCount).toBe(1)
  })

  test('publishes a mailbox result before stopping at maxTurns', async () => {
    let mailboxDelivered = false
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'completed')],
      maxTurns: 2,
      mailboxAttachments: () => {
        if (mailboxDelivered) return []
        mailboxDelivered = true
        return [
          {
            type: 'teammate_mailbox',
            messages: [
              {
                from: 'pane-worker',
                text: 'final result at the turn boundary',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        ]
      },
    })

    expect(result.terminal).toEqual({ reason: 'max_turns', turnCount: 3 })
    expect(result.callCount).toBe(2)
    expect(
      result.emitted.some(
        message =>
          message?.attachment?.type === 'teammate_mailbox' &&
          message.attachment.messages?.[0]?.text ===
            'final result at the turn boundary',
      ),
    ).toBe(true)
    expect(
      result.emitted.some(
        message => message?.attachment?.type === 'max_turns_reached',
      ),
    ).toBe(true)
  })

  test('drains the production teammate mailbox helper for external users', async () => {
    const previousUserType = process.env.USER_TYPE
    process.env.USER_TYPE = 'external'
    try {
      const toolUseContext = createToolUseContext()
      toolUseContext.setAppState((previous: any) => ({
        ...previous,
        teamContext: {
          teamName: 'external-team',
          teamFilePath: `${tempDir}/external-team.json`,
          leadAgentId: 'team-lead@external-team',
          teammates: {
            'team-lead@external-team': {
              name: 'team-lead',
              tmuxSessionName: 'external-team',
              tmuxPaneId: '%0',
              cwd: tempDir,
              spawnedAt: Date.now(),
            },
          },
        },
        inbox: {
          messages: [
            {
              id: 'external-mailbox-message',
              from: 'pane-worker',
              text: 'external CCB mailbox result',
              timestamp: new Date().toISOString(),
              status: 'pending',
            },
          ],
        },
      }))

      const attachments = await getTaskCompletionGuardMailboxAttachments(
        toolUseContext,
        'sdk',
      )

      expect(attachments).toEqual([
        {
          type: 'teammate_mailbox',
          messages: [
            {
              from: 'pane-worker',
              text: 'external CCB mailbox result',
              timestamp: expect.any(String),
              color: undefined,
              summary: undefined,
            },
          ],
        },
      ])
      expect(toolUseContext.getAppState().inbox.messages[0]?.status).toBe(
        'processed',
      )
    } finally {
      if (previousUserType === undefined) {
        delete process.env.USER_TYPE
      } else {
        process.env.USER_TYPE = previousUserType
      }
    }
  })

  test('waits through the terminal-to-notification delivery gap after TaskList completion', async () => {
    const runtimeAgent = createRuntimeLocalAgent('worker-1', {
      status: 'completed',
      notified: false,
    })
    const result = await runScenario({
      responses: (callCount, context) => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 2) {
          setTimeout(() => {
            context.setAppState((previous: any) => ({
              ...previous,
              tasks: {
                ...previous.tasks,
                [runtimeAgent.id]: {
                  ...previous.tasks[runtimeAgent.id],
                  notified: true,
                },
              },
            }))
            enqueuePendingNotification({
              value:
                '<task-notification>detached cleanup finished</task-notification>',
              mode: 'task-notification',
            })
          }, 20)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', 'completed', { owner: runtimeAgent.agentId }),
      ],
      runtimeTasks: { [runtimeAgent.id]: runtimeAgent },
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(3)
    expect(result.inspectionCount).toBe(2)
    expect(result.inputs[2]?.at(-1)?.attachment?.prompt).toContain(
      'detached cleanup finished',
    )
  })

  test('waits for retrying notifications without spending an idle continuation', async () => {
    let publicTaskCompleted = false
    const result = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3) {
          enqueuePendingNotification({
            value:
              '<task-notification>retry delivery finished</task-notification>',
            mode: 'task-notification',
          })
          const lease = leaseTaskNotificationBatch(() => true)
          expect(lease).toBeDefined()
          expect(retryTaskNotificationLease(lease!)).toBe('retry-scheduled')
        }
        if (callCount === 4) publicTaskCompleted = true
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', publicTaskCompleted ? 'completed' : 'pending'),
      ],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(4)
    expect(result.inspectionCount).toBe(2)
    expect(result.inputs[3]?.at(-1)?.attachment?.prompt).toContain(
      'retry delivery finished',
    )
  })

  test('reports a parked notification without polling forever and preserves it for external retry', async () => {
    enqueuePendingNotification({
      value: '<task-notification>parked result</task-notification>',
      mode: 'task-notification',
    })
    const firstLease = leaseTaskNotificationBatch(() => true)
    expect(firstLease).toBeDefined()
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    const retryLease = leaseTaskNotificationBatch(() => true)
    expect(retryLease).toBeUndefined()
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const releasedLease = leaseTaskNotificationBatch(() => true)
    expect(releasedLease).toBeDefined()
    expect(retryTaskNotificationLease(releasedLease!)).toBe('parked')

    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'completed')],
    })

    expect(result.terminal.reason).toBe('model_error')
    expect(result.callCount).toBe(2)
    expect(result.inspectionCount).toBe(0)
    expect(hasParkedTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
    expect(peek()).toBeUndefined()
    reactivateParkedTaskNotifications()
    expect(peek()?.value).toContain('parked result')
  })

  test('abort interrupts passive runtime waiting without another model call', async () => {
    const runtimeAgent = createRuntimeLocalAgent('worker-1')
    const result = await runScenario({
      responses: (callCount, context) => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 2) {
          setTimeout(() => context.abortController.abort('test abort'), 10)
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [
        createTask('1', 'in_progress', { owner: runtimeAgent.agentId }),
      ],
      runtimeTasks: { [runtimeAgent.id]: runtimeAgent },
    })

    expect(result.terminal.reason).toBe('aborted_streaming')
    expect(result.callCount).toBe(2)
    expect(result.inspectionCount).toBe(1)
  })

  test('correlates only finite background runtime work to the guard', () => {
    const worker = createRuntimeLocalAgent('worker-1')
    const unrelated = createRuntimeLocalAgent('worker-2')
    const mainSession = createRuntimeLocalAgent('main-session', {
      agentType: 'main-session',
    })
    const foreground = createRuntimeLocalAgent('foreground', {
      isBackgrounded: false,
    })
    const dream = {
      id: 'dream',
      type: 'dream',
      status: 'running',
      description: 'memory consolidation',
      startTime: Date.now(),
      outputFile: '',
      outputOffset: 0,
      notified: false,
      phase: 'starting',
      sessionsReviewing: 1,
      filesTouched: [],
      turns: [],
    } as TaskState

    expect(
      getTaskCompletionGuardRuntimeState(
        { worker, unrelated, mainSession, foreground, dream },
        new Set(),
        new Set(['worker-1']),
      ),
    ).toEqual({ hasActiveWork: true, hasPendingDelivery: false })
    expect(
      getTaskCompletionGuardRuntimeState(
        { unrelated, mainSession, foreground, dream },
        new Set(['dream']),
        new Set(['worker-1']),
      ),
    ).toEqual({ hasActiveWork: false, hasPendingDelivery: false })
    expect(
      getTaskCompletionGuardRuntimeState(
        {
          worker: {
            ...worker,
            status: 'completed',
            notified: false,
          },
        },
        new Set(),
        new Set(['worker-1']),
      ),
    ).toEqual({ hasActiveWork: false, hasPendingDelivery: true })
  })

  test('does not count newly settled tool work as an idle continuation', async () => {
    let bashCalls = 0
    const bashTool = createImmediateTool('Bash', () => bashCalls++)
    const result = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3) {
          return createAssistantMessage({ id: 'work', toolName: 'Bash' })
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [createTask('1', 'pending')],
      tools: [taskListTool, bashTool],
    })

    expect(bashCalls).toBe(1)
    expect(result.terminal).toEqual({
      reason: 'unfinished_tasks',
      taskIds: ['1'],
      noProgressContinuations: MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
    })
    expect(result.callCount).toBe(7)
    expect(result.inspectionCount).toBe(5)
  })

  test('does not let repeated or wait-only tools hide a real stall', async () => {
    for (const toolName of ['TaskList', 'Sleep', 'TaskOutput']) {
      const extraTool =
        toolName === 'TaskList' ? undefined : createImmediateTool(toolName)
      const result = await runScenario({
        responses: callCount => {
          if (callCount === 1) {
            return createAssistantMessage({
              id: 'task-list',
              toolName: 'TaskList',
            })
          }
          if (callCount === 3) {
            return createAssistantMessage({
              id: `wait-${toolName}`,
              toolName,
            })
          }
          return createAssistantMessage({
            id: `final-${callCount}`,
            text: 'All done',
          })
        },
        listTasks: () => [createTask('1', 'pending')],
        tools: extraTool ? [taskListTool, extraTool] : [taskListTool],
      })

      expect(result.terminal).toEqual({
        reason: 'unfinished_tasks',
        taskIds: ['1'],
        noProgressContinuations: MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
      })
      expect(result.callCount).toBe(6)
      expect(result.inspectionCount).toBe(4)
    }

    let repeatedResultCount = 0
    const repeatedBash = createImmediateTool(
      'Bash',
      () => {},
      () => `Bash completed ${++repeatedResultCount}`,
    )
    const repeatedResult = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 3 || callCount === 5) {
          return createAssistantMessage({
            id: `same-work-${callCount}`,
            toolName: 'Bash',
          })
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: () => [createTask('1', 'pending')],
      tools: [taskListTool, repeatedBash],
    })

    expect(repeatedResult.terminal.reason).toBe('unfinished_tasks')
    expect(repeatedResult.callCount).toBe(8)
    expect(repeatedResult.inspectionCount).toBe(5)
  })

  test('inspects every task list touched before a team switch', async () => {
    const originalTaskListId = getTaskListId()
    const switchedTaskListId = 'completion-guard-team'
    const inspectionsByList = new Map<string, number>()

    const result = await runScenario({
      responses: callCount => {
        if (callCount === 1) {
          return createAssistantMessage({
            id: 'session-task-list',
            toolName: 'TaskList',
          })
        }
        if (callCount === 2) {
          setLeaderTeamName(switchedTaskListId)
          return createAssistantMessage({
            id: 'team-task-list',
            toolName: 'TaskList',
          })
        }
        return createAssistantMessage({
          id: `final-${callCount}`,
          text: 'All done',
        })
      },
      listTasks: (_inspectionCount, taskListId) => {
        const count = (inspectionsByList.get(taskListId) ?? 0) + 1
        inspectionsByList.set(taskListId, count)
        if (taskListId === originalTaskListId) {
          return [
            createTask('old-list-task', count === 1 ? 'pending' : 'completed'),
          ]
        }
        return []
      },
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(4)
    expect(result.inspectedTaskListIds).toEqual([
      originalTaskListId,
      switchedTaskListId,
      originalTaskListId,
      switchedTaskListId,
    ])
    expect(messageText(result.inputs[3]?.at(-1))).toContain(
      '#old-list-task [pending]',
    )
    expect(messageText(result.inputs[3]?.at(-1))).toContain(
      `[TaskList ${JSON.stringify(originalTaskListId)}]`,
    )
    expect(messageText(result.inputs[3]?.at(-1))).toContain(
      `Task tools currently address TaskList ${JSON.stringify(switchedTaskListId)}`,
    )
    expect(messageText(result.inputs[3]?.at(-1))).toContain(
      'Never apply a same-numbered task ID from another list',
    )
  })

  test('abort takes priority over the completion guard', async () => {
    const result = await runScenario({
      responses: (callCount, context) => {
        if (callCount === 2) context.abortController.abort('test abort')
        return taskThenText(callCount)
      },
      listTasks: () => [createTask('1', 'pending')],
    })

    expect(result.terminal.reason).toBe('aborted_streaming')
    expect(result.inspectionCount).toBe(0)
  })

  test('an active exhausted token budget takes priority over the guard', async () => {
    snapshotOutputTokensForTurn(1)
    addToTotalCostState(
      0,
      {
        inputTokens: 0,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 0,
        maxOutputTokens: 0,
      },
      'test-model',
    )
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'pending')],
    })

    expect(result.terminal.reason).toBe('completed')
    expect(result.callCount).toBe(2)
    expect(result.inspectionCount).toBe(0)
  })

  test('caps unchanged actionable tasks with a visible unfinished terminal', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [createTask('1', 'pending')],
    })

    expect(result.callCount).toBe(
      MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS + 2,
    )
    expect(result.terminal).toEqual({
      reason: 'unfinished_tasks',
      taskIds: ['1'],
      noProgressContinuations: MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
    })
    const visibleError = result.emitted.find(
      message =>
        message.type === 'assistant' &&
        message.isApiErrorMessage &&
        messageText(message).includes('without TaskList progress'),
    )
    expect(visibleError).toBeDefined()
  })

  test('caps unchanged assigned or blocked tasks instead of false success', async () => {
    const result = await runScenario({
      responses: taskThenText,
      listTasks: () => [
        createTask('1', 'in_progress', { owner: 'worker-1' }),
        createTask('2', 'pending', { blockedBy: ['missing-blocker'] }),
      ],
    })

    expect(result.terminal).toEqual({
      reason: 'unfinished_tasks',
      taskIds: ['1', '2'],
      noProgressContinuations: MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
    })
    expect(result.callCount).toBe(
      MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS + 2,
    )
  })
})
