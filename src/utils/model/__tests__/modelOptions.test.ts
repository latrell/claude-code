import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { resetSettingsCache } from 'src/utils/settings/settingsCache.js'
// Pin the display language to English: getModelOptions() renders its
// descriptions through i18n t()/tf(), which reads settings.language —
// without this mock the suite fails on machines whose real settings.json
// sets 简体中文. Spread the real module so this process-global mock does
// not strip the other settings exports for test files loaded later in the
// same process (see CLAUDE.md cross-file mock pollution rules).
import * as realSettings from '../../settings/settings.js'

mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getInitialSettings: () => ({}),
}))

const { getModelOptions } = await import('../modelOptions.js')

/**
 * Verifies that ChatGPT Codex model options display human-readable
 * model names (e.g. GPT-5.5) rather than raw model IDs (e.g. gpt-5.5).
 */

const envKeys = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
  'OPENAI_AUTH_MODE',
  'USER_TYPE',
] as const

const savedEnv: Record<string, string | undefined> = {}

function enableChatGPTCodexMode(): void {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_AUTH_MODE = 'chatgpt'
}

describe('getChatGPTCodexModelOptions (via getModelOptions)', () => {
  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    resetSettingsCache()
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  describe('default ChatGPT Codex model option', () => {
    test('description uses display name GPT-5.5 not raw ID gpt-5.5', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const defaultOpt = options.find(o => o.value === null)
      expect(defaultOpt).toBeDefined()
      // Must contain the human-readable display name
      expect(defaultOpt!.description).toContain('GPT-5.5')
      // Must NOT leak the raw model ID in the parenthesized model slot
      expect(defaultOpt!.description).not.toContain('(currently gpt-5.5)')
      expect(defaultOpt!.description).not.toContain('(当前 gpt-5.5)')
      // Falls back to English key when locale is not zh
      expect(defaultOpt!.description).toContain('default ChatGPT Codex')
    })

    test('descriptionForModel uses display name GPT-5.5 not raw ID gpt-5.5', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const defaultOpt = options.find(o => o.value === null)
      expect(defaultOpt).toBeDefined()
      expect(defaultOpt!.descriptionForModel).toBeDefined()
      expect(defaultOpt!.descriptionForModel).toContain('GPT-5.5')
      expect(defaultOpt!.descriptionForModel).not.toContain(
        '(currently gpt-5.5)',
      )
      expect(defaultOpt!.descriptionForModel).not.toContain('(当前 gpt-5.5)')
    })

    test('default model value is null (unchanged)', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const defaultOpt = options.find(o => o.value === null)
      expect(defaultOpt).toBeDefined()
      expect(defaultOpt!.value).toBeNull()
    })
  })

  describe('non-default ChatGPT Codex model options', () => {
    test('descriptionForModel uses model.label not model.value', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const gpt55Opt = options.find(o => o.value === 'gpt-5.5')
      expect(gpt55Opt).toBeDefined()
      // descriptionForModel should use the label (GPT-5.5) not raw value (gpt-5.5)
      expect(gpt55Opt!.descriptionForModel).toBeDefined()
      expect(gpt55Opt!.descriptionForModel).toContain('(GPT-5.5)')
      expect(gpt55Opt!.descriptionForModel).not.toContain('(gpt-5.5)')
    })

    test('gpt-5.5-pro descriptionForModel uses label GPT-5.5 Pro', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const proOpt = options.find(o => o.value === 'gpt-5.5-pro')
      expect(proOpt).toBeDefined()
      expect(proOpt!.descriptionForModel).toContain('(GPT-5.5 Pro)')
      expect(proOpt!.descriptionForModel).not.toContain('(gpt-5.5-pro)')
    })

    test('gpt-5.4-mini descriptionForModel uses label GPT-5.4-Mini', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const miniOpt = options.find(o => o.value === 'gpt-5.4-mini')
      expect(miniOpt).toBeDefined()
      expect(miniOpt!.descriptionForModel).toContain('(GPT-5.4-Mini)')
      expect(miniOpt!.descriptionForModel).not.toContain('(gpt-5.4-mini)')
    })

    test('model value is unchanged (raw ID preserved for API calls)', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const values = options.map(o => o.value)
      expect(values).toContain('gpt-5.5')
      expect(values).toContain('gpt-5.5-pro')
      expect(values).toContain('gpt-5.4')
      expect(values).toContain('gpt-5.4-mini')
      expect(values).toContain('gpt-5.4-nano')
      expect(values).toContain('gpt-5.3-codex')
      expect(values).toContain('gpt-5.3-codex-spark')
      expect(values).toContain('gpt-5.2')
    })
  })
})
