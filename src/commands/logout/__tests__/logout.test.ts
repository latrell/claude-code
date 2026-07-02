import { describe, expect, mock, test } from 'bun:test'
import type { LocalJSXCommandOnDone } from '../../../types/command.js'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
// Static imports load the REAL modules before mock.module registers the
// overrides below. Spreading the real module keeps every named export
// intact so these process-global mocks do not strip exports to undefined
// for test files loaded later in the same process (see CLAUDE.md
// cross-file mock pollution rules).
import * as realGrowthbook from '../../../services/analytics/growthbook.js'
import * as realChatgptAuth from '../../../services/api/openai/chatgptAuth.js'
import * as realPolicyLimits from '../../../services/policyLimits/index.js'
import * as realRemoteManagedSettings from '../../../services/remoteManagedSettings/index.js'
import * as realAuth from '../../../utils/auth.js'
import * as realConfig from '../../../utils/config.js'
import * as realSettings from '../../../utils/settings/settings.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Neutralize every destructive side effect performLogout triggers, so the
// test never deletes real credentials/config/caches on the dev machine.
const removeApiKeyCalls: number[] = []
mock.module('src/utils/auth.js', () => ({
  ...realAuth,
  removeApiKey: async () => {
    removeApiKeyCalls.push(1)
  },
}))

const removeChatGPTAuthCalls: Array<string | undefined> = []
mock.module('src/services/api/openai/chatgptAuth.js', () => ({
  ...realChatgptAuth,
  removeChatGPTAuth: async (scope?: string) => {
    removeChatGPTAuthCalls.push(scope)
  },
}))

const saveGlobalConfigCalls: unknown[] = []
mock.module('src/utils/config.ts', () => ({
  ...realConfig,
  saveGlobalConfig: (updater: unknown) => {
    saveGlobalConfigCalls.push(updater)
  },
}))

mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getSettingsForSource: () => ({}),
  updateSettingsForSource: () => ({}),
}))

const secureStorageDeleteCalls: number[] = []
mock.module('src/utils/secureStorage/index.js', () => ({
  getSecureStorage: () => ({
    delete: () => {
      secureStorageDeleteCalls.push(1)
    },
  }),
}))

mock.module('src/services/analytics/growthbook.js', () => ({
  ...realGrowthbook,
  refreshGrowthBookAfterAuthChange: () => {},
}))

mock.module('src/services/policyLimits/index.js', () => ({
  ...realPolicyLimits,
  clearPolicyLimitsCache: async () => {},
}))

mock.module('src/services/remoteManagedSettings/index.js', () => ({
  ...realRemoteManagedSettings,
  clearRemoteManagedSettingsCache: async () => {},
}))

// flushTelemetry is dynamically imported by performLogout; stub the whole
// module (full export surface) so no OpenTelemetry code initializes.
mock.module('src/utils/telemetry/instrumentation.js', () => ({
  bootstrapTelemetry: () => {},
  parseExporterTypes: () => [],
  isTelemetryEnabled: () => false,
  initializeTelemetry: async () => {},
  flushTelemetry: async () => {},
}))

// gracefulShutdownSync would kill the test process — stub the full export
// surface of gracefulShutdown.ts and record calls instead.
const shutdownCalls: Array<{ code: number; reason: string }> = []
mock.module('src/utils/gracefulShutdown.js', () => ({
  setupGracefulShutdown: () => {},
  gracefulShutdown: async () => {},
  gracefulShutdownSync: (code: number, reason: string) => {
    shutdownCalls.push({ code, reason })
  },
  isShuttingDown: () => false,
  resetShutdownState: () => {},
  getPendingShutdownForTesting: () => undefined,
}))

const { call } = await import('../logout.js')
const { t } = await import('../../../i18n/t.js')

type OnDoneCall = {
  result?: string
  options?: Parameters<LocalJSXCommandOnDone>[1]
}

describe('logout call', () => {
  test('completes via onDone with null JSX, then schedules shutdown', async () => {
    const onDoneCalls: OnDoneCall[] = []
    const onDone: LocalJSXCommandOnDone = (result, options) => {
      onDoneCalls.push({ result, options })
    }

    const jsx = await call(onDone)

    // Must return null so the REPL does not hide the prompt input behind
    // a static JSX node that can never dismiss itself.
    expect(jsx).toBeNull()

    // onDone fires exactly once with the logout message, BEFORE shutdown.
    expect(onDoneCalls).toHaveLength(1)
    expect(onDoneCalls[0]?.result).toBe(t('Successfully logged out.'))
    expect(onDoneCalls[0]?.options).toEqual({ display: 'system' })

    // performLogout side effects went through the stubs.
    expect(removeApiKeyCalls).toHaveLength(1)
    expect(removeChatGPTAuthCalls).toEqual([undefined])
    expect(secureStorageDeleteCalls).toHaveLength(1)
    expect(saveGlobalConfigCalls).toHaveLength(1)

    // Shutdown is deferred (200ms) so the message can render first.
    expect(shutdownCalls).toHaveLength(0)
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(shutdownCalls).toEqual([{ code: 0, reason: 'logout' }])
  })
})
