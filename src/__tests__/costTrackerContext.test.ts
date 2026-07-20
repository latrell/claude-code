import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../tests/mocks/debug.js'
import { logMock } from '../../tests/mocks/log.js'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

const persistedContextWindow = 777_000

mock.module('src/utils/config.ts', () => ({
  getCurrentProjectConfig: () => ({
    lastSessionId: 'scoped-session',
    lastModelUsage: {
      'gpt-scoped-model': {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: persistedContextWindow,
      },
    },
  }),
  saveCurrentProjectConfig: () => {},
  getGlobalConfig: () => ({}),
}))

describe('stored scoped model usage', () => {
  test('preserves the context window captured by the original account', async () => {
    const { getStoredSessionCosts } = await import('../cost-tracker.js')

    const stored = getStoredSessionCosts('scoped-session')

    expect(stored?.modelUsage?.['gpt-scoped-model']?.contextWindow).toBe(
      persistedContextWindow,
    )
  })
})
