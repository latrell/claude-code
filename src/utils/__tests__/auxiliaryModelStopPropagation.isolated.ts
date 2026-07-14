// Launched by the wrapper test so module-level API mocks cannot leak into
// Bun's shared test process.
import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

import { StopConfirmationError } from '../stopConfirmation.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let queryError: unknown
mock.module('src/services/api/claude.ts', () => ({
  accumulateUsage: () => {},
  getAPIMetadata: () => ({}),
  getCacheControl: () => undefined,
  getExtraBodyParams: () => ({}),
  getMaxOutputTokensForModel: () => 4096,
  queryHaiku: async () => {
    throw queryError
  },
  queryModelWithoutStreaming: async () => {
    throw queryError
  },
  queryModelWithStreaming: async function* () {},
  queryWithModel: async () => {
    throw queryError
  },
  updateUsage: () => {},
  verifyApiKey: async () => false,
}))

const [
  { llmObserverBackend },
  { generateSessionName },
  { parseNaturalLanguageDateTime },
] = await Promise.all([
  import('../../services/skillLearning/llmObserverBackend.js'),
  import('../../commands/rename/generateSessionName.js'),
  import('../mcp/dateTimeParser.js'),
])

describe('auxiliary Haiku Stop propagation', () => {
  test('skill-learning observer does not turn an unconfirmed Stop into heuristic success', async () => {
    queryError = new StopConfirmationError(
      'skill-learning request may still be active',
    )
    const observations = [
      {
        id: 'observation-1',
        timestamp: new Date().toISOString(),
        event: 'user_message' as const,
        sessionId: 'session-1',
        projectId: 'project-1',
        projectName: 'project',
        cwd: process.cwd(),
        messageText: 'remember this workflow',
      },
    ]

    await expect(
      Promise.resolve(
        llmObserverBackend.analyze(observations, {
          signal: new AbortController().signal,
        }),
      ),
    ).rejects.toBe(queryError)
  })

  test('/rename name generation preserves an unconfirmed Stop', async () => {
    queryError = new StopConfirmationError('rename request may still be active')
    const messages = [
      {
        type: 'user' as const,
        message: { role: 'user' as const, content: 'fix cancellation' },
      },
    ]

    await expect(
      generateSessionName(
        messages as Parameters<typeof generateSessionName>[0],
        new AbortController().signal,
      ),
    ).rejects.toBe(queryError)
  })

  test('date/time parsing preserves an unconfirmed Stop', async () => {
    queryError = new StopConfirmationError(
      'date parser request may still be active',
    )

    await expect(
      parseNaturalLanguageDateTime(
        'tomorrow at 3pm',
        'date-time',
        new AbortController().signal,
      ),
    ).rejects.toBe(queryError)
  })
})
