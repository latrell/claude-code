import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setSessionAssignment } from '../../../services/connections/sessionAssignments.js'
import { _invalidateConnectionsCache } from '../../../services/connections/store.js'
import {
  FAST_CREDENTIAL_SCOPE,
  getFastProviderFromEnv,
  getFastProviderRuntimeConfig,
  setFastProviderCliOverride,
  setFastProviderConfigOverride,
} from '../fastProvider.js'

// getFastProviderRuntimeConfig falls back to getConnectionThinkingEffort
// ('fast'), which reads the real connection registry. Point CLAUDE_CONFIG_DIR
// at an empty temp dir so a developer's fast-slot connection (with a pinned
// thinkingEffort) cannot leak into the expected configs below.
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-fast-provider-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  setSessionAssignment('fast', undefined)
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  setSessionAssignment('fast', undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('fast provider config', () => {
  test('returns undefined without fast settings or env override', () => {
    const config = getFastProviderRuntimeConfig(
      {},
      {
        CLAUDE_CODE_FAST_PROVIDER: undefined,
        FAST_OPENAI_API_KEY: undefined,
        FAST_OPENAI_BASE_URL: undefined,
        FAST_GEMINI_API_KEY: undefined,
        FAST_GROK_API_KEY: undefined,
      },
    )

    expect(config).toBeUndefined()
  })

  test('maps settings fastProvider to a runtime provider config', () => {
    const config = getFastProviderRuntimeConfig(
      {
        fastProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'fast-key' },
        },
      },
      {},
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_API_KEY: 'fast-key' },
      credentialScope: FAST_CREDENTIAL_SCOPE,
    })
  })

  test('FAST_ env variables override settings', () => {
    const config = getFastProviderRuntimeConfig(
      {
        fastProvider: {
          modelType: 'gemini',
          env: { GEMINI_API_KEY: 'settings-key' },
        },
      },
      {
        CLAUDE_CODE_FAST_PROVIDER: 'openai',
        FAST_OPENAI_API_KEY: 'env-key',
        FAST_OPENAI_BASE_URL: 'https://example.test/v1',
        FAST_GEMINI_API_KEY: undefined,
        FAST_GROK_API_KEY: undefined,
      },
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_API_KEY: 'env-key',
        OPENAI_BASE_URL: 'https://example.test/v1',
      },
      credentialScope: FAST_CREDENTIAL_SCOPE,
    })
  })

  test('infers gemini provider from FAST_GEMINI_API_KEY', () => {
    const config = getFastProviderFromEnv({
      CLAUDE_CODE_FAST_PROVIDER: undefined,
      FAST_OPENAI_API_KEY: undefined,
      FAST_OPENAI_BASE_URL: undefined,
      FAST_GEMINI_API_KEY: 'gemini-key',
      FAST_GROK_API_KEY: undefined,
    })

    expect(config).toEqual({
      modelType: 'gemini',
      env: { GEMINI_API_KEY: 'gemini-key' },
      credentialScope: FAST_CREDENTIAL_SCOPE,
    })
  })

  test('pinned model is written into the provider model env', () => {
    const config = getFastProviderRuntimeConfig(
      {
        fastProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'fast-key' },
          model: 'deepseek-v4-flash',
        },
      },
      {},
    )

    expect(config?.model).toBe('deepseek-v4-flash')
    expect(config?.env?.OPENAI_MODEL).toBe('deepseek-v4-flash')
  })

  test('firstParty pinned model is written into CLAUDE_CODE_FAST_MODEL', () => {
    const config = getFastProviderRuntimeConfig(
      {
        fastProvider: {
          modelType: 'anthropic',
          env: { ANTHROPIC_BASE_URL: 'https://relay.test' },
          model: 'glm-4.7-flash',
        },
      },
      {},
    )

    expect(config?.provider).toBe('firstParty')
    expect(config?.env?.CLAUDE_CODE_FAST_MODEL).toBe('glm-4.7-flash')
    expect(config?.env?.ANTHROPIC_BASE_URL).toBe('https://relay.test')
  })

  test('providerModels fastModel applies when fastProvider carries no model', () => {
    const config = getFastProviderRuntimeConfig(
      {
        fastProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'fast-key' },
        },
        providerModels: {
          openai: { fastModel: 'gpt-5-mini' },
        },
      },
      {},
    )

    expect(config?.model).toBe('gpt-5-mini')
    expect(config?.env?.OPENAI_MODEL).toBe('gpt-5-mini')
  })

  test('CLI override wins over settings and env', () => {
    setFastProviderCliOverride('grok')
    try {
      const config = getFastProviderRuntimeConfig(
        {
          fastProvider: {
            modelType: 'openai',
            env: { OPENAI_API_KEY: 'settings-key' },
          },
        },
        {
          CLAUDE_CODE_FAST_PROVIDER: 'gemini',
          FAST_GEMINI_API_KEY: 'env-key',
        },
      )

      expect(config?.provider).toBe('grok')
      expect(config?.credentialScope).toBe(FAST_CREDENTIAL_SCOPE)
    } finally {
      setFastProviderCliOverride(undefined)
    }
  })

  test('unset override forces inherit-main (undefined runtime config)', () => {
    setFastProviderCliOverride('unset')
    try {
      const config = getFastProviderRuntimeConfig(
        {
          fastProvider: {
            modelType: 'openai',
            env: { OPENAI_API_KEY: 'settings-key' },
          },
          providerModels: {
            openai: { fastModel: 'stale-model' },
          },
        },
        {
          CLAUDE_CODE_FAST_PROVIDER: 'gemini',
          FAST_GEMINI_API_KEY: 'env-key',
        },
      )

      expect(config).toBeUndefined()
    } finally {
      setFastProviderCliOverride(undefined)
    }
  })

  test('config override (connection activation) carries env, model and thinking effort', () => {
    setFastProviderConfigOverride({
      modelType: 'openai',
      env: { OPENAI_API_KEY: 'conn-key', OPENAI_BASE_URL: 'https://conn.test' },
      model: 'deepseek-v4-flash',
      thinkingEffort: 'off',
      credentialScope: FAST_CREDENTIAL_SCOPE,
    })
    try {
      const config = getFastProviderRuntimeConfig({}, {})

      expect(config?.provider).toBe('openai')
      expect(config?.model).toBe('deepseek-v4-flash')
      expect(config?.env?.OPENAI_BASE_URL).toBe('https://conn.test')
      expect(config?.env?.OPENAI_MODEL).toBe('deepseek-v4-flash')
      expect(config?.thinkingEffort).toBe('off')
    } finally {
      setFastProviderConfigOverride(undefined)
    }
  })
})
