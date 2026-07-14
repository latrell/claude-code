import { describe, expect, mock, test } from 'bun:test'
// Spread the real module so this process-global mock does not strip the
// other settings exports for test files loaded later in the same process
// (see CLAUDE.md cross-file mock pollution rules).
import * as realSettings from '../../utils/settings/settings.js'

// Control variable for mock injection — controlling settings.language
let mockLanguage: string | undefined

mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getInitialSettings: () => ({ language: mockLanguage }),
}))

const { t, tf } = await import('../t.js')
const { localizedDetachedAuxiliaryStopMessage, localizedStopErrorMessage } =
  await import('../stop.js')
const { StopConfirmationError } = await import(
  '../../utils/stopConfirmation.js'
)
const { DetachedAuxiliaryStopConfirmationError } = await import(
  '../../utils/detachedAuxiliaryWork.js'
)
const { createCacheWarningMessage } = await import(
  '../../utils/cacheWarning.js'
)
const {
  getActivitySummarySeparator,
  getSearchReadOperationText,
  getSearchReadOperationTextParts,
  joinActivitySummaryParts,
} = await import('../../utils/searchReadSummaryText.js')

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
        'Switch subagents to a saved connection (from /connect), or unset to inherit the main agent',
      ),
    ).toBe(
      '将子 agent 切换到已保存的连接（来自 /connect），或 unset 继承主 agent',
    )
  })

  test('translates common UI labels', () => {
    mockLanguage = '简体中文'
    expect(t('Copy to clipboard')).toBe('复制到剪贴板')
    expect(t('Cancel')).toBe('取消')
    expect(t('Save to file')).toBe('保存到文件')
    expect(t('Unknown error')).toBe('未知错误')
  })

  test('translates CLI option descriptions', () => {
    mockLanguage = '简体中文'
    expect(
      t(
        'Main-agent connection for this process (connection id/label/preset from /connect). Process-scoped, not persisted.',
      ),
    ).toBe(
      '此进程的主 agent 连接（/connect 的连接 id/名称/预设）。进程级生效，不持久化。',
    )
    expect(
      t(
        'Subagent connection for this process (connection id/label/preset from /connect, or unset to inherit main). Process-scoped, not persisted.',
      ),
    ).toBe(
      '此进程的子 agent 连接（/connect 的连接 id/名称/预设，或 unset 继承主连接）。进程级生效，不持久化。',
    )
    expect(
      t('Print configured provider connections (from /connect) and exit'),
    ).toBe('打印已配置的提供者连接（来自 /connect）并退出')
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
    expect(t('Claude Code')).toBe('Claude Code')
    expect(
      tf(
        '{classifierModel} is temporarily unavailable, so auto mode cannot determine the safety of {toolName} right now. Wait briefly and then try this action again. If it keeps failing, continue with other tasks that do not require this action and come back to it later. Note: reading files, searching code, and other read-only operations do not require the classifier and can still be used.',
        { classifierModel: 'Haiku', toolName: 'Bash' },
      ),
    ).toContain('Haiku 暂时不可用')
    expect(
      tf(
        'Auth conflict: Both a token ({tokenSource}) and an API key ({apiKeySource}) are set. This may lead to unexpected behavior.',
        {
          tokenSource: 'ANTHROPIC_AUTH_TOKEN',
          apiKeySource: 'ANTHROPIC_API_KEY',
        },
      ),
    ).toBe(
      '鉴权冲突：同时设置了 token（ANTHROPIC_AUTH_TOKEN）和 API key（ANTHROPIC_API_KEY）。这可能导致行为不可预期。',
    )
    expect(
      tf(
        'Auto mode classifier requires confirmation for this {toolType}.\n{reason}',
        {
          toolType: t('command'),
          reason: 'Classifier unavailable',
        },
      ),
    ).toBe('自动模式分类器要求确认此命令。\nClassifier unavailable')
    expect(
      tf(
        'Classifier {classifier} requires confirmation for this {toolType}.\n{reason}',
        {
          classifier: 'Haiku',
          toolType: 'tool',
          reason: 'Need review',
        },
      ),
    ).toBe('分类器 Haiku 要求确认此tool。\nNeed review')
    expect(tf('Current API provider: {provider}', { provider: 'openai' })).toBe(
      '当前 API 提供者：openai',
    )
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

  test('translates cancellation confirmation warnings without leaking internal operation names', () => {
    mockLanguage = '简体中文'

    expect(
      t(
        'Stop was requested, but one or more background requests may still be running. Press Esc again to retry.',
      ),
    ).toBe(
      '已请求停止，但仍有一个或多个后台请求可能在运行。请再次按 Esc 重试。',
    )
    expect(
      t(
        'Stop was requested, but one or more background requests could not be confirmed as stopped and may still be running. Check the debug log for details.',
      ),
    ).toBe(
      '已请求停止，但无法确认一个或多个后台请求已经停止，它们可能仍在运行。请查看调试日志了解详情。',
    )
    expect(t('Remote request could not be confirmed as stopped.')).toBe(
      '已请求停止，但无法确认远程请求已停止。',
    )

    const detail = localizedStopErrorMessage(
      new StopConfirmationError(
        'Detached auxiliary work termination could not be confirmed',
      ),
    )
    expect(detail).toBe('无法确认请求已终止；它可能仍在运行。')
    expect(detail).not.toContain('Detached auxiliary work')
    expect(
      tf('Could not confirm task stopped: {error}', { error: detail }),
    ).toBe('无法确认任务已停止：无法确认请求已终止；它可能仍在运行。')

    const retryable = new DetachedAuxiliaryStopConfirmationError([
      {
        operation: 'title request',
        error: new StopConfirmationError('provider still active'),
        settlementPending: true,
        canRetrySettlement: true,
      },
    ])
    expect(localizedDetachedAuxiliaryStopMessage(retryable)).toBe(
      '已请求停止，但仍有一个或多个后台请求可能在运行。请再次按 Esc 重试。',
    )

    const terminal = new DetachedAuxiliaryStopConfirmationError([
      {
        operation: 'turn callback',
        error: new StopConfirmationError('old proof was uncertain'),
        settlementPending: false,
        canRetrySettlement: false,
      },
    ])
    expect(localizedDetachedAuxiliaryStopMessage(terminal)).toBe(
      '已请求停止，但无法确认一个或多个后台请求已经停止，它们可能仍在运行。请查看调试日志了解详情。',
    )
  })

  test('translates cache hit rate warnings', () => {
    mockLanguage = '简体中文'
    expect(
      createCacheWarningMessage({
        hitRate: 51,
        threshold: 80,
        trend: 51,
        shouldWarn: true,
      }).content,
    ).toBe('缓存命中率 51%，低于 80% 阈值（^51%）')
    expect(
      createCacheWarningMessage({
        hitRate: 51,
        threshold: 80,
        trend: null,
        shouldWarn: true,
      }).content,
    ).toBe('缓存命中率 51%，低于 80% 阈值')

    mockLanguage = 'English'
    expect(
      createCacheWarningMessage({
        hitRate: 51,
        threshold: 80,
        trend: 51,
        shouldWarn: true,
      }).content,
    ).toBe('Cache hit rate 51%, below 80% threshold (^51%)')
  })

  test('translates compact search and read summaries', () => {
    mockLanguage = '简体中文'
    const activeParts = [
      getSearchReadOperationText('search', 6, true, true),
      getSearchReadOperationText('read', 5, true, false),
    ]
    expect(`${joinActivitySummaryParts(activeParts)}…`).toBe(
      '正在搜索 6 个模式，读取 5 个文件…',
    )
    expect(getSearchReadOperationText('search', 3, true, true)).toBe(
      '正在搜索 3 个模式',
    )
    expect(getSearchReadOperationText('search', 1, false, true)).toBe(
      '已搜索 1 个模式',
    )
    expect(getSearchReadOperationText('read', 1, false, false)).toBe(
      '读取了 1 个文件',
    )
    expect(getActivitySummarySeparator()).toBe('，')

    const [beforeCount, afterCount] = getSearchReadOperationTextParts(
      'read',
      5,
      true,
      false,
    )
    expect(`${beforeCount}5${afterCount}`).toBe('读取 5 个文件')

    mockLanguage = 'English'
    expect(
      `${joinActivitySummaryParts([
        getSearchReadOperationText('search', 6, true, true),
        getSearchReadOperationText('read', 5, true, false),
      ])}…`,
    ).toBe('Searching for 6 patterns, reading 5 files…')
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
      tf(
        'Unknown connection "{ref}". Run `ccb connect` to list configured connections.',
        {
          ref: 'bad',
        },
      ),
    ).toBe('未知连接 "bad"。运行 `ccb connect` 查看已配置的连接。')
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
