import { describe, expect, test, mock } from 'bun:test'

// Mock auth to prevent reading real local OAuth state.
// Default: non-subscriber → getBillingDisplayName returns 'Anthropic API'.
// Tests that need subscriber behavior can re-mock per-test.
mock.module('src/utils/auth.js', () => ({
  isClaudeAISubscriber: () => false,
  getSubscriptionName: () => 'Claude Max',
}))

import type { ProviderRuntimeConfig } from '../model/subagentProvider.js'
import {
  formatSubagentDisplayLine,
  getBillingDisplayName,
  getSubagentBillingDisplayName,
} from '../logoV2Utils.js'

const PARENT_MODEL = 'claude-sonnet-4-6-20250514'

describe('formatSubagentDisplayLine', () => {
  test('returns undefined when no subagent provider is configured', () => {
    expect(
      formatSubagentDisplayLine(undefined, PARENT_MODEL, 'Claude Max'),
    ).toBeUndefined()
  })

  test('displays Anthropic for firstParty provider with billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Claude Max')).toBe(
      'Subagent: Anthropic · Inherit from parent · Claude Max',
    )
  })

  test('displays Anthropic for modelType anthropic with billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'anthropic',
    }
    expect(
      formatSubagentDisplayLine(config, PARENT_MODEL, 'Anthropic API'),
    ).toBe('Subagent: Anthropic · Inherit from parent · Anthropic API')
  })

  test('displays OpenAI for modelType openai (priority over provider)', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'OpenAI API')).toBe(
      'Subagent: OpenAI · Inherit from parent · OpenAI API',
    )
  })

  test('displays OpenAI for openai provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'OpenAI API')).toBe(
      'Subagent: OpenAI · Inherit from parent · OpenAI API',
    )
  })

  test('displays Gemini for modelType gemini', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'gemini',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Gemini API')).toBe(
      'Subagent: Gemini · Inherit from parent · Gemini API',
    )
  })

  test('displays Gemini for gemini provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Gemini API')).toBe(
      'Subagent: Gemini · Inherit from parent · Gemini API',
    )
  })

  test('displays Grok for modelType grok', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'grok',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Grok API')).toBe(
      'Subagent: Grok · Inherit from parent · Grok API',
    )
  })

  test('displays Grok for grok provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'grok',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Grok API')).toBe(
      'Subagent: Grok · Inherit from parent · Grok API',
    )
  })

  test('displays Bedrock for bedrock provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'bedrock',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'AWS Bedrock')).toBe(
      'Subagent: Bedrock · Inherit from parent · AWS Bedrock',
    )
  })

  test('displays Vertex for vertex provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'vertex',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Vertex AI')).toBe(
      'Subagent: Vertex · Inherit from parent · Vertex AI',
    )
  })

  test('displays Foundry for foundry provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'foundry',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'Foundry')).toBe(
      'Subagent: Foundry · Inherit from parent · Foundry',
    )
  })

  test('modelType openai takes priority over gemini provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
      modelType: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL, 'OpenAI API')).toBe(
      'Subagent: OpenAI · Inherit from parent · OpenAI API',
    )
  })

  // DeepSeek base URL detection + model resolution + billing

  test('shows DeepSeek when openai BASE_URL points to deepseek', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.deepseek.com' },
    }
    const result = formatSubagentDisplayLine(
      config,
      PARENT_MODEL,
      'DeepSeek API',
    )
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Inherit from parent')
    expect(result).toContain('DeepSeek API')
  })

  test('shows DeepSeek + resolved model when DEFAULT_SONNET_MODEL is set', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_BASE_URL: 'https://api.deepseek.com',
        OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
      },
    }
    const result = formatSubagentDisplayLine(
      config,
      PARENT_MODEL,
      'DeepSeek API',
    )
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-v4-pro')
    expect(result).toContain('DeepSeek API')
  })

  test('shows DeepSeek with OPENAI_MODEL override', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
        OPENAI_MODEL: 'deepseek-chat',
      },
    }
    const result = formatSubagentDisplayLine(
      config,
      PARENT_MODEL,
      'DeepSeek API',
    )
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-chat')
    expect(result).toContain('DeepSeek API')
  })

  test('shows OpenAI for non-deepseek openai BASE_URL', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.openai.com' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL, 'OpenAI API')
    expect(result).toContain('OpenAI')
    expect(result).toContain('Inherit from parent')
    expect(result).toContain('OpenAI API')
  })

  test('DeepSeek hostname match is case-insensitive', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: {
        OPENAI_BASE_URL: 'https://api.DeepSeek.com/v1',
        OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
      },
    }
    const result = formatSubagentDisplayLine(
      config,
      PARENT_MODEL,
      'DeepSeek API',
    )
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-v4-pro')
    expect(result).toContain('DeepSeek API')
  })

  test('shows Grok with model and billing for grok provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'grok',
      modelType: 'grok',
      env: { GROK_MODEL: 'grok-4' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL, 'Grok API')
    expect(result).toContain('Grok')
    expect(result).toContain('Grok-4')
    expect(result).toContain('Grok API')
  })

  test('shows Gemini with GEMINI_MODEL override and billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
      modelType: 'gemini',
      env: { GEMINI_MODEL: 'gemini-2.5-pro' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL, 'Gemini API')
    expect(result).toContain('Gemini')
    expect(result).toContain('Gemini-2.5-pro')
    expect(result).toContain('Gemini API')
  })

  test('omits billing suffix when billingType is undefined', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Anthropic · Inherit from parent',
    )
  })
})

describe('getBillingDisplayName', () => {
  test('returns Anthropic API for firstParty non-subscriber', () => {
    const result = getBillingDisplayName(
      {},
      { CLAUDE_CODE_USE_OPENAI: undefined },
    )
    // Default: firstParty, not a Claude.ai subscriber -> Anthropic API
    expect(result).toBe('Anthropic API')
  })

  test('returns ChatGPT Subscription for OpenAI with chatgpt auth mode', () => {
    const result = getBillingDisplayName(
      { modelType: 'openai' },
      { OPENAI_AUTH_MODE: 'chatgpt' },
    )
    expect(result).toBe('ChatGPT Subscription')
  })

  test('returns OpenAI API for openai modelType with no special env', () => {
    const result = getBillingDisplayName({ modelType: 'openai' }, {})
    expect(result).toBe('OpenAI API')
  })

  test('returns DeepSeek API for openai modelType with deepseek base URL', () => {
    const result = getBillingDisplayName(
      { modelType: 'openai' },
      { OPENAI_BASE_URL: 'https://api.deepseek.com/v1' },
    )
    expect(result).toBe('DeepSeek API')
  })

  test('returns OpenAI-compatible API for openai modelType with custom base URL', () => {
    const result = getBillingDisplayName(
      { modelType: 'openai' },
      { OPENAI_BASE_URL: 'https://my-custom-api.example.com/v1' },
    )
    expect(result).toBe('OpenAI-compatible API')
  })

  test('returns Gemini API for gemini modelType', () => {
    const result = getBillingDisplayName(
      { modelType: 'gemini' },
      { GEMINI_API_KEY: 'fake-key' },
    )
    expect(result).toBe('Gemini API')
  })

  test('returns Grok API for grok modelType', () => {
    const result = getBillingDisplayName(
      { modelType: 'grok' },
      { GROK_API_KEY: 'fake-key' },
    )
    expect(result).toBe('Grok API')
  })

  test('returns AWS Bedrock for bedrock via CLAUDE_CODE_USE_BEDROCK', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_BEDROCK: '1' })
    expect(result).toBe('AWS Bedrock')
  })

  test('returns Vertex AI for vertex via CLAUDE_CODE_USE_VERTEX', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_VERTEX: '1' })
    expect(result).toBe('Vertex AI')
  })

  test('returns Foundry for foundry via CLAUDE_CODE_USE_FOUNDRY', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_FOUNDRY: '1' })
    expect(result).toBe('Foundry')
  })

  test('returns OpenAI API for CLAUDE_CODE_USE_OPENAI env var', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_OPENAI: '1' })
    expect(result).toBe('OpenAI API')
  })

  test('returns Gemini API for CLAUDE_CODE_USE_GEMINI env var', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_GEMINI: '1' })
    expect(result).toBe('Gemini API')
  })

  test('returns Grok API for CLAUDE_CODE_USE_GROK env var', () => {
    const result = getBillingDisplayName({}, { CLAUDE_CODE_USE_GROK: '1' })
    expect(result).toBe('Grok API')
  })

  test('settings.modelType takes priority over env vars', () => {
    const result = getBillingDisplayName(
      { modelType: 'openai' },
      {
        CLAUDE_CODE_USE_GEMINI: '1',
        GEMINI_API_KEY: 'fake-key',
      },
    )
    expect(result).toBe('OpenAI API')
  })

  test('DeepSeek is case-insensitive via hostname', () => {
    const result = getBillingDisplayName(
      { modelType: 'openai' },
      { OPENAI_BASE_URL: 'https://api.DeepSeek.com/v1' },
    )
    expect(result).toBe('DeepSeek API')
  })
})

describe('getSubagentBillingDisplayName', () => {
  test('returns undefined when runtimeConfig is undefined', () => {
    expect(
      getSubagentBillingDisplayName(undefined, 'Claude Max'),
    ).toBeUndefined()
  })

  test('Anthropic subagent inherits Claude Max from parent', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe(
      'Claude Max',
    )
  })

  test('Anthropic subagent inherits Anthropic API from parent', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    expect(getSubagentBillingDisplayName(config, 'Anthropic API')).toBe(
      'Anthropic API',
    )
  })

  test('modelType anthropic inherits parent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'anthropic',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Team')).toBe(
      'Claude Team',
    )
  })

  test('OpenAI subagent with chatgpt auth mode', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
    }
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'ChatGPT Subscription',
    )
  })

  test('OpenAI subagent default billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
    }
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'OpenAI API',
    )
  })

  test('DeepSeek subagent via OPENAI_BASE_URL', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.deepseek.com' },
    }
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'DeepSeek API',
    )
  })

  test('OpenAI subagent with custom BASE_URL', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://custom.llm.example.com/v1' },
    }
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'OpenAI-compatible API',
    )
  })

  test('Gemini subagent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
      modelType: 'gemini',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe(
      'Gemini API',
    )
  })

  test('Grok subagent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'grok',
      modelType: 'grok',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe('Grok API')
  })

  test('Bedrock subagent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'bedrock',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe(
      'AWS Bedrock',
    )
  })

  test('Vertex subagent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'vertex',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe(
      'Vertex AI',
    )
  })

  test('Foundry subagent billing', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'foundry',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Max')).toBe('Foundry')
  })

  test('DeepSeek subagent uses runtimeConfig.env not global env', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.deepseek.com' },
    }
    // Even with a non-DeepSeek parent billing, the subagent reads from its own env
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'DeepSeek API',
    )
  })

  test('Anthropic subagent by modelType only inherits parent', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'anthropic',
    }
    expect(getSubagentBillingDisplayName(config, 'Claude Pro')).toBe(
      'Claude Pro',
    )
  })

  test('Anthropic subagent inherits non-Claude parent billing too', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    // Parent billing could be OpenAI API if main model uses OpenAI
    // The subagent still inherits whatever the parent displays
    expect(getSubagentBillingDisplayName(config, 'OpenAI API')).toBe(
      'OpenAI API',
    )
  })
})
