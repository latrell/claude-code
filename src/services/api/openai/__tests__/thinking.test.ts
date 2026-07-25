import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import {
  isOpenAIThinkingEnabled,
  buildOpenAIRequestBody,
  openAICompatSupportsThinkingControl,
  resolveOpenAIRequestTemperature,
  resolveOpenAIThinkingTokenBudget,
  usesDeepSeekV4RecommendedSampling,
} from '../requestBody.js'

// Re-register envUtils.js with correct isEnvDefinedFalsy and isEnvTruthy to
// override pollution from other test files (debug-tool-call, issue,
// break-cache, MagicDocs/prompts, SessionMemory/prompts, cacheStats) that
// mock this module without exporting isEnvDefinedFalsy.
mock.module('src/utils/envUtils.js', () => ({
  isEnvTruthy: (v: string | boolean | undefined): boolean => {
    if (!v) return false
    if (typeof v === 'boolean') return v
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase().trim())
  },
  isEnvDefinedFalsy: (v: string | boolean | undefined): boolean => {
    if (v === undefined) return false
    if (typeof v === 'boolean') return !v
    if (!v) return false
    return ['0', 'false', 'no', 'off'].includes(v.toLowerCase().trim())
  },
}))

describe('isOpenAIThinkingEnabled', () => {
  const originalEnv = {
    OPENAI_ENABLE_THINKING: process.env.OPENAI_ENABLE_THINKING,
  }

  beforeEach(() => {
    // Clear env var before each test
    delete process.env.OPENAI_ENABLE_THINKING
  })

  afterEach(() => {
    // Restore original env var — delete key if it was originally undefined
    // to avoid leaking the env key into subsequent tests
    if (originalEnv.OPENAI_ENABLE_THINKING === undefined) {
      delete process.env.OPENAI_ENABLE_THINKING
    } else {
      process.env.OPENAI_ENABLE_THINKING = originalEnv.OPENAI_ENABLE_THINKING
    }
  })

  describe('OPENAI_ENABLE_THINKING env var', () => {
    test('returns true when OPENAI_ENABLE_THINKING=1', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('uses scoped env instead of process env when provided', () => {
      process.env.OPENAI_ENABLE_THINKING = '0'
      expect(
        isOpenAIThinkingEnabled('gpt-4o', { OPENAI_ENABLE_THINKING: '1' }),
      ).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=true', () => {
      process.env.OPENAI_ENABLE_THINKING = 'true'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=yes', () => {
      process.env.OPENAI_ENABLE_THINKING = 'yes'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=on', () => {
      process.env.OPENAI_ENABLE_THINKING = 'on'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=TRUE (case insensitive)', () => {
      process.env.OPENAI_ENABLE_THINKING = 'TRUE'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns false when OPENAI_ENABLE_THINKING=0', () => {
      process.env.OPENAI_ENABLE_THINKING = '0'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING=false', () => {
      process.env.OPENAI_ENABLE_THINKING = 'false'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING is empty', () => {
      process.env.OPENAI_ENABLE_THINKING = ''
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING is not set', () => {
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })
  })

  describe('model name auto-detect', () => {
    test('returns true when model name is "deepseek-reasoner"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(true)
    })

    test('returns true when model name contains "deepseek-reasoner" (case insensitive)', () => {
      expect(isOpenAIThinkingEnabled('DeepSeek-Reasoner')).toBe(true)
    })

    test('returns true when model name has prefix/suffix for deepseek-reasoner', () => {
      expect(isOpenAIThinkingEnabled('my-deepseek-reasoner-v1')).toBe(true)
    })

    test('returns true when model name is namespaced for deepseek-reasoner', () => {
      expect(isOpenAIThinkingEnabled('TokenService/deepseek-reasoner')).toBe(
        true,
      )
    })

    test('returns true when model name is "deepseek-v3.2"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v3.2')).toBe(true)
    })

    test('returns true when model name contains "deepseek-v3.2" (case insensitive)', () => {
      expect(isOpenAIThinkingEnabled('DeepSeek-V3.2')).toBe(true)
    })

    test('returns true when model name has prefix/suffix for deepseek-v3.2', () => {
      expect(isOpenAIThinkingEnabled('my-deepseek-v3.2-v1')).toBe(true)
    })

    test('returns true when model name is namespaced for deepseek-v3.2', () => {
      expect(isOpenAIThinkingEnabled('TokenService/deepseek-v3.2')).toBe(true)
    })

    test('returns true when model name is "deepseek-chat"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-chat')).toBe(true)
    })

    test('returns true when model name is "deepseek-v3"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v3')).toBe(true)
    })

    test('returns true when model name is "deepseek-v4"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v4')).toBe(true)
    })

    test('returns true when model name is "deepseek-v4-pro"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v4-pro')).toBe(true)
    })

    test('returns true when model name is "deepseek-r1"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-r1')).toBe(true)
    })

    test('returns true when model name contains "deepseek"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-coder')).toBe(true)
    })

    test('returns true when model name is "mimo-v2-flash"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2-flash')).toBe(true)
    })

    test('returns true when model name is "mimo-v2-pro"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2-pro')).toBe(true)
    })

    test('returns true when model name is "mimo-v2.5-pro"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2.5-pro')).toBe(true)
    })

    test('returns true when model name contains "mimo"', () => {
      expect(isOpenAIThinkingEnabled('MiMo-V2-Omni')).toBe(true)
    })

    test('returns false when model name is "gpt-4o"', () => {
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })

    test('returns false when model name is empty', () => {
      expect(isOpenAIThinkingEnabled('')).toBe(false)
    })
  })

  describe('priority and combined detection', () => {
    test('OPENAI_ENABLE_THINKING=1 enables thinking for any model', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
      expect(isOpenAIThinkingEnabled('deepseek-v3')).toBe(true)
      expect(isOpenAIThinkingEnabled('qwen-3')).toBe(true)
    })

    test('OPENAI_ENABLE_THINKING=false disables thinking even for deepseek-reasoner', () => {
      process.env.OPENAI_ENABLE_THINKING = 'false'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('OPENAI_ENABLE_THINKING=0 disables thinking even for deepseek-reasoner', () => {
      process.env.OPENAI_ENABLE_THINKING = '0'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('both conditions can enable thinking', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(true)
    })
  })
})

describe('openAICompatSupportsThinkingControl', () => {
  const originalEnv = {
    OPENAI_ENABLE_THINKING: process.env.OPENAI_ENABLE_THINKING,
  }

  beforeEach(() => {
    delete process.env.OPENAI_ENABLE_THINKING
  })

  afterEach(() => {
    if (originalEnv.OPENAI_ENABLE_THINKING === undefined) {
      delete process.env.OPENAI_ENABLE_THINKING
    } else {
      process.env.OPENAI_ENABLE_THINKING = originalEnv.OPENAI_ENABLE_THINKING
    }
  })

  test('returns true for deepseek models', () => {
    expect(openAICompatSupportsThinkingControl('deepseek-v4-flash')).toBe(true)
    expect(openAICompatSupportsThinkingControl('deepseek-v4-pro')).toBe(true)
    expect(openAICompatSupportsThinkingControl('DeepSeek-Reasoner')).toBe(true)
  })

  test('returns true for mimo models', () => {
    expect(openAICompatSupportsThinkingControl('mimo-v2-pro')).toBe(true)
  })

  test('returns false for non-thinking-family models', () => {
    expect(openAICompatSupportsThinkingControl('gpt-4o')).toBe(false)
    expect(openAICompatSupportsThinkingControl('qwen-3')).toBe(false)
    expect(openAICompatSupportsThinkingControl('grok-4')).toBe(false)
  })

  test('OPENAI_ENABLE_THINKING=1 marks any model as thinking-capable', () => {
    process.env.OPENAI_ENABLE_THINKING = '1'
    expect(openAICompatSupportsThinkingControl('qwen-3')).toBe(true)
  })

  test('OPENAI_ENABLE_THINKING=0 does NOT remove the capability (unlike isOpenAIThinkingEnabled)', () => {
    process.env.OPENAI_ENABLE_THINKING = '0'
    expect(openAICompatSupportsThinkingControl('deepseek-v4-flash')).toBe(true)
    expect(isOpenAIThinkingEnabled('deepseek-v4-flash')).toBe(false)
  })

  test('uses scoped env instead of process env when provided', () => {
    expect(
      openAICompatSupportsThinkingControl('qwen-3', {
        OPENAI_ENABLE_THINKING: '1',
      }),
    ).toBe(true)
  })
})

describe('usesDeepSeekV4RecommendedSampling', () => {
  test.each([
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'OpenRouter/DeepSeek/deepseek-v4-flash',
    'deepseek-v4-flash-DSpark',
    'deepseek-v4-flash-abliterated',
  ])('recognizes canonical V4 model %s', model => {
    expect(usesDeepSeekV4RecommendedSampling(model)).toBe(true)
  })

  test.each([
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v3.2',
    'deepseek-r1',
    'deepseek-v4-flashback',
  ])('does not apply V4 sampling to ambiguous model %s', model => {
    expect(usesDeepSeekV4RecommendedSampling(model)).toBe(false)
  })
})

describe('resolveOpenAIThinkingTokenBudget', () => {
  test('uses half the output budget up to the DeepSeek 64k reasoning ceiling', () => {
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 384_000,
      }),
    ).toBe(64_000)
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 16_000,
      }),
    ).toBe(8_000)
  })

  test('omits the extension for other models, disabled thinking, or tiny side queries', () => {
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: false,
        maxTokens: 8000,
      }),
    ).toBeUndefined()
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: false,
        isDeepSeekV4: true,
        maxTokens: 8000,
      }),
    ).toBeUndefined()
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 256,
      }),
    ).toBeUndefined()
  })

  test('supports explicit positive and unlimited overrides', () => {
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 8000,
        env: { OPENAI_THINKING_TOKEN_BUDGET: '6000' },
      }),
    ).toBe(6000)
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 8000,
        env: { OPENAI_THINKING_TOKEN_BUDGET: '-1' },
      }),
    ).toBe(-1)
  })

  test('clamps a positive override to the model reasoning ceiling', () => {
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 384_000,
        maxThinkingTokens: 64_000,
        env: { OPENAI_THINKING_TOKEN_BUDGET: '128000' },
      }),
    ).toBe(64_000)
    expect(
      resolveOpenAIThinkingTokenBudget({
        enableThinking: true,
        isDeepSeekV4: true,
        maxTokens: 16_000,
        maxThinkingTokens: 64_000,
        env: { OPENAI_THINKING_TOKEN_BUDGET: '128000' },
      }),
    ).toBe(16_000)
  })
})

describe('buildOpenAIRequestBody — thinking params', () => {
  const baseParams = {
    model: 'deepseek-reasoner',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [] as any[],
    toolChoice: undefined as any,
  } as any

  test('includes official DeepSeek API thinking format when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.thinking).toEqual({ type: 'enabled' })
  })

  test('includes vLLM/self-hosted thinking format when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.enable_thinking).toBe(true)
    expect(body.chat_template_kwargs).toEqual({
      thinking: true,
      enable_thinking: true,
    })
  })

  test('includes both formats simultaneously when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.enable_thinking).toBe(true)
    expect(body.chat_template_kwargs!.thinking).toBe(true)
  })

  test('does NOT include thinking params when disabled', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.thinking).toBeUndefined()
    expect(body.enable_thinking).toBeUndefined()
    expect(body.chat_template_kwargs).toBeUndefined()
  })

  test('always includes stream and stream_options', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  test('includes temperature when thinking is off and override is set', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
      temperatureOverride: 0.7,
    })
    expect(body.temperature).toBe(0.7)
  })

  test('excludes temperature for non-DeepSeek thinking even if override is set', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      temperatureOverride: 0.7,
      isDeepSeekV4: false,
    })
    expect(body.temperature).toBeUndefined()
  })

  test('uses the published sampling temperature for DeepSeek V4 thinking', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      isDeepSeekV4: true,
    })
    expect(body.temperature).toBe(1)
  })

  test('honors an explicit temperature override for DeepSeek V4 thinking', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      temperatureOverride: 0,
      isDeepSeekV4: true,
    })
    expect(body.temperature).toBe(0)
  })

  test('uses connection OPENAI_TEMPERATURE before the DeepSeek V4 default', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      isDeepSeekV4: true,
      env: { OPENAI_TEMPERATURE: '0' },
    })
    expect(body.temperature).toBe(0)
  })

  test('keeps programmatic temperature above the connection setting', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      isDeepSeekV4: true,
      temperatureOverride: 0.7,
      env: { OPENAI_TEMPERATURE: '0' },
    })
    expect(body.temperature).toBe(0.7)
  })

  test.each([
    '',
    'NaN',
    'Infinity',
    '-Infinity',
    'not-a-number',
  ])('ignores invalid OPENAI_TEMPERATURE=%s', rawTemperature => {
    expect(
      resolveOpenAIRequestTemperature({
        enableThinking: true,
        isDeepSeekV4: true,
        env: { OPENAI_TEMPERATURE: rawTemperature },
      }),
    ).toBe(1)
  })

  test('uses connection temperature when thinking is disabled', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
      env: { OPENAI_TEMPERATURE: '0.25' },
    })
    expect(body.temperature).toBe(0.25)
  })

  test('excludes temperature when thinking is off and no override', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.temperature).toBeUndefined()
  })

  test('includes tools and tool_choice when tools are provided', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      tools: [{ type: 'function', function: { name: 'test' } }],
      toolChoice: 'auto',
      enableThinking: false,
    })
    expect(body.tools).toHaveLength(1)
    expect(body.tool_choice).toBe('auto')
  })

  test('excludes tools when empty', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })

  test('includes reasoning_effort when provided', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
      reasoningEffort: 'high',
    })
    expect(body.reasoning_effort).toBe('high')
  })

  test('preserves an exact max reasoning_effort from the transport resolver', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      reasoningEffort: 'max',
    })
    expect(body.reasoning_effort).toBe('max')
  })

  test('omits reasoning_effort entirely when undefined', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.reasoning_effort).toBeUndefined()
    expect(Object.keys(body)).not.toContain('reasoning_effort')
  })
})
