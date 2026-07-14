// Launched by the wrapper test so module-level sideQuery mocks cannot leak
// into Bun's shared test process.
import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

import { StopConfirmationError } from '../stopConfirmation.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))
mock.module('src/utils/model/fastProvider.ts', () => ({
  getFastModelAndRuntime: () => ({ model: 'test-model' }),
}))
mock.module('src/commands/poor/poorMode.ts', () => ({
  isPoorModeActive: () => false,
}))
mock.module('src/utils/model/modelAllowlist.ts', () => ({
  isModelAllowed: () => true,
}))
mock.module('src/utils/sessionStorage.ts', () => ({
  isLiteLog: () => false,
  loadFullLog: async (log: unknown) => log,
}))

let sideQueryError: unknown
mock.module('src/utils/sideQuery.ts', () => ({
  sideQuery: async () => {
    throw sideQueryError
  },
}))

const [
  { agenticSessionSearch },
  { validateModel },
  { generatePermissionExplanation },
] = await Promise.all([
  import('../agenticSessionSearch.js'),
  import('../model/validateModel.js'),
  import('../permissions/permissionExplainer.js'),
])

describe('sideQuery owner Stop propagation', () => {
  test('agentic session search preserves an unconfirmed Stop', async () => {
    sideQueryError = new StopConfirmationError(
      'agentic search request may still be active',
    )
    const logs = [
      {
        firstPrompt: 'debug cancellation',
      },
    ] as Parameters<typeof agenticSessionSearch>[1]

    await expect(
      agenticSessionSearch('cancellation', logs, new AbortController().signal),
    ).rejects.toBe(sideQueryError)
  })

  test('permission explanation checks StopConfirmation before signal.aborted fallback', async () => {
    sideQueryError = new StopConfirmationError(
      'permission explanation request may still be active',
    )
    const controller = new AbortController()
    controller.abort('escape')

    await expect(
      generatePermissionExplanation({
        toolName: 'Bash',
        toolInput: { command: 'pwd' },
        signal: controller.signal,
      }),
    ).rejects.toBe(sideQueryError)
  })

  test('model validation explicitly preserves an unconfirmed Stop', async () => {
    sideQueryError = new StopConfirmationError(
      'model validation request may still be active',
    )

    await expect(
      validateModel('custom-stop-model', new AbortController().signal),
    ).rejects.toBe(sideQueryError)
  })
})
