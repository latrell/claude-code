// This suite mocks process-wide runner dependencies and is launched in the
// subprocess owned by inProcessInitialTaskClaim.test.ts.
import { describe, expect, mock, test } from 'bun:test'
import type { AppState } from '../../../state/AppState.js'
import type { ToolUseContext } from '../../../Tool.js'
import type { TeammateIdentity } from '../../../tasks/InProcessTeammateTask/types.js'
import type { TeammateContext } from '../../teammateContext.js'

let claimCalls = 0
let updateCalls = 0
let lifecycleController: AbortController | null = null
const receivedPrompts: string[] = []
const actualTasks = await import('../../tasks.js')

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.ts',
  () => ({
    runAgent: async function* (params: {
      promptMessages: Array<{ message?: { content?: unknown } }>
    }) {
      const content = params.promptMessages[0]?.message?.content
      if (typeof content === 'string') {
        receivedPrompts.push(content)
      }
      lifecycleController?.abort('test complete')
      if (false) yield undefined
    },
  }),
)

mock.module('src/utils/tasks.ts', () => ({
  ...actualTasks,
  claimTask: async () => {
    claimCalls += 1
    return { success: true }
  },
  listTasks: async () => [
    {
      id: '1',
      subject: 'Queued team task',
      description: 'Must be delivered as a prompt after it is claimed.',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    },
  ],
  updateTask: async () => {
    updateCalls += 1
    return null
  },
}))

mock.module('src/utils/swarm/spawnInProcess.ts', () => ({
  finalizeKilledInProcessTeammate: async () => {},
  killInProcessTeammate: async () => {},
  killInProcessTeammateByAgentId: async () => {},
  spawnInProcessTeammate: async () => ({}),
}))

describe('in-process teammate initial task ownership', () => {
  test('does not preclaim a task before its prompt can be delivered', async () => {
    const { runInProcessTeammate } = await import('../inProcessRunner.js')
    const identity: TeammateIdentity = {
      agentId: 'worker@team',
      agentName: 'worker',
      teamName: 'team',
      planModeRequired: false,
      parentSessionId: 'parent-session',
    }
    const abortController = new AbortController()
    lifecycleController = abortController

    let appState = {
      tasks: {
        runner: {
          id: 'runner',
          type: 'in_process_teammate',
          status: 'running',
          description: 'worker',
          startTime: Date.now(),
          outputFile: '',
          outputOffset: 0,
          notified: false,
          identity,
          prompt: 'Initial assignment',
          awaitingPlanApproval: false,
          permissionMode: 'default',
          pendingUserMessages: [],
          isIdle: false,
          shutdownRequested: false,
          lastReportedToolCount: 0,
          lastReportedTokenCount: 0,
        },
      },
    } as unknown as AppState

    const toolUseContext = {
      options: {
        tools: [],
        mainLoopModel: 'test-model',
        mcpClients: [],
      },
      getAppState: () => appState,
      setAppState: (updater: (state: AppState) => AppState) => {
        appState = updater(appState)
      },
      readFileState: new Map(),
    } as unknown as ToolUseContext
    const teammateContext: TeammateContext = {
      ...identity,
      isInProcess: true,
      abortController,
    }

    const result = await runInProcessTeammate({
      identity,
      taskId: 'runner',
      prompt: 'Initial assignment',
      teammateContext,
      toolUseContext,
      abortController,
      systemPrompt: 'Test teammate prompt',
      systemPromptMode: 'replace',
    })

    expect(result.success).toBe(false)
    expect(receivedPrompts).toHaveLength(1)
    expect(receivedPrompts[0]).toContain('Initial assignment')
    expect(claimCalls).toBe(0)
    expect(updateCalls).toBe(0)
  })
})
