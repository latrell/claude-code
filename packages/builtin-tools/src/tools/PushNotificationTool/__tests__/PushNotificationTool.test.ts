import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../../../tests/mocks/debug'
import { logMock } from '../../../../../../tests/mocks/log'

// Cut the module-level side-effect chains (bootstrap/state via log/debug).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Spread-actual mocks (see CLAUDE.md cross-file mock pollution rules):
// only the delivery functions are replaced, controllable per test.
let meowConfigured = false
const sendMeowPushMock = mock(async (_title: string, _body: string) => true)
const actualNotifier = await import('src/services/notifier.js')
mock.module('src/services/notifier.ts', () => ({
  ...actualNotifier,
  isMeowChannelConfigured: () => meowConfigured,
  sendMeowPush: sendMeowPushMock,
}))

const actualBridgeEnabled = await import('src/bridge/bridgeEnabled.js')
mock.module('src/bridge/bridgeEnabled.ts', () => ({
  ...actualBridgeEnabled,
  isBridgeEnabled: () => false,
}))

const { PushNotificationTool } = await import('../PushNotificationTool.js')

type CallContext = Parameters<typeof PushNotificationTool.call>[1]

function makeContext(agentId?: string): CallContext {
  return {
    agentId,
    getAppState: () => ({ replBridgeEnabled: false }),
  } as unknown as CallContext
}

const INPUT = { title: 'done', body: 'task finished' }

beforeEach(() => {
  meowConfigured = true
  sendMeowPushMock.mockClear()
  sendMeowPushMock.mockResolvedValue(true)
})

describe('PushNotificationTool main-agent runtime gate', () => {
  // Cache-safe forks (createSubagentContext) inherit the parent's full
  // tool list — tools are part of the prompt cache key and cannot be
  // filtered there. The runtime gate is the only layer for that path.
  test('refuses to push from a subagent/fork context (agentId set)', async () => {
    const result = await PushNotificationTool.call(
      INPUT,
      makeContext('fork-agent-123'),
    )
    expect(result.data.sent).toBe(false)
    expect(result.data.error).toContain('main agent')
    // Delivery must never be attempted, even with MeoW fully configured.
    expect(sendMeowPushMock).not.toHaveBeenCalled()
  })

  test('main-agent context (agentId undefined) delivers via MeoW', async () => {
    const result = await PushNotificationTool.call(INPUT, makeContext())
    expect(result.data.sent).toBe(true)
    expect(sendMeowPushMock).toHaveBeenCalledTimes(1)
    expect(sendMeowPushMock).toHaveBeenCalledWith('done', 'task finished')
  })

  test('main-agent context reports MeoW delivery failure', async () => {
    sendMeowPushMock.mockResolvedValue(false)
    const result = await PushNotificationTool.call(INPUT, makeContext())
    expect(result.data.sent).toBe(false)
    expect(result.data.error).toContain('MeoW push failed')
  })

  test('tool result surfaces the gate error text to the model', () => {
    const block = PushNotificationTool.mapToolResultToToolResultBlockParam(
      {
        sent: false,
        error: 'Push notifications can only be sent by the main agent.',
      },
      'tu_1',
    )
    expect(block.content).toContain('main agent')
  })

  test('tool result falls back to generic failure text without error', () => {
    const block = PushNotificationTool.mapToolResultToToolResultBlockParam(
      { sent: false },
      'tu_2',
    )
    expect(block.content).toBe('Failed to send notification.')
  })
})
