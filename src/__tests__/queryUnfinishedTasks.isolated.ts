import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { z } from 'zod/v4'
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
const { enqueue, getCommandQueue, resetCommandQueue } = await import(
  '../utils/messageQueueManager'
)
const {
  MAX_UNFINISHED_TASK_NO_PROGRESS_CONTINUATIONS,
  isTaskCompletionGuardToolName,
} = await import('../query/unfinishedTasks')
const { cleanupTempDir, createTempDir } = await import(
  '../../tests/mocks/file-system'
)

let tempDir = ''
let originalProcessCwd = ''
let previousDisableAttachments: string | undefined

beforeEach(async () => {
  originalProcessCwd = process.cwd()
  previousDisableAttachments = process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
  process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
  tempDir = await createTempDir('query-unfinished-tasks-')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setCwdState(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (previousDisableAttachments === undefined) {
    delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
  } else {
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
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

function createToolUseContext(
  params: { mode?: 'default' | 'plan'; agentId?: string } = {},
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
  }

  return {
    agentId: params.agentId,
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4-5-20250929',
      tools: [taskListTool],
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
  listTasks: (inspectionCount: number) => Promise<Task[]> | Task[]
  maxTurns?: number
  mode?: 'default' | 'plan'
  agentId?: string
}

async function runScenario(params: ScenarioParams) {
  let callCount = 0
  let inspectionCount = 0
  const inputs: any[][] = []
  const toolUseContext = createToolUseContext({
    mode: params.mode,
    agentId: params.agentId,
  })
  const deps = {
    uuid: () => 'query-chain-id',
    microcompact: async (messages: unknown[]) => ({ messages }),
    autocompact: async () => ({
      compactionResult: undefined,
      consecutiveFailures: 0,
    }),
    listTasks: async () => {
      inspectionCount++
      return params.listTasks(inspectionCount)
    },
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
