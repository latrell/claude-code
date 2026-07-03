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

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('coordinator-command-')
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
})

afterEach(async () => {
  resetStateForTests()
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('/coordinator', () => {
  async function callCoordinator(): Promise<{
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
    const result = await mod.call(onDone as any, {} as any)
    return { result, onDoneText, metaMessages }
  }

  test('enabling coordinator mode sets env var and emits correct message', async () => {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE

    const { onDoneText, metaMessages } = await callCoordinator()

    // Env var should be set to '1'
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined).toBe(
      '1',
    )
    // Message should indicate mode was enabled
    expect(onDoneText).toContain('enabled')
    // System reminder should be present in metaMessages
    expect(
      metaMessages?.some(m => m.includes('Coordinator mode is now enabled')),
    ).toBe(true)
  })

  test('disabling coordinator mode clears env var and emits correct message', async () => {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'

    const { onDoneText, metaMessages } = await callCoordinator()

    // Env var should be cleared (deleted, yielding undefined)
    expect(
      process.env.CLAUDE_CODE_COORDINATOR_MODE as string | undefined,
    ).toBeUndefined()
    // Message should indicate mode was disabled
    expect(onDoneText).toContain('disabled')
    // System reminder should be present in metaMessages
    expect(
      metaMessages?.some(m => m.includes('Coordinator mode is now disabled')),
    ).toBe(true)
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
})
