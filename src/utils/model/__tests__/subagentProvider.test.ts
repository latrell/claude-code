import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setSessionAssignment } from '../../../services/connections/sessionAssignments.js'
import { _invalidateConnectionsCache } from '../../../services/connections/store.js'
import { getAgentModel } from '../agent.js'
import {
  getSubagentProviderFromEnv,
  getSubagentProviderRuntimeConfig,
  setSubagentProviderCliOverride,
  SUBAGENT_CREDENTIAL_SCOPE,
} from '../subagentProvider.js'
import {
  CHATGPT_CODEX_MODEL_OPTIONS,
  clearRemoteChatGPTCodexModelOptions,
  setRemoteChatGPTCodexModelOptions,
} from '../chatgptModels.js'

// getSubagentProviderRuntimeConfig falls back to getConnectionThinkingEffort
// ('subagent'), which reads the real connection registry. Point CLAUDE_CONFIG_DIR
// at an empty temp dir so a developer's subagent-slot connection (with a pinned
// thinkingEffort) cannot leak into the expected configs below.
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-subagent-provider-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  setSessionAssignment('subagent', undefined)
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  setSessionAssignment('subagent', undefined)
  clearRemoteChatGPTCodexModelOptions()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('subagent provider config', () => {
  test('returns undefined without subagent settings or env override', () => {
    const config = getSubagentProviderRuntimeConfig(
      {},
      {
        CLAUDE_CODE_SUBAGENT_PROVIDER: undefined,
        SUBAGENT_OPENAI_API_KEY: undefined,
        SUBAGENT_OPENAI_BASE_URL: undefined,
        SUBAGENT_GEMINI_API_KEY: undefined,
        SUBAGENT_GROK_API_KEY: undefined,
      },
    )

    expect(config).toBeUndefined()
  })

  test('maps settings subagentProvider to a runtime provider config', () => {
    const config = getSubagentProviderRuntimeConfig(
      {
        subagentProvider: {
          modelType: 'openai',
          env: { OPENAI_API_KEY: 'subagent-key' },
        },
      },
      {},
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_API_KEY: 'subagent-key' },
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  })

  test('SUBAGENT_ env variables override settings', () => {
    const config = getSubagentProviderRuntimeConfig(
      {
        subagentProvider: {
          modelType: 'gemini',
          env: { GEMINI_API_KEY: 'settings-key' },
        },
      },
      {
        CLAUDE_CODE_SUBAGENT_PROVIDER: 'openai',
        SUBAGENT_OPENAI_API_KEY: 'env-key',
        SUBAGENT_OPENAI_BASE_URL: 'https://example.test/v1',
        SUBAGENT_GEMINI_API_KEY: undefined,
        SUBAGENT_GROK_API_KEY: undefined,
      },
    )

    expect(config).toEqual({
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_API_KEY: 'env-key',
        OPENAI_BASE_URL: 'https://example.test/v1',
      },
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  })

  test('infers gemini provider from SUBAGENT_GEMINI_API_KEY', () => {
    const config = getSubagentProviderFromEnv({
      CLAUDE_CODE_SUBAGENT_PROVIDER: undefined,
      SUBAGENT_OPENAI_API_KEY: undefined,
      SUBAGENT_OPENAI_BASE_URL: undefined,
      SUBAGENT_GEMINI_API_KEY: 'gemini-key',
      SUBAGENT_GROK_API_KEY: undefined,
    })

    expect(config).toEqual({
      modelType: 'gemini',
      env: { GEMINI_API_KEY: 'gemini-key' },
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  })

  test('uses provider runtime OPENAI_MODEL before parent and CLAUDE_CODE_SUBAGENT_MODEL', () => {
    const originalSubagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'haiku'

    try {
      expect(
        getAgentModel(undefined, 'gpt-5.5', undefined, 'default', {
          provider: 'openai',
          env: { OPENAI_MODEL: 'deepseek-v4-pro' },
        }),
      ).toBe('deepseek-v4-pro')
    } finally {
      if (originalSubagentModel === undefined) {
        delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
      } else {
        process.env.CLAUDE_CODE_SUBAGENT_MODEL = originalSubagentModel
      }
    }
  })

  test('uses provider runtime OPENAI_DEFAULT_SONNET_MODEL before parent and CLAUDE_CODE_SUBAGENT_MODEL', () => {
    const originalSubagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'haiku'

    try {
      expect(
        getAgentModel(undefined, 'gpt-5.5', undefined, 'default', {
          provider: 'openai',
          env: { OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-v4-flash' },
        }),
      ).toBe('deepseek-v4-flash')
    } finally {
      if (originalSubagentModel === undefined) {
        delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
      } else {
        process.env.CLAUDE_CODE_SUBAGENT_MODEL = originalSubagentModel
      }
    }
  })

  test('old unpinned scoped ChatGPT config resolves aliases in that account catalog', () => {
    setRemoteChatGPTCodexModelOptions(
      [
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[0]!,
          value: 'scope-subagent-default',
          priority: 1,
        },
        {
          ...CHATGPT_CODEX_MODEL_OPTIONS[2]!,
          value: 'gpt-5.6-luna',
          priority: 2,
        },
      ],
      SUBAGENT_CREDENTIAL_SCOPE,
    )
    const runtime = {
      provider: 'openai' as const,
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    }

    expect(
      getAgentModel(
        undefined,
        'claude-sonnet-5',
        undefined,
        'default',
        runtime,
      ),
    ).toBe('scope-subagent-default')
    expect(
      getAgentModel(undefined, 'claude-sonnet-5', 'haiku', 'default', runtime),
    ).toBe('gpt-5.6-luna')
  })

  test('maps providerModels subagentModel into runtime config', () => {
    const config = getSubagentProviderRuntimeConfig(
      {
        modelType: 'openai',
        providerModels: {
          openai: { subagentModel: 'gpt-5.5-subagent' },
        },
      },
      {},
    )

    expect(config).toEqual({
      provider: 'openai',
      env: { OPENAI_MODEL: 'gpt-5.5-subagent' },
      model: 'gpt-5.5-subagent',
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
    expect(
      getAgentModel(undefined, 'parent-model', undefined, 'default', config),
    ).toBe('gpt-5.5-subagent')
  })

  test('subagentProvider model overrides inherited providerModels subagentModel', () => {
    const config = getSubagentProviderRuntimeConfig(
      {
        modelType: 'openai',
        providerModels: {
          openai: { subagentModel: 'main-openai-subagent' },
        },
        subagentProvider: {
          modelType: 'gemini',
          model: 'gemini-subagent',
        },
      },
      {},
    )

    expect(config).toEqual({
      provider: 'gemini',
      modelType: 'gemini',
      env: { GEMINI_MODEL: 'gemini-subagent' },
      model: 'gemini-subagent',
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  })

  test('provider-scoped subagent default does not override explicit tool model', () => {
    const config = getSubagentProviderRuntimeConfig(
      {
        modelType: 'openai',
        providerModels: {
          openai: { subagentModel: 'gpt-5.5-subagent' },
        },
      },
      {},
    )

    expect(
      getAgentModel(undefined, 'parent-model', 'haiku', 'default', config),
    ).not.toBe('gpt-5.5-subagent')
  })

  test('uses CLAUDE_CODE_SUBAGENT_MODEL when provider runtime config is absent', () => {
    const originalSubagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'deepseek-v4-flash'

    try {
      expect(getAgentModel(undefined, 'gpt-5.5', undefined, 'default')).toBe(
        'deepseek-v4-flash',
      )
    } finally {
      if (originalSubagentModel === undefined) {
        delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
      } else {
        process.env.CLAUDE_CODE_SUBAGENT_MODEL = originalSubagentModel
      }
    }
  })
})

describe('CLI --subagent-provider override', () => {
  test('overrides settings.subagentProvider', () => {
    setSubagentProviderCliOverride('openai')
    try {
      const config = getSubagentProviderRuntimeConfig(
        {
          subagentProvider: { modelType: 'gemini' },
        },
        {},
      )
      expect(config).toEqual({
        provider: 'openai',
        modelType: 'openai',
        credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
      })
    } finally {
      setSubagentProviderCliOverride(undefined)
    }
  })

  test('overrides SUBAGENT_ env variables', () => {
    setSubagentProviderCliOverride('grok')
    try {
      const config = getSubagentProviderRuntimeConfig(
        {},
        {
          CLAUDE_CODE_SUBAGENT_PROVIDER: 'openai',
          SUBAGENT_OPENAI_API_KEY: 'env-key',
        },
      )
      expect(config).toEqual({
        provider: 'grok',
        modelType: 'grok',
        credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
      })
    } finally {
      setSubagentProviderCliOverride(undefined)
    }
  })

  test('unset forces inherit (returns undefined runtime config)', () => {
    setSubagentProviderCliOverride('unset')
    try {
      const config = getSubagentProviderRuntimeConfig(
        {
          subagentProvider: { modelType: 'openai' },
        },
        {
          CLAUDE_CODE_SUBAGENT_PROVIDER: 'gemini',
          SUBAGENT_GEMINI_API_KEY: 'env-key',
        },
      )
      expect(config).toBeUndefined()
    } finally {
      setSubagentProviderCliOverride(undefined)
    }
  })

  test('unset also suppresses providerModels subagentModel fallback', () => {
    setSubagentProviderCliOverride('unset')
    try {
      // A stale ChatGPT-era subagent model under the same provider key must
      // not be packaged into a runtime config when the user asked subagents
      // to fully inherit the main connection.
      const config = getSubagentProviderRuntimeConfig(
        {
          modelType: 'openai',
          providerModels: {
            openai: { subagentModel: 'gpt-5.5-codex' },
          },
        },
        {},
      )
      expect(config).toBeUndefined()
    } finally {
      setSubagentProviderCliOverride(undefined)
    }
  })

  test('undefined clears the override', () => {
    setSubagentProviderCliOverride('openai')
    setSubagentProviderCliOverride(undefined)
    const config = getSubagentProviderRuntimeConfig(
      {
        subagentProvider: { modelType: 'gemini' },
      },
      {},
    )
    expect(config).toEqual({
      provider: 'gemini',
      modelType: 'gemini',
      credentialScope: SUBAGENT_CREDENTIAL_SCOPE,
    })
  })
})
