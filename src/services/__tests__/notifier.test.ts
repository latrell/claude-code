import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

// Cut the module-level side-effect chains (bootstrap/state via log/debug).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Spread-actual mocks: preserve the full export surface so this file's
// process-global mock.module doesn't break later test files that import
// other exports of the same modules (see CLAUDE.md cross-file mock
// pollution rules). Only the functions under test are replaced.
const actualConfig = await import('src/utils/config.js')
mock.module('src/utils/config.ts', () => ({
  ...actualConfig,
  getGlobalConfig: () => ({ preferredNotifChannel: 'terminal_bell' }),
}))

const actualHooks = await import('src/utils/hooks.js')
const executeNotificationHooksMock = mock(async () => {})
mock.module('src/utils/hooks.ts', () => ({
  ...actualHooks,
  executeNotificationHooks: executeNotificationHooksMock,
}))

const { sendNotification } = await import('../notifier.js')
const { clearDynamicTeamContext, setDynamicTeamContext } = await import(
  'src/utils/teammate.js'
)
const { getIsInteractive, setIsInteractive } = await import(
  'src/bootstrap/state.js'
)

function makeTerminal() {
  return {
    notifyBell: mock(() => {}),
    notifyITerm2: mock(() => {}),
    notifyKitty: mock(() => {}),
    notifyGhostty: mock(() => {}),
  }
}

type TerminalArg = Parameters<typeof sendNotification>[1]

const NOTIF = { message: 'hello', notificationType: 'idle_prompt' }

describe('sendNotification', () => {
  const originalIsInteractive = getIsInteractive()

  beforeEach(() => {
    executeNotificationHooksMock.mockClear()
    // Simulate a top-level interactive session (main.tsx sets this at startup)
    setIsInteractive(true)
    clearDynamicTeamContext()
  })

  afterEach(() => {
    setIsInteractive(originalIsInteractive)
    clearDynamicTeamContext()
  })

  test('sends to channel and fires notification hooks in the top-level interactive session', async () => {
    const terminal = makeTerminal()
    await sendNotification(NOTIF, terminal as unknown as TerminalArg)

    expect(terminal.notifyBell).toHaveBeenCalledTimes(1)
    expect(executeNotificationHooksMock).toHaveBeenCalledTimes(1)
  })

  test('suppresses channel dispatch and hooks when running as a teammate worker', async () => {
    setDynamicTeamContext({
      agentId: 'worker@team',
      agentName: 'worker',
      teamName: 'team',
      planModeRequired: false,
    })

    const terminal = makeTerminal()
    await sendNotification(NOTIF, terminal as unknown as TerminalArg)

    expect(terminal.notifyBell).not.toHaveBeenCalled()
    expect(executeNotificationHooksMock).not.toHaveBeenCalled()
  })

  test('suppresses channel dispatch and hooks in non-interactive (headless/SDK) sessions', async () => {
    setIsInteractive(false)

    const terminal = makeTerminal()
    await sendNotification(NOTIF, terminal as unknown as TerminalArg)

    expect(terminal.notifyBell).not.toHaveBeenCalled()
    expect(executeNotificationHooksMock).not.toHaveBeenCalled()
  })
})
