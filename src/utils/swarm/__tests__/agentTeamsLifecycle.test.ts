import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let terminateCalls: string[] = []

mock.module('src/utils/swarm/backends/registry.js', () => {
  const executor = {
    type: 'in-process' as const,
    setContext() {},
    async isAvailable() {
      return true
    },
    async spawn(config: { name: string; teamName: string; color?: string }) {
      return {
        success: true,
        agentId: `${config.name}@${config.teamName}`,
        taskId: `task-${config.name}`,
        backendType: 'in-process',
        color: config.color,
        isSplitPane: false,
      }
    },
    async sendMessage() {},
    async terminate(agentId: string) {
      terminateCalls.push(agentId)
      return true
    },
    async kill() {
      return true
    },
    async isActive() {
      return true
    },
  }

  return {
    getTeammateExecutor: async () => executor,
    getInProcessBackend: () => executor,
    detectAndGetBackend: async () => ({
      backend: { type: 'in-process' },
      isNative: false,
      needsIt2Setup: false,
    }),
    isInProcessEnabled: () => true,
    markInProcessFallback: () => {},
    resetBackendDetection: () => {},
    getCachedBackend: () => null,
    getCachedDetectionResult: () => null,
    getResolvedTeammateMode: () => 'in-process',
    ensureBackendsRegistered: async () => {},
    getBackendByType: () => ({
      type: 'tmux',
      killPane: async () => true,
    }),
  }
})

let tempHome: string
let previousConfigDir: string | undefined
let previousAnthropicApiKey: string | undefined
let previousTaskListId: string | undefined
let previousTeamName: string | undefined
let state: any

function setState(updater: (prev: any) => any): void {
  state = updater(state)
}

function createToolContext(): any {
  return {
    getAppState: () => state,
    setAppState: setState,
    options: {
      agentDefinitions: { activeAgents: [] },
    },
    abortController: new AbortController(),
  }
}

function readTeamConfig(teamName: string): any {
  return JSON.parse(
    readFileSync(join(tempHome, 'teams', teamName, 'config.json'), 'utf-8'),
  )
}

function writeTeamConfig(teamName: string, config: unknown): void {
  const teamDir = join(tempHome, 'teams', teamName)
  mkdirSync(teamDir, { recursive: true })
  writeFileSync(join(teamDir, 'config.json'), JSON.stringify(config, null, 2))
}

beforeEach(async () => {
  terminateCalls = []
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY
  previousTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID
  previousTeamName = process.env.CLAUDE_CODE_TEAM_NAME
  tempHome = join(
    tmpdir(),
    `agent-teams-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = tempHome
  process.env.ANTHROPIC_API_KEY = 'test-key'
  delete process.env.CLAUDE_CODE_TASK_LIST_ID
  delete process.env.CLAUDE_CODE_TEAM_NAME
  const { clearLeaderTeamName } = await import('../../tasks.js')
  clearLeaderTeamName()
  const { getClaudeConfigHomeDir } = await import('../../envUtils.js')
  getClaudeConfigHomeDir.cache.clear?.()
  state = {
    teamContext: undefined,
    tasks: {},
    inbox: { messages: [] },
    toolPermissionContext: {
      mode: 'default',
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      additionalWorkingDirectories: new Map(),
    },
    mainLoopModel: null,
    mainLoopModelForSession: null,
    agentNameRegistry: new Map(),
    mcp: { tools: [] },
  }
})

afterEach(async () => {
  const { clearLeaderTeamName } = await import('../../tasks.js')
  clearLeaderTeamName()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (previousAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey
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
  const { getClaudeConfigHomeDir } = await import('../../envUtils.js')
  getClaudeConfigHomeDir.cache.clear?.()
  rmSync(tempHome, { recursive: true, force: true })
})

describe('Agent Teams lifecycle', () => {
  test('moves implicit session tasks into a team and restores them on delete', async () => {
    const { TeamCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )
    const { TaskCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskCreateTool/TaskCreateTool.js'
    )
    const { TaskUpdateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskUpdateTool/TaskUpdateTool.js'
    )
    const { getTask, getTaskListId } = await import('../../tasks.js')
    const context = createToolContext()
    const sessionTaskListId = getTaskListId()

    const createdTask = await TaskCreateTool.call(
      {
        subject: 'Survive team lifecycle',
        description: 'Continue this task before and after team work',
      },
      context,
    )
    const taskId = createdTask.data.task.id

    const createdTeam = await TeamCreateTool.call(
      { team_name: 'task-migration-team' },
      context,
      undefined as any,
      undefined as any,
    )
    const teamTaskListId = createdTeam.data.team_name
    expect(readTeamConfig(teamTaskListId).restoreTasksToSessionOnDelete).toBe(
      true,
    )
    expect(getTaskListId()).toBe(teamTaskListId)
    expect(await getTask(sessionTaskListId, taskId)).toBeNull()
    expect(await getTask(teamTaskListId, taskId)).toMatchObject({
      status: 'pending',
    })

    const updatedInTeam = await TaskUpdateTool.call(
      { taskId, status: 'in_progress' },
      context,
    )
    expect(updatedInTeam.data.success).toBe(true)

    const deletedTeam = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(deletedTeam.data.success).toBe(true)
    expect(getTaskListId()).toBe(sessionTaskListId)
    expect(await getTask(teamTaskListId, taskId)).toBeNull()
    expect(await getTask(sessionTaskListId, taskId)).toMatchObject({
      status: 'in_progress',
    })

    const completedInSession = await TaskUpdateTool.call(
      { taskId, status: 'completed' },
      context,
    )
    expect(completedInSession.data.success).toBe(true)
    const nextTask = await TaskCreateTool.call(
      {
        subject: 'Continue after TeamDelete',
        description: 'Task numbering and access remain intact',
      },
      context,
    )
    expect(nextTask.data.task.id).toBe('2')
  })

  test('does not migrate explicit or existing team task lists', async () => {
    const { TeamCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )
    const { createTask, getTask, getTaskListId } = await import(
      '../../tasks.js'
    )
    const context = createToolContext()

    for (const scenario of [
      {
        envName: 'CLAUDE_CODE_TASK_LIST_ID' as const,
        sourceTaskListId: 'explicit-task-list',
        teamName: 'explicit-context-team',
      },
      {
        envName: 'CLAUDE_CODE_TEAM_NAME' as const,
        sourceTaskListId: 'existing-team-list',
        teamName: 'nested-context-team',
      },
    ]) {
      process.env[scenario.envName] = scenario.sourceTaskListId
      const taskId = await createTask(getTaskListId(), {
        subject: 'Keep original list stable',
        description: 'This list must not be migrated by TeamCreate',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      })

      const createdTeam = await TeamCreateTool.call(
        { team_name: scenario.teamName },
        context,
        undefined as any,
        undefined as any,
      )
      expect(
        readTeamConfig(createdTeam.data.team_name)
          .restoreTasksToSessionOnDelete,
      ).toBeUndefined()
      expect(getTaskListId()).toBe(scenario.sourceTaskListId)
      expect(await getTask(scenario.sourceTaskListId, taskId)).not.toBeNull()

      const deletedTeam = await TeamDeleteTool.call(
        {},
        context,
        undefined as any,
        undefined as any,
      )
      expect(deletedTeam.data.success).toBe(true)
      expect(getTaskListId()).toBe(scenario.sourceTaskListId)
      expect(await getTask(scenario.sourceTaskListId, taskId)).not.toBeNull()
      delete process.env[scenario.envName]
    }
  })

  test('does not reset a case-aliased explicit task directory on Windows', async () => {
    if (process.platform !== 'win32') return

    const { TeamCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )
    const { createTask, getTask } = await import('../../tasks.js')
    const context = createToolContext()
    const explicitTaskListId = 'CASE-ALIASED-TASK-LIST'
    process.env.CLAUDE_CODE_TASK_LIST_ID = explicitTaskListId
    const taskId = await createTask(explicitTaskListId, {
      subject: 'Preserve case-aliased list',
      description: 'TeamCreate must choose a physically distinct directory',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    const createdTeam = await TeamCreateTool.call(
      { team_name: explicitTaskListId },
      context,
      undefined as any,
      undefined as any,
    )
    expect(createdTeam.data.team_name).not.toBe(explicitTaskListId)
    expect(await getTask(explicitTaskListId, taskId)).not.toBeNull()

    await TeamDeleteTool.call({}, context, undefined as any, undefined as any)
    expect(await getTask(explicitTaskListId, taskId)).not.toBeNull()
  })

  test('runs TeamCreate -> spawn -> TaskUpdate -> SendMessage -> TeamDelete', async () => {
    const { TeamCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { spawnTeammate } = await import(
      '@claude-code-best/builtin-tools/tools/shared/spawnMultiAgent.js'
    )
    const { TaskCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskCreateTool/TaskCreateTool.js'
    )
    const { TaskUpdateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskUpdateTool/TaskUpdateTool.js'
    )
    const { SendMessageTool } = await import(
      '@claude-code-best/builtin-tools/tools/SendMessageTool/SendMessageTool.js'
    )
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )

    const context = {
      getAppState: () => state,
      setAppState: setState,
      options: {
        agentDefinitions: { activeAgents: [] },
      },
      abortController: new AbortController(),
    } as any

    const created = await TeamCreateTool.call(
      { team_name: 'alpha', description: 'test team' },
      context,
      undefined as any,
      undefined as any,
    )
    expect(created.data.team_name).toBe('alpha')

    const spawned = await spawnTeammate(
      {
        name: 'worker',
        prompt: 'handle assigned tasks',
        team_name: 'alpha',
      },
      context,
    )
    expect(spawned.data.agent_id).toBe('worker@alpha')

    const task = await TaskCreateTool.call(
      { subject: 'Check lifecycle', description: 'Verify team task flow' },
      context,
    )
    await TaskUpdateTool.call(
      { taskId: task.data.task.id, owner: 'worker' },
      context,
    )

    const message = await SendMessageTool.call(
      {
        to: 'worker',
        summary: 'Status request',
        message: 'Please report status.',
      },
      context,
      async () => ({ behavior: 'allow' as const }),
      undefined as any,
    )
    expect(message.data.success).toBe(true)

    const blockedDelete = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(blockedDelete.data.success).toBe(false)
    expect(terminateCalls).toEqual(['worker@alpha'])

    const config = readTeamConfig('alpha')
    config.members = config.members.map((member: any) =>
      member.name === 'worker' ? { ...member, isActive: false } : member,
    )
    writeTeamConfig('alpha', config)

    const deleted = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(deleted.data.success).toBe(true)
  })

  test('TeamDelete waits for active teammates to become inactive before cleanup', async () => {
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )
    const now = Date.now()
    writeTeamConfig('alpha', {
      name: 'alpha',
      createdAt: now,
      leadAgentId: 'team-lead@alpha',
      members: [
        {
          agentId: 'team-lead@alpha',
          name: 'team-lead',
          joinedAt: now,
          tmuxPaneId: '',
          cwd: tempHome,
          subscriptions: [],
        },
        {
          agentId: 'worker@alpha',
          name: 'worker',
          joinedAt: now,
          tmuxPaneId: 'in-process',
          cwd: tempHome,
          subscriptions: [],
          backendType: 'in-process',
        },
      ],
    })
    state.teamContext = {
      teamName: 'alpha',
      teamFilePath: join(tempHome, 'teams', 'alpha', 'config.json'),
      leadAgentId: 'team-lead@alpha',
      teammates: {
        'worker@alpha': {
          name: 'worker',
          tmuxSessionName: 'in-process',
          tmuxPaneId: 'in-process',
          cwd: tempHome,
          spawnedAt: now,
        },
      },
    }

    setTimeout(() => {
      const config = readTeamConfig('alpha')
      config.members = config.members.map((member: any) =>
        member.name === 'worker' ? { ...member, isActive: false } : member,
      )
      writeTeamConfig('alpha', config)
    }, 25)

    const result = await TeamDeleteTool.call(
      { wait_ms: 1000 },
      {
        getAppState: () => state,
        setAppState: setState,
      } as any,
      undefined as any,
      undefined as any,
    )

    expect(result.data.success).toBe(true)
  })
})
