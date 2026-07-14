import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setSessionAssignment } from '../../../services/connections/sessionAssignments.js'
import { _invalidateConnectionsCache } from '../../../services/connections/store.js'
import {
  SONNET_CREDENTIAL_SCOPE,
  getSonnetModelAndRuntime,
  getSonnetProviderFromEnv,
  getSonnetProviderRuntimeConfig,
  setSonnetProviderCliOverride,
  setSonnetProviderConfigOverride,
} from '../sonnetProvider.js'
import { setProviderCliOverride } from '../providers.js'

// getSonnetProviderRuntimeConfig falls back to getConnectionThinkingEffort
// ('sonnet'), which reads the real connection registry. Point
// CLAUDE_CONFIG_DIR at an empty temp dir so a developer's sonnet-slot
// connection (with a pinned thinkingEffort) cannot leak into the expected
// configs below.
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-sonnet-provider-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  setSessionAssignment('sonnet', undefined)
})

afterEach(() => {
  setProviderCliOverride(undefined)
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  setSessionAssignment('sonnet', undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('sonnet provider config', () => {
  test('returns undefined without sonnet settings or env override', () => {
    const config = getSonnetProviderRuntimeConfig(
      {},
      {
        CLAUDE_CODE_SONNET_PROVIDER: undefined,
        SONNET_OPENAI_API_KEY: undefined,
        SONNET_OPENAI_BASE_URL: undefined,
        SONNET_GEMINI_API_KEY: undefined,
        SONNET_GROK_API_KEY: undefined,
      },
    )

    expect(config).toBeUndefined()
  })

  test('maps settings sonnetProvider to a runtime provider config', () => {
    const config = getSonnetProviderRuntimeConfig(
      {
        sonnetProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'sonnet-key' },
        },
      },
      {},
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_API_KEY: 'sonnet-key' },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
  })

  test('SONNET_ env variables override settings', () => {
    const config = getSonnetProviderRuntimeConfig(
      {
        sonnetProvider: {
          modelType: 'gemini',
          env: { GEMINI_API_KEY: 'settings-key' },
        },
      },
      {
        CLAUDE_CODE_SONNET_PROVIDER: 'openai',
        SONNET_OPENAI_API_KEY: 'env-key',
        SONNET_OPENAI_BASE_URL: 'https://example.test/v1',
        SONNET_GEMINI_API_KEY: undefined,
        SONNET_GROK_API_KEY: undefined,
      },
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_API_KEY: 'env-key',
        OPENAI_BASE_URL: 'https://example.test/v1',
      },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
  })

  test('infers gemini provider from SONNET_GEMINI_API_KEY', () => {
    const config = getSonnetProviderFromEnv({
      CLAUDE_CODE_SONNET_PROVIDER: undefined,
      SONNET_OPENAI_API_KEY: undefined,
      SONNET_OPENAI_BASE_URL: undefined,
      SONNET_GEMINI_API_KEY: 'gemini-key',
      SONNET_GROK_API_KEY: undefined,
    })

    expect(config).toEqual({
      modelType: 'gemini',
      env: { GEMINI_API_KEY: 'gemini-key' },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
  })

  test('pinned model is written into the provider model env', () => {
    const config = getSonnetProviderRuntimeConfig(
      {
        sonnetProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'sonnet-key' },
          model: 'deepseek-v4-pro',
        },
      },
      {},
    )

    expect(config?.model).toBe('deepseek-v4-pro')
    expect(config?.env?.OPENAI_MODEL).toBe('deepseek-v4-pro')
  })

  test('firstParty pinned model is written into CLAUDE_CODE_SONNET_MODEL', () => {
    const config = getSonnetProviderRuntimeConfig(
      {
        sonnetProvider: {
          modelType: 'anthropic',
          env: { ANTHROPIC_BASE_URL: 'https://relay.test' },
          model: 'glm-5.1',
        },
      },
      {},
    )

    expect(config?.provider).toBe('firstParty')
    expect(config?.env?.CLAUDE_CODE_SONNET_MODEL).toBe('glm-5.1')
    expect(config?.env?.ANTHROPIC_BASE_URL).toBe('https://relay.test')
  })

  test('providerModels sonnetModel applies when sonnetProvider carries no model', () => {
    const config = getSonnetProviderRuntimeConfig(
      {
        sonnetProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'sonnet-key' },
        },
        providerModels: {
          openai: { sonnetModel: 'gpt-5.5' },
        },
      },
      {},
    )

    expect(config?.model).toBe('gpt-5.5')
    expect(config?.env?.OPENAI_MODEL).toBe('gpt-5.5')
  })

  test('CLI override wins over settings and env', () => {
    setSonnetProviderCliOverride('grok')
    try {
      const config = getSonnetProviderRuntimeConfig(
        {
          sonnetProvider: {
            modelType: 'openai',
            env: { OPENAI_API_KEY: 'settings-key' },
          },
        },
        {
          CLAUDE_CODE_SONNET_PROVIDER: 'gemini',
          SONNET_GEMINI_API_KEY: 'env-key',
        },
      )

      expect(config?.provider).toBe('grok')
      expect(config?.credentialScope).toBe(SONNET_CREDENTIAL_SCOPE)
    } finally {
      setSonnetProviderCliOverride(undefined)
    }
  })

  test('unset override forces inherit-main (undefined runtime config)', () => {
    setSonnetProviderCliOverride('unset')
    try {
      const config = getSonnetProviderRuntimeConfig(
        {
          sonnetProvider: {
            modelType: 'openai',
            env: { OPENAI_API_KEY: 'settings-key' },
          },
          providerModels: {
            openai: { sonnetModel: 'stale-model' },
          },
        },
        {
          CLAUDE_CODE_SONNET_PROVIDER: 'gemini',
          SONNET_GEMINI_API_KEY: 'env-key',
        },
      )

      expect(config).toBeUndefined()
    } finally {
      setSonnetProviderCliOverride(undefined)
    }
  })

  test('config override (connection activation) carries env, model and thinking effort', () => {
    setSonnetProviderConfigOverride({
      modelType: 'openai',
      env: { OPENAI_API_KEY: 'conn-key', OPENAI_BASE_URL: 'https://conn.test' },
      model: 'deepseek-v4-pro',
      thinkingEffort: 'high',
      thinkingEffortTransport: 'passthrough',
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
    try {
      const config = getSonnetProviderRuntimeConfig({}, {})

      expect(config?.provider).toBe('openai')
      expect(config?.model).toBe('deepseek-v4-pro')
      expect(config?.env?.OPENAI_BASE_URL).toBe('https://conn.test')
      expect(config?.env?.OPENAI_MODEL).toBe('deepseek-v4-pro')
      expect(config?.thinkingEffort).toBe('high')
      expect(config?.thinkingEffortTransport).toBe('passthrough')
    } finally {
      setSonnetProviderConfigOverride(undefined)
    }
  })

  test('un-pinned scoped ChatGPT connection uses the ChatGPT default model', () => {
    setSonnetProviderConfigOverride({
      modelType: 'openai',
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
    try {
      const resolved = getSonnetModelAndRuntime()

      expect(resolved.model).toBe('gpt-5.6-sol')
      expect(resolved.runtime?.provider).toBe('openai')
    } finally {
      setSonnetProviderConfigOverride(undefined)
    }
  })

  test('un-pinned scoped OpenAI connection uses its general provider default', () => {
    setSonnetProviderConfigOverride({
      modelType: 'openai',
      env: { OPENAI_DEFAULT_MODEL: 'gpt-4o-mini' },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
    try {
      const resolved = getSonnetModelAndRuntime()

      expect(resolved.model).toBe('gpt-4o-mini')
      expect(resolved.runtime?.provider).toBe('openai')
    } finally {
      setSonnetProviderConfigOverride(undefined)
    }
  })

  test('un-pinned scoped providers use their general provider defaults', () => {
    const cases: Array<{
      modelType: 'gemini' | 'grok' | 'cursor'
      env: Record<string, string>
      expected: string
    }> = [
      {
        modelType: 'gemini',
        env: { GEMINI_DEFAULT_MODEL: 'gemini-general-default' },
        expected: 'gemini-general-default',
      },
      {
        modelType: 'grok',
        env: { GROK_DEFAULT_MODEL: 'grok-general-default' },
        expected: 'grok-general-default',
      },
      {
        modelType: 'cursor',
        env: { CURSOR_DEFAULT_MODEL: 'cursor-general-default' },
        expected: 'cursor-general-default',
      },
    ]

    for (const testCase of cases) {
      setSonnetProviderConfigOverride({
        modelType: testCase.modelType,
        env: testCase.env,
        credentialScope: SONNET_CREDENTIAL_SCOPE,
      })
      expect(getSonnetModelAndRuntime().model).toBe(testCase.expected)
    }
    setSonnetProviderConfigOverride(undefined)
  })

  test('un-pinned scoped provider resolves its own env instead of the main provider env', () => {
    const previousMainDefault = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'main-anthropic-sonnet'
    setSonnetProviderConfigOverride({
      modelType: 'gemini',
      env: { GEMINI_DEFAULT_SONNET_MODEL: 'gemini-sonnet-scoped' },
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
    try {
      expect(getSonnetModelAndRuntime().model).toBe('gemini-sonnet-scoped')
    } finally {
      setSonnetProviderConfigOverride(undefined)
      if (previousMainDefault === undefined) {
        delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
      } else {
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = previousMainDefault
      }
    }
  })

  test('un-pinned scoped Anthropic provider does not reuse the main OpenAI model strings', () => {
    setProviderCliOverride('openai')
    setSonnetProviderConfigOverride({
      modelType: 'anthropic',
      credentialScope: SONNET_CREDENTIAL_SCOPE,
    })
    try {
      expect(getSonnetModelAndRuntime().model).toBe('claude-sonnet-5')
    } finally {
      setSonnetProviderConfigOverride(undefined)
      setProviderCliOverride(undefined)
    }
  })
})
