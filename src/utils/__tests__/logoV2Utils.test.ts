import { describe, expect, test } from 'bun:test'
import type { ProviderRuntimeConfig } from '../model/subagentProvider.js'
import { formatSubagentDisplayLine } from '../logoV2Utils.js'

const PARENT_MODEL = 'claude-sonnet-4-6-20250514'

describe('formatSubagentDisplayLine', () => {
  test('returns undefined when no subagent provider is configured', () => {
    expect(formatSubagentDisplayLine(undefined, PARENT_MODEL)).toBeUndefined()
  })

  test('displays Anthropic for firstParty provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Anthropic · Inherit from parent',
    )
  })

  test('displays Anthropic for modelType anthropic', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'anthropic',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Anthropic · Inherit from parent',
    )
  })

  test('displays OpenAI for modelType openai (priority over provider)', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: OpenAI · Inherit from parent',
    )
  })

  test('displays OpenAI for openai provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: OpenAI · Inherit from parent',
    )
  })

  test('displays Gemini for modelType gemini', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'gemini',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Gemini · Inherit from parent',
    )
  })

  test('displays Gemini for gemini provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Gemini · Inherit from parent',
    )
  })

  test('displays Grok for modelType grok', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'firstParty',
      modelType: 'grok',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Grok · Inherit from parent',
    )
  })

  test('displays Grok for grok provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'grok',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Grok · Inherit from parent',
    )
  })

  test('displays Bedrock for bedrock provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'bedrock',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Bedrock · Inherit from parent',
    )
  })

  test('displays Vertex for vertex provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'vertex',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Vertex · Inherit from parent',
    )
  })

  test('displays Foundry for foundry provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'foundry',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: Foundry · Inherit from parent',
    )
  })

  test('modelType openai takes priority over gemini provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
      modelType: 'openai',
    }
    expect(formatSubagentDisplayLine(config, PARENT_MODEL)).toBe(
      'Subagent: OpenAI · Inherit from parent',
    )
  })

  // New tests: DeepSeek base URL detection + model resolution

  test('shows DeepSeek when openai BASE_URL points to deepseek', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.deepseek.com' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Inherit from parent')
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
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-v4-pro')
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
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-chat')
  })

  test('shows OpenAI for non-deepseek openai BASE_URL', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'openai',
      modelType: 'openai',
      env: { OPENAI_BASE_URL: 'https://api.openai.com' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('OpenAI')
    expect(result).toContain('Inherit from parent')
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
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('DeepSeek')
    expect(result).toContain('Deepseek-v4-pro')
  })

  test('shows Grok with inherited model for grok provider', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'grok',
      modelType: 'grok',
      env: { GROK_MODEL: 'grok-4' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('Grok')
    expect(result).toContain('Grok-4')
  })

  test('shows Gemini with GEMINI_MODEL override', () => {
    const config: ProviderRuntimeConfig = {
      provider: 'gemini',
      modelType: 'gemini',
      env: { GEMINI_MODEL: 'gemini-2.5-pro' },
    }
    const result = formatSubagentDisplayLine(config, PARENT_MODEL)
    expect(result).toContain('Gemini')
    expect(result).toContain('Gemini-2.5-pro')
  })
})
