import { describe, expect, test } from 'bun:test'
import { getKnownModelDisplayName } from '../display.js'

describe('getKnownModelDisplayName', () => {
  test('resolves curated aliases across providers', () => {
    expect(getKnownModelDisplayName('deepseek-v4-pro')).toBe('DeepSeek V4 Pro')
    expect(getKnownModelDisplayName('gpt-5.6-sol')).toBe('GPT 5.6 Sol')
    expect(getKnownModelDisplayName('glm-5.1')).toBe('GLM 5.1')
    expect(getKnownModelDisplayName('composer-2.5')).toBe('Composer 2.5')
  })

  test('returns null for custom model ids', () => {
    expect(getKnownModelDisplayName('my-private-model')).toBeNull()
  })
})
