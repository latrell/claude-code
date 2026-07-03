import { describe, test, expect, mock } from 'bun:test'

// Control variables for mock injection
let mockLanguage: string | undefined
let mockSettingsThrows: boolean = false

// Mock settings.js with a controllable getInitialSettings.
// All test files in this suite mock settings.js (never language.js) to avoid
// cross-test mock pollution (see CLAUDE.md "跨文件 mock 污染").
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => {
    if (mockSettingsThrows) throw new Error('Config accessed before allowed.')
    return { language: mockLanguage }
  },
}))

// Dynamically import language.js — the real module will see our mocked
// getInitialSettings above.
const { getResolvedLanguage, getLanguageDisplayName } = await import(
  'src/utils/language.js'
)

describe('getResolvedLanguage', () => {
  test('returns zh when settings.language is 简体中文', () => {
    mockLanguage = '简体中文'
    expect(getResolvedLanguage()).toBe('zh')
  })

  test('returns en when settings.language is English', () => {
    mockLanguage = 'English'
    expect(getResolvedLanguage()).toBe('en')
  })

  test('returns en when settings.language is Japanese', () => {
    mockLanguage = 'Japanese'
    expect(getResolvedLanguage()).toBe('en')
  })

  test('returns en when settings.language is undefined', () => {
    mockLanguage = undefined
    expect(getResolvedLanguage()).toBe('en')
  })

  test('returns en when settings.language is an arbitrary custom string', () => {
    mockLanguage = 'Français'
    expect(getResolvedLanguage()).toBe('en')
  })

  test('returns en when settings.language is an empty string', () => {
    mockLanguage = ''
    expect(getResolvedLanguage()).toBe('en')
  })

  test('falls back to en when settings read throws', () => {
    mockSettingsThrows = true
    expect(getResolvedLanguage()).toBe('en')
    mockSettingsThrows = false
  })
})

describe('getLanguageDisplayName', () => {
  test('returns English for en', () => {
    expect(getLanguageDisplayName('en')).toBe('English')
  })

  test('returns 中文 for zh', () => {
    expect(getLanguageDisplayName('zh')).toBe('中文')
  })

  test('returns the input string for unknown language codes', () => {
    expect(getLanguageDisplayName('fr')).toBe('fr')
    expect(getLanguageDisplayName('unknown')).toBe('unknown')
  })
})
