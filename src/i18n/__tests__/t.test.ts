import { describe, expect, mock, test } from 'bun:test'

// Control variable for mock injection — controlling settings.language
let mockLanguage: string | undefined

mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ language: mockLanguage }),
}))

const { t, tf } = await import('../t.js')

describe('t', () => {
  test('returns key as-is when language is en', () => {
    mockLanguage = undefined
    expect(t('Change the theme')).toBe('Change the theme')
    expect(t('Shortcuts')).toBe('Shortcuts')
  })

  test('returns Chinese translation when language is zh', () => {
    mockLanguage = '简体中文'
    expect(t('Change the theme')).toBe('更改主题')
    expect(t('Getting started')).toBe('入门指南')
  })

  test('returns Chinese translation when system locale is zh and config is auto', () => {
    mockLanguage = '简体中文'
    expect(t('Theme')).toBe('主题')
  })

  test('returns key as-is when key is not in dictionary (zh fallback)', () => {
    mockLanguage = '简体中文'
    expect(t('SomeUnknownString1234XYZ')).toBe('SomeUnknownString1234XYZ')
  })

  test('returns key as-is when key is empty string', () => {
    mockLanguage = '简体中文'
    expect(t('')).toBe('')
  })

  test('returns English for known key when language is en', () => {
    mockLanguage = 'English'
    expect(t('Getting started')).toBe('Getting started')
    expect(t('Shortcuts')).toBe('Shortcuts')
  })

  test('translates command descriptions', () => {
    mockLanguage = '简体中文'
    expect(t('Change the theme')).toBe('更改主题')
    expect(t('Add a new working directory')).toBe('添加新的工作目录')
    expect(
      t(
        'Switch or check the subagent API provider (anthropic/openai/gemini/grok/unset)',
      ),
    ).toBe(
      '切换或查看子智能体 API 提供商（anthropic/openai/gemini/grok/unset）',
    )
  })

  test('translates common UI labels', () => {
    mockLanguage = '简体中文'
    expect(t('Copy to clipboard')).toBe('复制到剪贴板')
    expect(t('Cancel')).toBe('Cancel') // not in dict
    expect(t('Save to file')).toBe('保存到文件')
    expect(t('Unknown error')).toBe('未知错误')
  })

  test('translates CLI option descriptions', () => {
    mockLanguage = '简体中文'
    expect(
      t(
        'API provider for this process (anthropic/openai/gemini/grok/bedrock/vertex/foundry/unset). Process-scoped, not persisted.',
      ),
    ).toBe(
      '此进程的 API 提供商（anthropic/openai/gemini/grok/bedrock/vertex/foundry/unset）。进程级生效，不持久化。',
    )
    expect(
      t(
        'Subagent API provider for this process (anthropic/openai/gemini/grok/unset). Process-scoped, not persisted.',
      ),
    ).toBe(
      '此进程的子智能体 API 提供商（anthropic/openai/gemini/grok/unset）。进程级生效，不持久化。',
    )
  })

  test('translates startup/REPL first-screen strings', () => {
    mockLanguage = '简体中文'
    expect(t('Welcome back!')).toBe('欢迎回来！')
    expect(t('Inherit from parent')).toBe('继承自父智能体')
    expect(t('Subagent:')).toBe('子智能体：')
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
    mockLanguage = '简体中文'
    expect(t('show tasks')).toBe('显示任务')
    expect(t('hide tasks')).toBe('隐藏任务')
    expect(t('show teammates')).toBe('显示队友')
    expect(t('hide')).toBe('隐藏')
    expect(t('manage')).toBe('管理')
    expect(t('stop agents')).toBe('停止智能体')
    expect(t('return to team lead')).toBe('返回主智能体')
    expect(t('view tasks')).toBe('查看任务')
    expect(t('copy')).toBe('复制')
    expect(t('native select')).toBe('原生选择')
  })

  test('translates newly localized UI strings', () => {
    mockLanguage = '简体中文'
    expect(t("Use Claude Code's terminal setup?")).toBe(
      '使用 Claude Code 的终端设置？',
    )
    expect(t('Update available! Run: ')).toBe('有可用更新！运行：')
    expect(t('setting up statusLine')).toBe('正在设置状态栏')
    expect(t('statusline skipped · restart to fix')).toBe(
      '状态栏已跳过 · 重启以修复',
    )
    expect(t('Loading explanation…')).toBe('正在加载说明…')
    expect(t('High risk')).toBe('高风险')
    expect(t('Waiting for team lead approval')).toBe('正在等待团队负责人批准')
    expect(
      tf('Permission request sent to team "{teamName}" leader', {
        teamName: 'core',
      }),
    ).toBe('权限请求已发送给团队“core”的负责人')
    expect(
      tf('Monitor started (task {taskId}). Output: {outputFile}', {
        taskId: 'task-1',
        outputFile: '/tmp/out',
      }),
    ).toBe('监控已启动（任务 task-1）。输出：/tmp/out')
    expect(tf('Review complete: {count} annotation(s)', { count: 2 })).toBe(
      '审查完成：2 条注释',
    )
  })

  test('translates auto mode opt-in copy', () => {
    mockLanguage = '简体中文'
    expect(t('Enable auto mode?')).toBe('启用自动模式？')
    expect(
      t(
        "Auto mode lets Claude handle permission prompts automatically — Claude checks each tool call for risky actions and prompt injection before executing. Actions Claude identifies as safe are executed, while actions Claude identifies as risky are blocked and Claude may try a different approach. Ideal for long-running tasks. Sessions are slightly more expensive. Claude can make mistakes that allow harmful commands to run, it's recommended to only use in isolated environments. Shift+Tab to change mode.",
      ),
    ).toContain('自动模式会让 Claude 自动处理权限提示')
  })

  test('translates CLI validation strings', () => {
    mockLanguage = '简体中文'
    expect(
      tf('Invalid --provider value: "{provider}". Valid: {values}', {
        provider: 'bad',
        values: 'anthropic, openai',
      }),
    ).toBe('无效的 --provider 值："bad"。有效值：anthropic, openai')
    expect(
      t('Error: --no-session-persistence can only be used with --print mode.'),
    ).toBe('错误：--no-session-persistence 只能与 --print 模式一起使用。')
  })

  test('translates spinner tip strings', () => {
    mockLanguage = '简体中文'
    expect(
      t('/mobile to use Claude Code from the Claude app on your phone'),
    ).toBe('/mobile 通过手机上的 Claude 应用使用 Claude Code')
    expect(t('Use /memory to view and manage Claude memory')).toBe(
      '使用 /memory 查看和管理 Claude 记忆',
    )
    expect(t('Use /theme to change the color theme')).toBe(
      '使用 /theme 更改颜色主题',
    )
    expect(t('Use /feedback to help us improve!')).toBe(
      '使用 /feedback 帮助我们改进！',
    )
  })

  test('translates template strings', () => {
    mockLanguage = '简体中文'
    expect(tf('Welcome back, {username}!', { username: 'Alice' })).toBe(
      '欢迎回来，Alice！',
    )
    expect(tf('Try "{command}"', { command: 'write a test' })).toBe(
      '试试 "write a test"',
    )
    expect(tf('{mode} on', { mode: 'bypass' })).toBe('bypass 已开启')
    expect(t('Bypass')).toBe('绕过权限')
    expect(t('Accept edits')).toBe('接受编辑')
    expect(t('Plan Mode')).toBe('计划模式')
    expect(tf('hold {key} to speak', { key: 'Space' })).toBe('长按 Space 说话')
    expect(tf('Logging to: {path}', { path: 'stderr' })).toBe(
      '日志输出至：stderr',
    )
  })

  test('returns key as-is in en mode for new keys', () => {
    mockLanguage = undefined
    expect(t('Subagent:')).toBe('Subagent:')
    expect(t('Welcome back!')).toBe('Welcome back!')
    expect(t('cycle')).toBe('cycle')
    expect(t('Context ')).toBe('Context ')
  })
})

describe('tf', () => {
  test('translates template then substitutes placeholders', () => {
    mockLanguage = '简体中文'
    const result = tf('Welcome back, {username}!', { username: '中文用户' })
    expect(result).toBe('欢迎回来，中文用户！')
  })

  test('handles multiple placeholders', () => {
    mockLanguage = '简体中文'
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
    mockLanguage = 'English'
    const result = tf('No sessions found.', {})
    expect(result).toBe('No sessions found.')
  })

  test('handles numeric and boolean values in placeholders', () => {
    mockLanguage = '简体中文'
    const result = tf('Conversation exported to: {path}', {
      path: '/tmp/chat.txt',
    })
    expect(result).toBe('对话已导出到：/tmp/chat.txt')
  })

  test('handles null and undefined values by keeping placeholder', () => {
    mockLanguage = '简体中文'
    const result = tf('Welcome back, {username}!', {
      username: null,
    })
    expect(result).toBe('欢迎回来，{username}！')
  })

  test('handles template not in dictionary with placeholders', () => {
    mockLanguage = '简体中文'
    const result = tf('Hello {name}, welcome to {place}!', {
      name: 'Alice',
      place: 'Beijing',
    })
    expect(result).toBe('Hello Alice, welcome to Beijing!')
  })

  test('does not mutate string with no placeholders', () => {
    mockLanguage = '简体中文'
    expect(tf('Change the theme', {})).toBe('更改主题')
  })

  test('preserves placeholder when value is undefined', () => {
    mockLanguage = '简体中文'
    const result = tf('Welcome back, {username}!', {
      username: undefined,
    })
    expect(result).toBe('欢迎回来，{username}！')
  })

  test('substitutes boolean values as strings', () => {
    mockLanguage = undefined
    const result = tf('Enabled: {status}', { status: true })
    expect(result).toBe('Enabled: true')
  })
})
