import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../tests/mocks/debug.js'
import { logMock } from '../../tests/mocks/log.js'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let receivedAnalysisContext: unknown

mock.module('src/utils/analyzeContext.ts', () => ({
  TOOL_TOKEN_COUNT_OVERHEAD: 500,
  countToolDefinitionTokens: () => Promise.resolve(0),
  analyzeContextUsage: (...args: unknown[]) => {
    receivedAnalysisContext = args[6]
    return Promise.resolve({})
  },
}))

describe('non-interactive context analysis', () => {
  test('forwards the scoped provider runtime', async () => {
    const { collectContextData } = await import(
      '../commands/context/context-noninteractive.js'
    )
    const providerRuntimeConfig = {
      provider: 'openai' as const,
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
      credentialScope: 'scoped-account',
    }

    await collectContextData({
      messages: [],
      getAppState: () =>
        ({
          toolPermissionContext: { mode: 'default' },
        }) as never,
      options: {
        mainLoopModel: 'gpt-scoped-model',
        tools: [],
        agentDefinitions: { activeAgents: [], allAgents: [] },
        providerRuntimeConfig,
      },
    })

    expect(
      (
        receivedAnalysisContext as {
          options?: { providerRuntimeConfig?: unknown }
        }
      ).options?.providerRuntimeConfig,
    ).toBe(providerRuntimeConfig)
  })
})
