import { describe, expect, mock, test } from 'bun:test'

// Control variables for mock injection
let mockPreferredLanguage: string | undefined
let mockSystemLocale: string | undefined

mock.module('src/utils/config.js', () => ({
  getGlobalConfig: () => ({
    preferredLanguage: mockPreferredLanguage,
  }),
}))

mock.module('src/utils/intl.js', () => ({
  getSystemLocaleLanguage: () => mockSystemLocale,
}))

const { t, tf } = await import('../t.js')

describe('t', () => {
  test('returns key as-is when language is en', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'en'
    expect(t('Change the theme')).toBe('Change the theme')
    expect(t('Shortcuts')).toBe('Shortcuts')
  })

  test('returns Chinese translation when language is zh', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('Change the theme')).toBe('更改主题')
    expect(t('Getting started')).toBe('入门指南')
  })

  test('returns Chinese translation when system locale is zh and config is auto', () => {
    mockPreferredLanguage = 'auto'
    mockSystemLocale = 'zh'
    expect(t('Theme')).toBe('主题')
  })

  test('returns key as-is when key is not in dictionary (zh fallback)', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('SomeUnknownString1234XYZ')).toBe('SomeUnknownString1234XYZ')
  })

  test('returns key as-is when key is empty string', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('')).toBe('')
  })

  test('returns English for known key when language is en', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'en'
    expect(t('Getting started')).toBe('Getting started')
    expect(t('Shortcuts')).toBe('Shortcuts')
  })

  test('translates command descriptions', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('Change the theme')).toBe('更改主题')
    expect(t('Add a new working directory')).toBe('添加新的工作目录')
  })

  test('translates common UI labels', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('Copy to clipboard')).toBe('复制到剪贴板')
    expect(t('Cancel')).toBe('Cancel') // not in dict
    expect(t('Save to file')).toBe('保存到文件')
    expect(t('Unknown error')).toBe('未知错误')
  })

  test('translates startup/REPL first-screen strings', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('Welcome back!')).toBe('欢迎回来！')
    expect(t('Inherit from parent')).toBe('继承自父代理')
    expect(t('Subagent:')).toBe('子代理：')
    expect(t('Subagent:')).not.toBe('Subagent:')
    expect(t('cycle')).toBe('切换')
    expect(t('interrupt')).toBe('中断')
    expect(t('Resume')).toBe('恢复会话')
    expect(t('(tab to cycle)')).toBe('（Tab 切换）')
    expect(t('Context ')).toBe('上下文 ')
    expect(t('? for shortcuts')).toBe('? 查看快捷键')
    expect(t('Pasting text…')).toBe('正在粘贴文本…')
    expect(t('-- INSERT --')).toBe('-- 插入 --')
    expect(t('Debug mode enabled')).toBe('调试模式已启用')
  })

  test('translates footer action strings', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(t('show tasks')).toBe('显示任务')
    expect(t('hide tasks')).toBe('隐藏任务')
    expect(t('show teammates')).toBe('显示队友')
    expect(t('hide')).toBe('隐藏')
    expect(t('manage')).toBe('管理')
    expect(t('stop agents')).toBe('停止代理')
    expect(t('return to team lead')).toBe('返回主代理')
    expect(t('view tasks')).toBe('查看任务')
    expect(t('copy')).toBe('复制')
    expect(t('native select')).toBe('原生选择')
  })

  test('translates template strings for first screen', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(tf('Welcome back, {username}!', { username: 'Alice' })).toBe(
      '欢迎回来，Alice！',
    )
    expect(tf('Try "{command}"', { command: 'write a test' })).toBe(
      '试试 "write a test"',
    )
    expect(tf('{mode} on', { mode: 'bypass' })).toBe('bypass 已开启')
    expect(tf('hold {key} to speak', { key: 'Space' })).toBe('长按 Space 说话')
    expect(tf('Logging to: {path}', { path: 'stderr' })).toBe(
      '日志输出至：stderr',
    )
  })

  test('returns key as-is in en mode for new keys', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'en'
    expect(t('Subagent:')).toBe('Subagent:')
    expect(t('Welcome back!')).toBe('Welcome back!')
    expect(t('cycle')).toBe('cycle')
    expect(t('Context ')).toBe('Context ')
  })
})

describe('tf', () => {
  test('translates template then substitutes placeholders', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf('Language set to {lang}', { lang: '中文' })
    expect(result).toBe('语言已设置为 中文')
  })

  test('handles multiple placeholders', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf(
      'Current model: {session} (session override from plan mode)\nBase model: {base}',
      { session: 'sonnet', base: 'opus' },
    )
    // Substitutes values even when template is not in dictionary
    expect(result).toContain('sonnet')
    expect(result).toContain('opus')
    expect(result).toContain('Current model:')
    expect(result).toContain('Base model:')
  })

  test('returns template as-is in en mode with substitutions', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'en'
    const result = tf('No sessions found.', {})
    expect(result).toBe('No sessions found.')
  })

  test('handles numeric and boolean values in placeholders', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf('Conversation exported to: {path}', {
      path: '/tmp/chat.txt',
    })
    expect(result).toBe('对话已导出到：/tmp/chat.txt')
  })

  test('handles null and undefined values by keeping placeholder', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf('Language set to {lang}', {
      lang: null,
    })
    expect(result).toBe('语言已设置为 {lang}')
  })

  test('handles template not in dictionary with placeholders', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf('Hello {name}, welcome to {place}!', {
      name: 'Alice',
      place: 'Beijing',
    })
    expect(result).toBe('Hello Alice, welcome to Beijing!')
  })

  test('does not mutate string with no placeholders', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(tf('Change the theme', {})).toBe('更改主题')
  })

  test('preserves placeholder when value is undefined', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    const result = tf('Language set to {lang}', {
      lang: undefined,
    })
    expect(result).toBe('语言已设置为 {lang}')
  })

  test('substitutes boolean values as strings', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'en'
    const result = tf('Enabled: {status}', { status: true })
    expect(result).toBe('Enabled: true')
  })
})
