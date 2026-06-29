import { describe, expect, test } from 'bun:test'
import {
  getSubagentProviderFromEnv,
  getSubagentProviderRuntimeConfig,
  SUBAGENT_CREDENTIAL_SCOPE,
} from '../subagentProvider.js'

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
})
