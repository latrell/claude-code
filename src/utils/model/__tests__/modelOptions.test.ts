import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { setChatGPTSubscriptionPlan } from '../../../bootstrap/state.js'
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
const {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_MODEL_OPTIONS,
  formatChatGPTCodexContextWindow,
  getChatGPTCodexModelDisplayName,
} = await import('../chatgptModels.js')

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

function enableChatGPTCodexMode(plan = 'pro'): void {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_AUTH_MODE = 'chatgpt'
  setChatGPTSubscriptionPlan(plan)
}

describe('getChatGPTCodexModelOptions (via getModelOptions)', () => {
  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    setChatGPTSubscriptionPlan(null)
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
    setChatGPTSubscriptionPlan(null)
  })

  describe('default ChatGPT Codex model option', () => {
    test('uses the current default display name', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const defaultOpt = options.find(o => o.value === null)
      expect(defaultOpt).toBeDefined()
      const displayName = getChatGPTCodexModelDisplayName(
        CHATGPT_CODEX_DEFAULT_MODEL,
      )
      expect(displayName).toBeTruthy()
      expect(defaultOpt!.description).toContain(displayName!)
      expect(defaultOpt!.description).not.toContain(
        `(currently ${CHATGPT_CODEX_DEFAULT_MODEL})`,
      )
      expect(defaultOpt!.description).toContain('default ChatGPT Codex')
      expect(defaultOpt!.description).toContain('ctx 372K')
    })

    test('descriptionForModel uses the display name', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const defaultOpt = options.find(o => o.value === null)
      expect(defaultOpt).toBeDefined()
      expect(defaultOpt!.descriptionForModel).toBeDefined()
      expect(defaultOpt!.descriptionForModel).toContain(
        getChatGPTCodexModelDisplayName(CHATGPT_CODEX_DEFAULT_MODEL)!,
      )
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
    test('preserves the exact current roster for API calls', () => {
      enableChatGPTCodexMode()
      const options = getModelOptions()
      const values = options.map(o => o.value)
      expect(values).toEqual([
        null,
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.3-codex-spark',
      ])
    })

    test.each(
      CHATGPT_CODEX_MODEL_OPTIONS.map(option => [option] as const),
    )('$value renders its curated label and context window', model => {
      enableChatGPTCodexMode()
      const option = getModelOptions().find(o => o.value === model.value)
      const formatted = formatChatGPTCodexContextWindow(model.contextWindow)

      expect(option).toBeDefined()
      expect(option!.label).toBe(model.label)
      expect(option!.description).toContain(`ctx ${formatted}`)
      expect(option!.descriptionForModel).toContain(model.label)
      expect(option!.descriptionForModel).toContain(`ctx ${formatted}`)
      expect(option!.descriptionForModel).not.toContain(`(${model.value})`)
    })

    test('filters gated models and displays effective plan windows', () => {
      enableChatGPTCodexMode('plus')
      const options = getModelOptions()

      expect(
        options.some(option => option.value === 'gpt-5.3-codex-spark'),
      ).toBe(false)
      expect(
        options.find(option => option.value === 'gpt-5.6-sol')?.description,
      ).toContain('ctx 256K')
      expect(options[0]?.description).toContain('ctx 256K')
    })
  })
})
