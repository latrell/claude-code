import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { LocalJSXCommandOnDone } from '../../../types/command.js'
// Static imports load the REAL modules before mock.module registers the
// overrides below. Spreading the real module keeps every named export
// intact so this process-global mock does not strip exports to undefined
// for test files loaded later in the same process (see CLAUDE.md
// cross-file mock pollution rules).
import * as realChatgptAuth from '../../../services/api/openai/chatgptAuth.js'
import * as realSettings from '../../../utils/settings/settings.js'

let updateResult: { error?: Error } = {}
const updateCalls: Array<{ source: string; update: unknown }> = []
mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  updateSettingsForSource: (source: string, update: unknown) => {
    updateCalls.push({ source, update })
    return updateResult
  },
}))

const removeAuthCalls: Array<string | undefined> = []
mock.module('src/services/api/openai/chatgptAuth.js', () => ({
  ...realChatgptAuth,
  removeChatGPTAuth: async (scope?: string) => {
    removeAuthCalls.push(scope)
  },
}))

const { call } = await import('../subagentLogout.js')

type OnDoneCall = {
  result?: string
  options?: Parameters<LocalJSXCommandOnDone>[1]
}

function createOnDone(): {
  onDone: LocalJSXCommandOnDone
  calls: OnDoneCall[]
} {
  const calls: OnDoneCall[] = []
  const onDone: LocalJSXCommandOnDone = (result, options) => {
    calls.push({ result, options })
  }
  return { onDone, calls }
}

describe('subagent-logout call', () => {
  beforeEach(() => {
    updateResult = {}
    updateCalls.length = 0
    removeAuthCalls.length = 0
  })

  test('clears settings and auth, then completes via onDone with null JSX', async () => {
    const { onDone, calls } = createOnDone()

    const jsx = await call(onDone)

    // Must return null so the REPL does not hide the prompt input
    // waiting on a static <Text> that can never dismiss itself.
    expect(jsx).toBeNull()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.source).toBe('userSettings')
    expect(updateCalls[0]?.update).toEqual({ subagentProvider: undefined })

    expect(removeAuthCalls).toEqual(['subagent'])

    // onDone must fire exactly once — it resolves the outer
    // processSlashCommand Promise and unblocks the queue processor.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.result).toBe(
      'Subagent login cleared. Agent sub-sessions will inherit the main login.',
    )
    expect(calls[0]?.options).toEqual({ display: 'system' })
  })

  test('reports settings error via onDone and skips auth removal', async () => {
    updateResult = { error: new Error('disk full') }
    const { onDone, calls } = createOnDone()

    const jsx = await call(onDone)

    expect(jsx).toBeNull()
    expect(removeAuthCalls).toHaveLength(0)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.result).toBe('Failed to clear subagent login: disk full')
    expect(calls[0]?.options).toEqual({ display: 'system' })
  })
})
