import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import { createTempDir, cleanupTempDir } from '../../../tests/mocks/file-system'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

// Mocks shared across the whole test process to avoid deep dependency chains
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature(_name: string): boolean {
    // COORDINATOR_MODE is enabled at runtime via env var, not via build define.
    // Ensure the feature gate returns true so coordinatorMode module loads.
    if (_name === 'COORDINATOR_MODE') return true
    return false
  },
}))

const appState = {
  agentDefinitions: {
    activeAgents: [{ agentType: 'general-purpose' }],
    allAgents: [{ agentType: 'general-purpose' }],
  },
}

// Mock coordinatorMode.js so isCoordinatorMode() reads our env var directly.
// The real module's feature('COORDINATOR_MODE') check doesn't work in tests
// (bun:bundle is a virtual build-time module). We replace the whole module.
mock.module('src/coordinator/coordinatorMode.js', () => {
  function isEnvTruthy(envVar: string | boolean | undefined): boolean {
    if (!envVar) return false
    if (typeof envVar === 'boolean') return envVar
    const normalizedValue = (envVar as string).toLowerCase().trim()
    return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
  }
  return {
    isCoordinatorMode(): boolean {
      return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
    },
    matchSessionMode: () => undefined as string | undefined,
    getCoordinatorUserContext: () => ({}) as Record<string, string>,
    getCoordinatorSystemPrompt: () => '',
  }
})

// Mock coordinatorGlobal.js to capture global persistence calls without
// touching the real settings module (which has module-level side effects).
const setGlobalCalls: boolean[] = []
mock.module('src/coordinator/coordinatorGlobal.js', () => ({
  getGlobalCoordinatorSetting: () => false,
  setGlobalCoordinatorSetting: (enabled: boolean) => {
    setGlobalCalls.push(enabled)
  },
  applyGlobalCoordinatorDefault: () => {},
}))

mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js',
  () => {
    const normalAgents = [{ agentType: 'general-purpose' }]
    const workerAgents = [{ agentType: 'worker' }]

    function activeAgents() {
      return process.env.CLAUDE_CODE_COORDINATOR_MODE === '1'
        ? workerAgents
        : normalAgents
    }

    return {
      clearAgentDefinitionsCache: mock(() => {}),
      filterAgentsByMcpRequirements: mock(agents => agents),
      getActiveAgentsFromList: mock(agents => agents),
      getAgentDefinitionsWithOverrides: mock(async () => {
        const agents = activeAgents()
        return {
          activeAgents: agents,
          allAgents: agents,
        }
      }),
      hasRequiredMcpServers: mock(() => true),
      isBuiltInAgent: mock(() => false),
      isCustomAgent: mock(() => false),
      isPluginAgent: mock(() => false),
      parseAgentFromJson: mock(() => null),
      parseAgentFromMarkdown: mock(() => null),
      parseAgentsFromJson: mock(() => []),
    }
  },
)

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('coordinator-command-')
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  setGlobalCalls.length = 0
  appState.agentDefinitions = {
    activeAgents: [{ agentType: 'general-purpose' }],
    allAgents: [{ agentType: 'general-purpose' }],
  }
})

afterEach(async () => {
  resetStateForTests()
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('/coordinator', () => {
  async function callCoordinator(args = ''): Promise<{
    result: React.ReactNode
    onDoneText: string
    metaMessages: string[] | undefined
  }> {
    const { default: coordinatorModule } = await import('../coordinator')
    const mod = await coordinatorModule.load()
    let onDoneText = ''
    let metaMessages: string[] | undefined
    const onDone = (
      text: string,
      opts?: { display?: string; metaMessages?: string[] },
    ) => {
      onDoneText = text
      metaMessages = opts?.metaMessages
    }
    const context = {
      setAppState(updater: (prev: typeof appState) => typeof appState) {
        const next = updater(appState)
        appState.agentDefinitions = next.agentDefinitions
      },
    }
    const result = await mod.call(onDone as any, context as any, args)
    return { result, onDoneText, metaMessages }
  }

  test('enabling coordinator mode sets env var, refreshes agents, and emits correct message', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { onDoneText, metaMessages } = await callCoordinator()

    // Env var should be set to '1'
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(appState.agentDefinitions.activeAgents).toEqual([
      { agentType: 'worker' },
    ])
    // Message should indicate mode was enabled (either English or Chinese)
    const isEnglish = onDoneText.includes('enabled')
    const isChinese = onDoneText.includes('启用')
    expect(isEnglish || isChinese).toBe(true)
    // System reminder should be present in metaMessages
    expect(
      metaMessages?.some(m => m.includes('Coordinator mode is now enabled')),
    ).toBe(true)
    // No global persistence without the `global` argument
    expect(setGlobalCalls).toEqual([])
  })

  test('disabling coordinator mode clears env var, refreshes agents, and emits correct message', async () => {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    appState.agentDefinitions = {
      activeAgents: [{ agentType: 'worker' }],
      allAgents: [{ agentType: 'worker' }],
    }

    const { onDoneText, metaMessages } = await callCoordinator()

    // Env var should be cleared (deleted, yielding undefined)
    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(appState.agentDefinitions.activeAgents).toEqual([
      { agentType: 'general-purpose' },
    ])
    // Message should indicate mode was disabled (either English or Chinese)
    const isEnglish = onDoneText.includes('disabled')
    const isChinese = onDoneText.includes('禁用')
    expect(isEnglish || isChinese).toBe(true)
    // System reminder should be present in metaMessages
    expect(
      metaMessages?.some(m => m.includes('Coordinator mode is now disabled')),
    ).toBe(true)
    expect(setGlobalCalls).toEqual([])
  })

  test('command returns null JSX (onDone handles display)', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { result } = await callCoordinator()

    expect(result).toBeNull()
  })

  test('toggling twice returns env var to original state', async () => {
    // Start OFF
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    // Toggle ON
    await callCoordinator()
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )

    // Toggle OFF
    await callCoordinator()
    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
  })

  test('"on" enables explicitly', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    await callCoordinator('on')

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(setGlobalCalls).toEqual([])
  })

  test('"off" disables explicitly', async () => {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'

    await callCoordinator('off')

    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(setGlobalCalls).toEqual([])
  })

  test('"global" toggles the session and persists the new state globally', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { onDoneText } = await callCoordinator('global')

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(setGlobalCalls).toEqual([true])
    // Message should mention the global persistence (English or Chinese)
    expect(onDoneText.includes('global') || onDoneText.includes('全局')).toBe(
      true,
    )
  })

  test('"on global" enables and persists globally', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    await callCoordinator('on global')

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(setGlobalCalls).toEqual([true])
  })

  test('"off global" disables and clears the global default', async () => {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'

    await callCoordinator('off global')

    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(setGlobalCalls).toEqual([false])
  })

  test('explicit "on" when already enabled skips refresh and reminder but still reports', async () => {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    appState.agentDefinitions = {
      activeAgents: [{ agentType: 'worker' }],
      allAgents: [{ agentType: 'worker' }],
    }

    const { onDoneText, metaMessages } = await callCoordinator('on')

    // Env stays on, agents untouched, no model-visible reminder
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(appState.agentDefinitions.activeAgents).toEqual([
      { agentType: 'worker' },
    ])
    expect(metaMessages).toBeUndefined()
    expect(onDoneText.length).toBeGreaterThan(0)
  })

  test('explicit "off global" when already disabled still clears the global default', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { metaMessages } = await callCoordinator('off global')

    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(setGlobalCalls).toEqual([false])
    expect(metaMessages).toBeUndefined()
  })

  test('invalid arguments report usage without changing state', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { onDoneText } = await callCoordinator('bogus')

    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(setGlobalCalls).toEqual([])
    expect(onDoneText).toContain('/coordinator [on|off] [global]')
  })

  test('duplicate tokens are rejected', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { onDoneText } = await callCoordinator('on off')

    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    expect(onDoneText).toContain('/coordinator [on|off] [global]')
  })

  test('arguments are case-insensitive and order-insensitive', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    await callCoordinator('GLOBAL On')

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    expect(setGlobalCalls).toEqual([true])
  })
})
