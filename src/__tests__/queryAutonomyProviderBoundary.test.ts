import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../bootstrap/state'
import { query } from '../query'
import { getEmptyToolPermissionContext } from '../Tool'
import type { AssistantMessage } from '../types/message'
import { asSystemPrompt } from '../utils/systemPromptType'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
} from '../utils/messages'
import { cleanupTempDir, createTempDir } from '../../tests/mocks/file-system'
import {
  enqueue,
  getCommandQueue,
  getCommandsByMaxPriority,
  resetCommandQueue,
} from '../utils/messageQueueManager'
import { getAutonomyFlowById, listAutonomyFlows } from '../utils/autonomyFlows'
import {
  getAutonomyRunById,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../utils/autonomyRuns'
import { MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS } from '../services/api/openai/serverContinuation'

let tempDir = ''
let originalProcessCwd = ''

beforeEach(async () => {
  originalProcessCwd = process.cwd()
  tempDir = await createTempDir('query-autonomy-provider-boundary-')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setCwdState(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (originalProcessCwd) {
    process.chdir(originalProcessCwd)
  }
  if (tempDir) {
    let lastError: unknown
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await cleanupTempDir(tempDir)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    if (lastError) {
      throw lastError
    }
  }
})

function createToolUseAssistantMessage(): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: undefined,
    message: {
      id: 'msg_tool_use',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [
        {
          type: 'tool_use',
          id: 'toolu_provider_boundary',
          name: 'MissingBoundaryTool',
          input: {},
        },
      ],
    },
  } as unknown as AssistantMessage
}

function createTextAssistantMessage(
  id: string,
  text: string,
): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: undefined,
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: 'gpt-5.6-sol',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [{ type: 'text', text, citations: null }],
    },
  } as unknown as AssistantMessage
}

function createEmptyAssistantMessage(id: string): AssistantMessage {
  const message = createTextAssistantMessage(id, '')
  message.message.content = []
  return message
}

function createToolUseContext(): any {
  let inProgressToolUseIds = new Set<string>()
  let responseLength = 0
  let appState = {
    toolPermissionContext: getEmptyToolPermissionContext(),
    fastMode: false,
    mcp: {
      tools: [],
      clients: [],
    },
    effortValue: undefined,
    advisorModel: undefined,
    sessionHooks: new Map(),
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4-5-20250929',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allowedAgentTypes: [],
      },
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
  } as any
}

describe('query autonomy/provider boundary', () => {
  test('continues on Codex end_turn=false without synthetic input and scopes turn state to one query', async () => {
    enqueue({
      value: 'queued input must wait for the server continuation to finish',
      mode: 'prompt',
      priority: 'next',
      uuid: randomUUID(),
    })
    const firstTurnSessions: object[] = []
    const compactTurnSessions: object[] = []
    const firstTurnInputs: any[][] = []
    let firstTurnCallCount = 0
    const firstDeps = {
      uuid: () => 'query-chain-id',
      microcompact: async (messages: unknown[]) => ({ messages }),
      autocompact: async (
        _messages: unknown[],
        _context: unknown,
        cacheSafeParams: any,
      ) => {
        compactTurnSessions.push(cacheSafeParams.chatGPTCodexTurnSession)
        return {
          compactionResult: undefined,
          consecutiveFailures: 0,
        }
      },
      callModel: async function* ({ messages, options }: any) {
        firstTurnCallCount += 1
        firstTurnSessions.push(options.chatGPTCodexTurnSession)
        firstTurnInputs.push(messages)
        options.chatGPTCodexTurnSession.lastResponseEndTurn =
          firstTurnCallCount === 1 ? false : true
        yield createTextAssistantMessage(
          `msg_${firstTurnCallCount}`,
          `response ${firstTurnCallCount}`,
        )
      },
    }

    const firstGenerator = query({
      messages: [createUserMessage({ content: 'start Codex turn' })],
      systemPrompt: asSystemPrompt([]),
      userContext: {},
      systemContext: {},
      canUseTool: async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      toolUseContext: createToolUseContext(),
      querySource: 'sdk',
      maxTurns: 1,
      deps: firstDeps as never,
    })
    let firstResult = await firstGenerator.next()
    while (!firstResult.done) firstResult = await firstGenerator.next()

    expect(firstResult.value.reason).toBe('completed')
    expect(firstTurnCallCount).toBe(2)
    expect(firstTurnSessions[1]).toBe(firstTurnSessions[0])
    expect(compactTurnSessions[0]).toBe(firstTurnSessions[0])
    expect(firstTurnInputs[1]?.map(message => message.type)).toEqual([
      'user',
      'assistant',
    ])
    expect(getCommandQueue()).toHaveLength(1)

    let secondTurnSession: object | undefined
    const secondDeps = {
      ...firstDeps,
      callModel: async function* ({ options }: any) {
        secondTurnSession = options.chatGPTCodexTurnSession
        options.chatGPTCodexTurnSession.lastResponseEndTurn = true
        yield createTextAssistantMessage('msg_next_user_turn', 'done')
      },
    }
    const secondGenerator = query({
      messages: [createUserMessage({ content: 'next user turn' })],
      systemPrompt: asSystemPrompt([]),
      userContext: {},
      systemContext: {},
      canUseTool: async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      toolUseContext: createToolUseContext(),
      querySource: 'sdk',
      maxTurns: 2,
      deps: secondDeps as never,
    })
    let secondResult = await secondGenerator.next()
    while (!secondResult.done) secondResult = await secondGenerator.next()

    expect(secondResult.value.reason).toBe('completed')
    expect(secondTurnSession).not.toBe(firstTurnSessions[0])
  })

  test('bounds repeated empty Codex server continuations without growing replay history', async () => {
    const inputs: any[][] = []
    let callCount = 0
    const deps = {
      uuid: () => 'query-chain-id',
      microcompact: async (messages: unknown[]) => ({ messages }),
      autocompact: async () => ({
        compactionResult: undefined,
        consecutiveFailures: 0,
      }),
      callModel: async function* ({ messages, options }: any) {
        callCount += 1
        inputs.push(messages)
        options.chatGPTCodexTurnSession.lastResponseEndTurn = false
        yield createEmptyAssistantMessage(`msg_empty_${callCount}`)
      },
    }

    const emitted: any[] = []
    const generator = query({
      messages: [createUserMessage({ content: 'coordinator notification' })],
      systemPrompt: asSystemPrompt([]),
      userContext: {},
      systemContext: {},
      canUseTool: async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      toolUseContext: createToolUseContext(),
      querySource: 'sdk',
      maxTurns: 1,
      deps: deps as never,
    })
    let result = await generator.next()
    while (!result.done) {
      emitted.push(result.value)
      result = await generator.next()
    }

    expect(callCount).toBe(MAX_CHATGPT_CODEX_SERVER_CONTINUATIONS + 1)
    expect(result.value.reason).toBe('model_error')
    expect(
      emitted.some(
        message =>
          message.type === 'assistant' &&
          message.isApiErrorMessage === true &&
          JSON.stringify(message.message.content).includes(
            'server continuations',
          ),
      ),
    ).toBe(true)
    expect(
      inputs.every(
        messages =>
          messages.filter(message => message.type === 'assistant').length === 0,
      ),
    ).toBe(true)
  })

  test('provider api-error messages fail a consumed autonomy run instead of advancing the flow', async () => {
    const previousDisableAttachments =
      process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
    try {
      const command = await startManagedAutonomyFlowFromHeartbeatTask({
        task: {
          name: 'provider-boundary',
          interval: '1h',
          prompt: 'Exercise provider boundary',
          steps: [
            { name: 'first', prompt: 'First provider-boundary step' },
            { name: 'second', prompt: 'Second provider-boundary step' },
          ],
        },
        rootDir: tempDir,
        currentDir: tempDir,
        priority: 'next',
      })
      expect(command).not.toBeNull()
      enqueue(command!)

      const toolUseContext = createToolUseContext()

      let callCount = 0
      const toolContinuationSessions: object[] = []
      const deps = {
        uuid: () => 'query-chain-id',
        microcompact: async (messages: unknown[]) => ({ messages }),
        autocompact: async () => ({
          compactionResult: undefined,
          consecutiveFailures: 0,
        }),
        callModel: async function* ({ options }: any) {
          callCount += 1
          toolContinuationSessions.push(options.chatGPTCodexTurnSession)
          if (callCount === 1) {
            options.chatGPTCodexTurnSession.turnState = 'sticky-tool-turn'
            yield createToolUseAssistantMessage()
            return
          }
          yield createAssistantAPIErrorMessage({
            content: 'API Error: provider unavailable',
            apiError: 'api_error',
            error: new Error('provider unavailable') as never,
          })
        },
      }

      const emitted: any[] = []
      const generator = query({
        messages: [
          createUserMessage({
            content: 'start provider-boundary test',
          }),
        ],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        toolUseContext,
        querySource: 'sdk',
        maxTurns: 3,
        deps: deps as never,
      })
      let next = await generator.next()
      while (!next.done) {
        emitted.push(next.value)
        next = await generator.next()
      }

      const [flow] = await listAutonomyFlows(tempDir)
      const finalFlow = await getAutonomyFlowById(flow!.flowId, tempDir)
      const run = await getAutonomyRunById(command!.autonomy!.runId, tempDir)

      expect(next.value.reason).toBe('model_error')
      expect(callCount).toBe(2)
      expect(toolContinuationSessions[1]).toBe(toolContinuationSessions[0])
      expect(
        (toolContinuationSessions[1] as { turnState?: string }).turnState,
      ).toBe('sticky-tool-turn')
      expect(
        emitted.some(
          message =>
            message.type === 'attachment' &&
            message.attachment.type === 'queued_command',
        ),
      ).toBe(true)
      expect(run!.status).toBe('failed')
      expect(run!.error).toBe('provider api_error')
      expect(finalFlow!.status).toBe('failed')
      expect(finalFlow!.stateJson!.steps.map(step => step.status)).toEqual([
        'failed',
        'pending',
      ])
      expect(getCommandsByMaxPriority('later')).toHaveLength(0)
    } finally {
      if (previousDisableAttachments === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
      } else {
        process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
      }
    }
  })

  test('generator return cancels a consumed autonomy run instead of leaving it running', async () => {
    const previousDisableAttachments =
      process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
    try {
      const command = await startManagedAutonomyFlowFromHeartbeatTask({
        task: {
          name: 'return-boundary',
          interval: '1h',
          prompt: 'Exercise generator return boundary',
          steps: [
            { name: 'first', prompt: 'First return-boundary step' },
            { name: 'second', prompt: 'Second return-boundary step' },
          ],
        },
        rootDir: tempDir,
        currentDir: tempDir,
        priority: 'next',
      })
      expect(command).not.toBeNull()
      enqueue(command!)

      const toolUseContext = createToolUseContext()
      const deps = {
        uuid: () => 'query-chain-id',
        microcompact: async (messages: unknown[]) => ({ messages }),
        autocompact: async () => ({
          compactionResult: undefined,
          consecutiveFailures: 0,
        }),
        callModel: async function* () {
          yield createToolUseAssistantMessage()
        },
      }

      const generator = query({
        messages: [
          createUserMessage({
            content: 'start return-boundary test',
          }),
        ],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        toolUseContext,
        querySource: 'sdk',
        maxTurns: 3,
        deps: deps as never,
      })

      let sawQueuedAttachment = false
      let next = await generator.next()
      while (!next.done) {
        const message = next.value as any
        if (
          message.type === 'attachment' &&
          message.attachment.type === 'queued_command'
        ) {
          sawQueuedAttachment = true
          await generator.return(undefined as never)
          break
        }
        next = await generator.next()
      }

      const [flow] = await listAutonomyFlows(tempDir)
      const finalFlow = await getAutonomyFlowById(flow!.flowId, tempDir)
      const run = await getAutonomyRunById(command!.autonomy!.runId, tempDir)

      expect(sawQueuedAttachment).toBe(true)
      expect(run!.status).toBe('cancelled')
      expect(finalFlow!.status).toBe('cancelled')
      expect(finalFlow!.stateJson!.steps.map(step => step.status)).toEqual([
        'cancelled',
        'cancelled',
      ])
      expect(getCommandsByMaxPriority('later')).toHaveLength(0)
    } finally {
      if (previousDisableAttachments === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
      } else {
        process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
      }
    }
  })
})
