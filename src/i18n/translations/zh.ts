/**
 * Chinese (Simplified) translations for UI strings.
 * Keys are English UI strings, values are their Chinese translations.
 *
 * Only COMPLETE UI/user-visible strings are included — no partial prefixes,
 * no chalk-embedded fragments, no AI prompts, no tool schemas, no
 * protocol/config keys, and no test assertions.
 */
const zh: Record<string, string> = {
  // ── /lang command ──────────────────────────────────────────────
  'Set display language (en/zh/auto)': '设置显示语言 (en/zh/auto)',
  'Invalid language "{lang}". Use: en, zh, or auto':
    '无效语言 "{lang}"。请使用：en、zh 或 auto',
  'Language set to {lang}': '语言已设置为 {lang}',
  'Language: {lang}': '语言：{lang}',

  // ── Common command descriptions (user-visible in /help, typeahead) ──
  'Set the prompt bar color for this session': '设置当前会话的提示栏颜色',
  'Export the current conversation to a file or clipboard':
    '导出当前对话到文件或剪贴板',
  "Copy Claude's last response to clipboard (or /copy N for the Nth-latest)":
    '复制 Claude 的最后回复到剪贴板（或 /copy N 复制倒数第 N 条）',
  'Change the theme': '更改主题',
  'Resume a previous conversation': '恢复之前的对话',
  'Manage IDE integrations and show status': '管理 IDE 集成并显示状态',
  'Toggle a searchable tag on the current session': '为当前会话切换可搜索标签',
  'Enable plan mode or view the current session plan':
    '启用计划模式或查看当前会话计划',
  'Fork the current session into a new sub-agent': '将当前会话分支为新的子代理',
  'Add a new working directory': '添加新的工作目录',
  'Set the AI model for Claude Code (currently {model})':
    '设置 Claude Code 的 AI 模型（当前 {model}）',

  // ── All remaining built-in command descriptions ──
  'Force snip conversation history at current point': '强制裁剪当前对话历史',
  'Diagnose and verify your Claude Code installation and settings':
    '诊断并验证您的 Claude Code 安装与设置',
  'List all files currently in context': '列出当前上下文中的所有文件',
  'Show remote session URL and QR code': '显示远程会话 URL 和二维码',
  'Exit the REPL': '退出 REPL',
  'View uncommitted changes and per-turn diffs':
    '查看未提交的更改和每轮对话差异',
  'Connect this terminal for remote-control sessions':
    '连接此终端用于远程控制会话',
  'Configure extra usage to keep working when limits are hit':
    '配置超额使用以在限制触发后继续工作',
  'Show session cost, plan usage, and activity stats':
    '显示会话成本、计划使用和活动统计',
  'Re-run the first-run setup (theme, trust, model, MCP)':
    '重新运行首次设置（主题、信任、模型、MCP）',
  'Manage template jobs': '管理模板任务',
  'Clear conversation history and free up context': '清除对话历史并释放上下文',
  'Send a message to a connected sub CLI': '向已连接的子 CLI 发送消息',
  'Toggle coordinator (multi-worker) mode': '切换协调器（多 worker）模式',
  'Detach from a sub CLI (or all connected subs)':
    '断开与子 CLI（或所有已连接子 CLI）的连接',
  'Upgrade to Max for higher rate limits and more Opus':
    '升级到 Max 以获得更高的速率限制和更多 Opus',
  'Visualize current context usage as a colored grid':
    '以彩色网格可视化当前上下文使用情况',
  'Show current context usage': '显示当前上下文使用情况',
  'Start a background shell monitor (Shift+Down to view)':
    '启动后台 shell 监控（Shift+Down 查看）',
  'Install Claude Code native build': '安装 Claude Code 原生构建',
  'Resume a Claude Code session from claude.ai':
    '从 claude.ai 恢复 Claude Code 会话',
  'Attach to a sub Claude CLI instance via named pipe':
    '通过命名管道连接到子 Claude CLI 实例',
  'Show current environment, runtime, and feature flags':
    '显示当前环境、运行时和功能标志',
  'Continue the current session in Claude Desktop':
    '在 Claude Desktop 中继续当前会话',
  'Install the Claude Slack app': '安装 Claude Slack 应用',
  'Open config panel': '打开配置面板',
  'Open the Kairos assistant panel': '打开 Kairos 助手面板',
  'Workflow 监控面板：实时 run/phase/agent 进度，键盘控制':
    'Workflow 监控面板：实时 run/phase/agent 进度，键盘控制',
  'Set effort level for model usage': '设置模型使用的努力级别',
  'Claude in Chrome (Beta) settings': 'Claude in Chrome（测试版）设置',
  'List and manage background tasks': '列出和管理后台任务',
  'Create a branch of the current conversation at this point':
    '在此处创建当前对话的分支',
  '[INTERNAL] Development debug command (reserved)':
    '【内部】开发调试命令（保留）',
  'Manage agent configurations': '管理代理配置',
  'Configure web search and web fetch backends': '配置网页搜索和获取后端',
  'Create a git commit': '创建 git 提交',
  'Configure the advisor model': '配置顾问模型',
  'Commit, push, and open a PR': '提交、推送并创建 PR',
  'Play the thinkback animation': '播放 thinkback 动画',
  'Toggle voice mode. Use /voice doubao for Doubao ASR backend':
    '切换语音模式。使用 /voice doubao 切换豆包 ASR 后端',
  'Hatch a coding companion · pet, off': '孵化一个编程伙伴 · pet、off',
  'Your 2025 Claude Code Year in Review': '您的 2025 年 Claude Code 年度总结',
  'Generate and display a session summary': '生成并显示会话摘要',
  'Show QR code to download the Claude mobile app':
    '显示二维码下载 Claude 移动应用',
  'Manage background sessions and daemon': '管理后台会话和守护进程',
  'Subscribe to GitHub PR activity (comments, CI, reviews)':
    '订阅 GitHub PR 活动（评论、CI、审查）',
  'Toggle between Vim and Normal editing modes':
    '在 Vim 和普通编辑模式之间切换',
  'Toggle brief-only mode': '切换简洁模式',
  'Clear the Agent sub-session provider/account override':
    '清除 Agent 子会话提供商/账户覆盖',
  'Inject bridge failure states for manual recovery testing':
    '注入桥接故障状态以进行手动恢复测试',
  'Review a pull request': '审查拉取请求',
  'View hook configurations for tool events': '查看工具事件的钩子配置',
  'Manage scheduled remote agents (cron-style triggers)':
    '管理定时远程代理（cron 样式触发器）',
  'Configure the provider/account used by Agent sub-sessions':
    '配置 Agent 子会话使用的提供商/账户',
  'Generate a report analyzing your Claude Code sessions':
    '生成分析您 Claude Code 会话的报告',
  'Auto-fix CI failures on a pull request': '自动修复拉取请求的 CI 失败',
  'View session history of a connected sub CLI': '查看已连接子 CLI 的会话历史',
  'Order Claude Code stickers': '订购 Claude Code 贴纸',
  'Show help and available commands': '显示帮助和可用命令',
  "Set up Claude Code's status line UI": '设置 Claude Code 的状态栏 UI',
  'Dump the JS heap to ~/Desktop': '将 JS 堆转储到 ~/Desktop',
  'Open or create your keybindings configuration file':
    '打开或创建您的按键绑定配置文件',
  'Sign out from your configured account': '从已配置账户退出登录',
  'Manage MCP servers': '管理 MCP 服务器',
  'Toggle proactive (autonomous) mode': '切换主动（自主）模式',
  'Edit Claude memory files': '编辑 Claude 记忆文件',
  'Configure the default remote environment for teleport sessions':
    '为 teleport 会话配置默认远程环境',
  'View release notes': '查看发布说明',
  'Show current pipe connection status': '显示当前管道连接状态',
  'View and update your privacy settings': '查看和更新您的隐私设置',
  'Generate a one-line session recap now': '立即生成一行会话回顾',
  'Rename the current conversation': '重命名当前对话',
  'List available skills': '列出可用技能',
  'Activate pending plugin changes in the current session':
    '在当前会话中激活待处理的插件更改',
  'Manage allow & deny tool permission rules': '管理允许和拒绝工具的权限规则',
  'Control automatic skill matching during conversations':
    '在对话期间控制自动技能匹配',
  'Deprecated: use /config to change output style':
    '已弃用：使用 /config 更改输出风格',
  'Show options when rate limit is reached': '显示达到速率限制时的选项',
  'Manage skill learning (observe, analyze, evolve)':
    '管理技能学习（观察、分析、演进）',
  'List connected Claude Code peers': '列出已连接的 Claude Code 对等点',
  'Inspect pipe registry state and toggle the pipe selector':
    '检查管道注册状态并切换管道选择器',
  'Get comments from a GitHub pull request': '获取 GitHub 拉取请求的评论',
  'Manage Claude Code plugins': '管理 Claude Code 插件',

  // ── add-dir command (complete standalone strings) ──────────────
  'Please provide a directory path.': '请提供目录路径。',
  'Did not add a working directory.': '未添加工作目录。',

  // ── theme command ──────────────────────────────────────────────
  'Theme set to {setting}': '主题已设置为 {setting}',
  // ── Dialog dismissed messages ─────────────────────────────────
  'Config dialog dismissed': '配置面板已关闭',
  'Stats dialog dismissed': '统计面板已关闭',
  'Theme picker dismissed': '主题选择器已关闭',
  'Background tasks dialog dismissed': '后台任务面板已关闭',
  'Skills dialog dismissed': '技能面板已关闭',
  'Agents dialog dismissed': '代理面板已关闭',
  'Hooks dialog dismissed': '钩子面板已关闭',
  'Diff dialog dismissed': '差异面板已关闭',
  'Help dialog dismissed': '帮助面板已关闭',
  'MCP dialog dismissed': 'MCP 面板已关闭',
  'Workspace dialog dismissed': '工作区面板已关闭',
  'Permissions dialog dismissed': '权限面板已关闭',
  'Guest passes dialog dismissed': '访客通行证面板已关闭',
  'Privacy settings dialog dismissed': '隐私设置面板已关闭',
  'Web tools panel dismissed': '网络工具面板已关闭',
  'Break-cache panel dismissed': '缓存面板已关闭',
  'Autonomy panel dismissed': '自治面板已关闭',
  'TUI mode panel dismissed': 'TUI 模式面板已关闭',
  'Shell details dismissed': 'Shell 详情已关闭',
  'Remote session details dismissed': '远程会话详情已关闭',
  'Skill search panel dismissed': '技能搜索面板已关闭',
  'Skill panel dismissed': '技能面板已关闭',
  'Local vault panel dismissed': '本地保险库面板已关闭',
  'Local memory panel dismissed': '本地记忆面板已关闭',
  'Claude Code diagnostics dismissed': 'Claude Code 诊断已关闭',

  // ── model command ──────────────────────────────────────────────
  'Run /model to open the model selection menu, or /model [modelName] to set the model.':
    '运行 /model 打开模型选择菜单，或 /model [模型名称] 设置模型。',
  "Model '{model}' is not available. Your organization restricts model selection.":
    "模型 '{model}' 不可用。您的组织限制了模型选择。",
  "Model '{model}' not found": "模型 '{model}' 未找到",

  // ── export command ─────────────────────────────────────────────
  'Conversation copied to clipboard': '对话已复制到剪贴板',
  'Conversation exported to: {path}': '对话已导出到：{path}',
  'Copy to clipboard': '复制到剪贴板',
  'Save to file': '保存到文件',

  // ── Onboarding ─────────────────────────────────────────────────
  "Let's get started.": '开始使用。',
  'Before you start, keep in mind:': '开始之前，请注意：',
  'Always review changes before accepting': '在接受更改之前始终检查',
  'Claude can make mistakes — especially when running commands':
    'Claude 可能会犯错 — 尤其是在执行命令时',
  'or editing files. You stay in control of every action.':
    '或编辑文件时。您始终掌控每一步操作。',
  'To change this later, run /theme': '之后可运行 /theme 更改',
  'Only use Claude Code on projects you trust':
    '仅在您信任的项目中使用 Claude Code',
  'Untrusted code could contain prompt injection attacks.':
    '不受信任的代码可能包含提示注入攻击。',

  // ── ThemePicker ────────────────────────────────────────────────
  Theme: '主题',
  'Choose the text style that looks best with your terminal':
    '选择最适合您终端的文本样式',
  'Dark mode': '深色模式',
  'Light mode': '浅色模式',
  'Dark mode (colorblind-friendly)': '深色模式（色盲友好）',
  'Light mode (colorblind-friendly)': '浅色模式（色盲友好）',
  'Dark mode (ANSI colors only)': '深色模式（仅 ANSI 颜色）',
  'Light mode (ANSI colors only)': '浅色模式（仅 ANSI 颜色）',
  'Auto (match terminal)': '自动（匹配终端）',

  // ── LanguagePicker ─────────────────────────────────────────────
  'Enter your preferred response and voice language:':
    '输入您偏好的反馈和语音语言：',
  'Leave empty for default (English)': '留空则使用默认值（英语）',

  // ── ModelPicker ────────────────────────────────────────────────
  'Select model': '选择模型',

  // ── HelpV2 / General ───────────────────────────────────────────
  'Getting started': '入门指南',
  Shortcuts: '快捷键',
  'Ask a question or describe a task — Claude will explore your code and respond.':
    '提出问题或描述任务 — Claude 将探索您的代码并作出回应。',
  'When Claude wants to edit files or run commands, you review and approve each action.':
    '当 Claude 想要编辑文件或运行命令时，您将审查并批准每个操作。',

  // ── PromptInputHelpMenu ────────────────────────────────────────
  '! for bash mode': '! 进入 bash 模式',
  '/ for commands': '/ 进入命令模式',
  '@ for file paths': '@ 文件路径',
  '& for background': '& 后台运行',
  '/btw for side question': '/btw 旁路提问',
  'double tap esc to clear input': '双击 Esc 清空输入',
  '{shortcut} to cycle modes': '{shortcut} 切换模式',
  '{shortcut} to auto-accept edits': '{shortcut} 自动接受编辑',
  '{shortcut} for verbose output': '{shortcut} 详细输出',
  '{shortcut} to toggle tasks': '{shortcut} 切换任务',
  '{shortcut} for terminal': '{shortcut} 终端',
  '{shortcut} to undo': '{shortcut} 撤销',
  '{shortcut} to paste images': '{shortcut} 粘贴图片',
  '{shortcut} to switch model': '{shortcut} 切换模型',
  '{shortcut} to toggle fast mode': '{shortcut} 切换快速模式',
  '{shortcut} to stash prompt': '{shortcut} 暂存提示',
  '{shortcut} to edit in $EDITOR': '{shortcut} 在编辑器中编辑',
  '/keybindings to customize': '/keybindings 自定义快捷键',
  'ctrl + z to suspend': 'ctrl + z 挂起',

  // ── Settings / Config ──────────────────────────────────────────
  'Auto-compact': '自动压缩',
  'Show tips': '显示提示',
  'Cache warnings': '缓存警告',
  'Reduce motion': '减少动画',
  'Thinking mode': '思考模式',
  'Prompt suggestions': '提示建议',
  'Poor mode (save tokens)': '节省模式（节省 Token）',
  'Verbose output': '详细输出',
  'Terminal progress bar': '终端进度条',
  'Show status in terminal tab': '在终端标签页显示状态',
  'Show turn duration': '显示轮次耗时',
  'Respect .gitignore in file picker': '在文件选择器中遵循 .gitignore',
  'Search settings...': '搜索设置...',
  'Default permission mode': '默认权限模式',
  'Fast mode ({model} only)': '快速模式（仅 {model}）',
  'Speculative execution': '推测执行',
  'Rewind code (checkpoints)': '代码回退（检查点）',
  'Always copy full response (skip /copy picker)':
    '始终复制完整回复（跳过 /copy 选择器）',
  'Copy on select': '选中即复制',
  'Auto-update channel': '自动更新通道',
  'Local notifications': '本地通知',
  Notifications: '通知',
  'Push when idle': '空闲时推送',
  'Push when input needed': '需要输入时推送',
  'Push when Claude decides': 'Claude 主动推送',
  'Output style': '输出风格',
  'What you see by default': '默认显示内容',
  Language: '语言',
  'Editor mode': '编辑器模式',
  'Show PR status footer': '显示 PR 状态页脚',
  Model: '模型',
  'Default (recommended)': '默认（推荐）',
  "Default (leader's model)": '默认（跟随主代理模型）',
  'Default (English)': '默认（英语）',
  'Diff tool': '差异工具',
  'Auto-connect to IDE (external terminal)': '自动连接 IDE（外部终端）',
  'Auto-install IDE extension': '自动安装 IDE 扩展',
  'Claude in Chrome enabled by default': '默认启用 Claude in Chrome',
  'Teammate mode': '队友模式',
  'Teammate mode [overridden: {override}]': '队友模式【已覆盖：{override}】',
  'Default teammate model': '默认队友模型',
  'Enable Remote Control for all sessions': '为所有会话启用远程控制',
  'External CLAUDE.md includes': '外部 CLAUDE.md 引用',
  'Use custom API key': '使用自定义 API 密钥',
  'Billed as extra usage': '计入超额使用',
  'Use auto mode during plan': '计划期间使用自动模式',
  "Default model for newly spawned teammates. The leader can override via the tool call's model parameter.":
    '新创建队友的默认模型。主代理可通过工具调用的模型参数覆盖。',
  'disable external includes': '禁用外部引用',
  'Enable Auto-Updates': '启用自动更新',
  'Auto-updates are controlled by an environment variable and cannot be changed here.':
    '自动更新由环境变量控制，无法在此处更改。',
  'Auto-updates are disabled in development builds.':
    '自动更新在开发版本中已禁用。',
  'Unset {envVar} to re-enable auto-updates.':
    '取消设置 {envVar} 以重新启用自动更新。',
  'Enable with latest channel': '启用最新版通道',
  'Enable with stable channel': '启用稳定版通道',
  // auto-update disabled reason strings
  'development build': '开发版本',
  '{envVar} set': '{envVar} 已设置',
  config: '配置',
  'No settings match "{query}"': '未找到匹配 "{query}" 的设置',
  '{count} more above': '上方还有 {count} 项',
  '{count} more below': '下方还有 {count} 项',
  'Changing thinking mode mid-conversation will increase latency and may reduce quality.':
    '在对话中途更改思考模式会增加延迟并可能降低质量。',
  'Type to filter': '输入以筛选',
  Version: '版本',
  'Session name': '会话名称',
  'Session ID': '会话 ID',
  cwd: '工作目录',
  'System Diagnostics': '系统诊断',
  '/rename to add a name': '/rename 添加名称',
  Config: '配置',
  Usage: '用量',
  // Notification channel labels
  Auto: '自动',
  'iTerm2 w/ Bell': 'iTerm2 + 响铃',
  Disabled: '已禁用',
  // Common keyboard shortcut descriptions
  cancel: '取消',
  close: '关闭',
  save: '保存',
  change: '切换',
  search: '搜索',
  select: '选择',
  switch: '切换标签',
  return: '返回',
  clear: '清除',
  retry: '重试',
  confirm: '确认',
  tabs: '标签页',
  // Usage tab
  'ChatGPT Usage': 'ChatGPT 用量',
  '{pct}% used': '已用 {pct}%',
  'Resets {time}': '{time} 后重置',
  'No rate limit data available.': '无速率限制数据。',
  'Daily tokens': '每日 Token',
  '{tokens} tokens used on {date}': '{date} 已使用 {tokens} Token',
  'Loading usage data\u2026': '正在加载用量数据\u2026',
  'Current session': '当前会话',
  'Current week (all models)': '本周（全部模型）',
  'Current week (Sonnet only)': '本周（仅 Sonnet）',
  '/usage is only available for subscription plans.':
    '/usage 仅适用于订阅计划。',
  'Extra usage': '超额使用',
  'Extra usage not enabled \u00b7 /extra-usage to enable':
    '超额使用未启用 · 使用 /extra-usage 启用',
  Unlimited: '无限制',
  '{used} / {limit} spent': '已花费 {used} / {limit}',
  // OutputStylePicker
  'Preferred output style': '首选输出风格',
  'This changes how Claude Code communicates with you':
    '这将更改 Claude Code 与您的交流方式',
  'Loading output styles\u2026': '正在加载输出风格\u2026',

  // ── Stats ──────────────────────────────────────────────────────
  'Last 7 days': '最近 7 天',
  'Last 30 days': '最近 30 天',
  'All time': '全部时间',

  // ── Logo / Startup banner ──────────────────────────────────────
  'Welcome back!': '欢迎回来！',
  'Welcome back, {username}!': '欢迎回来，{username}！',
  'Inherit from parent': '继承自父代理',
  'Subagent:': '子代理：',

  // ── Prompt placeholder ─────────────────────────────────────────
  'Try "{command}"': '试试 "{command}"',
  'Message @{name}': '向 @{name} 发送消息…',
  'Press up to edit queued messages': '按上箭头编辑队列消息',

  // ── Status line / mode indicator ───────────────────────────────
  '{mode} on': '{mode} 已开启',

  // ── Footer shortcut action strings (first screen) ──────────────
  cycle: '切换',
  interrupt: '中断',
  'show tasks': '显示任务',
  'hide tasks': '隐藏任务',
  'show teammates': '显示队友',
  hide: '隐藏',
  manage: '管理',
  'stop agents': '停止代理',
  'return to team lead': '返回主代理',
  'view tasks': '查看任务',
  copy: '复制',
  'native select': '原生选择',

  // ── Keyboard shortcut hint templates ────────────────────────────
  // These replace the hardcoded "to" in "{shortcut} to {action}" so
  // that e.g. "esc to interrupt" becomes "esc 中断" under zh.
  '{shortcut} to {action}': '{shortcut} {action}',
  '({shortcut} to {action})': '（{shortcut} {action}）',

  // ── Spinner status ──────────────────────────────────────────────
  '✻ Thinking…': '✻ 思考中…',
  Idle: '空闲',
  ' · teammates running': ' · 队友工作中',
  '{asterisk} Worked for {duration}': '{asterisk} 已工作 {duration}',
  // Spinner inline tips (shown below spinner during long turns)
  'Use /clear to start fresh when switching topics and free up context':
    '使用 /clear 切换话题并释放上下文',
  "Use /btw to ask a quick side question without interrupting Claude's current work":
    '使用 /btw 快速旁路提问，不会中断 Claude 当前工作',
  'Tip: {text}': '提示：{text}',
  'Next: {subject}': '下一步：{subject}',
  '(esc to interrupt {name})': '（按 Esc 中断 {name}）',

  // ── Common spinner verbs ────────────────────────────────────────
  // Every verb in SPINNER_VERBS has a zh entry so spinner text is
  // always localized when language is set to zh.
  Accomplishing: '完成中',
  Actioning: '执行中',
  Actualizing: '实现中',
  Architecting: '架构设计中',
  Baking: '烘焙中',
  Beaming: '传送中',
  "Beboppin'": '摇摆中',
  Befuddling: '困惑中',
  Billowing: '翻涌中',
  Blanching: '漂白中',
  Bloviating: '高谈中',
  Boogieing: '舞动中',
  Boondoggling: '摸鱼中',
  Booping: '轻点中',
  Bootstrapping: '启动中',
  Brewing: '酝酿中',
  Bunning: '打包中',
  Burrowing: '挖掘中',
  Calculating: '计算中',
  Canoodling: '亲昵中',
  Caramelizing: '焦糖化中',
  Cascading: '级联中',
  Catapulting: '弹射中',
  Cerebrating: '思索中',
  Channeling: '通灵中',
  Channelling: '引导中',
  Choreographing: '编排中',
  Churning: '搅动中',
  Clauding: 'Claude 中',
  Coalescing: '汇聚中',
  Cogitating: '深思中',
  Combobulating: '重组中',
  Composing: '编排中',
  Computing: '计算中',
  Concocting: '调制中',
  Considering: '考虑中',
  Contemplating: '沉思中',
  Cooking: '烹饪中',
  Crafting: '制作中',
  Creating: '创建中',
  Crunching: '运算中',
  Crystallizing: '结晶中',
  Cultivating: '培育中',
  Deciphering: '解码中',
  Deliberating: '权衡中',
  Determining: '判断中',
  'Dilly-dallying': '磨蹭中',
  Discombobulating: '打乱中',
  Doing: '执行中',
  Doodling: '涂鸦中',
  Drizzling: '洒落中',
  Ebbing: '消退中',
  Effecting: '实施中',
  Elucidating: '阐明中',
  Embellishing: '润色中',
  Enchanting: '附魔中',
  Envisioning: '设想中',
  Evaporating: '蒸发中',
  Fermenting: '发酵中',
  'Fiddle-faddling': '闲逛中',
  Finagling: '周旋中',
  Flambéing: '火焰中',
  Flibbertigibbeting: '絮叨中',
  Flowing: '流动中',
  Flummoxing: '困惑中',
  Fluttering: '飘动中',
  Forging: '锻造中',
  Forming: '构建中',
  Frolicking: '嬉戏中',
  Frosting: '糖霜中',
  Gallivanting: '闲游中',
  Galloping: '奔驰中',
  Garnishing: '点缀中',
  Generating: '生成中',
  Gesticulating: '比划中',
  Germinating: '萌芽中',
  Gitifying: 'Git 中',
  Grooving: '律动中',
  Gusting: '呼啸中',
  Harmonizing: '协调中',
  Hashing: '哈希中',
  Hatching: '孵化中',
  Herding: '归拢中',
  Honking: '鸣响中',
  Hullaballooing: '喧嚣中',
  Hyperspacing: '跳跃中',
  Ideating: '构思中',
  Imagining: '想象中',
  Improvising: '即兴中',
  Incubating: '孵化中',
  Inferring: '推理中',
  Infusing: '注入中',
  Ionizing: '电离中',
  Jitterbugging: '摇摆中',
  Julienning: '切丝中',
  Kneading: '揉捏中',
  Leavening: '发酵中',
  Levitating: '悬浮中',
  Lollygagging: '闲逛中',
  Manifesting: '实现中',
  Marinating: '腌制中',
  Meandering: '漫步中',
  Metamorphosing: '蜕变中',
  Misting: '雾化中',
  Moonwalking: '太空步中',
  Moseying: '溜达中',
  Mulling: '琢磨中',
  Mustering: '集结中',
  Musing: '思考中',
  Nebulizing: '雾化中',
  Nesting: '筑巢中',
  Newspapering: '读报中',
  Noodling: '拨弄中',
  Nucleating: '成核中',
  Orbiting: '环绕中',
  Orchestrating: '编排中',
  Osmosing: '渗透中',
  Perambulating: '漫步中',
  Percolating: '渗透中',
  Perusing: '细读中',
  Philosophising: '哲思中',
  Photosynthesizing: '光合中',
  Pollinating: '传粉中',
  Pondering: '沉思中',
  Pontificating: '说教中',
  Pouncing: '猛扑中',
  Precipitating: '沉淀中',
  Prestidigitating: '戏法中',
  Processing: '处理中',
  Proofing: '校对中',
  Propagating: '传播中',
  Puttering: '闲混中',
  Puzzling: '解谜中',
  Quantumizing: '量子化中',
  'Razzle-dazzling': '炫技中',
  Razzmatazzing: '狂欢中',
  Recombobulating: '重整中',
  Reticulating: '织网中',
  Roosting: '栖息中',
  Ruminating: '反复思考中',
  Sautéing: '煎炒中',
  Scampering: '疾跑中',
  Schlepping: '搬运中',
  Scurrying: '奔走中',
  Seasoning: '调味中',
  Shenaniganing: '捣蛋中',
  Shimmying: '摇摆中',
  Simmering: '酝酿中',
  Skedaddling: '溜走中',
  Sketching: '素描中',
  Slithering: '滑行中',
  Smooshing: '揉合中',
  'Sock-hopping': '舞会中',
  Spelunking: '探洞中',
  Spinning: '旋转中',
  Sprouting: '萌芽中',
  Stewing: '熬煮中',
  Sublimating: '升华中',
  Swirling: '旋转中',
  Swooping: '俯冲中',
  Symbioting: '共生中',
  Synthesizing: '合成中',
  Tempering: '回火中',
  Thinking: '思考中',
  Thundering: '雷鸣中',
  Tinkering: '修补中',
  Tomfoolering: '胡闹中',
  'Topsy-turvying': '颠倒中',
  Transfiguring: '变形中',
  Transmuting: '转化中',
  Twisting: '扭曲中',
  Undulating: '起伏中',
  Unfurling: '展开中',
  Unravelling: '拆解中',
  Vibing: '共鸣中',
  Waddling: '摇摆中',
  Wandering: '漫游中',
  Warping: '扭曲中',
  Whatchamacalliting: '折腾中',
  Whirlpooling: '漩涡中',
  Whirring: '嗡嗡中',
  Whisking: '搅拌中',
  Wibbling: '摇摆中',
  Working: '工作中',
  Wrangling: '整理中',
  Zesting: '调味中',
  Zigzagging: '曲折中',

  // ── Turn completion verbs (past tense, shown when all teammates idle) ─
  Baked: '烘焙完成',
  Brewed: '酝酿完成',
  Churned: '搅动完成',
  Cogitated: '思索完成',
  Cooked: '烹饪完成',
  Crunched: '运算完成',
  Sautéed: '煎炒完成',
  Worked: '工作完成',

  // ── Teammate spinner status ─────────────────────────────────────
  '[stopping]': '[正在停止]',
  '[awaiting approval]': '[等待批准]',
  'Idle for {time}': '已空闲 {time}',
  '{verb} for {duration}': '{verb}{duration}',
  'enter to view': '回车查看',
  'enter to collapse': '回车收起',
  'shift + ↑/↓ to select': 'shift + ↑/↓ 选择',
  'tool use': '次工具调用',
  'tool uses': '次工具调用',
  tokens: 'token',
  '{count} in background': '后台 {count} 个',
  Reconnecting: '重新连接中',
  'Reconnecting…': '重新连接中…',
  Disconnected: '已断开连接',

  // ── TagTabs ────────────────────────────────────────────────────
  Resume: '恢复会话',
  'Resume (All Projects)': '恢复会话（所有项目）',
  '(tab to cycle)': '（Tab 切换）',

  // ── Builtin status line ────────────────────────────────────────
  'Context ': '上下文 ',
  'Session ': '会话 ',
  'Weekly ': '每周 ',

  // ── Footer misc ────────────────────────────────────────────────
  '? for shortcuts': '? 查看快捷键',
  'Pasting text…': '正在粘贴文本…',
  '-- INSERT --': '-- 插入 --',
  'hold {key} to speak': '长按 {key} 说话',

  // ── Debug ──────────────────────────────────────────────────────
  'Debug mode enabled': '调试模式已启用',
  'Logging to: {path}': '日志输出至：{path}',

  // ── Common UI labels (currently wired) ─────────────────────────
  'Unknown error': '未知错误',
  'Press {key} again to exit': '按 {key} 再次退出',

  // ── version command ─────────────────────────────────────────────
  'Print the version this session is running (not what autoupdate downloaded)':
    '打印当前会话运行的版本（非自动更新下载的版本）',

  // ── init command descriptions ───────────────────────────────────
  'Initialize new CLAUDE.md file(s) and optional skills/hooks with codebase documentation':
    '初始化新的 CLAUDE.md 文件及可选的 skills/hooks，包含代码库文档',
  'Initialize a new CLAUDE.md file with codebase documentation':
    '使用代码库文档初始化新的 CLAUDE.md 文件',

  // ── install command ─────────────────────────────────────────────
  'Checking installation status...': '正在检查安装状态…',
  'Cleaning up old npm installations...': '正在清理旧的 npm 安装…',
  'Installing Claude Code native build {version}...':
    '正在安装 Claude Code 原生构建 {version}…',
  'Setting up launcher and shell integration...':
    '正在设置启动器和 Shell 集成…',
  'Setup notes:': '设置说明：',
  'Claude Code successfully installed!': 'Claude Code 安装成功！',
  'Version: ': '版本：',
  'Location: ': '位置：',
  'Next: Run ': '下一步：运行 ',
  ' to get started': ' 开始使用',
  'Installation failed': '安装失败',
  'Try running with --force to override checks':
    '尝试使用 --force 参数运行以跳过检查',
  'Claude Code installation completed successfully': 'Claude Code 安装成功完成',
  'Claude Code installation failed': 'Claude Code 安装失败',
  'Could not install - another process is currently installing Claude. Please try again in a moment.':
    '无法安装 - 另一进程正在安装 Claude。请稍后再试。',

  // ── add-dir command ─────────────────────────────────────────────
  'Added {path} as a working directory and saved to local settings':
    '已添加 {path} 为工作目录并保存到本地设置',
  'Added {path} as a working directory. Failed to save to local settings: {error}':
    '已添加 {path} 为工作目录。保存到本地设置失败：{error}',
  'Added {path} as a working directory for this session':
    '已添加 {path} 为此会话的工作目录',
  '· /permissions to manage': '· /permissions 进行管理',
  'Did not add {path} as a working directory.': '未添加 {path} 作为工作目录。',
  'Path {path} was not found.': '路径 {path} 未找到。',
  '{path} is not a directory. Did you mean to add the parent directory {parent}?':
    '{path} 不是一个目录。您是要添加父目录 {parent} 吗？',
  '{path} is already accessible within the existing working directory {dir}.':
    '{path} 已在现有工作目录 {dir} 中可访问。',
  'Added {path} as a working directory.': '已添加 {path} 为工作目录。',

  // ── brief command ───────────────────────────────────────────────
  'Brief tool is not enabled for your account': '您的账户未启用 Brief 工具',
  'Brief-only mode enabled': '简洁模式已启用',
  'Brief-only mode disabled': '简洁模式已禁用',

  // ── color command ───────────────────────────────────────────────
  'Cannot set color: This session is a swarm teammate. Teammate colors are assigned by the team leader.':
    '无法设置颜色：此会话是 swarm 队友。队友颜色由团队领导者分配。',
  'Please provide a color. Available colors: {colors}, default':
    '请提供颜色。可用颜色：{colors}、default',
  'Session color reset to default': '会话颜色已重置为默认值',
  'Invalid color "{color}". Available colors: {colors}, default':
    '无效颜色 "{color}"。可用颜色：{colors}、default',
  'Session color set to: {color}': '会话颜色已设置为：{color}',

  // ── coordinator command ─────────────────────────────────────────
  'Coordinator mode disabled — back to normal mode':
    '协调器模式已禁用 — 返回普通模式',
  'Coordinator mode enabled — use Agent(subagent_type: "worker") to dispatch tasks':
    '协调器模式已启用 — 使用 Agent(subagent_type: "worker") 来分派任务',

  // ── copy command ────────────────────────────────────────────────
  'Copied to clipboard ({charCount} characters, {lineCount} lines)\nAlso written to {filePath}':
    '已复制到剪贴板（{charCount} 字符，{lineCount} 行）\n同时写入 {filePath}',
  'Copied to clipboard ({charCount} characters, {lineCount} lines)':
    '已复制到剪贴板（{charCount} 字符，{lineCount} 行）',
  'Full response': '完整回复',
  '{chars} chars, {lines} lines': '{chars} 字符，{lines} 行',
  'Always copy full response': '始终复制完整回复',
  'Skip this picker in the future (revert via /config)':
    '以后跳过此选择器（通过 /config 恢复）',
  'Preference saved. Use /config to change copyFullResponse':
    '偏好已保存。使用 /config 更改 copyFullResponse',
  'Written to {filePath}': '已写入 {filePath}',
  'Failed to write file: {error}': '写入文件失败：{error}',
  'Select content to copy:': '选择要复制的内容：',
  'Copy cancelled': '复制已取消',
  'No assistant message to copy': '没有可复制的助手消息',
  'Usage: /copy [N] where N is 1 (latest), 2, 3, … Got: {arg}':
    '用法：/copy [N]，N 为 1（最新）、2、3… 收到：{arg}',
  'Only {count} assistant {label} available to copy':
    '只有 {count} 条助手{label}可复制',

  // ── export command ──────────────────────────────────────────────
  'Failed to export conversation: {error}': '导出对话失败：{error}',

  // ── fork command ────────────────────────────────────────────────
  'Fork subagent feature is not enabled. Set FEATURE_FORK_SUBAGENT=1 to enable.':
    'Fork 子代理功能未启用。设置 FEATURE_FORK_SUBAGENT=1 以启用。',
  'Fork is not available inside a forked worker. Complete your task directly using your tools.':
    'Fork 在已 Fork 的 worker 中不可用。请直接使用您的工具完成任务。',
  'Usage: /fork <directive>\nExample: /fork Fix the null check in validate.ts':
    '用法：/fork <指令>\n示例：/fork Fix the null check in validate.ts',
  'Cannot fork: no assistant response in conversation history.':
    '无法 fork：对话历史中没有助手回复。',
  'Forked subagent started with directive: "{directive}"':
    'Fork 子代理已启动，指令："{directive}"',
  'Fork failed: {error}': 'Fork 失败：{error}',

  // ── goal command ────────────────────────────────────────────────
  'No active goal. Set one with `/goal <objective>`.':
    '没有活动目标。使用 `/goal <目标>` 设置。',
  'Goal: {objective}': '目标：{objective}',
  'Status: {status}': '状态：{status}',
  'Time: {elapsed}': '时间：{elapsed}',
  'Tokens: {tokens}': 'Token：{tokens}',
  'Continuation turns: {turns}': '连续轮次：{turns}',
  'Hint: Max continuation turns reached ({maxTurns}). Run `/goal continue` to reset and continue.':
    '提示：已达最大连续轮次（{maxTurns}）。运行 `/goal continue` 重置并继续。',
  'Goal set.': '目标已设置。',
  'Goal cleared.': '目标已清除。',
  'No active goal to clear.': '没有可清除的活动目标。',
  'Goal paused.': '目标已暂停。',
  'No active goal to pause.': '没有可暂停的活动目标。',
  'Goal reached max continuation turns ({maxTurns}). Run `/goal continue` to reset turn counter and continue.':
    '目标已达最大连续轮次（{maxTurns}）。运行 `/goal continue` 重置轮次计数并继续。',
  'Goal resumed.': '目标已恢复。',
  'No paused goal to resume.': '没有可恢复的暂停目标。',
  'Goal continuation counter reset (0/{maxTurns}). Continuing...':
    '目标连续计数器已重置（0/{maxTurns}）。继续中…',
  'Current goal is not in max-turns state.': '当前目标不处于最大轮次状态。',
  'Goal marked complete.': '目标已标记为完成。',
  'No active goal to complete.': '没有可完成的活动目标。',
  'Goal objective is too long ({length} chars; limit {max}). Save the detailed instructions to a file and reference it from a shorter objective.':
    '目标描述过长（{length} 字符；限制 {max}）。请将详细说明保存到文件，使用较短的目标引用它。',
  'Kept the current goal. New objective discarded.':
    '保留当前目标。新目标已丢弃。',

  // ── GoalReplaceConfirmDialog ────────────────────────────────────
  'Replace active goal?': '替换活动目标？',
  'A goal is already in progress. Replacing it will reset all progress and counters.':
    '已有一个进行中的目标。替换将重置所有进度和计数器。',
  'Current goal:': '当前目标：',
  '· Objective: ': '· 目标：',
  '· Status: ': '· 状态：',
  '· Time: ': '· 时间：',
  '· Tokens: ': '· Token：',
  'New objective:': '新目标：',
  'Yes, replace the goal': '是，替换目标',
  'No, keep the current goal': '否，保留当前目标',

  // ── ide command ─────────────────────────────────────────────────
  'Select IDE': '选择 IDE',
  'Connect to an IDE for integrated development features.':
    '连接到 IDE 以获得集成开发功能。',
  'No available IDEs detected. Please install the plugin and restart your IDE:\nhttps://docs.claude.com/s/claude-code-jetbrains':
    '未检测到可用 IDE。请安装插件并重启 IDE：\nhttps://docs.claude.com/s/claude-code-jetbrains',
  'No available IDEs detected. Make sure your IDE has the Claude Code extension or plugin installed and is running.':
    '未检测到可用 IDE。请确保您的 IDE 已安装并运行 Claude Code 扩展或插件。',
  'Note: Only one Claude Code instance can be connected to VS Code at a time.':
    '注意：一次只能有一个 Claude Code 实例连接到 VS Code。',
  'Tip: You can enable auto-connect to IDE in /config or with the --ide flag':
    '提示：您可以在 /config 中或通过 --ide 标志启用 IDE 自动连接',
  'IDE selection cancelled': 'IDE 选择已取消',
  'Select an IDE to open the project': '选择 IDE 打开项目',
  'Select IDE to install extension': '选择 IDE 安装扩展',
  'No IDEs with Claude Code extension detected.':
    '未检测到带有 Claude Code 扩展的 IDE。',
  'No IDE selected.': '未选择 IDE。',
  'Opened {item} in {name}': '已在 {name} 中打开{item}',
  'Failed to open in {name}. Try opening manually: {path}':
    '在 {name} 中打开失败。请手动打开：{path}',
  'Please open the {item} manually in {name}: {path}':
    '请在 {name} 中手动打开{item}：{path}',
  'Exited without opening IDE': '已退出，未打开 IDE',
  'Installed plugin to {ide}\nPlease {restart} completely for it to take effect':
    '已将插件安装到 {ide}\n请{restart}以使其生效',
  'restart your IDE': '重启您的 IDE',
  'Installed extension to {ide}': '已将扩展安装到 {ide}',
  'Connected to {name}.': '已连接到 {name}。',
  'Failed to connect to {name}.': '连接到 {name} 失败。',
  'Connection to {name} timed out.': '连接到 {name} 超时。',
  'Error connecting to IDE.': '连接到 IDE 时出错。',
  'Disconnected from {name}.': '已断开与 {name} 的连接。',
  'Connecting to {name}…': '正在连接到 {name}…',

  // ── model command ───────────────────────────────────────────────
  'Kept model as {model}': '保持模型为 {model}',
  'Set model to {model}': '模型已设置为 {model}',
  'Set model to {model} with {effort} effort':
    '模型已设置为 {model}，努力级别 {effort}',
  '· Fast mode ON': '· 快速模式 开启',
  '· Billed as extra usage': '· 计入超额使用',
  '· Fast mode OFF': '· 快速模式 关闭',
  'Opus 4.7 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m':
    'Opus 4.7 1M 上下文不适用于您的账户。了解更多：https://code.claude.com/docs/en/model-config#extended-context-with-1m',
  'Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m':
    'Sonnet 4.6 1M 上下文不适用于您的账户。了解更多：https://code.claude.com/docs/en/model-config#extended-context-with-1m',
  'Failed to validate model: {error}': '验证模型失败：{error}',
  '(default)': '（默认）',
  'Current model: {model} (session override from plan mode)\nBase model: {base}{effort}':
    '当前模型：{model}（计划模式会话覆盖）\n基础模型：{base}{effort}',
  'Current model: {model}{effort}': '当前模型：{model}{effort}',

  // ── plan command ────────────────────────────────────────────────
  'Current Plan': '当前计划',
  '"/plan open"': '"/plan open"',
  ' to edit this plan in ': ' 在以下编辑器中编辑此计划 ',
  'Enabled plan mode': '计划模式已启用',
  'Already in plan mode. No plan written yet.':
    '已在计划模式中。尚未编写计划。',
  'Failed to open plan in editor: {error}': '在编辑器中打开计划失败：{error}',
  'Opened plan in editor: {path}': '已在编辑器中打开计划：{path}',

  // ── rename command ──────────────────────────────────────────────
  'Cannot rename: This session is a swarm teammate. Teammate names are set by the team leader.':
    '无法重命名：此会话是 swarm 队友。队友名称由团队领导者设置。',
  'Could not generate a name: no conversation context yet. Usage: /rename <name>':
    '无法生成名称：尚无对话上下文。用法：/rename <名称>',
  'Session renamed to: {name}': '会话已重命名为：{name}',

  // ── resume command ──────────────────────────────────────────────
  'Session {arg} was not found. Run {boldResume} without arguments to browse all sessions.':
    '会话 {arg} 未找到。运行 {boldResume}（不带参数）浏览所有会话。',
  'Found {count} sessions matching {arg}. Run {boldResume} to pick one from the list.':
    '找到 {count} 个匹配 {arg} 的会话。运行 {boldResume} 从列表中选择一个。',
  'No conversations found to resume': '没有找到可恢复的对话',
  'Failed to load conversations': '加载对话失败',
  'Failed to resume conversation': '恢复对话失败',
  'This conversation is from a different directory.': '此对话来自不同的目录。',
  'To resume, run:': '要恢复，请运行：',
  '(Command copied to clipboard)': '（命令已复制到剪贴板）',
  'Resume cancelled': '恢复已取消',
  ' Loading conversations…': ' 正在加载对话…',
  ' Resuming conversation…': ' 正在恢复对话…',
  'Failed to resume: {error}': '恢复失败：{error}',

  // ── tag command ─────────────────────────────────────────────────
  'Remove tag?': '移除标签？',
  'Current tag: #{tagName}': '当前标签：# {tagName}',
  'This will remove the tag from the current session.':
    '这将从当前会话中移除标签。',
  'Yes, remove tag': '是，移除标签',
  'No, keep tag': '否，保留标签',
  'No active session to tag': '没有活动会话可标记',
  'Tag name cannot be empty': '标签名称不能为空',
  'Tagged session with {tag}': '已为会话添加标签 {tag}',
  'Removed tag {tag}': '已移除标签 {tag}',
  'Kept tag {tag}': '已保留标签 {tag}',
  'Usage: /tag <tag-name>': '用法：/tag <标签名>',
  'Toggle a searchable tag on the current session.\nRun the same command again to remove the tag.\nTags are displayed after the branch name in /resume and can be searched with /.\n\nExamples:\n  /tag bugfix        # Add tag\n  /tag bugfix        # Remove tag (toggle)\n  /tag feature-auth\n  /tag wip':
    '为当前会话切换可搜索标签。\n再次运行相同命令即可移除标签。\n标签显示在 /resume 中的分支名之后，可通过 / 搜索。\n\n示例：\n  /tag bugfix        # 添加标签\n  /tag bugfix        # 移除标签（切换）\n  /tag feature-auth\n  /tag wip',

  // ── proactive command ───────────────────────────────────────────
  'Proactive mode disabled': '主动模式已禁用',
  'Proactive mode enabled — model will work autonomously between ticks':
    '主动模式已启用 — 模型将在 tick 之间自主工作',

  // ── vim command ─────────────────────────────────────────────────
  'Editor mode set to {mode}.': '编辑器模式已设置为 {mode}。',
  'Use Escape key to toggle between INSERT and NORMAL modes.':
    '使用 Escape 键在 INSERT 和 NORMAL 模式之间切换。',
  'Using standard (readline) keyboard bindings.':
    '使用标准（readline）键盘绑定。',

  // ── voice command ───────────────────────────────────────────────
  'Voice mode is not available.': '语音模式不可用。',
  'Voice mode disabled.': '语音模式已禁用。',
  'Voice mode switched to Doubao ASR. Hold {key} to record.':
    '语音模式已切换到豆包 ASR。长按 {key} 录音。',
  'Voice mode switched to Anthropic STT. Hold {key} to record.':
    '语音模式已切换到 Anthropic STT。长按 {key} 录音。',
  'Failed to update settings. Check your settings file for syntax errors.':
    '更新设置失败。请检查设置文件的语法错误。',
  'Voice mode is not available in this environment.':
    '此环境中语音模式不可用。',
  'Voice mode requires a Claude.ai account. Please run /login to sign in.':
    '语音模式需要 Claude.ai 账户。请运行 /login 登录。',
  'No audio recording tool found.': '未找到音频录制工具。',
  'Install audio recording tools? Run: {cmd}': '安装音频录制工具？运行：{cmd}',
  'Install SoX manually for audio recording.':
    '请手动安装 SoX 以进行音频录制。',
  'Microphone access is denied. To enable it, go to {guidance}, then run /voice again.':
    '麦克风访问被拒绝。要启用，请前往 {guidance}，然后再次运行 /voice。',
  'Voice mode enabled ({provider}). Hold {key} to record.':
    '语音模式已启用（{provider}）。长按 {key} 录音。',
  'Note: "{from}" is not a supported dictation language; using English. Change it via /config.':
    '注意：不支持 "{from}" 作为听写语言；使用英语。通过 /config 更改。',
  'Dictation language: {lang} (/config to change).':
    '听写语言：{lang}（通过 /config 更改）。',

  // ── monitor command ─────────────────────────────────────────────
  'Usage: /monitor <command>\nExample: /monitor watch -n 5 git status':
    '用法：/monitor <命令>\n示例：/monitor watch -n 5 git status',
  'Usage: /monitor <command>\nExample: /monitor powershell -c "while(1){git status; Start-Sleep 5}"':
    '用法：/monitor <命令>\n示例：/monitor powershell -c "while(1){git status; Start-Sleep 5}"',
  'Monitor started ({taskId}). Press Shift+Down to view.\nOutput: {output}':
    '监控已启动（{taskId}）。按 Shift+Down 查看。\n输出：{output}',
  'Monitor failed: {error}': '监控失败：{error}',

  // ── advisor command ─────────────────────────────────────────────
  'Advisor: not set\nUse "/advisor <model>" to enable (e.g. "/advisor opus").':
    '顾问：未设置\n使用 "/advisor <模型>" 启用（例如 "/advisor opus"）。',
  'Advisor: {model} (inactive)\nThe current model ({base}) does not support advisors.':
    '顾问：{model}（未激活）\n当前模型（{base}）不支持顾问。',
  'Advisor: {model}\nUse "/advisor unset" to disable or "/advisor <model>" to change.':
    '顾问：{model}\n使用 "/advisor unset" 禁用或 "/advisor <模型>" 更改。',
  'Advisor disabled (was {model}).': '顾问已禁用（原为 {model}）。',
  'Advisor already unset.': '顾问已取消设置。',
  'Invalid advisor model: {error}': '无效的顾问模型：{error}',
  'Unknown model: {arg} ({resolved})': '未知模型：{arg}（{resolved}）',
  'The model {arg} ({resolved}) cannot be used as an advisor':
    '模型 {arg}（{resolved}）不能用作顾问',
  'Advisor set to {model}.\nNote: Your current model ({base}) does not support advisors. Switch to a supported model to use the advisor.':
    '顾问已设置为 {model}。\n注意：当前模型（{base}）不支持顾问。切换到支持的模型以使用顾问。',
  'Advisor set to {model}.': '顾问已设置为 {model}。',

  // ── cost command ────────────────────────────────────────────────
  'You are currently using your overages to power your Claude Code usage. We will automatically switch you back to your subscription rate limits when they reset':
    '您当前正在使用超额额度来支持 Claude Code 使用。我们将在订阅速率限制重置时自动切换回来',
  'You are currently using your subscription to power your Claude Code usage':
    '您当前正在使用您的订阅来支持 Claude Code 使用',

  // ── keybindings command ─────────────────────────────────────────
  'Keybinding customization is not enabled. This feature is currently in preview.':
    '按键绑定自定义未启用。此功能目前处于预览阶段。',
  'Opened {path} in your editor.': '已在编辑器中打开 {path}。',
  'Created {path} with template. Opened in your editor.':
    '已使用模板创建 {path}。已在编辑器中打开。',
  'Opened {path}. Could not open in editor: {error}':
    '已打开 {path}。无法在编辑器中打开：{error}',
  'Created {path}. Could not open in editor: {error}':
    '已创建 {path}。无法在编辑器中打开：{error}',

  // ── compact command ─────────────────────────────────────────────
  'No messages to compact': '没有可压缩的消息',
  'Compaction canceled.': '压缩已取消。',
  'Error during compaction: {error}': '压缩时出错：{error}',
  'Compacted ': '已压缩 ',
  '({shortcut} to see full summary)': '（{shortcut} 查看完整摘要）',

  // ── login / extra-usage ─────────────────────────────────────────
  'Login successful': '登录成功',
  'Login interrupted': '登录已中断',
  Login: '登录',
  'Starting new login following /extra-usage. Exit with Ctrl-C to use existing account.':
    '在 /extra-usage 之后开始新登录。使用 Ctrl-C 退出以使用现有账户。',

  // ── logout command ──────────────────────────────────────────────
  'Successfully logged out.': '已成功退出登录。',

  // ── memory command ──────────────────────────────────────────────
  'Learn more:': '了解更多：',
  Memory: '记忆',
  'Opened memory file at {path}\n\n{editorHint}':
    '已在 {path} 打开记忆文件\n\n{editorHint}',
  'Error opening memory file: {error}': '打开记忆文件时出错：{error}',
  'Cancelled memory editing': '已取消记忆编辑',
  'Using {source}="{value}".': '使用 {source}="{value}"。',
  'To change editor, set $EDITOR or $VISUAL environment variable.':
    '要更改编辑器，请设置 $EDITOR 或 $VISUAL 环境变量。',
  'To use a different editor, set the $EDITOR or $VISUAL environment variable.':
    '要使用其他编辑器，请设置 $EDITOR 或 $VISUAL 环境变量。',

  // ── session command ─────────────────────────────────────────────
  'Not in remote mode. Start with `claude --remote` to use this command.':
    '不在远程模式中。请使用 `claude --remote` 启动以使用此命令。',
  '(press esc to close)': '（按 Esc 关闭）',
  'Remote session': '远程会话',
  'Generating QR code…': '正在生成二维码…',
  'Open in browser: ': '在浏览器中打开：',

  // ── Terminal setup ─────────────────────────────────────────────
  "Use Claude Code's terminal setup?": '使用 Claude Code 的终端设置？',
  'For the optimal coding experience, enable the recommended settings':
    '为了获得最佳编码体验，请启用推荐的设置',
  'for your terminal: ': '针对您的终端：',
  'Option+Enter for newlines and visual bell': 'Option+Enter 换行和视觉提示音',
  'Shift+Enter for newlines': 'Shift+Enter 换行',
  'Yes, use recommended settings': '是，使用推荐设置',
  'No, maybe later with /terminal-setup': '否，以后通过 /terminal-setup 设置',
  'Enter to confirm · Esc to skip': '回车确认 · Esc 跳过',

  // ── Ide Onboarding Dialog ──────────────────────────────────────
  'Welcome to Claude Code for {ideName}': '欢迎使用 Claude Code for {ideName}',
  'installed {pluginOrExtension} v{installedVersion}':
    '已安装{pluginOrExtension} v{installedVersion}',
  'Claude has context of ': 'Claude 了解 ',
  ' open files': ' 打开的文件',
  ' and ': ' 和 ',
  "Review Claude Code's changes ": '请在 IDE 中舒适地',
  ' in the comfort of your IDE': '审查 Claude Code 的更改',
  ' for Quick Launch': ' 用于快速启动',
  'Press Enter to continue': '按回车继续',

  // ── Desktop handoff ────────────────────────────────────────────
  'Claude Desktop is not installed.': 'Claude Desktop 未安装。',
  'Claude Desktop needs to be updated (found v{version}, need v1.1.2396+).':
    'Claude Desktop 需要更新（发现 v{version}，需要 v1.1.2396+）。',
  'Failed to open Claude Desktop': '无法打开 Claude Desktop',
  'Error: ': '错误：',
  'Download now? (y/n)': '立即下载？（y/n）',
  'Checking for Claude Desktop…': '正在检查 Claude Desktop…',
  'Saving session…': '正在保存会话…',
  'Opening Claude Desktop…': '正在打开 Claude Desktop…',
  'Opening in Claude Desktop…': '正在 Claude Desktop 中打开…',
  'Session transferred to Claude Desktop': '会话已传输到 Claude Desktop',
  "Starting download. Re-run /desktop once you've installed the app.\nLearn more at {url}":
    '开始下载。安装应用后重新运行 /desktop。\n了解更多：{url}',
  'The desktop app is required for /desktop. Learn more at {url}':
    '桌面应用是 /desktop 所必需的。了解更多：{url}',
  'Press any key to continue…': '按任意键继续…',

  // ── CLI command descriptions (claude --help) ────────────────────
  'Start a Claude Code session server': '启动 Claude Code 会话服务器',
  'Run Claude Code on a remote host over SSH. Deploys the binary and tunnels API auth back through your local machine — no remote setup needed.':
    '通过 SSH 在远程主机上运行 Claude Code。部署二进制文件并通过本地机器隧道传输 API 认证 — 无需远程设置。',
  'Connect to a Claude Code server (internal — use cc:// URLs)':
    '连接到 Claude Code 服务器（内部使用 — 使用 cc:// URL）',
  'Set up a long-lived authentication token (requires Claude subscription)':
    '设置长期认证令牌（需要 Claude 订阅）',
  'List configured agents': '列出已配置的代理',
  'Inspect auto mode classifier configuration': '检查自动模式分类器配置',
  'Print the default auto mode environment, allow, and deny rules as JSON':
    '以 JSON 格式打印默认的自动模式环境以及允许和拒绝规则',
  'Print the effective auto mode config as JSON: your settings where set, defaults otherwise':
    '以 JSON 格式打印有效的自动模式配置：已设置的部分显示您的设置，其余显示默认值',
  'Get AI feedback on your custom auto mode rules':
    '获取 AI 对您的自定义自动模式规则的反馈',
  'Inspect and manage automatic autonomy runs and flows':
    '检查和管理自动自主运行和流程',
  'Print autonomy run, flow, team, pipe, and remote-control status':
    '打印自主运行、流程、团队、管道和远程控制状态',
  'List recent autonomy runs': '列出最近的自主运行',
  'List recent autonomy flows': '列出最近的自主流程',
  'Inspect a single autonomy flow': '检查单个自主流程',
  'Cancel a queued, waiting, or running autonomy flow':
    '取消排队、等待或正在运行的自主流程',
  'Resume a waiting autonomy flow': '恢复等待中的自主流程',
  'Connect your local environment for remote-control sessions via claude.ai/code':
    '通过 claude.ai/code 连接本地环境以进行远程控制会话',
  'Attach the REPL as a client to a running bridge session. Discovers sessions via API if no sessionId given.':
    '将 REPL 作为客户端附加到运行中的桥接会话。如果未提供 sessionId，则通过 API 发现会话。',
  'Check the health of your Claude Code auto-updater. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.':
    '检查 Claude Code 自动更新器的健康状况。注意：工作区信任对话框将被跳过，来自 .mcp.json 的 stdio 服务器将被启用以进行健康检查。仅在您信任的目录中使用此命令。',
  'Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)':
    '安装 Claude Code 原生构建。使用 [target] 指定版本（stable、latest 或特定版本）',
  'Update claude-code-best (ccb) to the latest version':
    '将 claude-code-best (ccb) 更新到最新版本',
  'Generate shell completion script (bash, zsh, or fish)':
    '生成 Shell 补全脚本（bash、zsh 或 fish）',

  // ── [ANT-ONLY] CLI command descriptions ─────────────────────────
  '[ANT-ONLY] Manage conversation logs.': '【内部】管理对话日志。',
  '[ANT-ONLY] View error logs. Optionally provide a number (0, -1, -2, etc.) to display a specific log.':
    '【内部】查看错误日志。可选择提供数字（0、-1、-2 等）以显示特定日志。',
  '[ANT-ONLY] Export a conversation to a text file.':
    '【内部】将对话导出为文本文件。',
  '[ANT-ONLY] Initialize or upgrade the local dev environment using the "# claude up" section of the nearest CLAUDE.md':
    '【内部】使用最近的 CLAUDE.md 中的 "# claude up" 部分初始化或升级本地开发环境。',
  '[ANT-ONLY] Roll back to a previous release\n\nExamples:\n  claude rollback                                    Go 1 version back from current\n  claude rollback 3                                  Go 3 versions back from current\n  claude rollback 2.0.73-dev.20251217.t190658        Roll back to a specific version':
    '【内部】回滚到之前的版本\n\n示例：\n  claude rollback                                    从当前版本回退 1 个版本\n  claude rollback 3                                  从当前版本回退 3 个版本\n  claude rollback 2.0.73-dev.20251217.t190658        回滚到特定版本',
  '[ANT-ONLY] Manage task list tasks': '【内部】管理任务列表。',
  'Create a new task': '创建新任务',
  'List all tasks': '列出所有任务',
  'Get details of a task': '获取任务详细信息',
  'Update a task': '更新任务',
  'Show the tasks directory path': '显示任务目录路径',

  // ── REPL error notifications ────────────────────────────────────
  'Failed to resume agent: {error}': '恢复代理失败：{error}',

  // ── Bundled skill descriptions (user-visible in /help, typeahead) ─
  'Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)':
    '按循环间隔运行提示或斜杠命令（例如 /loop 5m /foo，默认 10 分钟）',
  'List all scheduled cron jobs in this session':
    '列出当前会话中的所有定时 cron 任务',
  'Cancel a scheduled cron job by ID': '按 ID 取消定时 cron 任务',
  'Manually trigger memory consolidation — review, organize, and prune your auto-memory files.':
    '手动触发记忆整合 — 审查、组织和清理自动记忆文件',
  'Review changed code for reuse, quality, and efficiency, then fix any issues found.':
    '审查更改的代码以提升复用性、质量和效率，然后修复发现的问题',
  'Review auto-memory entries and propose promotions to CLAUDE.md, CLAUDE.local.md, or shared memory. Also detects outdated, conflicting, and duplicate entries across memory layers.':
    '审查自动记忆条目并建议提升到 CLAUDE.md、CLAUDE.local.md 或共享记忆。同时检测跨记忆层中过时、冲突和重复的条目',
  'Use this skill to configure the Claude Code harness via settings.json. Automated behaviors ("from now on when X", "each time X", "whenever X", "before/after X") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions ("allow X", "add permission", "move permission to"), env vars ("set X=Y"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X". For simple settings like theme/model, use Config tool.':
    '使用此技能通过 settings.json 配置 Claude Code 框架。自动化行为（"from now on when X"、"each time X" 等）需要在 settings.json 中配置 hooks — 框架负责执行而非 Claude，因此记忆/偏好无法实现。也可用于：权限（"allow X"、"add permission"、"move permission to"）、环境变量（"set X=Y"）、hook 故障排除，或对 settings.json/settings.local.json 文件的任何更改。示例："allow npm commands"、"add bq permission to global settings"、"move permission to user settings"、"set DEBUG=true"、"when claude stops show X"。对于主题/模型等简单设置，请使用 Config 工具。',
  'Research and plan a large-scale change, then execute it in parallel across 5\u201330 isolated worktree agents that each open a PR.':
    '研究并规划大规模更改，然后在 5\u201330 个隔离的 worktree 代理中并行执行，每个代理创建一个 PR',
  'Teach the agent when and how to use the artifact tool: what content belongs in artifacts, when to upload/update, and the SearchExtraTools + ExecuteExtraTool invocation flow for the deferred artifact tool.':
    '教代理何时以及如何使用 artifact 工具：哪些内容属于 artifact、何时上传/更新、以及延迟 artifact 工具的 SearchExtraTools + ExecuteExtraTool 调用流程',
  '[ANT-ONLY] Investigate frozen/stuck/slow Claude Code sessions on this machine and post a diagnostic report to #claude-code-feedback.':
    '【内部】调查此机器上冻结/卡住/缓慢的 Claude Code 会话并向 #claude-code-feedback 发布诊断报告',
  'Enable debug logging for this session and help diagnose issues':
    '为此会话启用调试日志并帮助诊断问题',
  'Debug your current Claude Code session by reading the session debug log. Includes all event logging':
    '通过读取会话调试日志调试当前 Claude Code 会话。包含所有事件日志',
  'Generate filler text for long context testing. Specify token count as argument (e.g., /lorem-ipsum 50000). Outputs approximately the requested number of tokens. Ant-only.':
    '生成长上下文测试的填充文本。指定 token 数量作为参数（例如 /lorem-ipsum 50000）。输出大约请求数量的 token。仅供内部使用。',
  'Enter multi-agent workflow orchestration mode: when to use the Workflow tool, script primitives, quality patterns, determinism constraints, resume/budget, and files/commands.':
    '进入多代理工作流编排模式：何时使用 Workflow 工具、脚本原语、质量模式、确定性约束、恢复/预算以及文件/命令',
  'Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension).':
    '自动化 Chrome 浏览器与网页交互 — 点击元素、填写表单、截屏、读取控制台日志和导航网站。在现有 Chrome 会话的新标签页中打开页面。执行前需要站点级权限（在扩展中配置）',
  'Create, update, list, or run scheduled remote agents (triggers) that execute on a cron schedule.':
    '创建、更新、列出或运行按 cron 计划执行的定时远程代理（触发器）',
  "Capture this session's repeatable process into a skill. Call at end of the process you want to capture with an optional description.":
    '将本会话的可重复流程捕获为技能。在要捕获的流程结束时调用，可附带描述',
  'Build apps with the Claude API or Anthropic SDK.\nTRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\nDO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.':
    '使用 Claude API 或 Anthropic SDK 构建应用。\n触发条件：代码导入 anthropic/@anthropic-ai-sdk/claude_agent_sdk，或用户要求使用 Claude API、Anthropic SDK 或 Agent SDK。\n不触发：代码导入 openai/其他 AI SDK、通用编程或 ML/数据科学任务。',

  // ── Agent / Task status UI ───────────────────────────────────────
  'Backgrounded agent': '后台代理',
  'Remote agent launched': '远程代理已启动',
  'Done ({result})': '完成（{result}）',
  '1 tool use': '1 次工具调用',
  '{count} tool uses': '{count} 次工具调用',
  '{count} tokens': '{count} tokens',
  'Agent "{description}" completed': '代理 "{description}" 已完成',
  'Agent "{description}" failed: {error}': '代理 "{description}" 失败：{error}',
  'Agent "{description}" was stopped': '代理 "{description}" 已停止',
  done: '完成',
  error: '错误',
  stopped: '已停止',
  ', unread': '，未读',
  'setting up': '设置中',
  stopping: '正在停止',
  'awaiting approval': '等待审批',
  idle: '空闲',
  working: '工作中',
  'No tasks currently running': '当前无任务运行',
  'Viewing teammate': '查看队友',
  'Viewing leader': '查看领导者',
  'Background tasks': '后台任务',
  'active agent': '活跃代理',
  'active agents': '活跃代理',
  Agents: '代理',
  Shells: 'Shell',
  Monitors: '监控',
  Completed: '已完成',
  Failed: '失败',
  Stopped: '已停止',
  'Async agent': '异步代理',
  Progress: '进度',
  Prompt: '提示',
  Error: '错误',
  'Monitor details': '监控详情',
  'Shell details': 'Shell 详情',
  Status: '状态',
  Runtime: '运行时间',
  Command: '命令',
  Title: '标题',
  'Session URL': '会话 URL',
  Script: '脚本',
  Output: '输出',
  'Loading output…': '正在加载输出…',
  'No output available': '无可用输出',
  'Showing {n} lines': '显示 {n} 行',
  'Remote session details': '远程会话详情',
  starting: '启动中',
  'input required': '需要输入',
  ready: '就绪',
  waiting: '等待中',
  running: '运行中',
  Find: '查找',
  Verify: '验证',
  Dedupe: '去重',
  Setup: '设置',
  'Stop ultrareview?': '停止 ultrareview？',
  'This archives the remote session and stops local tracking. The review will not complete and any findings so far are discarded.':
    '这将归档远程会话并停止本地跟踪。审查将不会完成，目前已发现的任何结果都将被丢弃。',
  'Stop ultrareview': '停止 ultrareview',
  Back: '返回',
  'Open in Claude Code on the web': '在网页版 Claude Code 中打开',
  Dismiss: '关闭',
  'Review in Claude Code on the web': '在网页版 Claude Code 中查看',
  'Stop ultraplan': '停止 ultraplan',
  'Teleport failed: {error}': '传送失败：{error}',
  'Teleporting to session…': '正在传送到会话…',
  'Recent messages': '最近消息',
  'Showing last {n} of {total} messages':
    '显示最近 {n} 条消息（共 {total} 条）',
  'Status:': '状态：',
  'Runtime:': '运行时间：',
  'Command:': '命令：',
  'Script:': '脚本：',
  'Output:': '输出：',
  'Title:': '标题：',
  'Progress:': '进度：',
  'Session URL:': '会话 URL：',
  finding: '查找中',
  found: '已找到',
  verified: '已验证',
  refuted: '已驳回',
  deduping: '去重中',
  'ready · shift+↓ to view': '就绪 · shift+↓ 查看',
  'Ultraplan session': 'Ultraplan 会话',
  ultraplan: 'ultraplan',
  ultrareview: 'ultrareview',
  'error · {error}': '错误 · {error}',
  'background agents launched': '个后台代理已启动',
  agents: '代理',
  '{type} agents': '{type} 代理',
  finished: '已完成',
  Running: '运行',
  'Initializing…': '初始化中…',
  'Running in the background': '在后台运行中',
  Done: '完成',
  teleport: '传送',
  tool: '工具',
  tools: '工具',
  use: '次调用',
  uses: '次调用',

  // ── KeyboardShortcutHint action labels (single-word / not in existing dict) ──
  toggle: '切换',
  submit: '提交',
  exit: '退出',
  background: '后台',
  update: '更新',
  remove: '移除',
  dismiss: '关闭',
  continue: '继续',
  add: '添加',
  expand: '展开',
  view: '查看',
  navigate: '导航',
  'go back': '返回',
  stop: '停止',
  foreground: '前台',
  resume: '恢复',
  back: '返回',
  skip: '跳过',
  preview: '预览',
  rename: '重命名',
  'enter text': '输入文本',
  'toggle selection': '切换选择',
  'edit in your editor': '在编辑器中编辑',
  complete: '补全',
  'write to file': '写入文件',
  unset: '取消设置',
  details: '详情',
  stash: '暂存',
  'toggle branch': '切换分支',
  'run in background': '后台运行',
  'stop all agents': '停止所有代理',
  'manage background agents': '管理后台代理',
  'more tool': '更多工具',

  // ── BackgroundAgentSelector hint strings ────────────────────────
  'up/down to select · Enter to view': '↑/↓ 选择 · Enter 查看',
  'shift+downarrow to manage background agents': 'shift+↓ 管理后台代理',
  'shift+downarrow to manage · x to stop': 'shift+↓ 管理 · x 停止',
  'shift+downarrow to manage · x to clear': 'shift+↓ 管理 · x 清除',

  // ── Task pill labels ────────────────────────────────────────────
  '{n} shell': '{n} 个 shell',
  '{n} shells': '{n} 个 shell',
  '{n} monitor': '{n} 个监控',
  '{n} monitors': '{n} 个监控',
  '{n} team': '{n} 个团队',
  '{n} teams': '{n} 个团队',
  '{n} local agent': '{n} 个本地代理',
  '{n} local agents': '{n} 个本地代理',
  '{n} cloud session': '{n} 个云端会话',
  '{n} cloud sessions': '{n} 个云端会话',
  '{n} background workflow': '{n} 后台工作流',
  '{n} background workflows': '{n} 个后台工作流',
  '{n} background task': '{n} 个后台任务',
  '{n} background tasks': '{n} 个后台任务',
  dreaming: '整理记忆中',

  // ── AgentTool progress display strings ──────────────────────────
  'In progress': '进行中',
  '+{n} more tool {unit}': '+{n} 更多工具 {unit}',
}

export default zh
