/**
 * Chinese (Simplified) translations for UI strings.
 * Keys are English UI strings, values are their Chinese translations.
 *
 * Only COMPLETE UI/user-visible strings are included — no partial prefixes,
 * no chalk-embedded fragments, no AI prompts, no tool schemas, no
 * protocol/config keys, and no test assertions.
 */
const zh: Record<string, string> = {
  // ── Product/UI shell ────────────────────────────────────────────
  'Claude Code': 'Claude Code',

  // ── Permission and auth notices ─────────────────────────────────
  '{classifierModel} is temporarily unavailable, so auto mode cannot determine the safety of {toolName} right now. Wait briefly and then try this action again. If it keeps failing, continue with other tasks that do not require this action and come back to it later. Note: reading files, searching code, and other read-only operations do not require the classifier and can still be used.':
    '{classifierModel} 暂时不可用，自动模式现在无法判断 {toolName} 是否安全。请稍等片刻后重试此操作。如果仍然失败，请继续处理不依赖此操作的其他任务，稍后再回来重试。注意：读取文件、搜索代码和其他只读操作不需要分类器，仍可继续使用。',
  'Auto mode classifier requires confirmation for this {toolType}.\n{reason}':
    '自动模式分类器要求确认此{toolType}。\n{reason}',
  'Classifier {classifier} requires confirmation for this {toolType}.\n{reason}':
    '分类器 {classifier} 要求确认此{toolType}。\n{reason}',
  'Auth conflict: Using {source} instead of Claude account subscription token. Either unset {source}, or run `claude /logout`.':
    '鉴权冲突：正在使用 {source}，而不是 Claude 账户订阅 token。请取消设置 {source}，或运行 `claude /logout`。',
  'Auth conflict: Using {source} instead of Anthropic Console key. Either unset {source}, or run `claude /logout`.':
    '鉴权冲突：正在使用 {source}，而不是 Anthropic Console key。请取消设置 {source}，或运行 `claude /logout`。',
  'Auth conflict: Both a token ({tokenSource}) and an API key ({apiKeySource}) are set. This may lead to unexpected behavior.':
    '鉴权冲突：同时设置了 token（{tokenSource}）和 API key（{apiKeySource}）。这可能导致行为不可预期。',
  '· Trying to use {source}? {action}': '· 想使用 {source}？{action}',
  'Unset the ANTHROPIC_API_KEY environment variable, or claude /logout then say "No" to the API key approval before login.':
    '请取消设置 ANTHROPIC_API_KEY 环境变量，或运行 claude /logout 后在登录前的 API key 确认中选择“否”。',
  'Unset the apiKeyHelper setting.': '请取消设置 apiKeyHelper。',
  'claude /logout to sign out of claude.ai.':
    '运行 claude /logout 退出 claude.ai。',
  'Unset the {source} environment variable.': '请取消设置 {source} 环境变量。',
  'Current API provider: {provider}': '当前 API 提供者：{provider}',
  'API provider cleared (will use environment variables).':
    '已清除 API 提供者配置（将使用环境变量）。',
  'Invalid provider: {provider}\nValid: {validProviders}':
    '无效提供者：{provider}\n可用：{validProviders}',
  'Switched to OpenAI provider.\nWarning: Missing env vars: {missing}\nConfigure them via /login or set manually.':
    '已切换到 OpenAI 提供者。\n警告：缺少环境变量：{missing}\n请通过 /login 配置，或手动设置。',
  'Switched to Grok provider.\nWarning: Missing env var: GROK_API_KEY (or XAI_API_KEY)\nConfigure it via settings.json env or set manually.':
    '已切换到 Grok 提供者。\n警告：缺少环境变量：GROK_API_KEY（或 XAI_API_KEY）\n请通过 settings.json env 配置，或手动设置。',
  'Switched to Gemini provider.\nWarning: Missing env var: GEMINI_API_KEY\nConfigure it via /login or set manually.':
    '已切换到 Gemini 提供者。\n警告：缺少环境变量：GEMINI_API_KEY\n请通过 /login 配置，或手动设置。',
  'API provider set to {provider}.': 'API 提供者已设置为 {provider}。',
  'API provider set to {provider} (via environment variable).':
    'API 提供者已设置为 {provider}（通过环境变量）。',
  'Current subagent provider: {provider}{source}':
    '当前子 agent 提供者：{provider}{source}',
  ' (from settings: {provider})': '（来自设置：{provider}）',
  'Subagent provider cleared. Subagents will now inherit the main provider.':
    '已清除子 agent 提供者。子 agent 现在将继承主提供者。',
  'Subagent provider "{provider}" is not supported. Subagents only support: {validProviders}':
    '不支持子 agent 提供者“{provider}”。子 agent 仅支持：{validProviders}',
  'Subagent provider set to {provider}.':
    '子 agent 提供者已设置为 {provider}。',

  // ── /lang command ──────────────────────────────────────────────
  // (Removed — language setting is now unified in /config's Language option)

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
  'Fork the current session into a new sub-agent':
    '将当前会话分支为新的子智能体',
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
  'Manage agent configurations': '管理智能体配置',
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
    '管理定时远程智能体（cron 样式触发器）',
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
  'Agents dialog dismissed': '智能体面板已关闭',
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
  'Select your preferred language:': '选择您偏好的语言：',
  'Enter your preferred response language:': '输入您偏好的回复语言：',
  'Custom input...': '自定义输入...',
  'Leave empty for default (English)': '留空则使用默认值（英语）',

  // ── ModelPicker ────────────────────────────────────────────────
  'Select mode': '选择模式',
  'Select model': '选择模型',
  'Choose a model for this and future sessions. Use \u2190 \u2192 to adjust effort, Space to toggle 1M context.':
    '为此会话及后续会话选择模型。使用 ← → 调整努力级别，空格键切换 1M 上下文。',
  'Currently using {model} for this session (set by plan mode). Selecting a model will undo this.':
    '当前会话正在使用 {model}（由计划模式设置）。选择模型将覆盖此设置。',
  'and {count} more\u2026': '还有 {count} 个…',
  '{level} effort': '{level} 级别',
  ' (default)': '（默认）',
  ' \u2190 \u2192 to adjust': ' ← → 调节',
  'Effort not supported': '不支持努力级别',
  ' for {model}': '（模型：{model}）',
  '1M context on': '1M 上下文 已开启',
  '1M context off': '1M 上下文 已关闭',
  ' \u00b7 Space to toggle': ' · 空格键切换',
  'Fast mode is ON and available with {model} only (/fast). Switching to other models turn off fast mode.':
    '快速模式已开启，仅适用于 {model}（/fast）。切换到其他模型将关闭快速模式。',
  'Use /fast to turn on Fast mode ({model} only).':
    '使用 /fast 开启快速模式（仅 {model}）。',
  'Current model': '当前模型',
  // ── EffortCallout ───────────────────────────────────────────────
  'Medium (recommended)': '中等（推荐）',
  High: '高',
  Low: '低',
  // ── ChatGPT Codex model descriptions ───────────────────────────
  'Frontier model for complex coding, research, and real-world work':
    '用于复杂编码、研究和实际工作的前沿模型',
  'Smarter, more precise responses for the most demanding reasoning tasks':
    '为最复杂的推理任务提供更智能、更精确的回答',
  'Strong model for everyday coding': '适合日常编码的强力模型',
  'Small, fast, and cost-efficient model for simpler coding tasks':
    '适合简单编码任务的小型、快速、高性价比模型',
  'Ultra-low-latency, lowest-cost model for classification, extraction, and high-volume subagents':
    '用于分类、提取和大规模子智能体的超低延迟、最低成本模型',
  'Coding-optimized model': '编码优化模型',
  'Ultra-fast coding model': '超快速编码模型',
  'Optimized for professional work and long-running agents':
    '为专业工作和长时间运行的智能体优化',
  // ── Claude model descriptions ──────────────────────────────────
  // Template versions with {pricing} / {billing} / {model} placeholders
  'Fable 5 · Best for everyday tasks{pricing}':
    'Fable 5 · 日常任务最佳选择{pricing}',
  'Fable 5 with 1M context{billing}{pricing}':
    'Fable 5（1M 上下文）{billing}{pricing}',
  'Sonnet 5 · Fast and capable{pricing}': 'Sonnet 5 · 快速且强大{pricing}',
  'Sonnet 5 with 1M context{billing}{pricing}':
    'Sonnet 5（1M 上下文）{billing}{pricing}',
  'Opus 4.8 · Most capable for complex work{pricing}':
    'Opus 4.8 · 处理复杂任务能力最强{pricing}',
  'Opus 4.8 with 1M context{pricing}': 'Opus 4.8（1M 上下文）{pricing}',
  'Opus 4.8 with 1M context{billing}{pricing}':
    'Opus 4.8（1M 上下文）{billing}{pricing}',
  'Opus 4.8 with 1M context · Most capable for complex work{pricing}':
    'Opus 4.8（1M 上下文）· 处理复杂任务能力最强{pricing}',
  'Opus 4.7 · Previous generation Opus{pricing}':
    'Opus 4.7 · 上一代 Opus{pricing}',
  'Opus 4.7 with 1M context{pricing}': 'Opus 4.7（1M 上下文）{pricing}',
  'Opus 4.6 · Previous generation Opus{pricing}':
    'Opus 4.6 · 上一代 Opus{pricing}',
  'Opus 4.6 with 1M context{pricing}': 'Opus 4.6（1M 上下文）{pricing}',
  'Sonnet 4.6 · Previous generation Sonnet · {pricing}':
    'Sonnet 4.6 · 上一代 Sonnet · {pricing}',
  'Sonnet 4.6 for long sessions · {pricing}':
    'Sonnet 4.6 适用于长时间会话 · {pricing}',
  'Sonnet 4.6 with 1M context{billing} · {pricing}':
    'Sonnet 4.6（1M 上下文）{billing} · {pricing}',
  'Haiku 4.5 · Fastest for quick answers{pricing}':
    'Haiku 4.5 · 最快速回答{pricing}',
  'Haiku 3.5 for simple tasks{pricing}': 'Haiku 3.5 适用于简单任务{pricing}',
  'Use the default model (currently {model}){pricing}':
    '使用默认模型（当前 {model}）{pricing}',
  // Non-template model descriptions
  'Fable 5 · Best for everyday tasks': 'Fable 5 · 日常任务最佳选择',
  'Fable 5 - best for everyday tasks. The recommended default model for most coding tasks':
    'Fable 5 - 日常任务最佳选择。推荐作为大多数编码任务的默认模型',
  'Fable 5 with 1M context': 'Fable 5（1M 上下文）',
  'Fable 5 with 1M context window - for long sessions with large codebases':
    'Fable 5（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Sonnet 5 · Fast and capable': 'Sonnet 5 · 快速且强大',
  'Sonnet 5 - fast and capable. Great for most coding tasks':
    'Sonnet 5 - 快速且强大。适合大多数编码任务',
  'Sonnet 5 with 1M context': 'Sonnet 5（1M 上下文）',
  'Sonnet 5 with 1M context window - for long sessions with large codebases':
    'Sonnet 5（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Opus 4.8 · Most capable for complex work': 'Opus 4.8 · 处理复杂任务能力最强',
  'Opus 4.8 - most capable for complex work': 'Opus 4.8 - 处理复杂任务能力最强',
  'Opus 4.8 with 1M context': 'Opus 4.8（1M 上下文）',
  'Opus 4.8 with 1M context - most capable for complex work':
    'Opus 4.8（1M 上下文）- 处理复杂任务能力最强',
  'Opus 4.8 with 1M context window - for long sessions with large codebases':
    'Opus 4.8（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Sonnet 4.6 · Previous generation Sonnet': 'Sonnet 4.6 · 上一代 Sonnet',
  'Sonnet 4.6 - previous generation Sonnet model':
    'Sonnet 4.6 - 上一代 Sonnet 模型',
  'Sonnet 4.6 with 1M context window - for long sessions with large codebases':
    'Sonnet 4.6（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Opus 4.7 · Previous generation Opus': 'Opus 4.7 · 上一代 Opus',
  'Opus 4.7 - previous generation Opus model': 'Opus 4.7 - 上一代 Opus 模型',
  'Opus 4.7 with 1M context': 'Opus 4.7（1M 上下文）',
  'Opus 4.7 with 1M context window - for long sessions with large codebases':
    'Opus 4.7（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Opus 4.6 · Previous generation Opus': 'Opus 4.6 · 上一代 Opus',
  'Opus 4.6 - previous generation Opus model': 'Opus 4.6 - 上一代 Opus 模型',
  'Opus 4.6 with 1M context': 'Opus 4.6（1M 上下文）',
  'Opus 4.6 with 1M context window - for long sessions with large codebases':
    'Opus 4.6（1M 上下文窗口）- 适用于大型代码库的长时间会话',
  'Haiku 4.5 · Fastest for quick answers': 'Haiku 4.5 · 最快速回答',
  'Haiku 4.5 - fastest for quick answers. Lower cost but less capable than Fable 5.':
    'Haiku 4.5 - 最快速回答。成本较低但能力不如 Fable 5。',
  'Haiku 3.5 for simple tasks': 'Haiku 3.5 适用于简单任务',
  'Haiku 3.5 - faster and lower cost, but less capable than Sonnet. Use for simple tasks.':
    'Haiku 3.5 - 更快且成本更低，但能力不如 Sonnet。适用于简单任务。',
  'Custom Sonnet model': '自定义 Sonnet 模型',
  'Custom Sonnet model (1M context)': '自定义 Sonnet 模型（1M 上下文）',
  'Custom Sonnet model with 1M context': '自定义 Sonnet 模型（1M 上下文）',
  'Custom Opus model': '自定义 Opus 模型',
  'Custom Opus model (1M context)': '自定义 Opus 模型（1M 上下文）',
  'Custom Opus model with 1M context': '自定义 Opus 模型（1M 上下文）',
  'Custom Haiku model': '自定义 Haiku 模型',
  'Custom model': '自定义模型',
  'Custom model ({model})': '自定义模型（{model}）',
  'Opus Plan Mode': 'Opus 计划模式',
  'Use Opus 4.8 in plan mode, Fable 5 otherwise':
    '计划模式使用 Opus 4.8，其他情况使用 Fable 5',
  'Default ChatGPT Codex model (currently {model})':
    '默认 ChatGPT Codex 模型（当前 {model}）',
  'Use the default ChatGPT Codex model (currently {model})':
    '使用默认 ChatGPT Codex 模型（当前 {model}）',
  'Default model (currently {model})': '默认模型（当前 {model}）',
  'Newer version available · select {alias} for {currentVersionName}':
    '有更新版本可用 · 选择 {alias} 以使用 {currentVersionName}',
  'Use the default model for Ants (currently {model})':
    '使用 Ant 默认模型（当前 {model}）',

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
  'Poor mode (save tokens)': '节省模式（节省词元）',
  'Verbose output': '详细输出',
  'Terminal progress bar': '终端进度条',
  'Show status in terminal tab': '在终端标签页显示状态',
  'Show built-in status line': '显示内置状态栏',
  'Show turn duration': '显示轮次耗时',
  'Respect .gitignore in file picker': '在文件选择器中遵循 .gitignore',
  'Search settings...': '搜索设置...',
  'Set {setting} to {value}': '已将{setting}设置为 {value}',
  'Enabled {setting}': '已启用{setting}',
  'Disabled {setting}': '已禁用{setting}',
  'Reset Remote Control to default': '已将远程控制重置为默认值',
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
  "Default (leader's model)": '默认（跟随主智能体模型）',
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
    '新创建队友的默认模型。主智能体可通过工具调用的模型参数覆盖。',
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
  'Primary rate limit': '主要速率限制',
  'Secondary rate limit': '次要速率限制',
  RPM: '请求/分钟',
  TPM: '词元/分钟',
  'Rate limit': '速率限制',
  '{label} ({mins}min)': '{label}（{mins} 分钟）',
  'Daily tokens': '每日词元',
  '{tokens} tokens used on {date}': '{date} 已使用 {tokens} 词元',
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
  // Cursor usage
  'Cursor Usage': 'Cursor 用量',
  'Included usage': '计划内用量',
  'Included API usage': '计划内 API 用量',
  'Included Auto usage': '计划内 Auto 用量',
  'On-demand usage': '按量付费用量',
  'Included in {plan}': '{plan} 计划内用量',
  Total: '总计',
  'Auto + Composer': 'Auto + Composer',
  '{auto}% Auto and {api}% API used': '已用 Auto {auto}%、API {api}%',
  'Plan includes at least {amount} of API usage':
    '计划内含至少 {amount} 的 API 用量',
  '{amount} bonus quota': '赠送额度 {amount}',
  'On-Demand': '按量付费',
  '{used} spent': '已花费 {used}',
  'No monthly limit': '无每月限额',
  'Monthly limit unknown': '每月限额未知',
  'No usage data available.': '暂无用量数据。',
  // OutputStylePicker
  'Preferred output style': '首选输出风格',
  'This changes how Claude Code communicates with you':
    '这将更改 Claude Code 与您的交流方式',
  'Loading output styles\u2026': '正在加载输出风格\u2026',

  // Output style names and descriptions
  Default: '默认',
  Explanatory: '解释型',
  Learning: '学习型',
  'Claude completes coding tasks efficiently and provides concise responses':
    'Claude 高效完成编码任务并提供简洁回复',
  'Claude explains its implementation choices and codebase patterns':
    'Claude 解释其实现选择和代码库模式',
  'Claude pauses and asks you to write small pieces of code for hands-on practice':
    'Claude 会暂停并邀请您编写小段代码进行动手练习',

  // ── Stats ──────────────────────────────────────────────────────
  'Last 7 days': '最近 7 天',
  'Last 30 days': '最近 30 天',
  'All time': '全部时间',

  // ── Logo / Startup banner ──────────────────────────────────────
  'Welcome back!': '欢迎回来！',
  'Welcome back, {username}!': '欢迎回来，{username}！',
  'Inherit from parent': '继承自父智能体',
  'Subagent:': '子智能体：',

  // ── Interrupted by user ─────────────────────────────────────────
  'Interrupted ': '已中断 ',
  '\u00b7 What should Claude do instead?': '· Claude 应该改做什么？',

  // ── Prompt placeholder ─────────────────────────────────────────
  'Try "{command}"': '试试 "{command}"',
  'Message @{name}': '向 @{name} 发送消息…',
  'Press up to edit queued messages': '按上箭头编辑队列消息',

  // ── Status line / mode indicator ───────────────────────────────
  '{mode} on': '{mode} 已开启',
  'setting up statusLine': '正在设置状态栏',
  'statusline skipped · restart to fix': '状态栏已跳过 · 重启以修复',

  // ── StatusLine Cache pill ──────────────────────────────────────
  ' Cache ': ' 缓存 ',
  ' Cache --% --:--': ' 缓存 --% --:--',
  now: '现在',

  // ── Background task status strings ─────────────────────────────
  'still running': '仍在运行',
  'still running in background': '仍在后台运行',
  'completed in background': '已在后台完成',

  // ── Package manager auto updater ───────────────────────────────
  'currentVersion: {version}': '当前版本：{version}',
  'your package manager update command': '您的包管理器更新命令',
  'Update available! Run: ': '有可用更新！运行：',

  // ── Footer shortcut action strings (first screen) ──────────────
  cycle: '切换',
  interrupt: '中断',
  'show tasks': '显示任务',
  'hide tasks': '隐藏任务',
  'show teammates': '显示队友',
  hide: '隐藏',
  manage: '管理',
  'stop agents': '停止智能体',
  'return to team lead': '返回主智能体',
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
  tokens: '词元',
  '{count} in background': '后台 {count} 个',
  Reconnecting: '重新连接中',
  'Reconnecting…': '重新连接中…',
  Disconnected: '已断开连接',

  // ── Spinner thinking state fragments ───────────────────────────
  'thinking{effort}': '思考中{effort}',
  'thought for {n}s': '思考了 {n} 秒',

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
  'Press {key} again to exit': '再按一次 {key} 退出',
  'Press {key} again to go back': '再按一次 {key} 返回',
  'Start a long-running background monitor': '启动长期运行的后台监控',
  'Starting monitor': '正在启动监控',
  'Monitoring: {description}': '正在监控：{description}',
  'Monitor command cannot be empty.': '监控命令不能为空。',
  'Monitor description cannot be empty.': '监控描述不能为空。',
  'Monitor: {description}': '监控：{description}',
  'Monitor started (task {taskId}). Output: {outputFile}':
    '监控已启动（任务 {taskId}）。输出：{outputFile}',
  'Claude wants to review: {title}': 'Claude 想要审查：{title}',
  'Claude wants to review an artifact': 'Claude 想要审查一个工件',
  'Untitled artifact': '未命名工件',
  'Review: "{title}" ({count} annotation(s))':
    '审查：“{title}”（{count} 条注释）',
  Untitled: '未命名',
  'Reviewed artifact: {title} ({count} annotations)':
    '已审查工件：{title}（{count} 条注释）',
  'Review complete: {count} annotation(s)': '审查完成：{count} 条注释',

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

  // ── coordinator mode session matching ──────────────────────────
  'Entered coordinator mode to match resumed session.':
    '已进入协调器模式以匹配已恢复的会话。',
  'Exited coordinator mode to match resumed session.':
    '已退出协调器模式以匹配已恢复的会话。',

  // ── coordinator command ─────────────────────────────────────────
  'Coordinator mode disabled — back to normal mode':
    '协调器模式已禁用 — 返回普通模式',
  'Coordinator mode enabled — use Agent(subagent_type: "worker") to dispatch tasks':
    '协调器模式已启用 — 使用 Agent(subagent_type: "worker") 来分派任务',
  coordinator: '协调器',
  '/coordinator to toggle': '/coordinator 切换',

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
    'Fork 子智能体功能未启用。设置 FEATURE_FORK_SUBAGENT=1 以启用。',
  'Fork is not available inside a forked worker. Complete your task directly using your tools.':
    'Fork 在已 Fork 的 worker 中不可用。请直接使用您的工具完成任务。',
  'Usage: /fork <directive>\nExample: /fork Fix the null check in validate.ts':
    '用法：/fork <指令>\n示例：/fork Fix the null check in validate.ts',
  'Cannot fork: no assistant response in conversation history.':
    '无法 fork：对话历史中没有助手回复。',
  'Forked subagent started with directive: "{directive}"':
    'Fork 子智能体已启动，指令："{directive}"',
  'Fork failed: {error}': 'Fork 失败：{error}',

  // ── goal command ────────────────────────────────────────────────
  'No active goal. Set one with `/goal <objective>`.':
    '没有活动目标。使用 `/goal <目标>` 设置。',
  'Goal: {objective}': '目标：{objective}',
  'Status: {status}': '状态：{status}',
  'Time: {elapsed}': '时间：{elapsed}',
  'Tokens: {tokens}': '词元：{tokens}',
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
  '· Tokens: ': '· 词元：',
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

  // ── Login dialog ──────────────────────────────────────────────────
  'Anthropic auth status:': 'Anthropic 认证状态：',
  Subscription: '订阅',
  plan: '套餐',
  'logged in': '已登录',
  'not logged in': '未登录',
  'Workspace API key': 'Workspace API 密钥',
  'not set': '未设置',
  'sk-ant-api03-* required': '需要 sk-ant-api03-*',
  'saved to settings': '已保存到设置',
  'from ANTHROPIC_API_KEY env': '来自 ANTHROPIC_API_KEY 环境变量',
  'To enable /vault /agents-platform /memory-stores:':
    '要启用 /vault /agents-platform /memory-stores：',
  'Press W to set now (saves to settings.json, no restart needed)':
    '按 W 立即设置（保存到 settings.json，无需重启）',
  '  — or —': '  — 或 —',
  '1. Open https://console.anthropic.com/settings/keys':
    '1. 打开 https://console.anthropic.com/settings/keys',
  '2. Create a key (sk-ant-api03-*)': '2. 创建密钥（sk-ant-api03-*）',
  '3. Set ANTHROPIC_API_KEY=<key> and restart':
    '3. 设置 ANTHROPIC_API_KEY=<key> 并重启',
  'Press W to enter workspace API key (saves to settings, no restart needed)':
    '按 W 输入 Workspace API 密钥（保存到设置，无需重启）',
  'Press W to replace workspace API key · Press D to remove it':
    '按 W 替换 Workspace API 密钥 · 按 D 移除',
  'Workspace API key from ANTHROPIC_API_KEY env. Press W to override with a settings-saved key.':
    '当前 Workspace API 密钥来自 ANTHROPIC_API_KEY 环境变量。按 W 可用保存到设置的密钥覆盖。',
  'Remove the saved workspace API key?': '移除已保存的 Workspace API 密钥？',
  '(settings.json only — env var is unaffected)':
    '（仅影响 settings.json，不影响环境变量）',
  'Removing…': '正在移除…',
  'Press Y to confirm, N to cancel': '按 Y 确认，按 N 取消',
  'Get your key: ': '获取密钥：',
  'Key format: ': '密钥格式：',
  'API Key: ': 'API 密钥：',
  'Enter to confirm · Esc to go back': '回车确认 · Esc 返回',
  'Enter to continue · Esc to go back': '回车继续 · Esc 返回',
  'Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.':
    'Claude Code 可通过 Claude 订阅使用，也可通过 Console 账户按 API 用量计费。',
  'Select login method:': '选择登录方式：',
  'Anthropic Compatible · ': 'Anthropic 兼容 · ',
  'Configure your own API endpoint': '配置你自己的 API 端点',
  'OpenAI Compatible · ': 'OpenAI 兼容 · ',
  'Ollama, DeepSeek, vLLM, One API, etc.': 'Ollama、DeepSeek、vLLM、One API 等',
  'China LLM Providers · ': '国内大模型提供商 · ',
  'DeepSeek, Zhipu GLM, Qwen, MiMo': 'DeepSeek、智谱 GLM、通义千问、小米 MiMo',
  'ChatGPT account with subscription · ': 'ChatGPT 订阅账号 · ',
  'Plus, Pro, Business, Edu, or Enterprise':
    'Plus、Pro、Business、Edu 或 Enterprise',
  'Gemini API · ': 'Gemini API · ',
  'Google Gemini native REST/SSE': 'Google Gemini 原生 REST/SSE',
  'Claude account with subscription · ': 'Claude 订阅账号 · ',
  'Pro, Max, Team, or Enterprise': 'Pro、Max、Team 或 Enterprise',
  'Anthropic Console account · ': 'Anthropic Console 账号 · ',
  'API usage billing': 'API 用量计费',
  '3rd-party platform · ': '第三方平台 · ',
  'Amazon Bedrock, Microsoft Foundry, or Vertex AI':
    'Amazon Bedrock、Microsoft Foundry 或 Vertex AI',
  'Invalid base URL: please enter a full URL including protocol (e.g., https://api.example.com)':
    'Base URL 无效：请输入包含协议的完整 URL（例如 https://api.example.com）',
  'Base URL ': 'Base URL ',
  'API Key': 'API 密钥',
  'API Key  ': 'API 密钥  ',
  'Haiku    ': 'Haiku    ',
  'Sonnet   ': 'Sonnet   ',
  'Opus     ': 'Opus     ',
  'Anthropic Compatible Setup': 'Anthropic 兼容配置',
  'OpenAI Compatible API Setup': 'OpenAI 兼容 API 配置',
  'Configure an OpenAI Chat Completions compatible endpoint (e.g. Ollama, DeepSeek, vLLM).':
    '配置兼容 OpenAI Chat Completions 的端点（例如 Ollama、DeepSeek、vLLM）。',
  'ChatGPT Account Setup': 'ChatGPT 账号配置',
  'Requesting sign-in code…': '正在请求登录代码…',
  'Open this link and sign in with your ChatGPT account:':
    '打开此链接并使用你的 ChatGPT 账号登录：',
  'Enter code:': '输入代码：',
  'Waiting for ChatGPT authorization…': '正在等待 ChatGPT 授权…',
  'Esc to go back. Device codes expire after 15 minutes.':
    'Esc 返回。设备代码将在 15 分钟后过期。',
  'Gemini API Setup': 'Gemini API 配置',
  'Gemini setup requires Haiku, Sonnet, and Opus model names.':
    'Gemini 配置需要填写 Haiku、Sonnet 和 Opus 模型名称。',
  "Configure a Gemini Generate Content compatible endpoint. Base URL is optional and defaults to Google's v1beta API.":
    '配置兼容 Gemini Generate Content 的端点。Base URL 可选，默认使用 Google 的 v1beta API。',
  'Select China LLM Provider': '选择国内大模型提供商',
  'Direct connection, no proxy needed. All providers are OpenAI-compatible.':
    '可直连，无需代理。所有提供商均兼容 OpenAI。',
  '— Select Access Mode': '— 选择接入方式',
  ' Pay-as-you-go (API)': ' 按量付费（API）',
  ' Top up freely, pay per use': ' 自由充值，按量使用',
  ' Coding Plan': ' 编程套餐',
  ' Fixed monthly fee, high usage': ' 固定月费，高用量',
  'No plan? Select "Pay-as-you-go"': '没有套餐？请选择“按量付费”',
  ' · GLM-4.7-Flash is free forever': ' · GLM-4.7-Flash 永久免费',
  '— Select Model': '— 选择模型',
  Free: '免费',
  ' · enter model name manually': ' · 手动输入模型名称',
  'Please enter a model name': '请输入模型名称',
  'Please enter an API key': '请输入 API 密钥',
  'Enter any model ID supported by this provider. Browse models: ':
    '输入此提供商支持的任意模型 ID。浏览模型：',
  'Use your Coding Plan credential here': '在此使用你的编程套餐凭据',
  'Model name: ': '模型名称：',
  'Matching models:': '匹配的模型：',
  'Known models:': '已知模型：',
  '— Custom Model': '— 自定义模型',

  // Terminal setup tips (shown as spinner hints)
  'Run /terminal-setup to enable convenient terminal integration like Option + Enter for new line and more':
    '运行 /terminal-setup 启用便捷终端集成，如 Option+Enter 换行等',
  'Run /terminal-setup to enable convenient terminal integration like Shift + Enter for new line and more':
    '运行 /terminal-setup 启用便捷终端集成，如 Shift+Enter 换行等',
  'Press Option+Enter to send a multi-line message':
    '按 Option+Enter 发送多行消息',
  'Press Shift+Enter to send a multi-line message':
    '按 Shift+Enter 发送多行消息',
  'Run /terminal-setup to enable Option+Enter for new lines':
    '运行 /terminal-setup 启用 Option+Enter 换行',
  'Run /terminal-setup to enable Shift+Enter for new lines':
    '运行 /terminal-setup 启用 Shift+Enter 换行',

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
  'List configured agents': '列出已配置的智能体',
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
  'Failed to resume agent: {error}': '恢复智能体失败：{error}',

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
    '研究并规划大规模更改，然后在 5\u201330 个隔离的 worktree 智能体中并行执行，每个智能体创建一个 PR',
  'Teach the agent when and how to use the artifact tool: what content belongs in artifacts, when to upload/update, and the SearchExtraTools + ExecuteExtraTool invocation flow for the deferred artifact tool.':
    '教智能体何时以及如何使用 artifact 工具：哪些内容属于 artifact、何时上传/更新、以及延迟 artifact 工具的 SearchExtraTools + ExecuteExtraTool 调用流程',
  '[ANT-ONLY] Investigate frozen/stuck/slow Claude Code sessions on this machine and post a diagnostic report to #claude-code-feedback.':
    '【内部】调查此机器上冻结/卡住/缓慢的 Claude Code 会话并向 #claude-code-feedback 发布诊断报告',
  'Enable debug logging for this session and help diagnose issues':
    '为此会话启用调试日志并帮助诊断问题',
  'Debug your current Claude Code session by reading the session debug log. Includes all event logging':
    '通过读取会话调试日志调试当前 Claude Code 会话。包含所有事件日志',
  'Generate filler text for long context testing. Specify token count as argument (e.g., /lorem-ipsum 50000). Outputs approximately the requested number of tokens. Ant-only.':
    '生成长上下文测试的填充文本。指定 token 数量作为参数（例如 /lorem-ipsum 50000）。输出大约请求数量的 token。仅供内部使用。',
  'Enter multi-agent workflow orchestration mode: when to use the Workflow tool, script primitives, quality patterns, determinism constraints, resume/budget, and files/commands.':
    '进入多智能体工作流编排模式：何时使用 Workflow 工具、脚本原语、质量模式、确定性约束、恢复/预算以及文件/命令',
  'Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension).':
    '自动化 Chrome 浏览器与网页交互 — 点击元素、填写表单、截屏、读取控制台日志和导航网站。在现有 Chrome 会话的新标签页中打开页面。执行前需要站点级权限（在扩展中配置）',
  'Create, update, list, or run scheduled remote agents (triggers) that execute on a cron schedule.':
    '创建、更新、列出或运行按 cron 计划执行的定时远程智能体（触发器）',
  "Capture this session's repeatable process into a skill. Call at end of the process you want to capture with an optional description.":
    '将本会话的可重复流程捕获为技能。在要捕获的流程结束时调用，可附带描述',
  'Build apps with the Claude API or Anthropic SDK.\nTRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\nDO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.':
    '使用 Claude API 或 Anthropic SDK 构建应用。\n触发条件：代码导入 anthropic/@anthropic-ai-sdk/claude_agent_sdk，或用户要求使用 Claude API、Anthropic SDK 或 Agent SDK。\n不触发：代码导入 openai/其他 AI SDK、通用编程或 ML/数据科学任务。',

  // ── Agent / Task status UI ───────────────────────────────────────
  'Backgrounded agent': '后台智能体',
  'Remote agent launched': '远程智能体已启动',
  'Done ({result})': '完成（{result}）',
  '1 tool use': '1 次工具调用',
  '{count} tool uses': '{count} 次工具调用',
  '{count} tokens': '{count} 词元',
  'Agent "{description}" completed': '智能体 "{description}" 已完成',
  'Agent "{description}" failed: {error}':
    '智能体 "{description}" 失败：{error}',
  'Agent "{description}" was stopped': '智能体 "{description}" 已停止',
  done: '完成',
  error: '错误',
  stopped: '已停止',
  completed: '已完成',
  failed: '失败',
  killed: '已停止',
  pending: '等待中',
  ', unread': '，未读',
  'setting up': '设置中',
  stopping: '正在停止',
  'awaiting approval': '等待审批',
  'No tasks currently running': '当前无任务运行',
  'Viewing teammate': '查看队友',
  'Viewing leader': '查看领导者',
  'Background tasks': '后台任务',
  'active agent': '活跃智能体',
  'active agents': '活跃智能体',
  Agents: '智能体',
  Shells: 'Shell',
  Monitors: '监控',
  'Async agent': '异步智能体',
  Progress: '进度',
  Prompt: '提示',
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
  'background agents launched': '个后台智能体已启动',
  '{type} agents': '{type} 智能体',
  finished: '已完成',
  'Initializing…': '初始化中…',
  'Running in the background': '在后台运行中',
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
  continue: '继续',
  add: '添加',
  expand: '展开',
  view: '查看',
  navigate: '导航',
  'go back': '返回',
  stop: '停止',
  foreground: '前台',
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
  'stop all agents': '停止所有智能体',
  'manage background agents': '管理后台智能体',
  'more tool': '更多工具',

  // ── BackgroundAgentSelector hint strings ────────────────────────
  'up/down to select · Enter to view': '↑/↓ 选择 · Enter 查看',
  'shift+downarrow to manage background agents': 'shift+↓ 管理后台智能体',
  'shift+downarrow to manage · x to stop': 'shift+↓ 管理 · x 停止',
  'shift+downarrow to manage · x to clear': 'shift+↓ 管理 · x 清除',

  // ── Task pill labels ────────────────────────────────────────────
  '{n} shell': '{n} 个 shell',
  '{n} shells': '{n} 个 shell',
  '{n} monitor': '{n} 个监控',
  '{n} monitors': '{n} 个监控',
  '{n} team': '{n} 个团队',
  '{n} teams': '{n} 个团队',
  '{n} local agent': '{n} 个本地智能体',
  '{n} local agents': '{n} 个本地智能体',
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

  // ── Dialog / misc ───────────────────────────────────────────────
  'Tool Recommendation': '工具推荐',
  'Select GitHub workflows to install': '选择要安装的 GitHub workflow',
  "We'll create a workflow file in your repository for each one you select.":
    '将为您选择的每一项在仓库中创建一个 workflow 文件。',
  '@Claude Code - Tag @claude in issues and PR comments':
    '@Claude Code - 在 issue 和 PR 评论中标记 @claude',
  'Claude Code Review - Automated code review on new PRs':
    'Claude Code Review - 对新 PR 进行自动代码审查',
  'More workflow examples (issue triage, CI fixes, etc.) at:':
    '更多 workflow 示例（issue 分流、CI 修复等）见：',
  Space: '空格',
  'Worktree removed (no changes)': 'Worktree 已移除（无更改）',
  'Worktree cleanup failed, exiting anyway': 'Worktree 清理失败，仍将退出',
  'No active worktree session found': '未找到活跃的 worktree 会话',
  'Worktree kept. Your work is saved at {path} on branch {branch}. Reattach to tmux session with: {command}':
    'Worktree 已保留。您的工作已保存在 {path} 的 {branch} 分支上。可使用以下命令重新连接 tmux 会话：{command}',
  'Worktree kept. Your work is saved at {path} on branch {branch}':
    'Worktree 已保留。您的工作已保存在 {path} 的 {branch} 分支上',
  'Worktree kept at {path} on branch {branch}. Tmux session terminated.':
    'Worktree 已保留在 {path} 的 {branch} 分支上。Tmux 会话已终止。',
  ' Tmux session terminated.': ' Tmux 会话已终止。',
  'Worktree removed. {count} {commitNoun} and uncommitted changes were discarded.{tmuxNote}':
    'Worktree 已移除。已丢弃 {count} 个{commitNoun}和未提交的更改。{tmuxNote}',
  'Worktree removed. {count} {commitNoun} on {branch} {verb} discarded.{tmuxNote}':
    'Worktree 已移除。已丢弃 {branch} 上的 {count} 个{commitNoun}。{tmuxNote}',
  'Worktree removed. Uncommitted changes were discarded.{tmuxNote}':
    'Worktree 已移除。未提交的更改已丢弃。{tmuxNote}',
  'Worktree removed.{tmuxNote}': 'Worktree 已移除。{tmuxNote}',
  commit: '提交',
  commits: '提交',
  was: '已被',
  were: '已被',
  file: '文件',
  files: '文件',
  'Keeping worktree…': '正在保留 worktree…',
  'Removing worktree…': '正在移除 worktree…',
  'You have {fileCount} uncommitted {fileNoun} and {commitCount} {commitNoun} on {branch}. All will be lost if you remove.':
    '您在 {branch} 上有 {fileCount} 个未提交{fileNoun}和 {commitCount} 个{commitNoun}。如果移除，所有内容都将丢失。',
  'You have {count} uncommitted {fileNoun}. These will be lost if you remove the worktree.':
    '您有 {count} 个未提交{fileNoun}。如果移除 worktree，这些内容将丢失。',
  'You have {count} {commitNoun} on {branch}. The branch will be deleted if you remove the worktree.':
    '您在 {branch} 上有 {count} 个{commitNoun}。如果移除 worktree，该分支将被删除。',
  'You are working in a worktree. Keep it to continue working there, or remove it to clean up.':
    '您正在 worktree 中工作。保留它可继续在其中工作，或移除它以完成清理。',
  'All changes and commits will be lost.': '所有更改和提交都将丢失。',
  'Clean up the worktree directory.': '清理 worktree 目录。',
  'Keep worktree and tmux session': '保留 worktree 和 tmux 会话',
  'Stays at {path}. Reattach with: {command}':
    '保留在 {path}。使用以下命令重新连接：{command}',
  'Keep worktree, kill tmux session': '保留 worktree，终止 tmux 会话',
  'Keeps worktree at {path}, terminates tmux session.':
    '将 worktree 保留在 {path}，并终止 tmux 会话。',
  'Remove worktree and tmux session': '移除 worktree 和 tmux 会话',
  'Keep worktree': '保留 worktree',
  'Stays at {path}': '保留在 {path}',
  'Remove worktree': '移除 worktree',
  'Exiting worktree session': '正在退出 worktree 会话',
  'Enter to confirm · Esc to cancel': '回车确认 · Esc 取消',
  'Feedback / bug report cancelled': '反馈/错误报告已取消',
  'Feedback cancelled': '反馈已取消',
  'Export cancelled': '导出已取消',

  // ── API Error prefix ────────────────────────────────────────────
  'API Error': 'API 错误',

  // ── Bundled skill descriptions (model-invocable, user-visible in /help) ─
  'Use when the user wants to customize keyboard shortcuts, rebind keys, add chord bindings, or modify ~/.claude/keybindings.json. Examples: "rebind ctrl+s", "add a chord shortcut", "change the submit key", "customize keybindings".':
    '用于用户想要自定义键盘快捷键、重新绑定按键、添加组合快捷键或修改 ~/.claude/keybindings.json 时。例如："rebind ctrl+s"、"add a chord shortcut"、"change the submit key"、"customize keybindings"。',
  'Verify a code change does what it should by running the app.':
    '通过运行应用验证代码改动是否符合预期。',
  'Submit feedback about Claude Code': '提交关于 Claude Code 的反馈',
  'Restore the code and/or conversation to a previous point':
    '将代码和/或对话恢复到之前的某个时间点',
  'List HTML artifacts uploaded to cloud-artifacts in this session':
    '列出本会话中上传到 cloud-artifacts 的 HTML 工件',
  'Manage credential vault': '管理凭据保险库',
  'Manage local credential vault': '管理本地凭据保险库',
  'Manage local memory stores for notes and context. Stored in ~/.claude/local-memory/ \u2014 no API key required.':
    '管理本地记忆存储（用于笔记和上下文）。存储在 ~/.claude/local-memory/ \u2014 无需 API 密钥。',
  'Security review of the current project': '对当前项目进行安全审查',
  'Toggle sandboxing behavior for this session': '切换本会话的沙箱行为',

  // ── Sandbox dynamic status fragments ───────────────────────────
  'sandbox disabled': '沙箱已禁用',
  'sandbox enabled': '沙箱已启用',
  'sandbox enabled (auto-allow)': '沙箱已启用（自动允许）',
  ', fallback allowed': '，允许降级',
  ' (managed)': '（受管控）',
  '(⏎ to configure)': '（⏎ 配置）',

  // ── Remote (CCR) command descriptions ──────────────────────────
  '~10–30 min · Claude Code on the web drafts an advanced plan you can edit and approve. See https://code.claude.com/docs/en/claude-code-on-the-web':
    '约 10–30 分钟 · Claude Code 网页版起草高级计划，您可以编辑和批准。详见 https://code.claude.com/docs/en/claude-code-on-the-web',
  '~10–20 min · Finds and verifies bugs in your branch. Runs in Claude Code on the web. See https://code.claude.com/docs/en/claude-code-on-the-web':
    '约 10–20 分钟 · 查找并验证分支中的错误。在 Claude Code 网页版中运行。详见 https://code.claude.com/docs/en/claude-code-on-the-web',

  'Manage memory stores': '管理记忆存储',
  'Manage Claude Code plugins and marketplaces': '管理 Claude Code 插件和市场',
  'Manage skill store': '管理技能商店',

  // ── Source suffix labels (used in formatDescriptionWithSource) ──
  '(bundled)': '（内置包）',
  '(plugin)': '（插件）',
  '(workflow)': '（工作流）',
  '(plugin: local)': '（插件：本地）',
  '(project)': '（项目）',
  '(user)': '（用户）',

  // ── Additional command descriptions for i18n completeness ──
  'Manage remote secret vaults and credentials for cloud agents. Requires Claude Pro/Max/Team subscription.':
    '管理云端凭据保险库和云智能体凭据。需要 Claude Pro/Max/Team 订阅。',
  'Manage local encrypted secrets. Stored in OS keychain or encrypted file fallback \u2014 no API key required.':
    '管理本地加密凭据。存储在操作系统密钥链或加密文件回退中 \u2014 无需 API 密钥。',
  'Manage remote memory stores (cross-device memory persistence). Requires Claude Pro/Max/Team subscription.':
    '管理远程记忆存储（跨设备记忆持久化）。需要 Claude Pro/Max/Team 订阅。',
  'Browse and install remote skills from the Anthropic skill marketplace. Requires Claude Pro/Max/Team subscription.':
    '浏览并安装来自 Anthropic 技能市场的远程技能。需要 Claude Pro/Max/Team 订阅。',

  // ── Remaining command descriptions (systematic scan) ─────────
  'Inspect automatic autonomy runs recorded for proactive ticks and scheduled tasks':
    '查看为主动 tick 和定时任务记录的自动自主运行',
  'Manage prompt-cache breaking. Open actions or run: once, status, always, off':
    '管理提示缓存中断。打开操作面板或直接运行：once、status、always、off',
  'Ask a quick side question without interrupting the main conversation':
    '在不中断主对话的情况下快速旁路提问',
  'Claim main role for this machine (overrides current main machine)':
    '声明此机器的主角色（覆盖当前主机）',
  'Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]':
    '清除对话历史但在上下文中保留摘要。可选：/compact [摘要说明]',
  'Show the last N tool call pairs (use/result) from the session log':
    '显示会话日志中最近 N 对工具调用（使用/结果）',
  'Set or view a persistent goal that drives auto-continuation across turns':
    '设置或查看推动跨轮次自动继续的持久目标',
  'Create a GitHub issue via gh CLI. Flags: --label <label>, --assignee <user>':
    '通过 gh CLI 创建 GitHub issue。参数：--label <标签>、--assignee <用户>',
  'Sign in with your Anthropic account': '使用您的 Anthropic 账户登录',
  'Switch Anthropic accounts': '切换 Anthropic 账户',
  'Switch interaction mode (default, gentle, sharp, workhorse, token-saver, super-ai)':
    '切换交互模式（default、gentle、sharp、workhorse、token-saver、super-ai）',
  'Capture a performance + token-usage snapshot. Flags: --format=json|csv|md (default md)':
    '捕获性能和词元用量快照。参数：--format=json|csv|md（默认 md）',
  'Toggle poor mode \u2014 disable extract_memories and prompt_suggestion to save tokens':
    '切换穷鬼模式 \u2014 禁用 extract_memories 和 prompt_suggestion 以节省词元',
  'Switch API provider (anthropic/openai/gemini/grok/bedrock/vertex/foundry)':
    '切换 API 提供商（anthropic/openai/gemini/grok/bedrock/vertex/foundry）',
  'Switch or check the subagent API provider (anthropic/openai/gemini/grok/unset)':
    '切换或查看子智能体 API 提供商（anthropic/openai/gemini/grok/unset）',
  'Manage scheduled remote agent triggers (cloud cron). Requires Claude Pro/Max/Team subscription.':
    '管理定时远程智能体触发器（云端 cron）。需要 Claude Pro/Max/Team 订阅。',
  'Show Claude Code status including version, model, account, API connectivity, and tool statuses':
    '显示 Claude Code 状态，包括版本、模型、账户、API 连接和工具状态',
  'Manage flicker-free TUI mode. Open actions or run: status, on, off, toggle':
    '管理无闪烁 TUI 模式。打开操作面板或直接运行：status、on、off、toggle',
  'Toggle flicker-free TUI mode (alternate screen buffer). Subcommands: on, off, status':
    '切换无闪烁 TUI 模式（交替屏幕缓冲）。子命令：on、off、status',
  'Upload the current session log to GitHub Gist. Flags: --public, --private (default), --mask-secrets, --summary-only, --allow-public-fallback':
    '将当前会话日志上传到 GitHub Gist。参数：--public、--private（默认）、--mask-secrets、--summary-only、--allow-public-fallback',
  'Complete a security review of the pending changes on the current branch':
    '对当前分支的待处理更改完成安全审查',
  'Setup Claude Code on the web (requires connecting your GitHub account)':
    '在网页上设置 Claude Code（需要连接您的 GitHub 账户）',
  'Create verifier skill(s) for automated verification of code changes':
    '创建用于自动验证代码更改的验证器技能',
  'Start a persistent Remote Control server (daemon) that accepts multiple sessions':
    '启动持久远程控制服务器（守护进程），接受多个会话',
  'Force the next (or all) API call(s) to miss prompt cache. Scopes: once, status, always, off':
    '强制下一次（或所有）API 调用跳过提示缓存。范围：once、status、always、off',

  // ── Dynamic descriptions (get description() accessor) ─────────
  'Toggle fast mode (Opus 4.7 only)': '切换快速模式（仅 Opus 4.7）',
  'Enable Option+Enter key binding for newlines and visual bell':
    '启用 Option+Enter 换行和视觉提示音快捷键',
  'Install Shift+Enter key binding for newlines': '安装 Shift+Enter 换行快捷键',

  // ── Remaining bundled skill descriptions ──────────────────────
  'Find flaky tests and propose fixes': '查找不稳定的测试并提出修复方案',
  'Review changed files across dimensions, verify each finding':
    '跨维度审查更改的文件，验证每个发现',

  // ── Built-in plugin skill descriptions ───────────────────────
  'Set up Claude GitHub Actions for a repository':
    '为仓库设置 Claude GitHub Actions',

  // ── SendMessageTool messages ─────────────────────────────────
  'Message queued for delivery to {to} at its next tool round.':
    '消息已加入队列，将在 {to} 的下一个工具轮次中送达。',
  'Agent "{to}" was stopped ({status}); resumed it in the background with your message. You\'ll be notified when it finishes. Output: {output}':
    '智能体 "{to}" 已停止（{status}）；已在后台用您的消息恢复。完成后您将收到通知。输出：{output}',
  'Agent "{to}" is stopped ({status}) and could not be resumed: {error}':
    '智能体 "{to}" 已停止（{status}），无法恢复：{error}',
  'Agent "{to}" had no active task; resumed from transcript in the background with your message. You\'ll be notified when it finishes. Output: {output}':
    '智能体 "{to}" 无活动任务；已在后台从记录中用您的消息恢复。完成后您将收到通知。输出：{output}',
  'Agent "{to}" is registered but has no transcript to resume. It may have been cleaned up. ({error})':
    '智能体 "{to}" 已注册但无记录可恢复。可能已被清理。（{error}）',

  // ── CoordinatorAgentStatus ───────────────────────────────────
  'x to stop': 'x 停止',
  'x to clear': 'x 清除',
  '{n} queued': '{n} 个排队',

  // ── BackgroundTasksDialog section headers ────────────────────
  'Remote agents': '远程智能体',
  'Local agents': '本地智能体',
  Workflows: '工作流',
  'No agents found': '未找到智能体',

  // ── AgentsList empty state ───────────────────────────────────
  'No agents found. Create specialized subagents that Claude can delegate to.':
    '未找到智能体。创建专门化子智能体，Claude 可以委派任务。',
  'Each subagent has its own context window, custom system prompt, and specific tools.':
    '每个子智能体拥有独立的上下文窗口、自定义系统提示和特定工具。',
  'Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech Lead, or UX Reviewer.':
    '尝试创建：代码审查员、代码简化员、安全审查员、技术主管或 UX 审查员。',
  'Built-in agents': '内置智能体',
  '(always available)': '（始终可用）',
  'Built-in agents are provided by default and cannot be modified.':
    '内置智能体默认提供，不可修改。',

  // ── agents CLI handler ───────────────────────────────────────
  '{n} active agents': '{n} 个活跃智能体',

  // ── Coordinator agent kill confirmation ──────────────────────
  'All background agents stopped': '所有后台智能体已停止',

  // ── useCancelRequest notifications ───────────────────────────
  'No background agents running': '没有后台智能体在运行',
  'Press {shortcut} again to stop background agents':
    '再次按 {shortcut} 停止后台智能体',
  'Background agent "{description}" was stopped by the user.':
    '后台智能体 "{description}" 已被用户停止。',
  '{n} background agents were stopped by the user: {descriptions}':
    '{n} 个后台智能体已被用户停止：{descriptions}',

  // ── Pill label ultraplan ─────────────────────────────────────
  'ultraplan ready': 'ultraplan 就绪',
  'ultraplan needs your input': 'ultraplan 需要您的输入',

  // ── Tips: agent-related tip content ──────────────────────────
  'Use /agents to optimize specific tasks. Eg. Software Architect, Code Writer, Code Reviewer':
    '使用 /agents 优化特定任务。例如：软件架构师、代码编写者、代码审查者',
  'Use --agent <agent_name> to directly start a conversation with a subagent':
    '使用 --agent <智能体名称> 直接开始与子智能体的对话',

  // ── Tips: subagent-fanout-nudge ──────────────────────────────
  '"fan out subagents"': '"派出子智能体"',
  'use subagents': '使用子智能体',
  'Say {blue_verb} and Claude sends a team. Each one digs deep so nothing gets missed.':
    '说{blue_verb}，Claude 会派遣团队，每个深入挖掘，不遗漏任何内容。',
  'For big tasks, tell Claude to {blue_verb}. They work in parallel and keep your main thread clean.':
    '大型任务让 Claude {blue_verb}。它们并行工作，保持主线程干净。',

  // ── Tips: all spinner tips (systematic localization) ─────────
  'Start with small features or bug fixes, tell Claude to propose a plan, and verify its suggested edits':
    '从小功能或 bug 修复开始，让 Claude 提出计划并验证其建议的编辑',
  'Use Plan Mode to prepare for a complex request before making changes. Press {shortcut} twice to enable.':
    '进行复杂请求前使用计划模式做好准备。按 {shortcut} 两次启用。',
  'Use /config to change your default permission mode (including Plan Mode)':
    '使用 /config 更改默认权限模式（包括计划模式）',
  'Use git worktrees to run multiple Claude sessions in parallel.':
    '使用 git worktrees 并行运行多个 Claude 会话。',
  'Running multiple Claude sessions? Use /color and /rename to tell them apart at a glance.':
    '运行多个 Claude 会话？使用 /color 和 /rename 一眼区分它们。',
  'Use /memory to view and manage Claude memory':
    '使用 /memory 查看和管理 Claude 记忆',
  'Use /theme to change the color theme': '使用 /theme 更改颜色主题',
  'Try setting environment variable COLORTERM=truecolor for richer colors':
    '尝试设置环境变量 COLORTERM=truecolor 以获得更丰富的颜色',
  'Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 to enable the PowerShell tool (preview)':
    '设置 CLAUDE_CODE_USE_POWERSHELL_TOOL=1 启用 PowerShell 工具（预览）',
  'Use /statusline to set up a custom status line that will display beneath the input box':
    '使用 /statusline 设置在输入框下方显示的自定义状态行',
  'Hit Enter to queue up additional messages while Claude is working.':
    'Claude 工作时按 Enter 可排队发送额外消息。',
  'Send messages to Claude while it works to steer Claude in real-time':
    '在 Claude 工作时发送消息，实时引导 Claude',
  'Ask Claude to create a todo list when working on complex tasks to track progress and remain on track':
    '处理复杂任务时让 Claude 创建待办列表以跟踪进度并保持方向',
  'Open the Command Palette (Cmd+Shift+P) and run "Shell Command: Install \'{terminal}\' command in PATH" to enable IDE integration':
    '打开命令面板（Cmd+Shift+P），运行 "Shell Command: Install \'{terminal}\' command in PATH" 以启用 IDE 集成',
  'Connect Claude to your IDE · /ide': '将 Claude 连接到您的 IDE · /ide',
  'Run /install-github-app to tag @claude right from your Github issues and PRs':
    '运行 /install-github-app 直接在 GitHub issues 和 PR 中 @claude',
  'Run /install-slack-app to use Claude in Slack':
    '运行 /install-slack-app 在 Slack 中使用 Claude',
  'Use /permissions to pre-approve and pre-deny bash, edit, and MCP tools':
    '使用 /permissions 预设 bash、编辑和 MCP 工具的批准/拒绝规则',
  'Did you know you can drag and drop image files into your terminal?':
    '您知道可以直接将图片文件拖放到终端中吗？',
  'Paste images into Claude Code using control+v (not cmd+v!)':
    '使用 control+v（不是 cmd+v！）将图片粘贴到 Claude Code',
  'Double-tap esc to rewind the conversation to a previous point in time':
    '双击 Esc 将会话回退到之前的某个时间点',
  'Double-tap esc to rewind the code and/or conversation to a previous point in time':
    '双击 Esc 将代码和/或会话回退到之前的某个时间点',
  'Run claude --continue or claude --resume to resume a conversation':
    '运行 claude --continue 或 claude --resume 恢复对话',
  'Name your conversations with /rename to find them easily in /resume later':
    '使用 /rename 给对话命名，方便之后在 /resume 中查找',
  'Create skills by adding .md files to .claude/skills/ in your project or ~/.claude/skills/ for skills that work in any project':
    '在项目的 .claude/skills/ 或 ~/.claude/skills/ 中添加 .md 文件创建技能，后者可在任意项目中使用',
  'Hit {shortcut} to cycle between default, accept edits, plan, auto, and bypass modes':
    '按 {shortcut} 在默认、接受编辑、计划、自动和绕过模式之间切换',
  'Use {shortcut} to paste images from your clipboard':
    '使用 {shortcut} 从剪贴板粘贴图片',
  'Run Claude Code locally or remotely using the Claude desktop app: clau.de/desktop':
    '使用 Claude 桌面应用在本地或远程运行 Claude Code：clau.de/desktop',
  'Continue your session in Claude Code Desktop with {desktop_cmd}':
    '使用 {desktop_cmd} 在 Claude Code Desktop 中继续会话',
  'Run tasks in the cloud while you keep coding locally · clau.de/web':
    '在云端运行任务，同时在本地继续编码 · clau.de/web',
  '/mobile to use Claude Code from the Claude app on your phone':
    '/mobile 通过手机上的 Claude 应用使用 Claude Code',
  'Your default model setting is Opus Plan Mode. Press {shortcut} twice to activate Plan Mode and plan with Claude Opus.':
    '您的默认模型设置为 Opus Plan Mode。按 {shortcut} 两次激活计划模式，使用 Claude Opus 进行规划。',
  'Working with HTML/CSS? Install the frontend-design plugin:\n{install_cmd}':
    '在开发 HTML/CSS？安装 frontend-design 插件：\n{install_cmd}',
  'Working with Vercel? Install the vercel plugin:\n{install_cmd}':
    '在使用 Vercel？安装 vercel 插件：\n{install_cmd}',
  'Use {cmd} for better one-shot answers. Claude thinks it through first.':
    '使用 {cmd} 获得更好的一次性答案。Claude 会先仔细思考。',
  'Working on something tricky? {cmd} gives better first answers':
    '在处理棘手问题？{cmd} 能给出更好的首次答案',
  'Use {loop_cmd} to run any prompt on a schedule. Set it and forget it.':
    '使用 {loop_cmd} 按计划运行任意提示。设置后即可高枕无忧。',
  '{loop_cmd} runs any prompt on a recurring schedule. Great for monitoring deploys, babysitting PRs, or polling status.':
    '{loop_cmd} 按周期运行任意提示。非常适合监控部署、跟进 PR 或轮询状态。',
  'Share Claude Code and earn {credit_amount} of extra usage · {passes_cmd}':
    '分享 Claude Code 赚取 {credit_amount} 额外用量 · {passes_cmd}',
  'You have free guest passes to share · {passes_cmd}':
    '您有免费访客通行证可分享 · {passes_cmd}',
  '{amount} in extra usage, on us': '{amount} 额外用量，我们请客',
  '{amount_label} · third-party apps · {extra_usage_cmd}':
    '{amount_label} · 第三方应用 · {extra_usage_cmd}',
  'Use /feedback to help us improve!': '使用 /feedback 帮助我们改进！',

  // ── TeammateSpinnerLine ──────────────────────────────────────
  'Using {tool}…': '正在使用 {tool}…',

  // ── sdkMessageAdapter ────────────────────────────────────────
  'Session completed successfully': '会话已成功完成',
  'Compacting conversation…': '正在压缩对话…',
  'Remote session initialized (model: {model})':
    '远程会话已初始化（模型：{model}）',

  // ── Permission dialogs ──────────────────────────────────────
  'Do you want to proceed?': '是否继续？',
  'Would you like to proceed?': '是否继续执行？',
  'Claude has written up a plan and is ready to execute. Would you like to proceed?':
    'Claude 已写好计划，准备执行。是否继续执行？',
  'Do you want to make this edit to {file}?': '是否对 {file} 进行此编辑？',
  'Do you want to overwrite {file}?': '是否覆盖 {file}？',
  'Do you want to create {file}?': '是否创建 {file}？',
  'Do you want to insert this cell into {file}?': '是否将此单元格插入 {file}？',
  'Do you want to delete this cell from {file}?':
    '是否从 {file} 删除此单元格？',
  'Do you want to allow Claude to fetch this content?':
    '是否允许 Claude 抓取此内容？',
  'Do you want to allow this connection?': '是否允许此连接？',
  Yes: '是',
  No: '否',
  // Suffix labels for the editable feedback inputs ("Yes/No, and …")
  'and tell Claude what to do next': '并告诉 Claude 接下来做什么',
  'and tell Claude what to do differently': '并告诉 Claude 换个做法',
  'tell Claude what to do next': '告诉 Claude 接下来做什么',
  'tell Claude what to do differently': '告诉 Claude 换个做法',
  'No, and tell Claude what to do differently': '否，并告诉 Claude 换个做法',
  'Deny, and tell Claude what to do differently':
    '拒绝，并告诉 Claude 换个做法',
  "Yes, and don't ask again for {hostname}": '是，且不再询问 {hostname}',
  // Editable prefix input label (code uses \u2019 — a right single quote)
  'Yes, and don’t ask again for': '是，且不再询问',
  'command prefix (e.g., npm run:*)': '命令前缀（如 npm run:*）',
  'command prefix (e.g., Get-Process:*)': '命令前缀（如 Get-Process:*）',
  'Yes, allow edits to .claude/ config for this session':
    '是，本次会话允许编辑 .claude/ 配置',
  'Yes, during this session': '是，本次会话内允许',
  'Yes, allow all edits during this session': '是，本次会话允许所有编辑',
  'Yes, allow reading from {dir} during this session':
    '是，本次会话允许读取 {dir}',
  'Yes, allow all edits in {dir} during this session':
    '是，本次会话允许编辑 {dir} 中的所有内容',
  'this directory': '此目录',
  // NOTE: translations must keep placeholders in the same order as English —
  // the call sites split on the placeholder markers positionally.
  'Yes, allow reading from {path} from this project':
    '是，允许本项目读取 {path}',
  'Yes, and always allow access to {path} from this project':
    '是，并始终允许本项目访问 {path}',
  "Yes, and don't ask again for {commands} commands in {cwd}":
    '是，且不再询问 {commands} 命令（位于 {cwd}）',
  'Yes, and allow access to {paths} and {commands} commands':
    '是，并允许访问 {paths} 及 {commands} 命令',
  'Yes, and allow {paths} access and {commands} commands':
    '是，并允许 {paths} 访问及 {commands} 命令',
  similar: '类似',
  'Esc to cancel': 'Esc 取消',
  'Esc to cancel · Tab to amend': 'Esc 取消 · Tab 补充说明',

  // ── Context window status (TokenWarning) ────────────────────
  '{pct}% context used': '已用 {pct}% 上下文',
  '{pct}% until auto-compact': '距自动压缩还剩 {pct}%',
  'Context low ({pct}% remaining)': '上下文不足（剩余 {pct}%）',
  'Context low ({pct}% remaining) · Run /compact to compact & continue':
    '上下文不足（剩余 {pct}%）· 运行 /compact 压缩后继续',
  'Tip: You have access to {name} with {multiplier}x more context':
    '提示：您可使用 {name}，上下文容量提升 {multiplier} 倍',

  // ── Exit path ────────────────────────────────────────────────
  'Resume this session with:\nclaude --resume {arg}':
    '使用以下命令恢复此会话：\nclaude --resume {arg}',
  'Goodbye!': '再见！',
  'See ya!': '回头见！',
  'Bye!': '拜拜！',
  'Catch you later!': '下次见！',

  // ── Startup banner (LogoV2 / feeds / onboarding) ─────────────
  'Your bash commands will be sandboxed. Disable with /sandbox.':
    '您的 bash 命令将在沙箱中运行。可用 /sandbox 关闭。',
  'Message from {org}:': '来自 {org} 的消息：',
  'Detach: {prefix} d': '脱离会话：{prefix} d',
  'Detach: {prefix} {prefix} d (press prefix twice - Claude uses {prefix})':
    '脱离会话：{prefix} {prefix} d（前缀键按两次 —— Claude 占用了 {prefix}）',
  'Recent activity': '最近活动',
  '/resume for more': '/resume 查看更多',
  'No recent activity': '暂无最近活动',
  "What's new": '更新内容',
  'Check the Claude Code changelog for updates':
    '查看 Claude Code 更新日志了解最新变化',
  '/release-notes for more': '/release-notes 查看更多',
  'Tips for getting started': '入门提示',
  'Note: You have launched claude in your home directory. For the best experience, launch it in a project directory instead.':
    '注意：您在主目录中启动了 claude。为获得最佳体验，请在项目目录中启动。',
  'Share Claude Code and earn {amount} of extra usage':
    '分享 Claude Code，赚取 {amount} 额外用量',
  'Share Claude Code with friends': '与好友分享 Claude Code',
  '3 guest passes': '3 张好友通行证',
  'Ask Claude to create a new app or clone a repository':
    '让 Claude 创建新应用或克隆仓库',
  'Run /init to create a CLAUDE.md file with instructions for Claude':
    '运行 /init 创建 CLAUDE.md，写入给 Claude 的项目说明',

  // ── Permission mode titles ────────────────────────────────────
  'Plan Mode': '计划模式',
  'Accept edits': '接受编辑',
  Accept: '接受',
  Bypass: '绕过权限',
  "Don't Ask": '不询问',
  DontAsk: '不询问',

  // ── Auto mode opt-in ──────────────────────────────────────────
  'Enable auto mode?': '启用自动模式？',
  "Auto mode lets Claude handle permission prompts automatically — Claude checks each tool call for risky actions and prompt injection before executing. Actions Claude identifies as safe are executed, while actions Claude identifies as risky are blocked and Claude may try a different approach. Ideal for long-running tasks. Sessions are slightly more expensive. Claude can make mistakes that allow harmful commands to run, it's recommended to only use in isolated environments. Shift+Tab to change mode.":
    '自动模式会让 Claude 自动处理权限提示 — Claude 会在执行前检查每个工具调用是否存在危险操作和提示注入。Claude 判断为安全的操作会被执行；Claude 判断为有风险的操作会被阻止，并且 Claude 可能会尝试其他方法。它适合长时间运行的任务。会话成本会略高。Claude 可能会出错并允许有害命令运行，建议仅在隔离环境中使用。按 Shift+Tab 可切换模式。',
  'Yes, and make it my default mode': '是，并设为我的默认模式',

  // ── Scattered tips ────────────────────────────────────────────
  'Tip: You can launch Claude Code with just `claude`':
    '提示：直接运行 `claude` 即可启动 Claude Code',
  'Tip: start a named workflow with /<name>, or pass name via the Workflow tool.':
    '提示：用 /<name> 启动命名工作流，或通过 Workflow 工具传入名称。',
  'Tip: The shorthand "{repo}" assumes github.com. For internal GitHub Enterprise, use the full URL:\n  git@your-github-host.com:{repo}.git':
    '提示：简写 "{repo}" 默认指向 github.com。如为内部 GitHub Enterprise，请使用完整 URL：\n  git@your-github-host.com:{repo}.git',
  'Tip: Run `/insights --homespaces` to include sessions from your {count} running homespace(s)':
    '提示：运行 `/insights --homespaces` 可纳入您 {count} 个运行中 homespace 的会话',

  // ── Permission dialogs (batch 2: titles / footers / hints) ───
  'describe what to allow...': '描述要允许的操作...',
  'Enter to submit · Esc to cancel': 'Enter 提交 · Esc 取消',
  '←/→ tab switch · ↓ return · Esc cancel':
    '←/→ 切换标签 · ↓ 返回列表 · Esc 取消',
  'Type to filter · Enter/↓ select · ↑ tabs · Esc clear':
    '输入以筛选 · Enter/↓ 选择 · ↑ 标签栏 · Esc 清除',
  'Enter approve · r retry · ↑↓ navigate · ←/→ switch · Esc cancel':
    'Enter 批准 · r 重试 · ↑↓ 导航 · ←/→ 切换 · Esc 取消',
  '↑↓ navigate · Enter select · Type to search · ←/→ switch · Esc cancel':
    '↑↓ 导航 · Enter 选择 · 输入以搜索 · ←/→ 切换 · Esc 取消',
  'Esc to reject': 'Esc 拒绝',
  'Tab to add feedback': 'Tab 补充反馈',
  'Tab to amend': 'Tab 补充说明',
  'ctrl+e to hide': 'ctrl+e 隐藏解释',
  'ctrl+e to explain': 'ctrl+e 查看解释',
  'Ctrl+d to show debug info': 'Ctrl+d 显示调试信息',
  'Bash command (unsandboxed)': 'Bash 命令（未沙箱化）',
  'Bash command': 'Bash 命令',
  'PowerShell command': 'PowerShell 命令',
  'Enter plan mode?': '进入计划模式？',
  'Exit plan mode?': '退出计划模式？',
  'Ready to code?': '准备开始编码？',
  Monitor: '监控',
  'Use skill "{skill}"?': '使用技能 "{skill}"？',
  'Edit file': '编辑文件',
  'Overwrite file': '覆盖文件',
  'Create file': '创建文件',
  'Edit notebook': '编辑 Notebook',
  Fetch: '抓取网页',
  'Network request outside of sandbox': '沙箱外网络请求',
  'Computer Use needs macOS permissions': 'Computer Use 需要 macOS 权限',
  'Computer Use wants to control these apps': 'Computer Use 请求控制以下应用',
  'Loading explanation…': '正在加载说明…',
  'Explanation unavailable': '说明不可用',
  'Low risk': '低风险',
  'Med risk': '中风险',
  'High risk': '高风险',
  'Waiting for team lead approval': '正在等待团队负责人批准',
  'Tool: ': '工具：',
  'Action: ': '操作：',
  'Permission request sent to team "{teamName}" leader':
    '权限请求已发送给团队“{teamName}”的负责人',

  // ── Plan mode UI (EnterPlanModeTool / ExitPlanModeTool) ───────────
  'Entered plan mode': '已进入计划模式',
  'Exited plan mode': '已退出计划模式',
  'Plan submitted for team lead approval': '计划已提交给团队负责人审批',
  'Waiting for team lead to review and approve...':
    '等待团队负责人审核和批准...',
  "User approved Claude's plan": '用户批准了 Claude 的计划',
  'User declined to enter plan mode': '用户拒绝进入计划模式',
  'Plan saved!': '计划已保存！',

  // ── Plan mode descriptions ────────────────────────────────────────
  'Claude is now exploring and designing an implementation approach.':
    'Claude 正在探索代码库并设计实现方案。',
  'No plan found': '未找到计划',
  'Claude wants to enter plan mode to explore and design an implementation approach.':
    'Claude 想要进入计划模式，探索并设计实现方案。',
  'In plan mode, Claude will:': '在计划模式下，Claude 将：',
  '· Explore the codebase thoroughly': '· 全面探索代码库',
  '· Identify existing patterns': '· 识别现有模式',
  '· Design an implementation strategy': '· 设计实现策略',
  '· Present a plan for your approval': '· 提交计划供您审批',
  'No code changes will be made until you approve the plan.':
    '在您批准计划之前，不会进行代码更改。',
  'Yes, enter plan mode': '是，进入计划模式',
  'No, start implementing now': '否，立即开始实现',
  'Claude wants to exit plan mode': 'Claude 想要退出计划模式',
  'Requested permissions:': '请求的权限：',
  'ctrl-g to edit in ': 'ctrl-g 在 ',
  'Yes, and use auto mode': '是，并使用自动模式',
  'Yes, and bypass permissions': '是，并绕过权限检查',
  'Yes, auto-accept edits': '是，自动接受编辑',
  'Yes, manually approve edits': '是，手动批准编辑',
  'No, refine with Ultraplan on Claude Code on the web':
    '否，在 Claude Code 网页版中使用 Ultraplan 优化',
  'No, keep planning': '否，继续规划',
  'Tell Claude what to change': '告诉 Claude 需要修改什么',
  'shift+tab to approve with this feedback': 'shift+tab 以此反馈进行批准',
  "Here is Claude's plan:": '以下是 Claude 的计划：',

  // ── Plan mode file messages ───────────────────────────────────────
  'Plan file: {displayPath}': '计划文件：{displayPath}',
  'Plan saved to: {displayPath} · /plan to edit':
    '计划已保存到：{displayPath} · /plan 编辑',

  // ── KAIROS / assistant command ────────────────────────────────────
  'KAIROS assistant mode activated.': 'KAIROS 助手模式已激活。',
  'Assistant panel hidden.': '助手面板已隐藏。',
  'Assistant panel opened.': '助手面板已打开。',

  // ── Mode command ──────────────────────────────────────────────────
  'Mode selection cancelled.': '模式选择已取消。',
  'Arrow keys to navigate, Enter to select, Esc to cancel.':
    '方向键导航，Enter 选择，Esc 取消。',
  '{icon} Mode switched to: {name} ({slug}) — {description}':
    '{icon} 模式已切换为：{name}（{slug}）— {description}',
  'Unknown mode: "{slug}"\n\nAvailable modes:\n{available}':
    '未知模式："{slug}"\n\n可用模式：\n{available}',

  // ── CLI validation errors / warnings ─────────────────────────────
  'Error: headless (-p/--print) mode is not supported with claude ssh\n':
    '错误：claude ssh 不支持 headless（-p/--print）模式\n',
  'Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.\n':
    '警告：3 秒内未收到 stdin 数据，将在没有输入的情况下继续。如果正在从慢速命令管道输入，请显式重定向 stdin：使用 < /dev/null 跳过，或等待更久。\n',
  'Failed to activate connection "{name}": {error}\n':
    '激活连接 "{name}" 失败：{error}\n',
  'Failed to activate subagent connection "{name}": {error}\n':
    '激活子 agent 连接 "{name}" 失败：{error}\n',
  'Error: --provider/--subagent-provider require PROVIDER_CONNECTIONS.\n':
    '错误：--provider/--subagent-provider 需要启用 PROVIDER_CONNECTIONS。\n',
  'unknown error': '未知错误',
  'Connection name is empty': '连接名称为空',
  'No connections configured. Use /connect to add one, then pass its name.':
    '尚未配置连接。请先用 /connect 添加，再传入连接名称。',
  'No connections configured. Use /connect in an interactive session to add one.':
    '尚未配置连接。请在交互会话中用 /connect 添加。',
  'Unknown connection "{ref}". Run `ccb connect` to list configured connections.':
    '未知连接 "{ref}"。运行 `ccb connect` 查看已配置的连接。',
  'Ambiguous connection "{ref}" matches multiple entries. Use the connection id:\n{list}':
    '连接 "{ref}" 匹配多条记录。请使用连接 id 消歧：\n{list}',
  'Error: Fallback model cannot be the same as the main model. Please specify a different model for --fallback-model.\n':
    '错误：Fallback 模型不能与主模型相同。请为 --fallback-model 指定不同的模型。\n',
  'Error: Invalid input format "{format}".':
    '错误：无效的输入格式 "{format}"。',
  'Error: --input-format=stream-json requires output-format=stream-json.':
    '错误：--input-format=stream-json 需要 output-format=stream-json。',
  'Error: --sdk-url requires both --input-format=stream-json and --output-format=stream-json.':
    '错误：--sdk-url 需要同时设置 --input-format=stream-json 和 --output-format=stream-json。',
  'Error: --replay-user-messages requires both --input-format=stream-json and --output-format=stream-json.':
    '错误：--replay-user-messages 需要同时设置 --input-format=stream-json 和 --output-format=stream-json。',
  'Error: --include-partial-messages requires --print and --output-format=stream-json.':
    '错误：--include-partial-messages 需要 --print 和 --output-format=stream-json。',
  'Error: --no-session-persistence can only be used with --print mode.':
    '错误：--no-session-persistence 只能与 --print 模式一起使用。',

  // ── Mode descriptions (defaults.ts) ───────────────────────────────
  'Balanced mode for everyday development': '均衡模式，适合日常开发',
  'Patient explanations, great for learning': '耐心讲解，适合学习',
  'Strict review, focused on code quality': '严格审查，专注代码质量',
  'Auto-execute, minimal confirmations': '自动执行，最少确认',
  'Minimal replies, save tokens': '极简回复，节省词元',
  'Deep thinking, comprehensive analysis': '深度思考，全面分析',

  // ── Subagent login/logout ─────────────────────────────────────────
  'Subagent login cleared. Agent sub-sessions will inherit the main login.':
    '子智能体登录已清除。智能体子会话将继承主登录。',
  'Subagent login interrupted': '子智能体登录已中断',
  'Subagent login successful': '子智能体登录成功',

  // ── Remote setup ──────────────────────────────────────────────────
  'Not signed in to Claude. Run /login first.':
    '未登录 Claude。请先运行 /login。',

  // ── Remote Control Server ─────────────────────────────────────────
  'Remote Control Server started. Use /remote-control-server to manage.':
    '远程控制服务已启动。使用 /remote-control-server 进行管理。',
  'Remote Control Server stopped.': '远程控制服务已停止。',
  'Remote Control Server restarted.': '远程控制服务已重启。',

  // ── Install GitHub App ────────────────────────────────────────────
  'Installation cancelled by user': '用户取消了安装',

  // ── Fast mode notifications ──────────────────────────────────────
  'Fast mode is now available · /fast to turn on':
    '快速模式现已可用 · /fast 开启',
  'Fast mode has been disabled by your organization':
    '快速模式已被您的组织禁用',
  'Fast mode requires a paid subscription': '快速模式需要付费订阅',
  'Fast mode requires extra usage billing · /extra-usage to enable':
    '快速模式需要额外用量计费 · /extra-usage 启用',
  'Fast mode unavailable during evaluation. Please purchase credits.':
    '评估期间快速模式不可用。请购买额度。',
  'Fast mode unavailable due to network connectivity issues':
    '快速模式因网络连接问题不可用',
  'Fast mode is currently unavailable': '快速模式当前不可用',

  // ── Voice mode notice ─────────────────────────────────────────────
  'Voice mode is now available · /voice to enable':
    '语音模式现已可用 · /voice 启用',

  // ── Memory notification ───────────────────────────────────────────
  'Memory updated in {displayPath} · /memory to edit':
    '记忆已在 {displayPath} 中更新 · /memory 编辑',

  // ── Text input hints ──────────────────────────────────────────────
  'Esc again to clear': '再按 Esc 清除',

  // ── Export dialog ─────────────────────────────────────────────────
  'Enter filename:': '输入文件名：',
  'Copy the conversation to your system clipboard': '将对话复制到系统剪贴板',
  'Save the conversation to a file in the current directory':
    '将对话保存到当前目录的文件',

  // ── Workflow dialog ───────────────────────────────────────────────
  'You must select at least one workflow to continue':
    '您必须至少选择一个工作流才能继续',

  // ── Message selector (rewind) ─────────────────────────────────────
  'Nothing to rewind to yet.': '尚无内容可回退。',
  'Restore the code and/or conversation to the point before…':
    '将代码和/或对话恢复到之前的节点…',
  'Restore and fork the conversation to the point before…':
    '将对话恢复并分叉到之前的节点…',

  // ── Remote environment dialog ─────────────────────────────────────
  'No remote environments available.': '无可用远程环境。',

  // ── MCP remote server menu ────────────────────────────────────────
  'Return here after authenticating in your browser. Press Esc to go back.':
    '在浏览器中认证后返回此处。按 Esc 返回。',
  'Return here after authenticating in your browser.':
    '在浏览器中认证后返回此处。',

  // ── Skill permission ──────────────────────────────────────────────
  'Claude may use instructions, code, or files from this Skill.':
    'Claude 可能会使用此技能中的指令、代码或文件。',

  // ── Workspace directory ────────────────────────────────────────────
  'Claude Code will no longer have access to files in this directory.':
    'Claude Code 将不再能访问此目录中的文件。',

  // ── Agents list ───────────────────────────────────────────────────
  'Create new agent': '创建新智能体',

  // ── Resume task ───────────────────────────────────────────────────
  'Loading Claude Code sessions…': '正在加载 Claude Code 会话…',

  // ── Teleport resume ───────────────────────────────────────────────
  'Resuming session…': '正在恢复会话…',

  // ── Thinking toggle ───────────────────────────────────────────────
  'Enable or disable thinking for this session.': '为此会话启用或禁用思考。',

  // ── Navigation hints ──────────────────────────────────────────────
  'Press Enter or Esc to go back': '按回车或 Esc 返回',
  'Esc to go back': 'Esc 返回',
  'Press ↑↓ to navigate · Enter to select · Esc to go back':
    '↑↓ 导航 · Enter 选择 · Esc 返回',
  'Press Enter to save · Esc to cancel': '按回车保存 · Esc 取消',
  ' · start typing your key': ' · 开始输入您的密钥',
  // ── P0 batch additions ────────────────────────────────────────
  '  Directory: {dir}': '  目录：{dir}',
  ' (sidechain)': '（侧链）',
  'Active days': '活跃天数',
  'Added {type} MCP server {name} to {scope} config':
    '已将 {type} MCP 服务器 {name} 添加到 {scope} 配置',
  'Avg/session': '平均/会话',
  'Checking for updates...': '正在检查更新…',
  'Checking for updates': '正在检查更新',
  Connected: '已连接',
  'Connection error': '连接错误',
  'Current streak': '当前连续天数',
  'Current version: {version}': '当前版本：{version}',
  "Don't ask again": '不再询问',
  'Error submitting feedback / bug report': '提交反馈/错误报告时出错',
  'Error: {error}': '错误：{error}',
  'Exit and fix manually': '退出并手动修复',
  'Failed to check for updates': '检查更新失败',
  'Failed to connect': '连接失败',
  'Failed to save settings. Please try again.': '保存设置失败。请重试。',
  'Favorite model': '偏好模型',
  'Feedback / bug report submitted': '反馈/错误报告已提交',
  'File modified: {path}': '文件已修改：{path}',
  'In: {input} · Out: {output}': '输入：{input} · 输出：{output}',
  'Job not found: {id}': '未找到任务：{id}',
  'Killing session {id} (PID: {pid})...': '正在终止会话 {id}（PID: {pid}）…',
  'Loading conversations…': '正在加载对话…',
  'Login failed: {error}': '登录失败：{error}',
  'Login successful.': '登录成功。',
  'Longest session': '最长会话',
  'Longest streak': '最长连续天数',
  'Needs authentication': '需要认证',
  'New MCP server found in .mcp.json: {serverName}':
    '在 .mcp.json 中发现新的 MCP 服务器：{serverName}',
  'New version available: {latest} (current: {current})':
    '新版本可用：{latest}（当前：{current}）',
  'No MCP server found with name: "{name}"':
    '未找到名为 "{name}" 的 MCP 服务器',
  'No MCP servers configured. Use `claude mcp add` to add a server.':
    '未配置 MCP 服务器。使用 `claude mcp add` 添加服务器。',
  'No active sessions to kill.': '没有活跃会话可终止。',
  'No active sessions.': '无活跃会话。',
  'No conversations found to resume.': '未找到可恢复的对话。',
  'No matching sessions found.': '未找到匹配的会话。',
  'No model usage data available': '无模型使用数据',
  'No, exit': '否，退出',
  'No, go back': '否，返回',
  'No (requires sudo)': '否（需要 sudo）',
  'Opening browser to sign in…': '正在打开浏览器进行登录…',
  'Using 3rd-party platforms': '使用第三方平台',
  'Claude Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment variables, then restart Claude Code.':
    'Claude Code 支持 Amazon Bedrock、Microsoft Foundry 和 Vertex AI。请设置所需环境变量，然后重启 Claude Code。',
  'If you are part of an enterprise organization, contact your administrator for setup instructions.':
    '如果你属于企业组织，请联系管理员获取配置说明。',
  'Documentation:': '文档：',
  'Creating API key for Claude Code…': '正在为 Claude Code 创建 API 密钥…',
  'Retrying…': '正在重试…',
  'Logged in as': '已登录为',
  'OAuth error: ': 'OAuth 错误：',
  'Press Enter to retry.': '按回车重试。',
  'Invalid code. Please make sure the full code was copied':
    '代码无效。请确认已复制完整代码',
  'Failed to exchange authorization code for access token. Please try again.':
    '无法用授权代码换取访问令牌。请重试。',
  "Browser didn't open? Use the url below to sign in ":
    '浏览器没有打开？请使用下面的 URL 登录 ',
  '(Copied!)': '（已复制！）',
  '✓ Long-lived authentication token created successfully!':
    '✓ 已成功创建长期认证令牌！',
  'Your OAuth token (valid for 1 year):': '你的 OAuth 令牌（有效期 1 年）：',
  "Store this token securely. You won't be able to see it again.":
    '请安全保存此令牌。之后将无法再次查看。',
  'Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>':
    '设置以下环境变量以使用此令牌：export CLAUDE_CODE_OAUTH_TOKEN=<token>',
  'Login method pre-selected: Subscription Plan (Claude Pro/Max)':
    '已预选登录方式：订阅套餐（Claude Pro/Max）',
  'Login method pre-selected: API Usage Billing (Anthropic Console)':
    '已预选登录方式：API 用量计费（Anthropic Console）',
  'Removed MCP server {name} from {scope} config':
    '已将 MCP 服务器 {name} 从 {scope} 配置中移除',
  'Resuming conversation…': '正在恢复对话…',
  'Running:': '运行中：',
  'Searching…': '搜索中…',
  'Session not found: {target}': '未找到会话：{target}',
  'Session stopped.': '会话已停止。',
  Sessions: '会话',
  Settings: '设置',
  'Shot distribution': '请求分布',
  'Speculation saved': '推测节省',
  'Successfully updated from {old} to {new}': '已成功从 {old} 更新到 {new}',
  'Tokens per Day': '每日词元数',
  'Total tokens': '总词元数',
  'WARNING: Claude Code running in Bypass Permissions mode':
    '警告：Claude Code 正在绕过权限模式运行',
  'Yes, I accept': '是，我接受',
  "Yes, and don't ask again for": '是，且不再询问',
  'Yes, enable auto mode': '是，启用自动模式',
  day: '天',
  days: '天',
  "{'Press {key} again to exit'}": '再按 {key} 退出',
  '↑↓/Tab to switch · Enter on last field to save · Esc to go back':
    '↑↓/Tab 切换 · 在最后字段按 Enter 保存 · Esc 返回',

  // ── CLI option descriptions ───────────────────────────────────
  'Main-agent connection for this process (connection id/label/preset from /connect). Process-scoped, not persisted.':
    '此进程的主 agent 连接（/connect 的连接 id/名称/预设）。进程级生效，不持久化。',
  'Subagent connection for this process (connection id/label/preset from /connect, or unset to inherit main). Process-scoped, not persisted.':
    '此进程的子 agent 连接（/connect 的连接 id/名称/预设，或 unset 继承主连接）。进程级生效，不持久化。',
  'Print configured provider connections (from /connect) and exit':
    '打印已配置的提供者连接（来自 /connect）并退出',

  // ── Provider connections (/connect + /models) ─────────────────
  'Manage provider connections and accounts (add, switch, remove)':
    '管理提供者连接与账号（添加、切换、删除）',
  'Pick the model for the main agent or subagents across all connections':
    '跨所有连接为主 agent 或子 agent 选择模型',
  Connections: '连接管理',
  Close: '关闭',
  'Connections closed': '已关闭连接管理',
  'No connections yet. Add one to manage providers and accounts.':
    '还没有任何连接。添加一个以管理提供者和账号。',
  '+ Add connection…': '+ 添加连接…',
  'Clear subagent default (inherit main)': '清除子 agent 默认（继承主 agent）',
  'Claude account': 'Claude 账号',
  'Anthropic compatible': 'Anthropic 兼容',
  'ChatGPT account': 'ChatGPT 账号',
  'OpenAI compatible': 'OpenAI 兼容',
  'main default': '主 agent 默认',
  'subagent default': '子 agent 默认',
  'in use (main)': '本会话使用中（主）',
  'in use (subagent)': '本会话使用中（子）',
  'Use for this session (main agent)': '本会话使用（主 agent）',
  'Set as global default (main agent)': '设为全局默认（主 agent）',
  'Use for this session (subagents)': '本会话使用（子 agent）',
  'Set as global default (subagents)': '设为全局默认（子 agent）',
  Delete: '删除',
  'Edit connection': '编辑连接',
  'Rename connection': '重命名连接',
  'Delete connection "{label}"? Stored credentials for it will be removed.':
    '删除连接“{label}”？其存储的凭据也将被移除。',
  'Pick a model (main agent)': '选择模型（主 agent）',
  'Pick a model (subagents)': '选择模型（子 agent）',
  'Persists across sessions': '跨会话持久生效',
  'This session only': '仅当前会话',
  'Custom model…': '自定义模型…',
  'type a model id, Enter to confirm': '输入模型 ID，回车确认',
  'Model context windows…': '模型上下文窗口…',
  'Model context windows': '模型上下文窗口',
  'Pick a model to set its context window (used for auto-compact and context display)':
    '选择模型以设置其上下文窗口（用于自动压缩和上下文用量显示）',
  'ctx unknown, 200K assumed': '上下文窗口未知，按 200K 处理',
  'ctx unknown, 200K assumed — set via /connect':
    '上下文窗口未知，按 200K 处理 — 可在 /connect 中设置',
  'Context window — {model}': '上下文窗口 — {model}',
  'Current: {value} tokens ({source})': '当前：{value} tokens（{source}）',
  'set manually': '手动设置',
  'from preset': '来自预设',
  'auto-detected': '自动识别',
  'Not reported by the provider — enter it to size auto-compact correctly (200K assumed otherwise)':
    '提供者未上报此模型的上下文窗口 — 填写后自动压缩阈值才能按真实窗口计算（不填按 200K 处理）',
  'Context window': '上下文窗口',
  'e.g. 128K or 1M — leave empty to skip': '如 128K 或 1M — 留空跳过',
  'e.g. 128K or 1M — leave empty to clear the manual value':
    '如 128K 或 1M — 留空清除手动设置',
  'Invalid context window — use a token count like 200000, 128K or 1M':
    '无效的上下文窗口 — 请输入 token 数，如 200000、128K 或 1M',
  'Switching…': '切换中…',
  'Failed to switch connection.': '切换连接失败。',
  'Failed to switch model.': '切换模型失败。',
  '{label}{model} is now the global default': '{label}{model} 已设为全局默认',
  'Using {label}{model} for this session': '本会话使用 {label}{model}',
  '{label}{model} is now the subagent default':
    '{label}{model} 已设为子 agent 默认',
  'Subagents use {label}{model} for this session':
    '本会话子 agent 使用 {label}{model}',
  'Add connection': '添加连接',
  'Pick a provider preset or connection type': '选择提供者预设或连接类型',
  'OpenAI Compatible (custom endpoint)': 'OpenAI 兼容（自定义端点）',
  'Any OpenAI Chat Completions endpoint (Ollama, vLLM, …)':
    '任意 OpenAI Chat Completions 端点（Ollama、vLLM 等）',
  'Anthropic Compatible (custom endpoint)': 'Anthropic 兼容（自定义端点）',
  'Anthropic Messages API gateway with base URL + auth token':
    '使用 Base URL + Auth Token 的 Anthropic Messages API 网关',
  'Google Gemini Generate Content API': 'Google Gemini Generate Content API',
  'Grok (xAI)': 'Grok（xAI）',
  'xAI Grok API (OpenAI compatible)': 'xAI Grok API（OpenAI 兼容）',
  'Claude account (OAuth)': 'Claude 账号（OAuth）',
  'Sign in with a claude.ai subscription account':
    '使用 claude.ai 订阅账号登录',
  'ChatGPT subscription (OAuth)': 'ChatGPT 订阅（OAuth）',
  'Sign in with a ChatGPT account via device code':
    '通过设备码登录 ChatGPT 账号',
  '{provider} access mode': '{provider} 接入方式',
  'API (pay per token)': 'API（按量计费）',
  'Coding plan (subscription)': '编程套餐（订阅）',
  'Connect {provider}': '连接 {provider}',
  'Connection details': '连接信息',
  'Get an API key: {url}': '获取 API Key：{url}',
  Name: '名称',
  'Display name, e.g. "DeepSeek personal"': '显示名称，如“DeepSeek 个人”',
  'optional — default Gemini endpoint': '可选 — 默认 Gemini 端点',
  'model for fast/background tasks (optional)':
    '用于快速/后台任务的模型（可选）',
  'default model (recommended)': '默认模型（推荐填写）',
  'model for complex tasks (optional)': '用于复杂任务的模型（可选）',
  'Signing in adds this account as a connection and makes it the active Claude account.':
    '登录后此账号将作为连接添加，并成为当前活跃的 Claude 账号。',
  'Login finished but no account information was stored.':
    '登录已完成，但未能保存账号信息。',
  'ChatGPT Subscription': 'ChatGPT 订阅',
  required: '必填',
  'Open the URL below and enter the code to sign in:':
    '打开下方链接并输入验证码登录：',
  'Code:': '验证码：',
  'Waiting for you to finish signing in…': '等待你完成登录…',
  'Connection default model': '连接的默认模型',
  'Mapped tier': '映射档位',
  'ChatGPT credential for "{label}" is missing. Run /login and select ChatGPT account with subscription to sign in again.':
    '连接“{label}”的 ChatGPT 凭据已丢失。请运行 /login 并选择 ChatGPT 订阅账号重新登录。',
  'ChatGPT credential for "{label}" is missing. Delete this connection and add it again via /connect.':
    '连接“{label}”的 ChatGPT 凭据已丢失。请在 /connect 中删除此连接后重新添加。',
  'Failed to deploy ChatGPT credential': '部署 ChatGPT 凭据失败',
  'Select model — main agent': '选择模型 — 主 agent',
  'Select model — subagents': '选择模型 — 子 agent',
  'Search connections and models…': '搜索连接与模型…',
  'use for this session': '本会话使用',
  'subagent slot': '子 agent 槽位',
  'main slot': '主 agent 槽位',
  'set global default': '设为全局默认',
  'No models match — add connections via /connect':
    '没有匹配的模型 — 请先通过 /connect 添加连接',
  '● current session · ★ global default': '● 当前会话 · ★ 全局默认',
  'No provider connections configured yet.': '尚未配置任何提供者连接。',
  'Run /connect to add providers and accounts first.':
    '请先运行 /connect 添加提供者和账号。',
  'Model picker closed': '已关闭模型选择器',

  // ── i18n batch: agent creation wizard ──────────────────────────
  'Agent type (identifier)': '智能体类型（标识符）',
  'All tools': '所有工具',
  None: '无',
  Description: '描述',
  '(tells Claude when to use this agent):':
    '（告诉 Claude 何时使用此智能体）：',
  'Permission mode': '权限模式',
  Hooks: '钩子',
  Skills: '技能',
  Color: '颜色',
  'System prompt': '系统提示',
  'Automatic color': '自动颜色',
  'Preview: ': '预览：',
  'Enter a unique identifier for your agent:': '为您的智能体输入唯一标识符：',
  'e.g., test-runner, tech-lead, etc': '例如 test-runner、tech-lead 等',
  'Enter the system prompt for your agent:': '输入智能体的系统提示：',
  'Be comprehensive for best results': '为获得最佳结果，请尽量详尽',
  'You are a helpful code reviewer who...': '你是一个乐于助人的代码审查者…',
  'Generation cancelled': '生成已取消',
  'Creation method': '创建方法',
  'Generate with Claude (recommended)': '使用 Claude 生成（推荐）',
  'Manual configuration': '手动配置',
  'Choose background color': '选择背景颜色',
  'Choose location': '选择位置',
  'Personal (~/.claude/agents/)': '个人（~/.claude/agents/）',
  'Project (.claude/agents/)': '项目（.claude/agents/）',
  'Configure agent memory': '配置智能体记忆',
  'User scope (~/.claude/agent-memory/) (Recommended)':
    '用户范围（~/.claude/agent-memory/）（推荐）',
  'None (no persistent memory)': '无（无持久记忆）',
  'Project scope (.claude/agent-memory/)': '项目范围（.claude/agent-memory/）',
  'Local scope (.claude/agent-memory-local/)':
    '本地范围（.claude/agent-memory-local/）',
  'Project scope (.claude/agent-memory/) (Recommended)':
    '项目范围（.claude/agent-memory/）（推荐）',
  'User scope (~/.claude/agent-memory/)': '用户范围（~/.claude/agent-memory/）',
  'Select tools': '选择工具',
  'Confirm and save': '确认并保存',
  'Description (tell Claude when to use this agent)':
    '描述（告诉 Claude 何时使用此智能体）',
  'When should Claude use this agent?': 'Claude 应该在什么情况下使用此智能体？',
  "e.g., use this agent after you're done writing code...":
    '例如，在完成代码编写后使用此智能体…',
  'Describe what this agent should do and when it should be used (be comprehensive for best results)':
    '描述此智能体的职责和使用场景（为获得最佳结果，请尽量详尽）',
  'e.g., Help me write unit tests for my code...': '例如，帮我编写单元测试…',
  'Please describe what the agent should do': '请描述智能体应该做什么',
  'Description is required': '描述为必填项',
  'Failed to save agent': '保存智能体失败',
  'Opened {agentType} in editor. If you made edits, restart to load the latest version.':
    '已在编辑器中打开{agentType}。如果进行过修改，请重启以加载最新版本。',
  'Open in editor': '在编辑器中打开',
  'Edit tools': '编辑工具',
  'Edit model': '编辑模型',
  'Edit color': '编辑颜色',
  'Source: ': '来源：',
  'Agent type is required': '智能体类型为必填项',
  'System prompt is required': '系统提示为必填项',
  'Press {key1} to retry · Press {key2} to cancel':
    '按 {key1} 重试 · 按 {key2} 取消',
  'Fetching your Claude Code sessions…': '正在获取您的 Claude Code 会话…',
  'Check your internet connection': '请检查您的网络连接',
  'Teleport requires a Claude account': 'Teleport 需要 Claude 账号',
  'Sorry, Claude encountered an error': '抱歉，Claude 遇到了错误',
  'Sorry, Claude Code encountered an error': '抱歉，Claude Code 遇到了错误',
  'No code changes': '无代码更改',
  'No code restore': '无代码恢复',
  'Enter to continue · ': '回车继续 · ',
  'Esc to exit': 'Esc 退出',
  'Messages after this point will be summarized.': '此点之后的消息将被摘要。',
  'Preceding messages will be summarized. This and subsequent messages will remain unchanged — you will stay at the end of the conversation.':
    '之前的消息将被摘要。此消息及后续消息保持不变 — 您将停留在对话末尾。',
  'The conversation will be forked.': '对话将被分叉。',
  'The conversation will be unchanged.': '对话保持不变。',
  'The code will be unchanged.': '代码保持不变。',
  'The code has not changed (nothing will be restored).':
    '代码未更改（无需恢复任何内容）。',
  'User rejected ': '用户已拒绝 ',
  'User rejected {operation} to ': '用户已拒绝{operation}到 ',
  "User rejected Claude's plan:": '用户拒绝了 Claude 的计划：',
  Overview: '概览',
  Models: '模型',
  'Esc to close': 'Esc 关闭',
  'When hooks are disabled:': '当钩子禁用时：',
  'No skills found': '未找到技能',
  'No skills matching "{query}"': '没有与"{query}"匹配的技能',
  'Type to filter skills\u2026': '输入以筛选技能…',
  'Press \u2191\u2193 to navigate, Enter to select, Esc to cancel':
    '↑↓ 导航，Enter 选择，Esc 取消',
  'Press Enter to continue anyway, or Ctrl+C to exit and fix issues':
    '按回车继续，或按 Ctrl+C 退出并修复问题',
  'Setup Warnings': '设置警告',
  'We found some potential issues, but you can continue anyway':
    '我们发现了一些潜在问题，但您仍然可以继续',
  'Having trouble? See manual setup instructions at:':
    '遇到问题？请查看以下网址的手动设置说明：',
  'Install GitHub App': '安装 GitHub App',
  Success: '成功',
  'GitHub Actions setup complete!': 'GitHub Actions 设置完成！',
  'github-actions setup failed': 'github-actions 设置失败',
  'Existing Workflow Found': '找到现有工作流',
  'Update workflow file with latest version': '将工作流文件更新到最新版本',
  'Skip workflow update (configure secrets only)':
    '跳过工作流更新（仅配置密钥）',
  'Exit without making changes': '退出而不做更改',
  'Workflow file conflict': '工作流文件冲突',
  'A Claude workflow file already exists at': 'Claude 工作流文件已存在于',
  'A Claude workflow file already exists in this repository.':
    '此仓库中已存在 Claude 工作流文件。',
  'Install the Claude GitHub App': '安装 Claude GitHub App',
  'Opening browser to install the Claude GitHub App…':
    '正在打开浏览器安装 Claude GitHub App…',
  'Important: Make sure to grant access to this specific repository':
    '重要：请确保授予对此特定仓库的访问权限',
  'Install GitHub CLI from https://cli.github.com/':
    '从 https://cli.github.com/ 安装 GitHub CLI',
  'GitHub CLI (gh) does not appear to be installed or accessible.':
    'GitHub CLI (gh) 似乎未安装或无法访问。',
  'GitHub CLI not found': '未找到 GitHub CLI',
  'GitHub CLI not authenticated': 'GitHub CLI 未登录',
  'GitHub CLI does not appear to be authenticated.': 'GitHub CLI 似乎未登录。',
  'Missing required scopes': '缺少必需的作用域',
  'GitHub CLI is missing required permissions: {scopes}.':
    'GitHub CLI 缺少所需权限：{scopes}。',
  'Please install the app for repository: {repo}': '请为仓库 {repo} 安装应用',
  'Enter repository': '输入仓库',
  'Select GitHub repository': '选择 GitHub 仓库',
  'Enter a different repository': '输入其他仓库',
  'Enter a repo as owner/repo or https://github.com/owner/repo…':
    '以 owner/repo 或 https://github.com/owner/repo… 格式输入仓库',
  'Use current repository: {repo}': '使用当前仓库：{repo}',
  'Repository: {name}': '仓库：{name}',
  'Repository not found': '未找到仓库',
  'Repository format warning': '仓库格式警告',
  'Repository should be in format "owner/repo"': '仓库应为 "owner/repo" 格式',
  'Invalid GitHub URL format': '无效的 GitHub URL 格式',
  'The repository URL format appears to be invalid.': '仓库 URL 格式似乎无效。',
  'Check that the repository name is correct: {name}':
    '请检查仓库名称是否正确：{name}',
  'Admin permissions required': '需要管理员权限',
  'You might need admin permissions on {name} to set up GitHub Actions.':
    '您可能需要对 {name} 拥有管理员权限才能设置 GitHub Actions。',
  'Getting repository information': '正在获取仓库信息',
  'Creating branch': '正在创建分支',
  'Creating workflow file': '正在创建工作流文件',
  'Creating workflow files': '正在创建工作流文件',
  'Opening pull request page': '正在打开拉取请求页面',
  'Create GitHub Actions workflow': '创建 GitHub Actions 工作流',
  'Create Authentication Token': '创建认证令牌',
  'Starting authentication…': '正在开始认证…',
  'Processing authentication…': '正在处理认证…',
  'Opening browser to sign in with your Claude account…':
    '正在打开浏览器以使用您的 Claude 账号登录…',
  'Using token for GitHub Actions setup…':
    '正在使用令牌进行 GitHub Actions 设置…',
  'Authentication token created successfully!': '认证令牌创建成功！',
  'Creating a long-lived token for GitHub Actions':
    '正在为 GitHub Actions 创建长期令牌',
  'Choose API key': '选择 API 密钥',
  'Use your existing Claude Code API key': '使用现有的 Claude Code API 密钥',
  'Create a long-lived token with your Claude subscription':
    '使用您的 Claude 订阅创建长期令牌',
  'Enter a new API key': '输入新的 API 密钥',
  'sk-ant… (Create a new key at https://platform.claude.com/settings/keys)':
    'sk-ant…（在 https://platform.claude.com/settings/keys 创建新密钥）',
  'Setup API key secret': '设置 API 密钥机密',
  'ANTHROPIC_API_KEY already exists in repository secrets!':
    '仓库机密中已存在 ANTHROPIC_API_KEY！',
  'Setting up {name} secret': '正在设置 {name} 机密',
  'Use the existing API key': '使用现有 API 密钥',
  'Create a new secret with a different name': '使用不同名称创建新机密',
  'Enter new secret name (alphanumeric with underscores):':
    '输入新机密名称（字母数字加下划线）：',
  'e.g., CLAUDE_API_KEY': '例如 CLAUDE_API_KEY',
  'Auth: ': '认证：',
  'Status: ': '状态：',
  'Scope:': '范围：',
  'Type:': '类型：',
  URL: 'URL',
  'URL: ': 'URL：',
  'Command: ': '命令：',
  'Args: ': '参数：',
  'Args:': '参数：',
  'Headers:': '头部：',
  'OAuth:': 'OAuth：',
  'Environment:': '环境：',
  'Tools: ': '工具：',
  'Config location: ': '配置位置：',
  'Version:': '版本：',
  'Path:': '路径：',
  'Error:': '错误：',
  'Source:': '来源：',
  'Plugin:': '插件：',
  'client_id configured': 'client_id 已配置',
  'client_secret configured': 'client_secret 已配置',
  'callback_port {port}': 'callback_port {port}',
  'MCP server "{serverName}" not found': '未找到 MCP 服务器 "{serverName}"',
  'Successfully reconnected to {serverName}': '已成功重新连接到 {serverName}',
  'Failed to reconnect to {serverName}': '重新连接到 {serverName} 失败',
  'Error: {errorMessage}': '错误：{errorMessage}',
  'Error: {msg}': '错误：{msg}',
  'OAuth error: {msg}': 'OAuth 错误：{msg}',
  'Reason: {msg}': '原因：{msg}',
  'Reconnecting to ': '正在重新连接到 ',
  enabled: '已启用',
  'Connecting to {serverName}...': '正在连接到 {serverName}…',
  'Authenticating with {serverName}...': '正在使用 {serverName} 进行认证…',
  'Authentication successful. Connected to {serverName}.':
    '认证成功。已连接到 {serverName}。',
  'Authentication successful. Reconnected to {serverName}.':
    '认证成功。已重新连接到 {serverName}。',
  'Authentication cleared for {serverName}.':
    '已清除 {serverName} 的认证信息。',
  'Disconnected from {serverName}.': '已断开与 {serverName} 的连接。',
  'Reconnection failed after authentication': '认证后重新连接失败',
  'Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.':
    '认证成功，但服务器重新连接失败。您可能需要手动重启 Claude Code 才能使更改生效。',
  'Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.':
    '认证成功，但服务器仍需认证。您可能需要手动重启 Claude Code。',
  'Clear authentication for {serverName}': '清除 {serverName} 的认证信息',
  'Clear authentication': '清除认证',
  Authenticate: '认证',
  'Re-authenticate': '重新认证',
  'not authenticated': '未认证',
  'View tools': '查看工具',
  Reconnect: '重新连接',
  Enable: '启用',
  Disable: '禁用',
  'This will open claude.ai in the browser. Find the MCP server in the list and click "Disconnect".':
    '这将在浏览器中打开 claude.ai。在列表中找到 MCP 服务器并点击"断开连接"。',
  'This may take a few moments.': '这可能需要一些时间。',
  'Find the MCP server in the browser and click "Disconnect".':
    '在浏览器中找到 MCP 服务器并点击"断开连接"。',
  'Exported {source} → {outputFile}': '已导出 {source} → {outputFile}',
  'Exported session {sessionId} → {outputFile}':
    '已将会话 {sessionId} 导出到 {outputFile}',
  'Source not found: {source}': '未找到来源：{source}',
  'Session not found: {logId}': '未找到会话：{logId}',
  'Task not found: {id}': '未找到任务：{id}',
  'Updated task {id}: [{status}] {subject}':
    '已更新任务 {id}：[{status}] {subject}',
  'No recent sessions.': '无最近会话。',
  'Last {count} sessions:': '最近 {count} 个会话：',
  'Completion cache regenerated for {shell}.':
    '已完成 {shell} 的补全缓存重建。',
  'Recent versions:': '最近版本：',
  'Analyzing your auto mode rules…\n\n': '正在分析您的自动模式规则…\n\n',
  'No critique was generated. Please try again.\n': '未生成评论。请重试。\n',
  'API key: ANTHROPIC_API_KEY\n': 'API 密钥：ANTHROPIC_API_KEY\n',
  'Warning: You already have authentication configured via environment variable or API key helper.':
    '警告：您已通过环境变量或 API 密钥助手配置了认证。',
  'The setup-token command will create a new OAuth token which you can use instead.':
    'setup-token 命令将创建一个新的 OAuth 令牌，您可以改用它。',
  Allow: '允许',
  Ask: '询问',
  Deny: '拒绝',
  Workspace: '工作区',
  'Permissions:': '权限：',
  'Recently denied': '最近拒绝',
  'Any Bash command': '任意 Bash 命令',
  'Any Bash command starting with ': '以以下内容开头的任意 Bash 命令 ',
  'The Bash command ': 'Bash 命令 ',
  'Any use of the ': '使用 ',
  ' tool': ' 工具',
  'Rule details': '规则详情',
  'This rule is configured by managed settings and cannot be modified.':
    '此规则由托管设置配置，无法修改。',
  'Contact your system administrator for more information.':
    '请联系您的系统管理员了解更多信息。',
  'Are you sure you want to delete this permission rule?':
    '您确定要删除此权限规则吗？',
  'Delete {behavior} tool?': '删除{behavior}工具？',
  'Claude Code will always ask for confirmation before using these tools.':
    '在使用这些工具前，Claude Code 将始终要求确认。',
  'Claude Code will always reject requests to use denied tools.':
    'Claude Code 将始终拒绝使用被拒绝工具的请求。',
  "Claude Code won't ask before using allowed tools.":
    'Claude Code 在使用允许的工具前不会询问。',
  'Add a new rule': '添加新规则',
  'Claude Code can read files in the workspace, and make edits when auto-accept edits is on.':
    'Claude Code 可以读取工作区中的文件，并在自动接受编辑开启时进行编辑。',
  'Add directory to workspace': '添加目录到工作区',
  'Remove directory from workspace?': '从工作区移除目录？',
  'Enter the path to the directory:': '输入目录路径：',
  'Yes, for this session': '是，仅本次会话',
  'Yes, and remember this directory': '是，并记住此目录',
  'Claude Code will be able to read files in this directory and make edits when auto-accept edits is on.':
    'Claude Code 将能够读取此目录中的文件，并在自动接受编辑开启时进行编辑。',
  'Directory path': '目录路径',
  'Requires manual approval': '需要手动批准',
  'Ctrl-D to hide debug info': 'Ctrl-D 隐藏调试信息',
  'ctrl+g to edit in {editor}': 'ctrl+g 在 {editor} 中编辑',
  'Review artifact?': '审查工件？',
  'Chat about this': '对此进行聊天',
  'Skip interview and plan immediately': '跳过访谈并立即计划',
  'press n to add notes': '按 n 添加备注',
  'Add notes on this design\u2026': '在此设计中添加备注…',
  'No preview available': '无可用预览',
  'Enter to select \u00b7 {up}/{down} to navigate \u00b7 n to add notes':
    'Enter 选择 · {up}/{down} 导航 · n 添加备注',
  'Tab to switch questions': 'Tab 切换问题',
  'Sandbox BashTool, with auto-allow': '沙箱 BashTool，自动允许',
  'Sandbox BashTool, with regular permissions': '沙箱 BashTool，常规权限',
  'No Sandbox': '无沙箱',
  Mode: '模式',
  Overrides: '覆盖',
  Dependencies: '依赖',
  'Sandbox:': '沙箱：',
  'Cannot block unix domain sockets (see Dependencies tab)':
    '无法阻止 Unix 域套接字（请参阅依赖标签页）',
  'Configure Mode:': '配置模式：',
  'All bash commands invoked by the model must run in the sandbox unless they are explicitly listed in excludedCommands.':
    '模型调用的所有 bash 命令必须在沙箱中运行，除非它们明确列在 excludedCommands 中。',
  'Commands will try to run in the sandbox automatically, and attempts to run outside of the sandbox fallback to regular permissions. Explicit ask/deny rules are always respected.':
    '命令将尝试自动在沙箱中运行，尝试在沙箱外运行将回退到常规权限。显式的询问/拒绝规则始终有效。',
  'Sandbox is not enabled. Enable sandbox to configure override settings.':
    '沙箱未启用。请启用沙箱以配置覆盖设置。',
  'Override settings are managed by a higher-priority configuration and cannot be changed locally.':
    '覆盖设置由更高优先级的配置管理，无法在本地更改。',
  'Allow unsandboxed fallback': '允许非沙箱回退',
  'Allow unsandboxed fallback:': '允许非沙箱回退：',
  'Strict sandbox mode': '严格沙箱模式',
  'Strict sandbox mode:': '严格沙箱模式：',
  'Configure Overrides:': '配置覆盖：',
  'Excluded Commands:': '排除的命令：',
  'Filesystem Read Restrictions:': '文件系统读取限制：',
  'Filesystem Write Restrictions:': '文件系统写入限制：',
  'Allowed Unix Sockets:': '允许的 Unix 套接字：',
  'The following patterns will be ignored:': '以下模式将被忽略：',
  'Current setting:': '当前设置：',
  'No marketplaces configured': '未配置市场',
  'Configured marketplaces:': '已配置的市场：',
  'Adding marketplace...': '正在添加市场…',
  'Successfully added marketplace: {name} (declared in {scope} settings)':
    '已成功添加市场：{name}（在 {scope} 设置中声明）',
  'Successfully removed marketplace: {name}': '已成功移除市场：{name}',
  'Successfully updated marketplace: {name}': '已成功更新市场：{name}',
  'Successfully updated {count} marketplace(s)': '已成功更新 {count} 个市场',
  'Updating marketplace: {name}...': '正在更新市场：{name}…',
  'Updating {count} marketplace(s)...': '正在更新 {count} 个市场…',
  'Invalid marketplace source format. Try: owner/repo, https://..., or ./path':
    '无效的市场源格式。请尝试：owner/repo、https://... 或 ./path',
  'Invalid scope "{scope}". Valid scopes: {validScopes}':
    '无效的范围 "{scope}"。有效范围：{validScopes}',
  'Invalid scope {scope}. Use: user, project, or local':
    '无效的范围 {scope}。请使用：user、project 或 local',
  'Invalid scope: {scope}. Must be one of: {validScopes}.':
    '无效的范围：{scope}。必须是以下之一：{validScopes}。',
  'Cannot use --all with a specific plugin': '不能将 --all 与特定插件同时使用',
  'Cannot use --scope with --all': '不能将 --scope 与 --all 同时使用',
  'Please specify a plugin name or use --all to disable all plugins':
    '请指定插件名称或使用 --all 禁用所有插件',
  '--cowork can only be used with user scope': '--cowork 只能用于 user 范围',
  'Validating {fileType} manifest: {filePath}':
    '正在验证 {fileType} 清单：{filePath}',
  'Validating {fileType}: {filePath}': '正在验证 {fileType}：{filePath}',
  'Validation passed': '验证通过',
  'Validation passed with warnings': '验证通过但有警告',
  'Validation failed': '验证失败',
  'Unexpected error during validation: {error}': '验证时出现意外错误：{error}',
  'Failed to {action}: {error}': '操作 "{action}" 失败：{error}',
  'Failed to {action} MCP server ': 'MCP 服务器 "{action}" 失败 ',
  'Found {count} {word}:': '找到 {count} 个{word}：',
  'failed to load': '加载失败',
  loaded: '已加载',
  'loaded with errors': '已加载但存在错误',
  'Session-only plugins (--plugin-dir):': '仅会话插件（--plugin-dir）：',
  'Are you sure you want to delete the agent {agentType}?':
    '您确定要删除智能体 {agentType} 吗？',
  'Guest passes · {count} left': '好友通行证 · 剩余 {count} 个',
  'Guest passes are not currently available.': '好友通行证当前不可用。',
  'Referral link copied to clipboard!': '推荐链接已复制到剪贴板！',
  'Loading guest pass information…': '正在加载好友通行证信息…',
  'Terms apply.': '适用条款。',
  'Enter to copy link · Esc to cancel': '回车复制链接 · Esc 取消',
  'Authentication error · Try again': '认证错误 · 重试',
  'Not logged in · Run /login': '未登录 · 运行 /login',
  'To enable {shortcut}, run /terminal-setup':
    '要启用 {shortcut}，请运行 /terminal-setup',
  'To enable {shortcut}, set Option as Meta in {terminalName} preferences (⌘,)':
    '要启用 {shortcut}，请在 {terminalName} 偏好设置中将 Option 作为 Meta 键（⌘,）',
  Location: '位置',
  'Errors:': '错误：',
  'Warnings:': '警告：',
  'to save': '保存',
  'to save and edit': '保存并编辑',
  'Press ': '按 ',
  Enter: '回车',
  ' or ': ' 或 ',
  ' Not now': '稍后再说',
  'Accept terms · Help improve Claude: ON': '接受条款 · 帮助改进 Claude：开启',
  'Accept terms · Help improve Claude: OFF': '接受条款 · 帮助改进 Claude：关闭',
  'Accept terms · Help improve Claude: OFF (for emails with your domain)':
    '接受条款 · 帮助改进 Claude：关闭（针对您域名的邮件）',
  'false (for emails with your domain)': 'false（针对您域名的邮件）',
  'Updates to Consumer Terms and Policies': '消费者条款和政策更新',
  'Data Privacy': '数据隐私',
  'When a command fails due to sandbox restrictions, Claude can retry with dangerouslyDisableSandbox to run outside the sandbox (falling back to default permissions).':
    '当命令因沙箱限制失败时，Claude 可以使用 dangerouslyDisableSandbox 重新尝试在沙箱外运行（回退到默认权限）。',
  'Auto-allow mode:': '自动允许模式：',
  'Rolling back to version {version}...': '正在回滚到版本 {version}…',
  'Safe rollback: would install the server-pinned safe version.':
    '安全回滚：将安装服务器锁定的安全版本。',
  '(dry run — no changes made)': '（试运行 — 未做任何更改）',
  '(version listing requires access to the release registry)':
    '（版本列表需要访问发布注册表）',
  'Contact oncall for the current safe version.':
    '请联系值班人员获取当前安全版本。',
  'Safe version pinning requires access to the release API.':
    '安全版本锁定需要访问发布 API。',
  'Use `claude update --list` for available versions.':
    '使用 `claude update --list` 查看可用版本。',

  // ── i18n batch: LogoV2 / HelpV2 / hooks / misc ────────────────
  'Welcome to Claude Code': '欢迎使用 Claude Code',
  'Listening for channel messages from: {list}':
    '正在监听来自 {list} 的频道消息',
  'Experimental · inbound messages will be pushed into this session, this carries prompt injection risks. Restart Claude Code without {flag} to disable.':
    '实验功能 · 入站消息将推送至此会话，此功能存在提示注入风险。重启 Claude Code 时不加 {flag} 可禁用。',
  'no MCP server configured with that name': '未配置该名称的 MCP 服务器',
  'plugin not installed': '插件未安装',
  'Share Claude Code and earn {amount} of extra usage · /passes':
    '分享 Claude Code 赚取 {amount} 额外用量 · /passes',
  '3 guest passes at /passes': '/passes 有 3 张好友通行证',
  'Opus now defaults to 1M context · 5x more room, same pricing':
    'Opus 现在默认 1M 上下文 · 5 倍空间，定价不变',
  '{amount} in extra usage for third-party apps · /extra-usage':
    '第三方应用 {amount} 额外用量 · /extra-usage',
  'On us. Works on third-party apps · /extra-usage':
    '我们请客。适用于第三方应用 · /extra-usage',
  'extra usage credit': '额外用量额度',
  'tmux session: ': 'tmux 会话：',
  'Use /issue to report model behavior issues': '使用 /issue 报告模型行为问题',
  'API calls:': 'API 调用：',
  'Debug logs:': '调试日志：',
  'Startup Perf:': '启动性能：',
  'Browse default commands:': '浏览默认命令：',
  'Browse custom commands:': '浏览自定义命令：',
  'No custom commands found': '未找到自定义命令',
  'Browse ant-only commands:': '浏览仅内部命令：',
  ' to commit changes, ': ' 提交更改，',
  ' for commands, or ': ' 命令，或 ',
  ' for shortcuts.': ' 查看快捷键。',
  'Event:': '事件：',
  'Matcher:': '匹配器：',
  'Status message:': '状态消息：',
  'No hooks configured for this event.': '此事件未配置钩子。',
  'To add hooks, edit settings.json directly or ask Claude.':
    '要添加钩子，请直接编辑 settings.json 或询问 Claude。',
  'Hooks Restricted by Policy': '钩子受策略限制',
  'Only hooks from managed settings can run. User-defined hooks from ~/.claude/settings.json, .claude/settings.json, and .claude/settings.local.json are blocked.':
    '仅托管设置中的钩子可以运行。来自 ~/.claude/settings.json、.claude/settings.json 和 .claude/settings.local.json 的用户自定义钩子已被阻止。',
  'This menu is read-only. To add or modify hooks, edit settings.json directly or ask Claude.':
    '此菜单为只读。要添加或修改钩子，请直接编辑 settings.json 或询问 Claude。',
  'Learn more': '了解更多',
  'To modify or remove this hook, edit settings.json directly or ask Claude to help.':
    '要修改或移除此钩子，请直接编辑 settings.json 或让 Claude 帮忙。',
  'Hook Configuration - Disabled': '钩子配置 — 已禁用',
  'All hooks are currently ': '所有钩子当前为 ',
  ' by a managed settings file': '（由托管设置文件）',
  'You have {configuredCount} configured and {runningCount} running.':
    '您已配置 {configuredCount} 个，运行 {runningCount} 个。',
  '· No hook commands will execute': '· 钩子命令将不会执行',
  '· StatusLine will not be displayed': '· 状态栏将不会显示',
  '· Tool operations will proceed without hook validation':
    '· 工具操作将在没有钩子验证的情况下进行',
  'To re-enable hooks, remove "disableAllHooks" from settings.json or ask Claude.':
    '要重新启用钩子，请从 settings.json 中移除 "disableAllHooks" 或询问 Claude。',
  'Snapshot timestamp: {timestamp}': '快照时间戳：{timestamp}',
  'Merge snapshot into current memory': '将快照合并到当前记忆',
  'Keep current memory and ask Claude to merge in the snapshot changes.':
    '保留当前记忆并要求 Claude 合并快照更改。',
  'Keep current memory': '保留当前记忆',
  'Ignore this snapshot update and continue with current memory.':
    '忽略此快照更新并继续使用当前记忆。',
  'Replace with snapshot': '替换为快照',
  'Overwrite current memory files with the snapshot contents.':
    '用快照内容覆盖当前记忆文件。',
  'Agent memory snapshot update': '智能体记忆快照更新',
  'A newer {scope} memory snapshot is available for {agentType}.':
    '智能体 {agentType} 有更新的 {scope} 记忆快照可用。',
  'A newer {scope} persistent memory snapshot is available for the "{agentType}" agent.\n\nPlease merge the snapshot update into the current {scope} agent memory before continuing:\n- Preserve useful current memory entries.\n- Incorporate newer or more accurate information from the snapshot.\n- Resolve duplicates or conflicts in favor of the most current, specific information.\n- Keep the memory concise and relevant to future runs of this agent.\n\nAfter merging, continue with the user':
    '智能体 "{agentType}" 有更新的 {scope} 持久记忆快照可用。\n\n请在继续前将快照更新合并到当前 {scope} 智能体记忆：\n- 保留有用的当前记忆条目。\n- 纳入快照中更新或更准确的信息。\n- 以最新、最具体的信息为准解决重复或冲突。\n- 保持记忆简洁且与此智能体未来运行相关。\n\n合并后，继续与用户',
  'Current model (custom ID)': '当前模型（自定义 ID）',
  "Model determines the agent's reasoning capabilities and speed.":
    '模型决定了智能体的推理能力和速度。',
  'Read-only tools': '只读工具',
  'Execution tools': '执行工具',
  'MCP tools': 'MCP 工具',
  'Other tools': '其他工具',
  'No tools available': '无可用工具',
  'Tools for {serverName}': '{serverName} 的工具',
  'Failed to load description': '加载描述失败',
  'read-only': '只读',
  destructive: '破坏性',
  'open-world': '开放世界',
  'Tool name: ': '工具名称：',
  'Full name: ': '全名：',
  'Description:': '描述：',
  'Parameters:': '参数：',
  '(required)': '（必填）',
  unknown: '未知',
  'Claude Code needs your approval for the plan':
    'Claude Code 需要您批准该计划',
  'Claude Code wants to enter plan mode': 'Claude Code 想要进入计划模式',
  'Claude needs your approval for a review artifact':
    'Claude 需要您批准审查工件',
  'Claude Code needs your attention': 'Claude Code 需要您的关注',
  'Claude needs your permission to use {toolName}':
    'Claude 需要您允许使用 {toolName}',
  'Claude is waiting for your input': 'Claude 正在等待您的输入',
  'Claude Code login successful': 'Claude Code 登录成功',
  'Claude is using your computer {bullet} press Esc to stop':
    'Claude 正在使用您的计算机 {bullet} 按 Esc 停止',
  'Claude is using your computer {bullet} press Ctrl+C to stop':
    'Claude 正在使用您的计算机 {bullet} 按 Ctrl+C 停止',
  'Claude is done using your computer': 'Claude 已结束使用您的计算机',
  '{agentId} needs permission for {toolName}':
    '{agentId} 需要您允许使用 {toolName}',
  '{workerName} needs network access to {host}':
    '{workerName} 需要访问网络主机 {host}',
  Suggestions: '建议',
  Suggestion: '建议',
  Rules: '规则',
  Directories: '目录',
  Behavior: '行为',
  Message: '消息',
  Reason: '原因',
  'Unreachable Rules ({count})': '不可达规则（{count} 个）',
  'Add {behavior} permission rule': '添加 {behavior} 权限规则',
  'Permission rules are a tool name, optionally followed by a specifier in parentheses.':
    '权限规则是一个工具名称，可选择后跟括号中的说明符。',
  'e.g.,': '例如：',
  'Enter permission rule{ellipsis}': '输入权限规则{ellipsis}',
  'No recent denials. Commands denied by the auto mode classifier will appear here.':
    '没有最近的拒绝。被自动模式分类器拒绝的命令将显示在此处。',
  'Commands recently denied by the auto mode classifier.':
    '最近被自动模式分类器拒绝的命令。',
  'Try again': '重试',
  'Allow for this session ({count} {apps})': '允许本次会话（{count} 个{apps}）',
  'Accessibility:': '无障碍：',
  'Screen Recording:': '屏幕录制：',
  granted: '已授权',
  'not granted': '未授权',
  'Grant the missing permissions in System Settings, then select "Try again". macOS may require you to restart Claude Code after granting Screen Recording.':
    '在系统设置中授予缺少的权限，然后选择"重试"。授予屏幕录制权限后，macOS 可能需要您重启 Claude Code。',
  'equivalent to shell access': '相当于 shell 访问权限',
  'can read/write any file': '可以读写任意文件',
  'can change system settings': '可以更改系统设置',
  'Add {behavior} permission {ruleCount}': '添加 {behavior} 权限{ruleCount}',
  'Where should these rules be saved?': '这些规则应保存在哪里？',
  'Where should this rule be saved?': '此规则应保存在哪里？',
  'Project settings (local)': '项目设置（本地）',
  'Project settings': '项目设置',
  'User settings': '用户设置',
  'Select any you wish to enable.': '选择您想要启用的。',
  'reject all': '全部拒绝',
  'agent-only': '仅智能体',
  'not connected (agent-only)': '未连接（仅智能体）',
  'may need auth': '可能需要认证',
  'may need authentication': '可能需要认证',
  'The server will connect when the agent runs.':
    '该服务器将在智能体运行时连接。',
  'This server connects only when running the agent.':
    '此服务器仅在运行智能体时连接。',
  'server provided by plugin "{plugin}"': '由插件 "{plugin}" 提供的服务器',
  'already-configured "{name}"': '已配置的 "{name}"',
  'Built-in MCPs': '内置 MCP',
  'Project MCPs': '项目 MCP',
  'User MCPs': '用户 MCP',
  'Local MCPs': '本地 MCP',
  'Enterprise MCPs': '企业 MCP',
  'Agent MCPs': '智能体 MCP',
  'claude.ai': 'claude.ai',
  'always available': '始终可用',
  'Enter to continue': '回车继续',
  'Connect the agent to this MCP server': '将智能体连接到此 MCP 服务器',
  'No content': '无内容',
  'Checking GitHub CLI installation…': '正在检查 GitHub CLI 安装…',
  'Your GitHub CLI authentication is missing the "{scopes}" {count} {noun} needed to manage GitHub Actions and secrets.':
    '您的 GitHub CLI 认证缺少管理 GitHub Actions 和机密所需的 "{scopes}" {count} {noun}。',
  'To fix this, run:': '要修复此问题，请运行：',
  'Run: gh auth login': '运行：gh auth login',
  'You can add the repo scope with: gh auth refresh -h github.com -s repo,workflow':
    '您可以通过以下命令添加 repo 范围：gh auth refresh -h github.com -s repo,workflow',
  'For private repositories, make sure your GitHub token has the "repo" scope':
    '对于私有仓库，请确保您的 GitHub 令牌具有 "repo" 范围',
  'macOS: brew install gh': 'macOS：brew install gh',
  'Linux: See installation instructions at https://github.com/cli/cli#installation':
    'Linux：请查看 https://github.com/cli/cli#installation 的安装说明',
  'Windows: winget install --id GitHub.cli':
    'Windows：winget install --id GitHub.cli',
  'Follow the prompts to authenticate with GitHub': '按照提示认证 GitHub',
  'Ask a repository admin to run this command if setup fails':
    '如果设置失败，请让仓库管理员运行此命令',
  'Ensure you have access to this repository': '确保您有权访问此仓库',
  'Repository admins can install GitHub Apps and set secrets':
    '仓库管理员可以安装 GitHub Apps 和设置机密',
  'This will add the necessary permissions to manage workflows and secrets.':
    '这将添加管理工作流和机密所需的权限。',
  'You can also try the manual setup steps if needed:':
    '如果需要，您也可以尝试手动设置步骤：',
  'Alternatively, you can use the manual setup instructions':
    '或者，您可以使用手动设置说明',
  'For manual setup instructions, see:': '有关手动设置说明，请参阅：',
  'Example: anthropics/claude-cli': '示例：anthropics/claude-cli',
  'Use format: owner/repo': '使用格式：owner/repo',
  'Use format: owner/repo or https://github.com/owner/repo':
    '使用格式：owner/repo 或 https://github.com/owner/repo',
  'Or set up authentication using environment variables or other methods':
    '或者使用环境变量或其他方法设置认证',
  See: '请参阅',
  'API key is required': '需要 API 密钥',
  'GitHub Actions setup failed': 'GitHub Actions 设置失败',
  'Failed to set up GitHub Actions': '设置 GitHub Actions 失败',
  'The file .github/workflows/claude.yml already exists':
    '文件 .github/workflows/claude.yml 已经存在',
  '1. A pre-filled PR page has been created': '1. 已创建预填充的 PR 页面',
  "2. Install the Claude GitHub App if you haven't already":
    '2. 如果尚未安装，请安装 Claude GitHub App',
  '3. Merge the PR to enable Claude PR assistance':
    '3. 合并 PR 以启用 Claude PR 辅助',
  '2. Your workflow file was kept unchanged': '2. 您的工作流文件保持不变',
  '3. API key is configured and ready to use': '3. API 密钥已配置且可用',
  'Installed {editor} terminal Shift+Enter key binding':
    '已安装 {editor} 终端的 Shift+Enter 快捷键绑定',
  'Installed Alacritty Shift+Enter key binding':
    '已安装 Alacritty Shift+Enter 快捷键绑定',
  'Installed Zed Shift+Enter key binding': '已安装 Zed Shift+Enter 快捷键绑定',
  'Failed to install {editor} terminal Shift+Enter key binding':
    '安装 {editor} 终端 Shift+Enter 快捷键绑定失败',
  'Failed to install Alacritty Shift+Enter key binding':
    '安装 Alacritty Shift+Enter 快捷键绑定失败',
  'Failed to install Zed Shift+Enter key binding':
    '安装 Zed Shift+Enter 快捷键绑定失败',
  'Found existing {editor} terminal Shift+Enter key binding. Remove it to continue.':
    '发现已存在的 {editor} 终端 Shift+Enter 快捷键绑定。请移除它以继续。',
  'Found existing Alacritty Shift+Enter key binding. Remove it to continue.':
    '发现已存在的 Alacritty Shift+Enter 快捷键绑定。请移除它以继续。',
  'Found existing Zed Shift+Enter key binding. Remove it to continue.':
    '发现已存在的 Zed Shift+Enter 快捷键绑定。请移除它以继续。',
  'Error backing up existing {editor} terminal keybindings. Bailing out.':
    '备份现有 {editor} 终端快捷键绑定失败。正在退出。',
  'Error backing up existing Alacritty config. Bailing out.':
    '备份现有 Alacritty 配置失败。正在退出。',
  'Error backing up existing Zed keymap. Bailing out.':
    '备份现有 Zed 键位映射失败。正在退出。',
  'Cannot install keybindings from a remote {editor} session.':
    '无法从远程 {editor} 会话安装快捷键绑定。',
  'Shift+Enter is natively supported in {terminal}.\n\nNo configuration needed. Just use Shift+Enter to add newlines.':
    '{terminal} 原生支持 Shift+Enter。\n\n无需配置。直接使用 Shift+Enter 换行即可。',
  'Note: iTerm2, WezTerm, Ghostty, Kitty, and Warp support Shift+Enter natively.':
    '注意：iTerm2、WezTerm、Ghostty、Kitty 和 Warp 原生支持 Shift+Enter。',
  'Note: You can already use backslash (\\\\) + return to add newlines.':
    '注意：您已经可以使用反斜杠 (\\\\) + 回车来换行。',
  'Option+Enter will now enter a newline.': '现在 Option+Enter 将输入换行符。',
  'Terminal setup cannot be run from {terminal}.\n\nThis command configures a convenient Shift+Enter shortcut for multi-line prompts.\n{note1}\n\nTo set up the shortcut (optional):\n1. Exit tmux/screen temporarily\n2. Run /terminal-setup directly in one of these terminals:\n{platformTerms}   • IDE: VSCode, Cursor, Windsurf, Zed\n   • Other: Alacritty\n3. Return to tmux/screen - settings will persist\n\n{note2}':
    '无法从 {terminal} 运行终端设置。\n\n此命令为多行提示配置便捷的 Shift+Enter 快捷键。\n{note1}\n\n要设置快捷键（可选）：\n1. 临时退出 tmux/screen\n2. 直接在以下终端之一运行 /terminal-setup：\n{platformTerms}   • IDE：VSCode、Cursor、Windsurf、Zed\n   • 其他：Alacritty\n3. 返回 tmux/screen — 设置将持续存在\n\n{note2}',
  'Failed to enable Option as Meta key for Terminal.app.':
    '无法为 Terminal.app 启用 Option 作为 Meta 键。',
  'Configured Terminal.app settings:': '已配置的 Terminal.app 设置：',
  'You may need to restart Alacritty for changes to take effect':
    '您可能需要重启 Alacritty 以使更改生效',
  'You must restart Terminal.app for changes to take effect.':
    '您必须重启 Terminal.app 以使更改生效。',
  'Saved in {path}': '已保存在 {path}',
  'Saved in at ~/.claude/settings.json': '已保存在 ~/.claude/settings.json',
  'Backup path:': '备份路径：',
  '1. Open {editor} on your local machine (not connected to remote)':
    '1. 在本地机器上打开 {editor}（未连接到远程）',
  '2. Open the Command Palette (Cmd/Ctrl+Shift+P) → "Preferences: Open Keyboard Shortcuts (JSON)"':
    '2. 打开命令面板 (Cmd/Ctrl+Shift+P) → "Preferences: Open Keyboard Shortcuts (JSON)"',
  '3. Add this keybinding (the file must be a JSON array):':
    '3. 添加快捷键绑定（文件必须是 JSON 数组）：',
  'To install the Shift+Enter keybinding:': '要安装 Shift+Enter 快捷键绑定：',
  'reconnecting ({attempt}/{max})…': '正在重新连接（{attempt}/{max}）…',
  'connecting…': '正在连接…',
  'Checked in at {path}': '已在 {path} 签入',
  'Suggested rules:': '建议的规则：',
  'Failed to generate agent': '生成智能体失败',
  'Network error accessing {url}': '访问 {url} 时网络错误',
  'Network error accessing {url}: {details}':
    '访问 {url} 时网络错误：{details}',
  'Git {authType} authentication failed for {url}':
    'Git {authType} 认证在 {url} 失败',
  'Git {operation} timed out for {url}': 'Git {operation} 在 {url} 超时',
  'Failed to parse manifest at {path}: {parseError}':
    '解析 {path} 的清单失败：{parseError}',
  'Invalid manifest at {path}: {errors}': '{path} 的清单无效：{errors}',
  'Plugin "{pluginId}" not found in marketplace "{marketplace}"':
    '在市场 "{marketplace}" 中未找到插件 "{pluginId}"',
  'Marketplace "{marketplace}" not found': '未找到市场 "{marketplace}"',
  'Failed to load marketplace "{marketplace}": {reason}':
    '加载市场 "{marketplace}" 失败：{reason}',
  'Invalid MCP server config for "{serverName}": {validationError}':
    '"{serverName}" 的 MCP 服务器配置无效：{validationError}',
  'MCP server "{serverName}" skipped — same command/URL as {dup}':
    'MCP 服务器 "{serverName}" 已跳过 — 与 {dup} 的命令/URL 相同',
  'Failed to load hooks from {hookPath}: {reason}':
    '从 {hookPath} 加载钩子失败：{reason}',
  'Failed to load {component} from {path}: {reason}':
    '从 {path} 加载 {component} 失败：{reason}',
  'Failed to download MCPB from {url}: {reason}':
    '从 {url} 下载 MCPB 失败：{reason}',
  'Failed to extract MCPB {mcpbPath}: {reason}':
    '解压 MCPB {mcpbPath} 失败：{reason}',
  'MCPB manifest invalid at {mcpbPath}: {validationError}':
    '{mcpbPath} 的 MCPB 清单无效：{validationError}',
  'Marketplace "{marketplace}" is blocked by enterprise policy':
    '市场 "{marketplace}" 被企业策略阻止',
  'Marketplace "{marketplace}" is not in the allowed marketplace list':
    '市场 "{marketplace}" 不在允许的市场列表中',
  'Dependency "{dependency}" is disabled': '依赖 "{dependency}" 已禁用',
  'Dependency "{dependency}" is not installed': '依赖 "{dependency}" 未安装',
  'Plugin "{plugin}" not cached at {installPath}':
    '插件 "{plugin}" 未在 {installPath} 缓存',
  'Invalid LSP server config for "{serverName}": {validationError}':
    '"{serverName}" 的 LSP 服务器配置无效：{validationError}',
  'LSP server "{serverName}" failed to start: {reason}':
    'LSP 服务器 "{serverName}" 启动失败：{reason}',
  'LSP server "{serverName}" crashed with exit code {exitCode}':
    'LSP 服务器 "{serverName}" 崩溃，退出代码 {exitCode}',
  'LSP server "{serverName}" crashed with signal {signal}':
    'LSP 服务器 "{serverName}" 因信号 {signal} 崩溃',
  'LSP server "{serverName}" {method} failed: {error}':
    'LSP 服务器 "{serverName}" {method} 失败：{error}',
  'LSP server "{serverName}" timed out on {method} after {timeoutMs}ms':
    'LSP 服务器 "{serverName}" 在 {method} 上超时（{timeoutMs}ms）',
  'Authentication successful for {serverName}. The server will connect when the agent runs.':
    '{serverName} 认证成功。服务器将在智能体运行时连接。',
  'Marketplace {name} already on disk — declared in {scope} settings':
    '市场 {name} 已在磁盘上 — 在 {scope} 设置中声明',
  'Not now': '稍后再说',
  'Would you like to:': '您想要：',
  'What would you like to do?': '您想要做什么？',
  'You can either:': '您可以：',
  'Press any key to exit': '按任意键退出',
  'Press any key to return to API key selection': '按任意键返回 API 密钥选择',
  'Press Enter to try again, or any other key to cancel':
    '按回车重试，或按其他任意键取消',
  'Please enter a repository name to continue': '请输入仓库名称以继续',
  'Then we can dive into what you want to build!':
    '然后我们就可以深入了解您想要构建什么！',
  'View the latest workflow template at:': '查看最新工作流模板：',
  'Using existing API key secret': '使用现有 API 密钥机密',
  'got it': '知道了',
  'good to know': '好的',
  noted: '已记录',
  'Next steps:': '后续步骤：',
  'How to fix:': '如何修复：',
  '1. Install the Claude GitHub App if you have not already':
    '1. 如果尚未安装，请安装 Claude GitHub App',
  'Used by: ': '使用者：',
  'URL:': 'URL：',
  'Type: ': '类型：',
  'User MCP Server': '用户 MCP 服务器',
  'Project MCP Server': '项目 MCP 服务器',
  'Looks like an error occurred. Let me show you how to fix it.':
    '似乎发生了错误。让我向您展示如何修复。',
  'Tool name:': '工具名称：',

  // ── i18n batch: autonomy / plugin errors / misc ────────────────
  'Auto mode': '自动模式',
  'Check whether auto permission mode is available and why':
    '检查自动权限模式是否可用及原因',
  'Runs summary': '运行摘要',
  'Show queued/running/completed/failed run totals and latest run':
    '显示排队/运行中/已完成/失败的运行总数和最新运行',
  'Recent runs': '最近运行',
  'List recent autonomy run IDs, triggers, statuses, and prompts':
    '列出最近的自主运行 ID、触发器、状态和提示',
  'Flows summary': '流程摘要',
  'Show managed flow totals across queued/running/waiting states':
    '显示跨排队/运行中/等待状态的托管流程总数',
  'Recent flows': '最近流程',
  'List recent managed flow IDs, status, current step, and goal':
    '列出最近的托管流程 ID、状态、当前步骤和目标',
  Cron: 'Cron',
  'Show scheduled autonomy jobs, durability, recurrence, and next run':
    '显示计划的自主任务、持久性、重复周期和下次运行',
  'Workflow runs': '工作流运行',
  'Show persisted WorkflowTool runs and their current workflow step':
    '显示持久化的 WorkflowTool 运行及其当前工作流步骤',
  Teams: '团队',
  'Show Agent Teams, teammate backends, activity, and open tasks':
    '显示智能体团队、队友后端、活动和开放任务',
  Pipes: '管道',
  'Show UDS/named-pipe and LAN registry for terminal messaging':
    '显示 UDS/命名管道和 LAN 注册表（用于终端消息传递）',
  'Show daemon state and live background or interactive sessions':
    '显示守护进程状态和实时后台或交互式会话',
  'Remote Control': '远程控制',
  'Show bridge mode, base URL, token presence, and entitlement note':
    '显示桥接模式、基本 URL、令牌存在和权限说明',
  RemoteTrigger: '远程触发器',
  'Show recent remote trigger audit records, failures, and latest call':
    '显示最近的远程触发器审计记录、失败和最新调用',
  'Flow {id}': '流程 {id}',
  'Resume {id}': '恢复 {id}',
  'Cancel {id}': '取消 {id}',
  'Cancel {status} flow': '取消 {status} 流程',
  'Resume waiting flow': '恢复等待中的流程',
  'Resume waiting step: {step}': '恢复等待中的步骤：{step}',
  'Full deep status': '完整深度状态',
  'Print every local autonomy surface in one diagnostic report':
    '在一个诊断报告中打印所有本地自主面',
  'Failed to remove "{name}": {msg}': '移除 "{name}" 失败：{msg}',
  'Removed "{name}" from {scopes} settings':
    '已从 {scopes} 设置中移除 "{name}"',
  'Removed marketplace "{name}"': '已移除市场 "{name}"',
  'No plugin errors': '无插件错误',
  'Errors ({count})': '错误（{count} 个）',
  'Plugin Command Usage:': '插件命令用法：',
  'Managed by your organization — contact your admin':
    '由您的组织管理 — 请联系管理员',
  'Add the marketplace first using /plugin marketplace add':
    '请先使用 /plugin marketplace add 添加市场',
  'Available marketplaces: {list}': '可用市场：{list}',
  'Configured marketplaces:\n{list}': '已配置的市场：\n{list}',
  'Loading marketplaces...': '正在加载市场…',
  'Error loading marketplaces: {msg}': '加载市场时出错：{msg}',
  'Marketplaces:': '市场：',
  'Allowed sources: {list}': '允许的来源：{list}',
  'This marketplace source is explicitly blocked by your administrator':
    '此市场源已被管理员明确阻止',
  'Contact your administrator to configure allowed marketplace sources':
    '请联系您的管理员配置允许的市场来源',
  'Plugin may not exist in marketplace "{marketplace}"':
    '插件可能不存在于市场 "{marketplace}" 中',
  'Disable plugin "{plugin}" if you want this plugin':
    '如果要保留此插件，请禁用插件 "{plugin}"',
  'Remove "{name}" from your MCP config if you want the plugin':
    '如果要保留该插件，请从 MCP 配置中移除 "{name}"',
  'Enable "{dependency}" or uninstall "{plugin}"':
    '启用 "{dependency}" 或卸载 "{plugin}"',
  'Install "{dependency}" or uninstall "{plugin}"':
    '安装 "{dependency}" 或卸载 "{plugin}"',
  'Restart to retry loading plugins': '重启以重新加载插件',
  'Run /plugins to refresh the plugin cache': '运行 /plugins 刷新插件缓存',
  'Check that the path in your manifest or marketplace config is correct':
    '检查清单或市场配置中的路径是否正确',
  'Check {component} directory structure and file permissions':
    '检查 {component} 目录结构和文件权限',
  'Check manifest file syntax in the plugin directory':
    '检查插件目录中的清单文件语法',
  'Check manifest file follows the required schema':
    '检查清单文件是否符合所需架构',
  'Check MCP server configuration in .mcp.json or manifest':
    '检查 .mcp.json 或清单中的 MCP 服务器配置',
  'Check LSP server configuration in the plugin manifest':
    '检查插件清单中的 LSP 服务器配置',
  'Check LSP server logs with --debug for details':
    '使用 --debug 检查 LSP 服务器日志以获取详细信息',
  'Check hooks.json file syntax and structure':
    '检查 hooks.json 文件语法和结构',
  'Check your internet connection and try again': '请检查您的网络连接并重试',
  'Check your internet connection and URL accessibility':
    '请检查您的网络连接和 URL 可访问性',
  'Configure credentials or use SSH URL instead': '请配置凭据或改用 SSH URL',
  'Configure SSH keys or use HTTPS URL instead':
    '请配置 SSH 密钥或改用 HTTPS URL',
  'Contact the plugin author about the invalid manifest':
    '请联系插件作者关于无效清单的问题',
  'Verify the MCPB file is valid and not corrupted':
    '验证 MCPB 文件是否有效且未损坏',
  'Validation:': '验证：',
  'Management:': '管理：',
  'Installation:': '安装：',
  'For more help:': '更多帮助：',
  'Also requested:': '同时请求：',
  'All tools selected': '已选择所有工具',
  'Hide advanced options': '隐藏高级选项',
  'Show advanced options': '显示高级选项',
  'Individual Tools:': '单个工具：',
  'MCP Servers:': 'MCP 服务器：',
  'Field {current} of {total}': '字段 {current}/{total}',
  'Tab: Next field · Enter: Save and continue':
    'Tab：下一个字段 · Enter：保存并继续',
  'Enter: Save configuration': 'Enter：保存配置',
  'Continue without waiting': '不等待继续',
  'MCP server "{serverName}" requests your input':
    'MCP 服务器 "{serverName}" 请求您的输入',
  'MCP server "{serverName}" — waiting for completion':
    'MCP 服务器 "{serverName}" — 等待完成',
  'MCP server "{serverName}" wants to open a URL':
    'MCP 服务器 "{serverName}" 想要打开 URL',
  'Waiting for the server to confirm completion…': '正在等待服务器确认完成…',
  'Opening your options\u2026': '正在打开选项…',
  'Claude Code needs your input': 'Claude Code 需要您的输入',
  'This field is required': '此字段为必填项',
  'File does not exist': '文件不存在',
  'Pattern did not match any content': '模式未匹配任何内容',
  'Insert new cell': '插入新单元格',
  'Delete cell': '删除单元格',
  'Replace cell contents': '替换单元格内容',
  'Read file': '读取文件',
  'Task #{taskId} assigned by {assignedBy}':
    '任务 #{taskId} 由 {assignedBy} 分配',
  'Open System Settings → Accessibility': '打开系统设置 → 无障碍',
  'Open System Settings → Screen Recording': '打开系统设置 → 屏幕录制',

  // ── i18n batch: remaining high-priority ─────────────────────────
  'A tool for editing files': '一个用于编辑文件的工具',
  'Add funds to continue with extra usage': '添加额度以继续使用超额用量',
  'Advisor unavailable ({code})': '顾问不可用（{code}）',
  'Auto classifier checking\u2026': '自动分类器检查中…',
  'Bash classifier checking\u2026': 'Bash 分类器检查中…',
  'Approved Plan': '已批准的计划',
  'Approved Plan (edited by user)': '已批准的计划（用户已编辑）',
  'Claude wants to search the web for: {query}': 'Claude 想要搜索网络：{query}',
  'Clean up team and task directories when the swarm is complete':
    '在 swarm 完成后清理团队和任务目录',
  'Cleaned up directories and worktrees for team "{teamName}"':
    '已清理团队 "{teamName}" 的目录和 worktree',
  'Checking goal status\u2026': '正在检查目标状态…',
  'Goal achieved \u2014 usage report:': '目标达成 — 使用报告：',
  'Goal operation rejected': '目标操作被拒绝',
  'No active goal. The user can set one with `/goal <objective>`.':
    '没有活动目标。用户可以使用 `/goal <目标>` 设置。',
  'Goal marked as blocked after {count} consecutive attempts.':
    '目标在 {count} 次连续尝试后被标记为阻塞。',
  'Blocked attempt {count} recorded for': '已记录第 {count} 次阻塞尝试',
  'You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.':
    '您不在计划模式中。此工具仅用于在编写计划后退出计划模式。如果您的计划已获批准，请继续实施。',
  'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"':
    '用户已批准该计划。您现在无需做其他事情。请回复 "ok"。',
  'User has approved exiting plan mode. You can now proceed.':
    '用户已批准退出计划模式。您现在可以继续。',
  'Run shell command': '运行 shell 命令',
  Bash: 'Bash',
  SandboxedBash: 'SandboxedBash',
  'Running command': '正在运行命令',
  'Run PowerShell command': '运行 PowerShell 命令',
  PowerShell: 'PowerShell',
  'Web Search': '网络搜索',
  'Searching the web': '正在搜索网络',
  'No search results found.': '未找到搜索结果。',
  'Error: Missing query': '错误：缺少查询',
  'Error: Cannot specify both allowed_domains and blocked_domains in the same request':
    '错误：不能在同一请求中同时指定 allowed_domains 和 blocked_domains',
  'Editing notebook': '正在编辑 Notebook',
  'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.':
    '文件必须是 Jupyter notebook（.ipynb 文件）。要编辑其他文件类型，请使用 FileEdit 工具。',
  'Edit mode must be replace, insert, or delete.':
    '编辑模式必须是 replace、insert 或 delete。',
  'Notebook file does not exist.': 'Notebook 文件不存在。',
  'Notebook is not valid JSON.': 'Notebook 不是有效的 JSON。',
  'Cell ID must be specified when not inserting a new cell.':
    '不插入新单元格时必须指定单元格 ID。',
  'Unknown edit mode': '未知编辑模式',
  'Cell type is required when using edit_mode=insert.':
    '使用 edit_mode=insert 时需要指定单元格类型。',
  'Write a file to the local filesystem.': '将文件写入本地文件系统。',
  'Writing file': '正在写入文件',
  'File created successfully at: {filePath}': '文件已成功创建在：{filePath}',
  'The file {filePath} has been updated successfully.':
    '文件 {filePath} 已成功更新。',
  'Processed {count} occurrence(s) in {filePath}':
    '已处理 {filePath} 中的 {count} 处匹配',
  'File is too large to edit ({size}). Maximum editable file size is {maxSize}.':
    '文件过大（{size}）。最大可编辑文件大小为 {maxSize}。',
  'File has been unexpectedly modified. Read it again before attempting to write it.':
    '文件已被意外修改。在尝试写入前请重新读取。',
  'Finding files': '正在查找文件',
  'No files found': '未找到文件',
  '(Results are truncated. Consider using a more specific path or pattern.)':
    '（结果已被截断。请考虑使用更具体的路径或模式。）',
  Searching: '正在搜索',
  'Found {numFiles} {fileWord}': '找到 {numFiles} 个{fileWord}',
  'Found {matches} total {matchWord} across {files} {fileWord}':
    '在 {files} 个{fileWord}中共找到 {matches} 处{matchWord}',
  'Write a file': '写入文件',
  'Edit cells': '编辑单元格',
  'Insert cell': '插入单元格',
  'Replace cell': '替换单元格',
  CtxInspect: '上下文检查',
  'Context Inspect': '上下文检查',
  'Inspect the current context window contents and token usage':
    '检查当前上下文窗口内容和 token 使用情况',
  'Inspect the current conversation context': '检查当前对话上下文',
  Goal: '目标',
  'WebSearchTool requires permission.': 'WebSearchTool 需要权限。',
  TaskGet: '任务获取',
  'Task not found': '未找到任务',
  'Discover Skills': '发现技能',
  ExecuteExtraTool: '执行额外工具',
  'ExecuteExtraTool delegates permission to the target tool.':
    'ExecuteExtraTool 将权限委托给目标工具。',
  'Tool "{name}" not found. Use SearchExtraTools to discover available tools.':
    '工具 "{name}" 未找到。请使用 SearchExtraTools 发现可用工具。',
  'Tool "{name}" has not been discovered yet': '工具 "{name}" 尚未被发现',
  'Invalid parameters for tool "{name}": {message}':
    '工具 "{name}" 的参数无效：{message}',
  'Permission denied for tool "{name}": {message}':
    '工具 "{name}" 的权限被拒绝：{message}',
  'No files found matching "{pattern}"': '未找到匹配 "{pattern}" 的文件',
  'Searching for "{pattern}"': '正在搜索 "{pattern}"',
  'No matches found': '未找到匹配',
  Cancel: '取消',
  disabled: '已禁用',
  connected: '已连接',
  'not found': '未找到',
  'not running': '未在运行',
  'invalid JSON body': '无效的 JSON 主体',
  'group and command are required': '需要 group 和 command',
  'Shutting down...': '正在关闭…',
  'ACP Manager': 'ACP 管理器',
  'Press Ctrl+C to stop': '按 Ctrl+C 停止',
  'Error: agent command is required (or use --manager)':
    '错误：需要 agent 命令（或使用 --manager）',
  'WARNING: Authentication disabled. This is dangerous for remote access!':
    '警告：认证已禁用。这对外部访问很危险！',
  'Failed to connect: {message}': '连接失败：{message}',
  'Invalid {source}: expected a string': '无效的 {source}：应为字符串',
  'Invalid {type} payload': '无效的 {type} 载荷',
  'Invalid prompt payload': '无效的提示载荷',
  'Invalid permission_response payload': '无效的 permission_response 载荷',
  'Invalid WebSocket message payload': '无效的 WebSocket 消息载荷',
  'Invalid set_session_model payload': '无效的 set_session_model 载荷',
  'Unknown message type: {type}': '未知的消息类型：{type}',
  'Unsupported WebSocket message payload': '不支持的 WebSocket 消息载荷',
  'message too large': '消息过大',
  'Certificate expired, regenerating...': '证书已过期，正在重新生成…',
  'Certificate expires in {days} days, regenerating...':
    '证书将在 {days} 天后过期，正在重新生成…',
  'Using existing certificate from {dir}': '正在使用来自 {dir} 的现有证书',
  'Valid for {days} more days': '有效期还有 {days} 天',
  'LAN IP changed (missing: {ips}), regenerating certificate...':
    'LAN IP 已更改（缺少：{ips}），正在重新生成证书…',
  'Invalid certificate, regenerating...': '证书无效，正在重新生成…',
  'Generating self-signed certificate...': '正在生成自签名证书…',
  'Including LAN IPs: {ips}': '包含 LAN IP：{ips}',
  'Certificate saved to {dir}': '证书已保存到 {dir}',
  'Valid for 365 days': '有效期 365 天',
  'First access will show a security warning - click "Advanced" -> "Proceed"':
    '首次访问将显示安全警告 - 点击"高级"->"继续"',
  'Created tmux session: {sessionName}\nTo attach: {attachCmd}':
    '已创建 tmux 会话：{sessionName}\n要附加：{attachCmd}',
  'Warning: Failed to create tmux session: {error}':
    '警告：创建 tmux 会话失败：{error}',
  'WARNING: Running as root/sudo with bypass permissions mode is dangerous.':
    '警告：以 root/sudo 身份使用绕过权限模式是危险的。',
  'Bypass mode skips ALL permission checks. Combined with root, any command (rm -rf /, chmod, dd) executes without review.':
    '绕过模式跳过所有权限检查。结合 root 权限，任何命令（rm -rf /、chmod、dd）都会不经审查执行。',
  '\nI understand the risks. Continue? [y/N] ':
    '\n我了解风险。是否继续？[y/N] ',
  'Aborted.': '已中止。',
  '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons':
    '出于安全原因，--dangerously-skip-permissions 不能与 root/sudo 权限一起使用',
  '--dangerously-skip-permissions can only be used in Docker/sandbox containers with no internet access but got Docker: {isDocker}, Bubblewrap: {isBubblewrap}, IS_SANDBOX: {isSandbox}, hasInternet: {hasInternet}':
    '--dangerously-skip-permissions 只能在无互联网访问的 Docker/sandbox 容器中使用，当前状态 Docker：{isDocker}、Bubblewrap：{isBubblewrap}、IS_SANDBOX：{isSandbox}、hasInternet：{hasInternet}',
  'Error: Claude Code requires Node.js version 18 or higher.':
    '错误：Claude Code 需要 Node.js 18 或更高版本。',
  'Error: Failed to start messaging socket (UDS_INBOX): {error}':
    '错误：启动消息传递套接字（UDS_INBOX）失败：{error}',
  'Detected an interrupted iTerm2 setup. Your original settings have been restored. You may need to restart iTerm2 for the changes to take effect.':
    '检测到 iTerm2 设置被中断。您的原始设置已恢复。您可能需要重启 iTerm2 以使更改生效。',
  'Failed to restore iTerm2 settings. Please manually restore your original settings with: defaults import com.googlecode.iterm2 {backupPath}.':
    '恢复 iTerm2 设置失败。请使用以下命令手动恢复您的原始设置：defaults import com.googlecode.iterm2 {backupPath}。',
  'Detected an interrupted Terminal.app setup. Your original settings have been restored. You may need to restart Terminal.app for the changes to take effect.':
    '检测到 Terminal.app 设置被中断。您的原始设置已恢复。您可能需要重启 Terminal.app 以使更改生效。',
  'Working...': '工作中…',
  'No claude.ai OAuth token available': '没有可用的 claude.ai OAuth 令牌',
  'No claude.ai OAuth token found': '未找到 claude.ai OAuth 令牌',
  'No code verifier saved': '未保存代码验证器',
  'Unexpected auth result: ': '意外的认证结果：',
  'Cursor login cancelled': 'Cursor 登录已取消',
  'Cursor login failed ({status})': 'Cursor 登录失败（{status}）',
  'Cursor login timed out after 10 minutes': 'Cursor 登录超时（超过 10 分钟）',
  'Cursor token refresh failed ({status})': 'Cursor 令牌刷新失败（{status}）',
  'Cursor session expired. Re-add this connection via /connect to sign in again.':
    'Cursor 会话已过期。请通过 /connect 重新添加此连接以重新登录。',
  'Cursor account is not signed in. Run /connect and add a Cursor connection with browser sign-in.':
    'Cursor 账号未登录。请运行 /connect 并添加使用浏览器登录的 Cursor 连接。',
  'Unable to get organization UUID': '无法获取组织 UUID',
  'No access token available': '无可用访问令牌',
  'Session expired. Please run /login to sign in again.':
    '会话已过期。请运行 /login 重新登录。',
  'Workspace API key must start with sk-ant-api03-, got prefix "{prefix}...". Obtain a workspace API key from https://console.anthropic.com/settings/keys. Press W in /login to save your key, or set ANTHROPIC_API_KEY.':
    'Workspace API 密钥必须以 sk-ant-api03- 开头，获取的前缀为 "{prefix}..."。请从 https://console.anthropic.com/settings/keys 获取 Workspace API 密钥。在 /login 中按 W 保存密钥，或设置 ANTHROPIC_API_KEY。',
  'Claude Code web sessions require authentication with a Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status.':
    'Claude Code 网络会话需要使用 Claude.ai 账号进行认证。API 密钥认证不足以访问此功能。请运行 /login 进行认证，或通过 /status 检查认证状态。',
  'Failed to fetch code sessions: {status}': '获取代码会话失败：{status}',
  'Failed to fetch session: {status} {statusText}':
    '获取会话失败：{status} {statusText}',
  'Session not found: {sessionId}': '未找到会话：{sessionId}',
  'No artifactory auth token found in ~/.npmrc':
    '在 ~/.npmrc 中未找到 artifactory 认证令牌',
  'No version found in artifactory response': '在 artifactory 响应中未找到版本',
  'Cannot send UDS message without auth token': '没有认证令牌无法发送 UDS 消息',
  'Invalid store name: store name must not be empty.':
    '无效的存储名称：存储名称不能为空。',
  'No messages to send to Cursor after conversion.':
    '转换后没有消息发送到 Cursor。',
  'Agent created': '智能体已创建',
  'Scheduled Agents ({count})': '计划智能体（{count} 个）',
  'No scheduled agents. Use /agents-platform create <cron> <prompt> to create one.':
    '没有计划智能体。使用 /agents-platform create <cron> <prompt> 创建一个。',
  'Schedule: {schedule}': '计划：{schedule}',
  'Prompt: {prompt}': '提示：{prompt}',
  'Next run: {nextRun}': '下次运行：{nextRun}',
  'ID: {id}': 'ID：{id}',
  'Agent {id} deleted.': '智能体 {id} 已删除。',
  'Agent {id} triggered.': '智能体 {id} 已触发。',
  'Run ID: {runId}': '运行 ID：{runId}',
  'Memory store created': '记忆存储已创建',
  'Memory store archived': '记忆存储已归档',
  archived: '已归档',
  active: '活跃',
  'Memory Stores ({count})': '记忆存储（{count} 个）',
  'Memory Store: {id}': '记忆存储：{id}',
  'Namespace: {namespace}': '命名空间：{namespace}',
  'No memory stores found. Use /memory-stores create <name> to create one.':
    '没有找到记忆存储。使用 /memory-stores create <名称> 创建一个。',
  'Vault created': '保险库已创建',
  'Vault archived': '保险库已归档',
  'Credential added': '凭据已添加',
  'Credential archived': '凭据已归档',
  'Vaults ({count})': '保险库（{count} 个）',
  'No vaults found. Use /vault create <name> to create one.':
    '没有找到保险库。使用 /vault create <名称> 创建一个。',
  'Checking connectivity...': '正在检查连接…',
  'Unable to connect to Anthropic services': '无法连接到 Anthropic 服务',
  'Vault: {id}': '保险库：{id}',
  'Vault: {vaultId}': '保险库：{vaultId}',
  'Credentials in {vaultId} ({count})': '{vaultId} 中的凭据（{count} 个）',
  'No credentials in vault {vaultId}. Use /vault add-credential {vaultId} <key> <value> to add one.':
    '保险库 {vaultId} 中没有凭据。使用 /vault add-credential {vaultId} <键> <值> 添加一个。',
  'Name: {name}': '名称：{name}',
  'Created: {createdAt}': '创建时间：{createdAt}',
  'Archived: {archivedAt}': '归档时间：{archivedAt}',

  // ── 补充高频翻译 ──
  Ready: '就绪',
  Connecting: '连接中',
  Attached: '已连接',
  Reconnected: '已重新连接',
  'Saving...': '保存中…',
  Enabled: '已启用',
  removed: '已移除',
  authenticated: '已认证',
  About: '关于',
  Off: '关闭',
  On: '开启',
  Send: '发送',
  Submit: '提交',
  Skip: '跳过',
  Error: '错误',
  Tool: '工具',
  Result: '结果',
  Expand: '展开',
  Today: '今天',
  Yesterday: '昨天',
  Older: '更早',
  All: '全部',
  'Session history': '历史会话',
  Discover: '发现',
  'New Thread': '新会话',
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
  'Toggle theme': '切换主题',
  'Select a model...': '选择模型…',
  'No models found.': '未找到模型。',
  'Select Model': '选择模型',
  'No results': '无结果',
  'Search…': '搜索…',
  'New Session': '新会话',
  Create: '创建',
  'Creating...': '创建中…',
  'Title (optional)': '标题（可选）',
  'My session': '我的会话',
  Environment: '环境',
  '-- None --': '-- 无 --',
  'no branch': '无分支',
  'Start conversation': '开始对话',
  'Failed to create session': '会话创建失败',
  'Send message to Claude...': '给 Claude 发送消息…',
  'Command list': '命令列表',
  'Enter to send, Shift+Enter for new line': 'Enter 发送，Shift+Enter 换行',
  'Waiting for session...': '等待会话…',
  Start: '开始',
  Stop: '停止',
  Press: '按',
  'to cancel': '取消',
  back: '返回',

  // ── 补充高频翻译 第二批 ──
  'Remote Control Failed': '远程控制失败',
  'Remote Control failed': '远程控制失败',
  'Remote Control active': '远程控制活跃',
  'Remote Control reconnecting': '远程控制重新连接中',
  'Remote Control connecting…': '远程控制连接中…',
  'Something went wrong, please try again': '出了点问题，请重试',
  'Session creation failed': '会话创建失败',
  'session ended': '会话已结束',
  'Session completed': '会话已完成',
  'Execution completed': '执行已完成',
  'Session resumed': '会话已恢复',
  'Remote task': '远程任务',
  'Background task': '后台任务',
  'Plain text': '纯文本',
  'Permission Request': '权限请求',
  'Submit All': '全部提交',
  'Connecting...': '连接中…',
  'No messages yet': '暂无消息',
  'Always Allow': '始终允许',
  'Always Reject': '始终拒绝',
  'Bypass Permissions': '绕过权限',
  'Accept Edits': '接受编辑',
  Plugin: '插件',
  MCP: 'MCP',
  'Export Conversation': '导出对话',
  'Select export method:': '选择导出方式：',
  'Hook details': 'Hook 详情',
  'MCP Monitor': 'MCP 监控',
  'Memory consolidation': '记忆整合',
  'Delete agent': '删除 agent',
  'Review your answers': '检查你的答案',
  'Toggle thinking mode': '切换思考模式',
  'View agent': '查看 agent',
  'Edit agent': '编辑 agent',
  'Yes, delete': '是，删除',
  'No, cancel': '否，取消',
  'Submit answers': '提交答案',
  'Yes, show review': '是，查看审查',
  'No, skip': '否，跳过',
  'Restore code and conversation': '恢复代码和对话',
  'Restore conversation': '恢复对话',
  'Restore code': '恢复代码',
  'Summarize from here': '从此处摘要',
  'Summarize up to here': '摘要至此',
  'Never mind': '算了',
  'Terminate session': '终止会话',
  'Implement here': '在此实现',
  'Start new session': '开始新会话',
  'No, not now': '否，稍后',
  'Run ultraplan': '运行 ultraplan',
  'View repository': '查看仓库',
  'Open homepage': '打开主页',
  'Back to plugin list': '返回插件列表',
  'Plugin options': '插件选项',
  'Subagent Login': '子 Agent 登录',
  Installed: '已安装',
  'Disable plugin': '禁用插件',
  'Enable plugin': '启用插件',
  Configure: '配置',
  'Configure options': '配置选项',
  Uninstall: '卸载',
  'Update now': '立即更新',
  'will enable': '将启用',
  'will disable': '将禁用',
  'Enter to auth': 'Enter 认证',
  'Mark for update': '标记为更新',
  'Unmark for update': '取消更新标记',
  'Update marketplace': '更新市场',
  'Remove marketplace': '移除市场',
  'Disable auto-update': '禁用自动更新',
  'Enable auto-update': '启用自动更新',
  'Failed to load marketplaces': '加载市场失败',
  'Failed to update setting': '更新设置失败',
  'No MCPB file found in plugin': '插件中未找到 MCPB 文件',
  'Loading environments...': '加载环境中…',
  'Updating...': '更新中…',
  'Validating session': '验证会话中',
  'Fetching session logs': '获取会话日志中',
  'Getting branch info': '获取分支信息中',
  'Checking out branch': '切换分支中',
  'Install Chrome extension': '安装 Chrome 扩展',
  'Claude in Chrome (Beta)': 'Claude in Chrome（Beta）',
  'iTerm2 Split Pane Setup': 'iTerm2 分割窗格设置',
  'You can try installing manually:': '您可以尝试手动安装：',
  'Install it2 now': '立即安装 it2',
  'Use tmux instead': '使用 tmux 替代',
  'Output as JSON': '以 JSON 输出',
  'Show command syntax': '显示命令语法',
  'KEY NAME': '键名',
  'Key required': '需要密钥',
  'Confirm Overwrite': '确认覆盖',
  'Show all stores': '显示所有存储',
  'Create a new memory store': '创建新的记忆存储',
  'List all stores': '列出所有存储',
  'Archive a store': '归档存储',
  'Fetch entry by key': '按键获取条目',
  'Show stored secret keys': '显示已存储的密钥键',
  'Secret value cannot be empty': '密钥值不能为空',
  'Store name required': '需要存储名称',
  'PowerShell tool requires interactive approval':
    'PowerShell 工具需要交互式批准',
  'Computer Use permission dialog aborted': 'Computer Use 权限对话框已取消',
  'LSP operation failed': 'LSP 操作失败',
  'Updated plan': '计划已更新',
  'Reading Plan': '正在读取计划',
  'Read agent output': '读取 agent 输出',
  'Exiting worktree…': '正在退出工作树…',
  'Creating worktree…': '正在创建工作树…',
  'Successfully loaded skill': '成功加载技能',
  'Kept worktree': '已保留工作树',
  'Removed worktree': '已移除工作树',
  'Artifact uploaded: ': 'Artifact 已上传：',
  'expires: ': '过期时间：',
  'create team: ': '创建团队：',
  'cleanup team: current': '清理团队：当前',
  'Error compacting conversation': '压缩对话时出错',
  'Tool use is not allowed during compaction': '压缩期间不允许使用工具',
  'Permission pipeline failed': '权限管道失败',
  'Permission request cancelled by client': '客户端取消了权限请求',
  'Permission denied by client': '客户端拒绝了权限',
  'Permission request failed': '权限请求失败',
  'Tool use aborted': '工具使用已中止',
  'Cannot connect to server': '无法连接到服务器',
  'No authentication available': '无可用的身份验证',
  'No OAuth token available': '没有可用的 OAuth 令牌',
  'No enabled plugins to disable': '没有已启用的插件可禁用',
  'Failed to write secure storage': '写入安全存储失败',
  'Connection has no linked OAuth account': '连接没有关联的 OAuth 账户',
  'Session creation failed — see debug log': '会话创建失败 — 查看调试日志',
  'Failed to analyze rules: ': '分析规则失败：',
  'Command completed': '命令已完成',
  'Commands are in the form /command [args]': '命令格式为 /command [参数]',
  'No active autofix monitor.': '没有活跃的自动修复监控。',
  'Not authorized': '未授权',
  'Network error': '网络错误',
  'No git remote found': '没有找到 git remote',
  'OAuth not available': 'OAuth 不可用',
  skills: '技能',
  agents: 'agent',
  'Error: Remote Control base URL uses HTTP. Only HTTPS or localhost HTTP is allowed.':
    '错误：远程控制基础 URL 使用 HTTP。仅允许 HTTPS 或 localhost HTTP。',
  'Error: Multi-session Remote Control is not enabled for your account yet.':
    '错误：多会话远程控制尚未为您的账户启用。',
  'Failed to resume session with --print mode': '在 --print 模式下恢复会话失败',
  'Warning: Saved spawn mode is worktree but this directory is not a git repository. Falling back to same-dir.':
    '警告：保存的 spawn 模式为 worktree，但此目录不是 git 仓库。回退到 same-dir。',
  'Lost sync with Remote Control — events could not be delivered':
    '与远程控制失去同步 — 事件无法送达',
  'Work item lease expired, fetching fresh token':
    '工作项租约过期，正在获取新令牌',
  'User rejected request to exit plan mode.': '用户拒绝了退出计划模式的请求。',
  'Provide feedback to refine the plan': '提供反馈以优化计划',
  'Tell Claude what to change...': '告诉 Claude 需要更改什么…',
  'Remote credentials fetch failed — see debug log':
    '远程凭据获取失败 — 查看调试日志',
  '[daemon] supervisor starting in {dir}': '[守护进程] 管理器在 {dir} 启动',
  '[daemon] supervisor shutting down...': '[守护进程] 管理器正在关闭…',
  '[daemon] supervisor stopped': '[守护进程] 管理器已停止',

  // ── 补充高频翻译 第三批 ──
  '=== Daemon Supervisor ===': '=== 守护进程管理器 ===',
  '=== Background Sessions ===': '=== 后台会话 ===',
  'daemon is not running': '守护进程未运行',
  'daemon was stale (cleaned up)': '守护进程已过期（已清理）',
  'daemon stopped': '守护进程已停止',
  'daemon could not be stopped (may have already exited)':
    '守护进程无法停止（可能已退出）',
  'stopping daemon (PID: {pid})...': '正在停止守护进程（PID: {pid}）…',
  'Unknown daemon subcommand: {sub}': '未知的守护进程子命令：{sub}',
  'Error: --daemon-worker requires a worker kind':
    '错误：--daemon-worker 需要一个 worker 类型',
  'New sessions will be created in an isolated worktree':
    '新会话将在隔离的工作树中创建',
  'New sessions will be created in the current directory':
    '新会话将在当前目录中创建',
  'Spawn mode: worktree (new sessions get isolated git worktrees)':
    'Spawn 模式：worktree（新会话获得隔离的 git 工作树）',
  'Spawn mode: same-dir (new sessions share the current directory)':
    'Spawn 模式：same-dir（新会话共享当前目录）',
  'Single session · exits when complete': '单会话 · 完成后退出',
  'Sandbox: ': '沙箱：',
  'Enable Remote Control? (y/n) ': '启用远程控制？(y/n) ',
  'Error: Workspace not trusted. Please run `claude` in {dir} first to review and accept the workspace trust dialog.':
    '错误：工作区不受信任。请先在 {dir} 中运行 `claude` 以查看并接受工作区信任对话框。',
  'Error: You must be logged in to use Remote Control.':
    '错误：您必须登录才能使用远程控制。',
  'Remote Control is only available with claude.ai subscriptions. Please use `/login` to sign in with your claude.ai account.':
    '远程控制仅适用于 claude.ai 订阅用户。请使用 `/login` 登录您的 claude.ai 账户。',
  'Remote Control disconnected.': '远程控制已断开。',
  'Remote Control is not yet enabled for your account.':
    '远程控制尚未为您的账户启用。',
  'Remote Control is not available in this build.': '此版本不支持远程控制。',
  'Unable to determine your organization for Remote Control eligibility. Run `claude auth login` to refresh your account information.':
    '无法确定您的组织是否符合远程控制资格。请运行 `claude auth login` 刷新您的账户信息。',
  'Invalid {label}: contains unsafe characters':
    '无效的 {label}：包含不安全字符',
  '{context}: Authentication failed (401){detail}. {instruction}':
    '{context}：认证失败 (401){detail}。{instruction}',
  '{context}: Access denied (403){detail}. Check your organization permissions.':
    '{context}：访问被拒绝 (403){detail}。请检查您的组织权限。',
  '{context}: Not found (404). Remote Control may not be available for this organization.':
    '{context}：未找到 (404)。远程控制可能不适用于此组织。',
  '{context}: Rate limited (429). Polling too frequently.':
    '{context}：频率限制 (429)。轮询过于频繁。',
  '{context}: Failed with status {status}{detail}':
    '{context}：失败，状态码 {status}{detail}',
  'Resuming session {sessionId} ({ageStr} ago){fromWt}…':
    '正在恢复会话 {sessionId}（{ageStr} 前）{fromWt}…',
  'Spawn mode for this project:': '此项目的 Spawn 模式：',
  'Choose [1/2] (default: 1): ': '选择 [1/2]（默认：1）：',
  '{count} actions': '{count} 个操作',
  '{serverName} MCP Server': '{serverName} MCP 服务器',
  '{count} tools': '{count} 个工具',
  '{count}x {name}': '{count}x {name}',
  '{n} tool calls': '{n} 次工具调用',
  '{n} tools: {list}': '{n} 个工具：{list}',
  '✗ {msg}': '✗ {msg}',
  '{count} {word}': '{count} {word}',
  'Invalid key (allowed: letters/digits/._- only; no leading dot; not a Windows reserved name)':
    '无效的键（仅允许字母/数字/._-；不以点开头；非 Windows 保留名称）',
  'y/Enter = overwrite · n/Esc = cancel': 'y/Enter = 覆盖 · n/Esc = 取消',
  'Enter = next · Esc = back': 'Enter = 下一步 · Esc = 返回',
  ' A browser window will open for authentication': ' 浏览器窗口将打开进行认证',
  ' connecting…': ' 连接中…',
  'Quick, straightforward implementation': '快速、直接的实现',
  'Balanced approach with standard testing': '平衡的方法与标准测试',
  'Thorough implementation with comprehensive testing':
    '全面的实现与完整的测试',
  'Exhaustive implementation with maximal quality': '详尽的实现与最高质量',
  'Effort level set to auto': 'Effort 级别已设为自动',
  Plugins: '插件',
  Marketplaces: '市场',
  'Install for you (user scope)': '为你安装（用户范围）',
  'Install for all collaborators on this repository (project scope)':
    '为此仓库的所有协作者安装（项目范围）',
  'Install for you, in this repo only (local scope)':
    '为你安装，仅此仓库（本地范围）',
  'open in editor': '在编辑器中打开',
  'switch tab': '切换标签',
  'expand history': '展开历史',
  'view summary': '查看摘要',
  resume: '恢复',

  // ── 补充翻译 第四批 ──
  Logout: '退出登录',
  Edit: '编辑',
  View: '查看',
  List: '列表',
  Failure: '失败',
  OK: '正常',
  Search: '搜索',
  Read: '读取',
  Write: '写入',
  Open: '打开',
  Reading: '读取中',
  Writing: '写入中',
  Editing: '编辑中',
  Clicked: '已点击',
  Update: '更新',
  'Processing…': '处理中…',
  Running: '运行中',
  Decline: '拒绝',
  Copy: '复制',
  Manual: '手动',
  Custom: '自定义',
  'needs authentication': '需要认证',
  login: '登录',
  'Login method': '登录方式',
  'Auth token': '认证令牌',
  'API key': 'API 密钥',
  Organization: '组织',
  Email: '邮箱',
  'API provider': 'API 提供者',
  'Anthropic base URL': 'Anthropic 基础 URL',
  'AWS Bedrock': 'AWS Bedrock',
  Proxy: '代理',
  'Additional CA cert(s)': '额外 CA 证书',
  'mTLS client cert': 'mTLS 客户端证书',
  'mTLS client key': 'mTLS 客户端密钥',
  'Bash Sandbox': 'Bash 沙箱',
  'Setting sources': '设置来源',
  'Connected to {ideName} {pluginOrExtension}':
    '已连接至 {ideName} {pluginOrExtension}',
  'Not connected to {ideName}': '未连接到 {ideName}',
  'Installed {ideName} {pluginOrExtension}':
    '已安装 {ideName} {pluginOrExtension}',
  'No write permissions for auto-updates (requires sudo)':
    '没有自动更新的写入权限（需要 sudo）',
  'Found invalid settings files: {fileList}. They will be ignored.':
    '发现无效的设置文件：{fileList}。它们将被忽略。',
  'Search: {status} ({mode})': '搜索：{status}（{mode}）',
  'Claude Code Daemon — background process management':
    'Claude Code 守护进程 — 后台进程管理',
  USAGE: '用法',
  SUBCOMMANDS: '子命令',
  'Login with a claude.ai account': '使用 claude.ai 账户登录',
  'Claude Code Remote Control — persist sessions across devices':
    'Claude Code 远程控制 — 跨设备持久会话',
  OPTIONS: '选项',
  EXAMPLES: '示例',
  'Same-dir spawn mode — share the current directory across sessions':
    'Same-dir spawn 模式 — 跨会话共享当前目录',
  'Worktree spawn mode — isolate each session':
    'Worktree spawn 模式 — 隔离每个会话',
  'Session spawn mode — single active session':
    'Session spawn 模式 — 单个活跃会话',
  'Add or update a provider connection': '添加或更新提供者连接',
  'List all configured connections': '列出所有已配置的连接',
  'Set the active connection for current session': '设置当前会话的活跃连接',
  'Remove a connection': '移除一个连接',
  'List available models for a connection': '列出连接的可用模型',
  'Manage subagent login for background agents':
    '管理后台 agent 的子 agent 登录',
  '/login': '/login',
  '/logout': '/logout',
  'OpenAI Compatible': 'OpenAI 兼容',
  Gemini: 'Gemini',
  Grok: 'Grok',
  'Anthropic Compatible': 'Anthropic 兼容',
  'Claude Account': 'Claude 账户',
  'Cursor Account': 'Cursor 账户',
  Cursor: 'Cursor',
  Haiku: 'Haiku',
  Sonnet: 'Sonnet',
  Opus: 'Opus',
  Claude: 'Claude',
  Fable: 'Fable',
  IDE: 'IDE',
  'Anthropic API': 'Anthropic API',
  'Gemini API': 'Gemini API',
  Anthropic: 'Anthropic',
  'Google Vertex AI': 'Google Vertex AI',
  'Microsoft Foundry': 'Microsoft Foundry',
  'Grok API': 'Grok API',
  'Bedrock base URL': 'Bedrock 基础 URL',
  'AWS region': 'AWS 区域',
  'Vertex base URL': 'Vertex 基础 URL',
  'GCP project': 'GCP 项目',
  'Default region': '默认区域',
  'Microsoft Foundry base URL': 'Microsoft Foundry 基础 URL',
  'Microsoft Foundry resource': 'Microsoft Foundry 资源',
  'Gemini base URL': 'Gemini 基础 URL',
  'Grok base URL': 'Grok 基础 URL',
  'OpenAI base URL': 'OpenAI 基础 URL',
  ' from worktree {dir}': ' 来自工作树 {dir}',
  'Bridge not connected': 'Bridge 未连接',
  'No target session specified': '未指定目标会话',
  'JWT expired — refreshing': 'JWT 已过期 — 正在刷新',
  'JWT refresh failed: no OAuth token': 'JWT 刷新失败：无 OAuth 令牌',
  'JWT refresh failed after 401': 'JWT 在 401 后刷新失败',
  'Transport closed (code {code})': '传输已关闭（code {code}）',
  'session expired · /remote-control to reconnect':
    '会话已过期 · /remote-control 重新连接',
  'Refresh failed: {error}': '刷新失败：{error}',
  'JWT refresh failed: {error}': 'JWT 刷新失败：{error}',
  'Transport setup failed: {error}': '传输设置失败：{error}',
  'run `claude update` to upgrade': '运行 `claude update` 升级',
  'Environment deleted and re-registration limit reached':
    '环境已删除且重新注册次数已达上限',
  'Environment deleted and re-registration failed': '环境已删除且重新注册失败',
  'environment lost, recreating session': '环境丢失，正在重建会话',
  'Process exited with error': '进程异常退出',
  'This session is outbound-only. Enable Remote Control locally to allow inbound control.':
    '此会话仅支持出站。请在本地启用远程控制以允许入站控制。',

  // ── Batch-filled missing translations (auto-generated sweep) ────
  'Select Assistant Session': '选择助手会话',
  'Multiple sessions found. Select one to attach:':
    '找到多个会话。请选择要连接的会话：',
  '↑↓ navigate · Enter select · Esc cancel': '↑↓ 导航 · Enter 选择 · Esc 取消',
  'Remote Control session has expired. Please restart with `claude remote-control` or /remote-control.':
    '远程控制会话已过期。请使用 `claude remote-control` 或 /remote-control 重新启动。',
  'Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.':
    '远程控制需要 claude.ai 订阅。请运行 `claude auth login` 登录您的 claude.ai 账户。',
  'Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token` or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons. Run `claude auth login` to use Remote Control.':
    '远程控制需要完整权限的登录令牌。出于安全考虑，长效令牌（来自 `claude setup-token` 或 CLAUDE_CODE_OAUTH_TOKEN）仅限推理用途。请运行 `claude auth login` 以使用远程控制。',
  'Your version of Claude Code ({version}) is too old for Remote Control.\nVersion {minVersion} or higher is required. Run `claude update` to update.':
    '您的 Claude Code 版本（{version}）过旧，无法使用远程控制。\n需要 {minVersion} 或更高版本。请运行 `claude update` 更新。',
  '\nRemote Control lets you access this CLI session from the web (claude.ai/code)\nor the Claude app, so you can pick up where you left off on any device.\n\nYou can disconnect remote access anytime by running /remote-control again.\n':
    '\n远程控制让您可以从网页（claude.ai/code）或 Claude 应用访问此 CLI 会话，\n在任何设备上接续之前的工作。\n\n随时可以再次运行 /remote-control 断开远程访问。\n',
  'Error: No recent session found in this directory or its worktrees. Run `claude remote-control` to start a new one.':
    '错误：在此目录及其 worktree 中未找到最近的会话。请运行 `claude remote-control` 启动新会话。',
  '\nClaude Remote Control is launching in spawn mode which lets you create new sessions in this project from Claude Code on Web or your Mobile app. Learn more here: https://code.claude.com/docs/en/remote-control\n\n':
    '\nClaude 远程控制正以 spawn 模式启动，您可以从 Web 版 Claude Code 或移动应用在此项目中创建新会话。了解更多：https://code.claude.com/docs/en/remote-control\n\n',
  'Spawn mode for this project:\n': '此项目的 spawn 模式：\n',
  '  [1] same-dir — sessions share the current directory (default)\n':
    '  [1] same-dir — 各会话共享当前目录（默认）\n',
  '  [2] worktree — each session gets an isolated git worktree\n\n':
    '  [2] worktree — 每个会话使用独立的 git worktree\n\n',
  'This can be changed later or explicitly set with --spawn=same-dir or --spawn=worktree.\n':
    '之后可以更改，也可以通过 --spawn=same-dir 或 --spawn=worktree 显式设置。\n',
  'Remote Control base URL uses HTTP. Only HTTPS or localhost HTTP is allowed.':
    '远程控制的 base URL 使用了 HTTP。仅允许 HTTPS 或 localhost 的 HTTP。',
  'Code everywhere with the Claude app or {url}':
    '使用 Claude 应用或 {url}，随时随地编程',
  'Continue coding in the Claude app or {url}':
    '在 Claude 应用或 {url} 继续编程',
  'Capacity: {active}/1 · New sessions will be created in an isolated worktree':
    '容量：{active}/1 · 新会话将在独立的 worktree 中创建',
  'Capacity: {active}/1 · New sessions will be created in the current directory':
    '容量：{active}/1 · 新会话将在当前目录中创建',
  "disabled by your organization's policy": '已被您所在组织的策略禁用',
  Fetching: '正在获取',
  'Running task': '正在运行任务',
  'Error: You must be logged in to use Remote Control.\n\n':
    '错误：必须登录才能使用远程控制。\n\n',
  'Invalid work secret: missing or empty session_ingress_token':
    '无效的 work secret：session_ingress_token 缺失或为空',
  'Invalid work secret: missing api_base_url':
    '无效的 work secret：缺少 api_base_url',
  '{count} active session{suffix}:': '{count} 个活跃会话{suffix}：',
  'Multiple sessions active. Specify one:': '存在多个活跃会话。请指定一个：',
  'No log path recorded for session {id}': '会话 {id} 未记录日志路径',
  'Failed to read log file: {path}': '读取日志文件失败：{path}',
  'No background sessions to attach to. Start one with `claude daemon bg`.':
    '没有可连接的后台会话。请使用 `claude daemon bg` 启动一个。',
  'Multiple background sessions. Specify one:':
    '存在多个后台会话。请指定一个：',
  'tmux is no longer available. Cannot attach to tmux session.':
    'tmux 已不可用，无法连接到 tmux 会话。',
  'Specify a session to kill:': '请指定要终止的会话：',
  'Session already exited.': '会话已退出。',
  'Session force-killed.': '会话已被强制终止。',
  'Session exited during grace period.': '会话在宽限期内已退出。',
  'Error: Background sessions with detached engine require -p/--print flag.\n':
    '错误：使用 detached 引擎的后台会话需要 -p/--print 标志。\n',
  'Background session started: {name}': '后台会话已启动：{name}',
  '  Engine: {engine}': '  引擎：{engine}',
  '  Log: {path}': '  日志：{path}',
  'Use `claude daemon attach {name}` to reconnect.':
    '使用 `claude daemon attach {name}` 重新连接。',
  'Use `claude daemon status` to check status.':
    '使用 `claude daemon status` 查看状态。',
  'Use `claude daemon kill {name}` to stop.':
    '使用 `claude daemon kill {name}` 停止。',
  'Created task {id}: {subject}': '已创建任务 {id}：{subject}',
  'No tasks found.': '未找到任务。',
  'Unable to create API key. The server accepted the request but did not return a key.':
    '无法创建 API key。服务器已接受请求，但未返回 key。',
  'Error: --console and --claudeai cannot be used together.':
    '错误：--console 和 --claudeai 不能同时使用。',
  'CLAUDE_CODE_OAUTH_SCOPES is required when using CLAUDE_CODE_OAUTH_REFRESH_TOKEN.\n':
    '使用 CLAUDE_CODE_OAUTH_REFRESH_TOKEN 时必须设置 CLAUDE_CODE_OAUTH_SCOPES。\n',
  "If the browser didn't open, visit: {url}":
    '如果浏览器未自动打开，请访问：{url}',
  'Not logged in. Run claude auth login to authenticate.':
    '尚未登录。请运行 claude auth login 进行认证。',
  'Failed to log out.': '退出登录失败。',
  'Successfully logged out from your Anthropic account.':
    '已成功退出您的 Anthropic 账户。',
  'No custom auto mode rules found.\n\n': '未找到自定义自动模式规则。\n\n',
  'Error: Directory {path} does not exist': '错误：目录 {path} 不存在',
  'Removed MCP server "{name}" from {scope} config':
    '已从 {scope} 配置中移除 MCP 服务器“{name}”',
  'MCP server "{name}" exists in multiple scopes:':
    'MCP 服务器“{name}”存在于多个作用域中：',
  '\nTo remove from a specific scope, use:\n':
    '\n要从指定作用域移除，请使用：\n',
  'Checking MCP server health...': '正在检查 MCP 服务器健康状态...',
  '\nTo remove this server, run: claude mcp remove "{name}" -s {scope}':
    '\n要移除此服务器，请运行：claude mcp remove "{name}" -s {scope}',
  'No MCP servers found in Claude Desktop configuration or configuration file does not exist.':
    'Claude Desktop 配置中未找到 MCP 服务器，或配置文件不存在。',
  'All project-scoped (.mcp.json) server approvals and rejections have been reset.\n':
    '所有项目级（.mcp.json）服务器的批准和拒绝记录均已重置。\n',
  'No plugins installed. Use `claude plugin install` to install a plugin.':
    '未安装任何插件。请使用 `claude plugin install` 安装插件。',
  'Installed plugins:': '已安装的插件：',
  '--sparse is only supported for github and git marketplace sources (got: {source})':
    '--sparse 仅支持 github 和 git 类型的 marketplace 来源（当前为：{source}）',
  '    Source: GitHub ({repo})': '    来源：GitHub（{repo}）',
  '    Source: Git ({url})': '    来源：Git（{url}）',
  '    Source: URL ({url})': '    来源：URL（{url}）',
  '    Source: Directory ({path})': '    来源：目录（{path}）',
  '    Source: File ({path})': '    来源：文件（{path}）',
  'Unknown template command: {cmd}': '未知的模板命令：{cmd}',
  'Template Job Commands:': '模板任务命令：',
  'Usage: claude job status <job-id>': '用法：claude job status <job-id>',
  'No templates found.': '未找到模板。',
  'Place .md files in .claude/templates/ or ~/.claude/templates/':
    '请将 .md 文件放置在 .claude/templates/ 或 ~/.claude/templates/ 中',
  '{count} template{suffix} found:': '找到 {count} 个模板{suffix}：',
  '    Path:': '    路径：',
  'Usage: claude job new <template> [args...]':
    '用法：claude job new <template> [args...]',
  'Template not found: {name}': '未找到模板：{name}',
  'Available templates:': '可用模板：',
  'Job created: {id}': '任务已创建：{id}',
  '  Template: {name}': '  模板：{name}',
  '  Input: {text}': '  输入：{text}',
  'Usage: claude job reply <job-id> <text>':
    '用法：claude job reply <job-id> <text>',
  'Reply added to job {id}': '回复已添加到任务 {id}',
  'Failed to append reply to job {id}': '向任务 {id} 追加回复失败',
  'This will guide you through long-lived (1-year) auth token setup for your Claude account. Claude subscription required.':
    '这将引导您为 Claude 账户设置长效（1 年）认证令牌。需要 Claude 订阅。',
  'Error: When using --print, --output-format=stream-json requires --verbose\n':
    '错误：使用 --print 时，--output-format=stream-json 需要配合 --verbose\n',
  'Error: --resume requires a valid session ID when used with --print. Usage: claude -p --resume <session-id>':
    '错误：--resume 与 --print 同时使用时需要有效的会话 ID。用法：claude -p --resume <session-id>',
  '  (version listing requires access to the release registry)':
    '  （列出版本需要访问发布注册表）',
  '  Use `claude update --list` for available versions.':
    '  使用 `claude update --list` 查看可用版本。',
  '  (dry run — no changes made)': '  （试运行 — 未做任何更改）',
  '  Safe version pinning requires access to the release API.':
    '  固定安全版本需要访问发布 API。',
  '  Contact oncall for the current safe version.':
    '  请联系 oncall 获取当前安全版本。',
  'Usage: claude rollback [target]\n\n': '用法：claude rollback [target]\n\n',
  '  (dry run — would install {target})': '  （试运行 — 将会安装 {target}）',
  'Rollback failed with exit code {code}': '回滚失败，退出码 {code}',
  'Rolled back to {version} successfully.': '已成功回滚到 {version}。',
  'Found "# claude up" in {path}': '在 {path} 中找到 "# claude up"',
  'No "# claude up" section found in CLAUDE.md.':
    'CLAUDE.md 中未找到 "# claude up" 段落。',
  'claude up failed with exit code {code}': 'claude up 失败，退出码 {code}',
  'claude up completed successfully.': 'claude up 已成功完成。',
  'Package manager: {pm}': '包管理器：{pm}',
  'Unable to fetch latest version from npm registry.':
    '无法从 npm registry 获取最新版本。',
  'ccb is up to date ({version})': 'ccb 已是最新版本（{version}）',
  'Installing update via {pm}...': '正在通过 {pm} 安装更新...',
  'Update failed': '更新失败',
  'Try manually updating with:': '请尝试手动更新：',
  'Failed to start daemon: {msg}': '启动守护进程失败：{msg}',
  'Assistant Setup': '助手设置',
  'Starting daemon in {dir}...': '正在 {dir} 中启动守护进程...',
  'No active assistant sessions found.': '未找到活跃的助手会话。',
  'Start a daemon in': '启动守护进程于',
  'to create a cloud session?': '以创建云端会话？',
  'Start assistant daemon': '启动助手守护进程',
  'Enter to select · Esc to cancel': 'Enter 选择 · Esc 取消',
  'Detecting repository...': '正在检测仓库...',
  'Checking remote agent eligibility...': '正在检查远程 agent 可用资格...',
  'Acquiring monitor lock...': '正在获取监控锁...',
  'Launching remote session...': '正在启动远程会话...',
  'Session registered': '会话已注册',
  'Autofix launched': '自动修复已启动',
  'Autofix PR': '自动修复 PR',
  'Track:': '跟踪：',
  'Monitor already active: {repo}#{number}': '监控已在运行：{repo}#{number}',
  'gh pr view timed out after {timeout}ms': 'gh pr view 在 {timeout}ms 后超时',
  'gh pr view exited {code}: {stderr}':
    'gh pr view 以退出码 {code} 结束：{stderr}',
  'gh pr view JSON parse failed: {error}': 'gh pr view JSON 解析失败：{error}',
  'Show run and flow counts plus the latest automatic activity':
    '显示运行和流程计数以及最新的自动活动',
  Autonomy: '自治',
  '↑/↓ select · Enter run · Esc close': '↑/↓ 选择 · Enter 运行 · Esc 关闭',
  'Branched conversation': '对话已创建分支',
  'No conversation to branch': '没有可创建分支的对话',
  'No messages to branch': '没有可创建分支的消息',
  'To resume the original': '如需恢复原对话',
  'Branched conversation{titleInfo}. You are now in the branch.{resumeHint}':
    '对话已创建分支{titleInfo}。您当前位于分支中。{resumeHint}',
  'Branched conversation{titleInfo}. Resume with: /resume {sessionId}':
    '对话已创建分支{titleInfo}。恢复原对话：/resume {sessionId}',
  'Unknown error occurred': '发生未知错误',
  'Failed to branch conversation: {error}': '创建对话分支失败：{error}',
  'Show pending marker, always mode, and break count':
    '显示待处理标记、始终模式和缓存断点计数',
  Once: '一次',
  'Break prompt cache on the next API call only':
    '仅在下一次 API 调用时打断 prompt cache',
  Always: '始终',
  'Break prompt cache on every API call':
    '在每次 API 调用时都打断 prompt cache',
  'Disable always mode and clear pending once marker':
    '禁用始终模式并清除待处理的一次性标记',
  'Clear Once': '清除一次性标记',
  'Cancel the pending one-time cache break': '取消待处理的一次性缓存断点',
  'Break Cache': '打断缓存',
  'This session is available via Remote Control at {url}.':
    '此会话可通过远程控制在 {url} 访问。',
  'This session is available via Remote Control.': '此会话可通过远程控制访问。',
  'Disconnect this session': '断开此会话',
  'Hide QR code': '隐藏二维码',
  'Show QR code': '显示二维码',
  Continue: '继续',
  'Enter to select · Esc to continue': 'Enter 选择 · Esc 继续',
  "Remote Control is disabled by your organization's policy.":
    '远程控制已被您所在组织的策略禁用。',
  'Show session API cost and usage stats': '显示会话 API 成本和使用统计',
  'Use `claude daemon attach` from the CLI. Attach is not available inside the REPL.':
    '请在 CLI 中使用 `claude daemon attach`。REPL 内不支持 attach。',
  'Failed to set effort level: {error}': '设置努力级别失败：{error}',
  'Quick, straightforward implementation with minimal overhead':
    '快速、直接的实现，开销最小',
  'Balanced approach with standard implementation and testing':
    '平衡策略，标准实现与测试',
  'Comprehensive implementation with extensive testing and documentation':
    '全面实现，广泛的测试与文档',
  'Extended reasoning beyond high, short of max': '推理强度高于 high、低于 max',
  'Maximum capability with deepest reasoning': '最强能力，最深入的推理',
  ' (this session only)': '（仅本次会话）',
  'Not applied: CLAUDE_CODE_EFFORT_LEVEL={envRaw} overrides effort this session, and {effortValue} is session-only (nothing saved)':
    '未生效：CLAUDE_CODE_EFFORT_LEVEL={envRaw} 覆盖了本会话的努力级别，且 {effortValue} 仅对本会话有效（未保存任何内容）',
  'CLAUDE_CODE_EFFORT_LEVEL={envRaw} overrides this session — clear it and {effortValue} takes over':
    'CLAUDE_CODE_EFFORT_LEVEL={envRaw} 覆盖了本会话 — 清除后 {effortValue} 将生效',
  'Set effort level to {effortValue}{suffix}: {description}':
    '努力级别已设置为 {effortValue}{suffix}：{description}',
  'Effort level: auto (currently {level})': '努力级别：auto（当前为 {level}）',
  'Current effort level: {effectiveValue} ({description})':
    '当前努力级别：{effectiveValue}（{description}）',
  'Cleared effort from settings, but CLAUDE_CODE_EFFORT_LEVEL={envRaw} still controls this session':
    '已从设置中清除努力级别，但 CLAUDE_CODE_EFFORT_LEVEL={envRaw} 仍控制本会话',
  'Invalid argument: {args}. Valid options are: low, medium, high, max, auto':
    '无效参数：{args}。有效选项为：low、medium、high、max、auto',
  'Usage: /effort [low|medium|high|xhigh|max|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Extended reasoning beyond high, short of max; including ChatGPT Codex models\n- max: Maximum capability with deepest reasoning; maps to xhigh for ChatGPT Codex models\n- auto: Use the default effort level for your model':
    '用法：/effort [low|medium|high|xhigh|max|auto]\n\n努力级别：\n- low：快速、直接的实现\n- medium：平衡策略，标准测试\n- high：全面实现，广泛测试\n- xhigh：推理强度高于 high、低于 max；包括 ChatGPT Codex 模型\n- max：最强能力，最深入的推理；对 ChatGPT Codex 模型映射为 xhigh\n- auto：使用模型的默认努力级别',
  'Found {count} other running IDE(s). However, their workspace/project directories do not match the current cwd.':
    '发现 {count} 个其他正在运行的 IDE。但它们的工作区/项目目录与当前 cwd 不匹配。',
  '↑/↓ to select · Enter to continue': '↑/↓ 选择 · Enter 继续',
  '↑/↓ to select · ': '↑/↓ 选择 · ',
  '  1. Delete the existing file and run this command again':
    '  1. 删除现有文件后重新运行此命令',
  '  2. Update the existing file manually using the template from:':
    '  2. 使用以下模板手动更新现有文件：',
  "Repository {name} was not found or you don't have access.":
    '仓库 {name} 不存在，或您没有访问权限。',
  "Couldn't install GitHub App: {error}\nFor manual setup instructions, see: {url}":
    '无法安装 GitHub App：{error}\n手动设置说明请参阅：{url}',
  'GitHub App installation failed\nFor manual setup instructions, see: {url}':
    'GitHub App 安装失败\n手动设置说明请参阅：{url}',
  "If your browser doesn't open automatically, visit:":
    '如果浏览器没有自动打开，请访问：',
  "Press Enter once you've installed the app": '安装完应用后按 Enter',
  '✓ Authentication token created successfully!': '✓ 认证 token 创建成功！',
  "Browser didn't open? Use the url below to sign in":
    '浏览器没有打开？请使用下方 URL 登录',
  'Failed to create workflow file {path}: A Claude workflow file already exists in this repository. Please remove it first or update it manually.':
    '创建工作流文件 {path} 失败：此仓库中已存在 Claude 工作流文件。请先删除它，或手动更新。',
  '\n\nNeed help? Common issues:\n· Permission denied → Run: gh auth refresh -h github.com -s repo,workflow\n· Not authorized → Ensure you have admin access to the repository\n· For manual setup → Visit: https://github.com/anthropics/claude-code-action':
    '\n\n需要帮助？常见问题：\n· Permission denied → 运行：gh auth refresh -h github.com -s repo,workflow\n· Not authorized → 确认您拥有该仓库的管理员权限\n· 手动设置 → 访问：https://github.com/anthropics/claude-code-action',
  'Failed to create workflow file {path}: {stderr}{help}':
    '创建工作流文件 {path} 失败：{stderr}{help}',
  'Failed to access repository {repo}: {error}':
    '访问仓库 {repo} 失败：{error}',
  'Failed to get default branch: {error}': '获取默认分支失败：{error}',
  'Failed to get branch SHA: {error}': '获取分支 SHA 失败：{error}',
  'Failed to create branch: {error}': '创建分支失败：{error}',
  'Claude PR Assistant workflow': 'Claude PR 助手工作流',
  'Claude Code Review workflow': 'Claude 代码审查工作流',
  '\n\nNeed help? Common issues:\n· Permission denied → Run: gh auth refresh -h github.com -s repo\n· Not authorized → Ensure you have admin access to the repository\n· For manual setup → Visit: https://github.com/anthropics/claude-code-action':
    '\n\n需要帮助？常见问题：\n· Permission denied → 运行：gh auth refresh -h github.com -s repo\n· Not authorized → 确认您拥有该仓库的管理员权限\n· 手动设置 → 访问：https://github.com/anthropics/claude-code-action',
  'Failed to set API key secret: {error}{help}':
    '设置 API key secret 失败：{error}{help}',
  '✓ GitHub Actions workflow created!': '✓ GitHub Actions 工作流已创建！',
  '✓ Using existing ANTHROPIC_API_KEY secret':
    '✓ 使用现有的 ANTHROPIC_API_KEY secret',
  '✓ API key saved as {name} secret': '✓ API key 已保存为 {name} secret',
  "1. Install the Claude GitHub App if you haven't already":
    '1. 如果尚未安装，请先安装 Claude GitHub App',
  'No memory stores found.': '未找到记忆存储。',
  'Local Memory Stores': '本地记忆存储',
  'No entries in "{store}".': '“{store}”中没有条目。',
  'Entries in "{store}"': '“{store}”中的条目',
  Store: '存储',
  'Write an entry: store name + key + value': '写入条目：存储名 + 键 + 值',
  'Read an entry by store name + key': '按存储名 + 键读取条目',
  Entries: '条目',
  'List entry keys in a store': '列出存储中的条目键',
  Archive: '归档',
  'Archive a store (rename to *.archived)': '归档存储（重命名为 *.archived）',
  'Internal: missing store': '内部错误：缺少存储名',
  'Store created: {store}': '存储已创建：{store}',
  'Archived store: {store}': '已归档存储：{store}',
  'Internal: missing key': '内部错误：缺少键',
  'Entry not found: {store}/{key}': '未找到条目：{store}/{key}',
  'Entry fetched: {store}/{key}\n\n{value}':
    '已获取条目：{store}/{key}\n\n{value}',
  'Internal: missing key or value': '内部错误：缺少键或值',
  'Stored {store}/{key} ({length} chars)':
    '已存储 {store}/{key}（{length} 个字符）',
  'Local Memory': '本地记忆',
  '↑/↓ or 1-7 select · Enter run · Esc close':
    '↑/↓ 或 1-7 选择 · Enter 运行 · Esc 关闭',
  'Confirm Archive': '确认归档',
  'Archive store "{store}"? This renames it to *.archived.':
    '归档存储“{store}”？此操作会将其重命名为 *.archived。',
  'y/Enter = archive · n/Esc = cancel': 'y/Enter = 归档 · n/Esc = 取消',
  'Entry "{store}/{key}" already exists. Overwrite with new value ({length} chars)?':
    '条目“{store}/{key}”已存在。用新值（{length} 个字符）覆盖？',
  'STORE NAME': '存储名称',
  VALUE: '值',
  'e.g. my-notes': '例如 my-notes',
  'e.g. todo-2026-05-08': '例如 todo-2026-05-08',
  'free text': '任意文本',
  'Invalid store name (no /, \\, :, null byte, or leading dot; max 255 chars)':
    '存储名称无效（不能包含 /、\\、:、空字节，不能以点开头；最长 255 字符）',
  'Local Memory · input': '本地记忆 · 输入',
  'Stored entry "{key}" in store "{store}".':
    '已在存储“{store}”中保存条目“{key}”。',
  'Entry fetched: {store}/{key}\n{value}': '已获取条目：{store}/{key}\n{value}',
  'No secrets stored.': '尚未存储任何机密。',
  'Local Vault Keys': '本地保险库密钥',
  Set: '设置',
  'Store a secret: KEY + VALUE (input is masked)':
    '存储机密：KEY + VALUE（输入已掩码）',
  Get: '获取',
  'Look up a secret (returns masked preview)': '查询机密（返回掩码预览）',
  'Delete a stored secret by KEY': '按 KEY 删除已存储的机密',
  'Deleted: {key}': '已删除：{key}',
  'Key not found: {key}': '未找到键：{key}',
  'Secret stored: {key} = [REDACTED]': '机密已存储：{key} = [REDACTED]',
  'Failed to store {key}: {error}': '存储 {key} 失败：{error}',
  'Key found: {key} = {masked}': '已找到键：{key} = {masked}',
  'Local Vault': '本地保险库',
  '↑/↓ or 1-5 select · Enter run · Esc close':
    '↑/↓ 或 1-5 选择 · Enter 运行 · Esc 关闭',
  'Confirm Delete': '确认删除',
  'Delete secret "{key}"? This cannot be undone.':
    '删除机密“{key}”？此操作无法撤销。',
  'y/Enter = delete · n/Esc = cancel': 'y/Enter = 删除 · n/Esc = 取消',
  'Deleting...': '正在删除...',
  'Secret "{key}" already exists. Overwrite? Old value is lost.':
    '机密“{key}”已存在。是否覆盖？旧值将丢失。',
  'Storing...': '正在存储...',
  'SECRET VALUE': '机密值',
  'e.g. github-token': '例如 github-token',
  '(masked input — value never displayed)': '（掩码输入 — 值不会显示）',
  'Local Vault · KEY / VALUE': '本地保险库 · KEY / VALUE',
  'Secret revealed for: {key}': '已显示机密：{key}',
  'Warning: secret revealed in terminal.': '警告：机密已在终端中显示。',
  'Key must start with "{prefix}"': '键必须以“{prefix}”开头',
  'Key too short ({current}/{minimum} chars minimum)':
    '键过短（{current}/{minimum}，未达最少字符数）',
  'Key too long ({current}/{maximum} chars maximum)':
    '键过长（{current}/{maximum}，超出最大字符数）',
  '  Obtain from: https://console.anthropic.com/settings/keys':
    '  获取地址：https://console.anthropic.com/settings/keys',
  '[paste key here]': '[在此粘贴 key]',
  '  Saving...': '  正在保存...',
  'Failed to save key — unknown error': '保存 key 失败 — 未知错误',
  'Add an MCP server to Claude Code.': '向 Claude Code 添加 MCP 服务器。',
  'Examples:': '示例：',
  'Add HTTP server:': '添加 HTTP 服务器：',
  'Add HTTP server with headers:': '添加带请求头的 HTTP 服务器：',
  'Add stdio server with environment variables:':
    '添加带环境变量的 stdio 服务器：',
  'Add stdio server with subprocess flags:':
    '添加带子进程参数的 stdio 服务器：',
  'Configuration scope (local, user, or project)':
    '配置作用域（local、user 或 project）',
  'Transport type (stdio, sse, http). Defaults to stdio if not specified.':
    '传输类型（stdio、sse、http）。未指定时默认为 stdio。',
  'Set environment variables (e.g. -e KEY=value)':
    '设置环境变量（例如 -e KEY=value）',
  'Set WebSocket headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")':
    '设置 WebSocket 请求头（例如 -H "X-Api-Key: abc123" -H "X-Custom: value"）',
  'OAuth client ID for HTTP/SSE servers': 'HTTP/SSE 服务器的 OAuth 客户端 ID',
  'Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)':
    '提示输入 OAuth 客户端密钥（或设置 MCP_CLIENT_SECRET 环境变量）',
  'Fixed port for OAuth callback (for servers requiring pre-registered redirect URIs)':
    'OAuth 回调的固定端口（用于要求预注册重定向 URI 的服务器）',
  'Display help for command': '显示命令帮助',
  "Enable XAA (SEP-990) for this server. Requires 'claude mcp xaa setup' first. Also requires --client-id and --client-secret (for the MCP server's AS).":
    "为此服务器启用 XAA（SEP-990）。需要先运行 'claude mcp xaa setup'，并需要 --client-id 和 --client-secret（用于 MCP 服务器的 AS）。",
  'Error: Server name is required.': '错误：必须提供服务器名称。',
  'Usage: claude mcp add <name> <command> [args...]':
    '用法：claude mcp add <name> <command> [args...]',
  'Error: Command is required when server name is provided.':
    '错误：提供服务器名称时必须同时提供命令。',
  'Error: --xaa requires CLAUDE_CODE_ENABLE_XAA=1 in your environment':
    '错误：--xaa 需要在环境中设置 CLAUDE_CODE_ENABLE_XAA=1',
  "'claude mcp xaa setup' (settings.xaaIdp not configured)":
    "'claude mcp xaa setup'（settings.xaaIdp 未配置）",
  'Error: --xaa requires: {items}': '错误：--xaa 需要：{items}',
  'Error: URL is required for SSE transport.': '错误：SSE 传输必须提供 URL。',
  'Added SSE MCP server {name} with URL: {url} to {scope} config\n':
    '已将 SSE MCP 服务器 {name}（URL：{url}）添加到 {scope} 配置\n',
  'Error: URL is required for HTTP transport.': '错误：HTTP 传输必须提供 URL。',
  'Added HTTP MCP server {name} with URL: {url} to {scope} config\n':
    '已将 HTTP MCP 服务器 {name}（URL：{url}）添加到 {scope} 配置\n',
  'Warning: --client-id, --client-secret, --callback-port, and --xaa are only supported for HTTP/SSE transports and will be ignored for stdio.':
    '警告：--client-id、--client-secret、--callback-port 和 --xaa 仅支持 HTTP/SSE 传输，stdio 下将被忽略。',
  '\nWarning: The command "{command}" looks like a URL, but is being interpreted as a stdio server as --transport was not specified.\n':
    '\n警告：命令“{command}”看起来像 URL，但由于未指定 --transport，将按 stdio 服务器处理。\n',
  'If this is an HTTP server, use: claude mcp add --transport http {name} {command}\n':
    '如果这是 HTTP 服务器，请使用：claude mcp add --transport http {name} {command}\n',
  'If this is an SSE server, use: claude mcp add --transport sse {name} {command}\n':
    '如果这是 SSE 服务器，请使用：claude mcp add --transport sse {name} {command}\n',
  'Added stdio MCP server {name} with command: {cmd} {args} to {scope} config\n':
    '已将 stdio MCP 服务器 {name}（命令：{cmd} {args}）添加到 {scope} 配置\n',
  'Manage the XAA (SEP-990) IdP connection': '管理 XAA（SEP-990）IdP 连接',
  'Configure the IdP connection (one-time setup for all XAA-enabled servers)':
    '配置 IdP 连接（对所有启用 XAA 的服务器一次性设置）',
  'IdP issuer URL (OIDC discovery)': 'IdP 颁发者 URL（OIDC 发现）',
  "Claude Code's client_id at the IdP": 'Claude Code 在 IdP 处的 client_id',
  'Read IdP client secret from MCP_XAA_IDP_CLIENT_SECRET env var':
    '从 MCP_XAA_IDP_CLIENT_SECRET 环境变量读取 IdP 客户端密钥',
  'Fixed loopback callback port (only if IdP does not honor RFC 8252 port-any matching)':
    '固定回环回调端口（仅当 IdP 不支持 RFC 8252 任意端口匹配时使用）',
  'Error: --issuer must be a valid URL (got "{issuer}")':
    '错误：--issuer 必须是有效的 URL（收到“{issuer}”）',
  'Error: --issuer must use https:// (got "{protocol}//{host}")':
    '错误：--issuer 必须使用 https://（收到“{protocol}//{host}”）',
  'Error: --callback-port must be a positive integer':
    '错误：--callback-port 必须是正整数',
  'Error: --client-secret requires MCP_XAA_IDP_CLIENT_SECRET env var':
    '错误：--client-secret 需要 MCP_XAA_IDP_CLIENT_SECRET 环境变量',
  'Error writing settings: {error}': '写入设置时出错：{error}',
  'Error: settings written but keychain save failed{warning}. Re-run with --client-secret once keychain is available.':
    '错误：设置已写入，但保存到钥匙串失败{warning}。钥匙串可用后请带 --client-secret 重新运行。',
  'XAA IdP connection configured for {issuer}':
    '已为 {issuer} 配置 XAA IdP 连接',
  'Cache an IdP id_token so XAA-enabled MCP servers authenticate silently. Default: run the OIDC browser login. With --id-token: write a pre-obtained JWT directly (used by conformance/e2e tests where the mock IdP does not serve /authorize).':
    '缓存 IdP id_token，使启用 XAA 的 MCP 服务器可静默认证。默认：执行 OIDC 浏览器登录。使用 --id-token 时：直接写入预先获取的 JWT（用于 mock IdP 不提供 /authorize 的一致性/e2e 测试）。',
  'Ignore any cached id_token and re-login (useful after IdP-side revocation)':
    '忽略已缓存的 id_token 并重新登录（在 IdP 侧撤销后很有用）',
  'Write this pre-obtained id_token directly to cache, skipping the OIDC browser login':
    '将预先获取的 id_token 直接写入缓存，跳过 OIDC 浏览器登录',
  "Error: no XAA IdP connection. Run 'claude mcp xaa setup' first.":
    "错误：没有 XAA IdP 连接。请先运行 'claude mcp xaa setup'。",
  'id_token cached for {issuer} (expires {expires})':
    '已为 {issuer} 缓存 id_token（{expires} 过期）',
  'Already logged in to {issuer} (cached id_token still valid). Use --force to re-login.':
    '已登录 {issuer}（缓存的 id_token 仍有效）。使用 --force 重新登录。',
  'Opening browser for IdP login at {issuer}...\n':
    '正在打开浏览器进行 {issuer} 的 IdP 登录...\n',
  'If the browser did not open, visit:\n  {url}\n':
    '如果浏览器未打开，请访问：\n  {url}\n',
  'Logged in. MCP servers with --xaa will now authenticate silently.':
    '已登录。带 --xaa 的 MCP 服务器现在将静默认证。',
  'IdP login failed: {error}': 'IdP 登录失败：{error}',
  'Show the current IdP connection config': '显示当前 IdP 连接配置',
  'No XAA IdP connection configured.': '未配置 XAA IdP 连接。',
  'Issuer:        ': '颁发者：     ',
  'Client ID:     ': '客户端 ID：  ',
  'Callback port: ': '回调端口：   ',
  'Client secret: ': '客户端密钥： ',
  '(stored in keychain)': '（已存储在钥匙串中）',
  '(not set — PKCE-only)': '（未设置 — 仅 PKCE）',
  'Logged in:     ': '登录状态：   ',
  'yes (id_token cached)': '是（已缓存 id_token）',
  "no — run 'claude mcp xaa login'": "否 — 请运行 'claude mcp xaa login'",
  'Clear the IdP connection config and cached id_token':
    '清除 IdP 连接配置和已缓存的 id_token',
  'XAA IdP connection cleared': '已清除 XAA IdP 连接',
  'Archived at: {archivedAt}': '归档时间：{archivedAt}',
  'No memories in store {storeId}. Use /memory-stores create-memory {storeId} <content> to add one.':
    '存储 {storeId} 中没有记忆。使用 /memory-stores create-memory {storeId} <内容> 添加一条。',
  'Memories in {storeId} ({count})': '{storeId} 中的记忆（{count} 条）',
  'Memory: {id}': '记忆：{id}',
  'Store: {storeId}': '存储：{storeId}',
  'Content: {content}': '内容：{content}',
  'Updated: {updatedAt}': '更新于：{updatedAt}',
  'Memory created': '记忆已创建',
  'Memory updated': '记忆已更新',
  'Memory {memoryId} deleted from store {storeId}.':
    '记忆 {memoryId} 已从存储 {storeId} 中删除。',
  'No memory versions found for store {storeId}.':
    '未找到存储 {storeId} 的记忆版本。',
  'Memory Versions in {storeId} ({count})':
    '{storeId} 中的记忆版本（{count} 个）',
  redacted: '已脱敏',
  'Version redacted': '版本已脱敏',
  'Redacted at: {redactedAt}': '脱敏于：{redactedAt}',
  'Please enter a marketplace source': '请输入市场来源',
  'Successfully added marketplace: {name}': '已成功添加市场：{name}',
  'Add Marketplace': '添加市场',
  'Enter marketplace source:': '输入市场来源：',
  'Adding marketplace to configuration…': '正在将市场添加到配置…',
  "Plugin '{pluginId}' is already installed globally. Use '/plugin' to manage existing plugins.":
    "插件 '{pluginId}' 已全局安装。请使用 '/plugin' 管理现有插件。",
  'Plugin "{targetPlugin}" not found in any marketplace':
    '在任何市场中都未找到插件 "{targetPlugin}"',
  'Marketplace "{targetMarketplace}" not found':
    '未找到市场 "{targetMarketplace}"',
  'Failed to load marketplace: {marketplaceName}':
    '加载市场失败：{marketplaceName}',
  'Failed to load plugins': '加载插件失败',
  '✓ Installed {count} {pluginWord}. Run /reload-plugins to activate.':
    '✓ 已安装 {count} 个{pluginWord}。运行 /reload-plugins 以激活。',
  'Failed to install: {details}': '安装失败：{details}',
  '✓ Installed {successCount} of {total} plugins. Failed: {details}. Run /reload-plugins to activate successfully installed plugins.':
    '✓ 已安装 {total} 个插件中的 {successCount} 个。失败：{details}。运行 /reload-plugins 以激活已成功安装的插件。',
  '✓ Installed and configured {name}. Run /reload-plugins to apply.':
    '✓ 已安装并配置 {name}。运行 /reload-plugins 以应用。',
  '✓ Installed {name}. Run /reload-plugins to apply.':
    '✓ 已安装 {name}。运行 /reload-plugins 以应用。',
  'Installed but failed to save config: {detail}':
    '已安装，但保存配置失败：{detail}',
  'Loading…': '加载中…',
  'Select marketplace': '选择市场',
  'No marketplaces configured.': '未配置市场。',
  "Add a marketplace first using 'Add marketplace'.":
    "请先使用 'Add marketplace' 添加市场。",
  '{count} {pluginWord} available': '{count} 个{pluginWord}可用',
  ' · {count} already installed': ' · {count} 个已安装',
  'Plugin Details': '插件详情',
  'Version: {version}': '版本：{version}',
  'By:': '作者：',
  'Will install:': '将安装：',
  'Commands:': '命令：',
  'Agents:': '智能体：',
  'Hooks:': '钩子：',
  '· Component summary not available for remote plugin':
    '· 远程插件暂无组件摘要',
  '· Components will be discovered at installation': '· 组件将在安装时发现',
  'Error: {installError}': '错误：{installError}',
  'Installing…': '安装中…',
  'Install plugins': '安装插件',
  'No new plugins available to install.': '没有可安装的新插件。',
  'All plugins from this marketplace are already installed.':
    '此市场中的所有插件均已安装。',
  'Install Plugins': '安装插件',
  'more above': '上方还有更多',
  '[Community Managed]': '[社区维护]',
  '(installed)': '（已安装）',
  '{count} installs': '{count} 次安装',
  'more below': '下方还有更多',
  "Plugin '{pluginId}' is already installed. Use '/plugin' to manage existing plugins.":
    "插件 '{pluginId}' 已安装。请使用 '/plugin' 管理现有插件。",
  'Plugin details': '插件详情',
  'from {marketplaceName}': '来自 {marketplaceName}',
  'Discover plugins': '发现插件',
  'No plugins match "{searchQuery}"': '没有与 "{searchQuery}" 匹配的插件',
  install: '安装',
  'type to search': '输入以搜索',
  'Git is required to install marketplaces.': '安装市场需要 Git。',
  'Please install git and restart Claude Code.':
    '请安装 git 并重启 Claude Code。',
  'Your organization policy does not allow any external marketplaces.':
    '您的组织策略不允许任何外部市场。',
  'Contact your administrator.': '请联系您的管理员。',
  'Your organization restricts which marketplaces can be added.':
    '您的组织限制了可添加的市场。',
  'Switch to the Marketplaces tab to view allowed sources.':
    '切换到市场标签页查看允许的来源。',
  'Failed to load marketplace data.': '加载市场数据失败。',
  'Check your network connection.': '请检查您的网络连接。',
  'All available plugins are already installed.': '所有可用插件均已安装。',
  'Check for new plugins later or add more marketplaces.':
    '请稍后查看新插件，或添加更多市场。',
  'No plugins available.': '没有可用插件。',
  'Add a marketplace first using the Marketplaces tab.':
    '请先在市场标签页中添加市场。',
  'Built-in plugin {name} not found': '未找到内置插件 {name}',
  'Plugin {name} not found in marketplace': '在市场中未找到插件 {name}',
  'Failed to load components': '加载组件失败',
  'Components:': '组件：',
  'Installed components:': '已安装的组件：',
  'Plugin enabled. Configuration skipped — run /reload-plugins to apply.':
    '插件已启用。已跳过配置 — 运行 /reload-plugins 以应用。',
  'Run /reload-plugins to apply plugin changes.':
    '运行 /reload-plugins 以应用插件更改。',
  'Removed from marketplace': '已从市场移除',
  'Plugin "{targetPlugin}" is not installed in this project':
    '插件 "{targetPlugin}" 未在此项目中安装',
  '{name} is already at the latest version ({newVersion}).':
    '{name} 已是最新版本（{newVersion}）。',
  Updated: '已更新',
  Uninstalled: '已卸载',
  'Failed to {operation}: {errorMessage}': '{operation}失败：{errorMessage}',
  'Failed to check plugin update availability': '检查插件更新失败',
  'Failed to load MCPB for configuration': '加载 MCPB 配置失败',
  'Failed to load configuration: {errorMsg}': '加载配置失败：{errorMsg}',
  'Failed to write settings: {errorMessage}': '写入设置失败：{errorMessage}',
  'Loading installed plugins…': '正在加载已安装的插件…',
  'Manage plugins': '管理插件',
  'No plugins or MCP servers installed.': '未安装任何插件或 MCP 服务器。',
  'Failed to save configuration: {detail}': '保存配置失败：{detail}',
  'Configuration saved. Run /reload-plugins for changes to take effect.':
    '配置已保存。运行 /reload-plugins 使更改生效。',
  'Failed to save configuration: {error}': '保存配置失败：{error}',
  'Failed to save configuration: {errorMsg}': '保存配置失败：{errorMsg}',
  Removed: '已移除',
  'Removed from marketplace · reason: {reason}':
    '已从市场移除 · 原因：{reason}',
  dismiss: '关闭',
  'Disable it just for you in .claude/settings.local.json?':
    '仅在 .claude/settings.local.json 中为您个人禁用？',
  'This has the same effect as uninstalling, without affecting other contributors.':
    '这与卸载效果相同，但不影响其他贡献者。',
  'Disabling…': '禁用中…',
  'Delete it along with the plugin?': '随插件一并删除？',
  'Uninstalling…': '卸载中…',
  'to delete': '删除',
  'to keep': '保留',
  '{count} {word}:': '{count} 个{word}：',
  'Author:': '作者：',
  'Marked for update': '已标记待更新',
  'Failed to load': '加载失败',
  Remove: '移除',
  'View on GitHub': '在 GitHub 上查看',
  '{component} path not found: {path}': '未找到 {component} 路径：{path}',
  'Disable plugin "{plugin}" if you want this plugin\'s version instead':
    '如需改用此插件自带的版本，请禁用插件 "{plugin}"',
  'Remove "{name}" from your MCP config if you want the plugin\'s version instead':
    '如需改用插件自带的版本，请从 MCP 配置中移除 "{name}"',
  'Configure {name}': '配置 {name}',
  '[ANT-ONLY] MCP servers are now managed in /plugins. Use /mcp no-redirect to test old UI':
    '[ANT-ONLY] MCP 服务器现已在 /plugins 中管理。使用 /mcp no-redirect 测试旧版界面',
  Errors: '错误',
  ' /plugin install - Browse and install plugins':
    ' /plugin install - 浏览并安装插件',
  ' /plugin install <marketplace> - Install from specific marketplace':
    ' /plugin install <marketplace> - 从指定市场安装',
  ' /plugin install <plugin> - Install specific plugin':
    ' /plugin install <plugin> - 安装指定插件',
  ' /plugin install <plugin>@<market> - Install plugin from marketplace':
    ' /plugin install <plugin>@<market> - 从市场安装插件',
  ' /plugin manage - Manage installed plugins':
    ' /plugin manage - 管理已安装的插件',
  ' /plugin enable <plugin> - Enable a plugin':
    ' /plugin enable <plugin> - 启用插件',
  ' /plugin disable <plugin> - Disable a plugin':
    ' /plugin disable <plugin> - 禁用插件',
  ' /plugin uninstall <plugin> - Uninstall a plugin':
    ' /plugin uninstall <plugin> - 卸载插件',
  ' /plugin marketplace - Marketplace management menu':
    ' /plugin marketplace - 市场管理菜单',
  ' /plugin marketplace add - Add a marketplace':
    ' /plugin marketplace add - 添加市场',
  ' /plugin marketplace add <path/url> - Add marketplace directly':
    ' /plugin marketplace add <path/url> - 直接添加市场',
  ' /plugin marketplace update - Update marketplaces':
    ' /plugin marketplace update - 更新市场',
  ' /plugin marketplace update <name> - Update specific marketplace':
    ' /plugin marketplace update <name> - 更新指定市场',
  ' /plugin marketplace remove - Remove a marketplace':
    ' /plugin marketplace remove - 移除市场',
  ' /plugin marketplace remove <name> - Remove specific marketplace':
    ' /plugin marketplace remove <name> - 移除指定市场',
  ' /plugin marketplace list - List all marketplaces':
    ' /plugin marketplace list - 列出所有市场',
  ' /plugin validate <path> - Validate a manifest file or directory':
    ' /plugin validate <path> - 校验 manifest 文件或目录',
  'Other:': '其他：',
  ' /plugin - Main plugin menu': ' /plugin - 插件主菜单',
  ' /plugin help - Show this help': ' /plugin help - 显示此帮助',
  ' /plugins - Alias for /plugin': ' /plugins - /plugin 的别名',
  'failed to load · {count} {errors}': '加载失败 · {count} 个{errors}',
  'Usage: /plugin validate <path>\n\n': '用法：/plugin validate <path>\n\n',
  'Validate a plugin or marketplace manifest file or directory.\n\n':
    '校验插件或市场的 manifest 文件或目录。\n\n',
  'Examples:\n': '示例：\n',
  'When given a directory, automatically validates .claude-plugin/marketplace.json\n':
    '传入目录时，自动校验 .claude-plugin/marketplace.json\n',
  'or .claude-plugin/plugin.json (prefers marketplace if both exist).\n\n':
    '或 .claude-plugin/plugin.json（两者都存在时优先 marketplace）。\n\n',
  'Or from the command line:\n': '也可在命令行中运行：\n',
  'Validating {fileType} manifest: {filePath}\n\n':
    '正在校验 {fileType} manifest：{filePath}\n\n',
  'Running validation...': '正在运行校验...',
  'Unable to retrieve updated privacy settings': '无法获取更新后的隐私设置',
  '"Help improve Claude" set to {status}.':
    '「帮助改进 Claude」已设置为 {status}。',
  'Unknown provider: {provider}': '未知提供者：{provider}',
  'Switched to Cursor provider.\nNo CURSOR_API_KEY set — will try to read the session token from a signed-in Cursor IDE. Set CURSOR_API_KEY + CURSOR_MACHINE_ID to override.':
    '已切换到 Cursor 提供者。\n未设置 CURSOR_API_KEY — 将尝试从已登录的 Cursor IDE 读取会话 token。可设置 CURSOR_API_KEY + CURSOR_MACHINE_ID 覆盖。',
  'Request more': '申请更多',
  'Request extra usage': '申请超额使用',
  'Switch to extra usage': '切换到超额使用',
  'Upgrade your plan': '升级您的计划',
  'Stop and wait for limit to reset': '停止并等待限额重置',
  'What do you want to do?': '您想怎么做？',
  'See the full changelog at: {url}': '完整更新日志见：{url}',
  'Login failed. Please visit {url} and login using the GitHub App':
    '登录失败。请访问 {url} 并使用 GitHub App 登录',
  'GitHub rejected that token. Run `gh auth login` and try again.':
    'GitHub 拒绝了该 token。请运行 `gh auth login` 后重试。',
  'Server error ({status}). Try again in a moment.':
    '服务器错误（{status}）。请稍后重试。',
  "Couldn't reach the server. Check your connection.":
    '无法连接服务器。请检查网络连接。',
  'GitHub CLI not found. Install it via https://cli.github.com/, then run `gh auth login`, or connect GitHub on the web: {url}':
    '未找到 GitHub CLI。请通过 https://cli.github.com/ 安装后运行 `gh auth login`，或在网页端连接 GitHub：{url}',
  'GitHub CLI not authenticated. Run `gh auth login` and try again, or connect GitHub on the web: {url}':
    'GitHub CLI 未认证。请运行 `gh auth login` 后重试，或在网页端连接 GitHub：{url}',
  'Connected as {username}. Opened {url}':
    '已以 {username} 身份连接。已打开 {url}',
  'Checking login status…': '正在检查登录状态…',
  'Connecting GitHub to Claude…': '正在将 GitHub 连接到 Claude…',
  'Connect Claude on the web to GitHub?': '将网页版 Claude 连接到 GitHub？',
  'Remote Control Server failed to start: {msg}':
    '远程控制服务器启动失败：{msg}',
  'Failed to restart: {msg}': '重启失败：{msg}',
  'Remote Control Server': '远程控制服务器',
  'Remote Control Server is': '远程控制服务器当前',
  ' (PID: {pid})': '（PID：{pid}）',
  'Recent logs:': '最近日志：',
  'Stop server': '停止服务器',
  'Restart server': '重启服务器',
  'Ultrareview failed to launch the remote session. Check that this is a GitHub repo and try again.':
    'Ultrareview 启动远程会话失败。请确认这是一个 GitHub 仓库后重试。',
  'Free ultrareviews used. Enable Extra Usage at https://claude.ai/settings/billing to continue.':
    '免费 ultrareview 次数已用完。请在 https://claude.ai/settings/billing 启用超额使用以继续。',
  'Balance too low to launch ultrareview ({available} available, $10 minimum). Top up at https://claude.ai/settings/billing':
    '余额不足，无法启动 ultrareview（可用 {available}，最低需 $10）。请在 https://claude.ai/settings/billing 充值',
  'Ultrareview cancelled.': 'Ultrareview 已取消。',
  'Proceed with Extra Usage billing': '按超额使用计费继续',
  'Ultrareview billing': 'Ultrareview 计费',
  'Your free ultrareviews for this organization are used. Further reviews bill as Extra Usage (pay-per-use).':
    '该组织的免费 ultrareview 次数已用完。后续审查将按超额使用计费（按量付费）。',
  'Launching…': '正在启动…',
  'Error: Sandboxing requires WSL2. WSL1 is not supported.':
    '错误：沙箱需要 WSL2。不支持 WSL1。',
  'Error: Sandboxing is currently only supported on macOS, Linux, and WSL2.':
    '错误：沙箱目前仅支持 macOS、Linux 和 WSL2。',
  'Error: Sandboxing is disabled for this platform ({platform}) via the enabledPlatforms setting.':
    '错误：enabledPlatforms 设置已在此平台（{platform}）上禁用沙箱。',
  'Error: Sandbox settings are overridden by a higher-priority configuration and cannot be changed locally.':
    '错误：沙箱设置已被更高优先级的配置覆盖，无法在本地修改。',
  'Error: Please provide a command pattern to exclude (e.g., /sandbox exclude "npm run test:*")':
    '错误：请提供要排除的命令模式（例如 /sandbox exclude "npm run test:*"）',
  'Added "{pattern}" to excluded commands in {configPath}':
    '已将 "{pattern}" 添加到 {configPath} 的排除命令中',
  'Error: Unknown subcommand "{subcommand}". Available subcommand: exclude':
    '错误：未知子命令 "{subcommand}"。可用子命令：exclude',
  'No scheduled triggers. Use /schedule create <cron> <prompt> to create one.':
    '暂无定时触发器。使用 /schedule create <cron> <prompt> 创建。',
  'Scheduled Triggers ({count})': '定时触发器（{count}）',
  'Trigger: {triggerId}': '触发器：{triggerId}',
  'Agent: {agentId}': 'Agent：{agentId}',
  'Last run: {lastRun}': '上次运行：{lastRun}',
  'Trigger created': '触发器已创建',
  'Trigger updated': '触发器已更新',
  'Trigger {id} deleted.': '触发器 {id} 已删除。',
  'Trigger {id} fired.': '触发器 {id} 已触发。',
  'Trigger {id} enabled.': '触发器 {id} 已启用。',
  'Trigger {id} disabled.': '触发器 {id} 已禁用。',
  'Unexpected gh gist output: {url}': 'gh gist 输出异常：{url}',
  '0x0.st returned unexpected output: {url}': '0x0.st 返回了异常输出：{url}',
  'Usage: /share [--public|--private] [--mask-secrets] [--summary-only] [--allow-public-fallback]\n\n  --public               Create a public Gist (default: secret)\n  --private              Create a secret Gist (default)\n  --mask-secrets         Redact API keys, tokens, and secrets before uploading\n  --summary-only         Upload a summary (first 200 chars per turn) instead of full log\n  --allow-public-fallback  Fall back to 0x0.st if gh gist fails':
    '用法：/share [--public|--private] [--mask-secrets] [--summary-only] [--allow-public-fallback]\n\n  --public               创建公开 Gist（默认：私密）\n  --private              创建私密 Gist（默认）\n  --mask-secrets         上传前抹除 API key、token 和其他机密信息\n  --summary-only         上传摘要（每轮前 200 字符）而非完整日志\n  --allow-public-fallback  gh gist 失败时回退到 0x0.st',
  '## Session log not found\n\nSession: {sessionId}\nExpected path: `{logPath}`\n\nThe session log may not have been written yet. Try sending at least one message first.':
    '## 未找到会话日志\n\n会话：{sessionId}\n预期路径：`{logPath}`\n\n会话日志可能尚未写入。请先至少发送一条消息。',
  '## Share session log\n\nSession: {sessionId}\nLog file: `{logPath}`\n\nTo upload to GitHub Gist automatically, install the `gh` CLI:\n  https://cli.github.com/\n\nThen run:\n  `gh gist create "{logPath}" --secret --filename claude-session.jsonl`\n\nOr use `--allow-public-fallback` to upload to 0x0.st instead.\n\n_Privacy note: the JSONL contains everything typed in this session,_\n_including tool outputs. Review before sharing._':
    '## 分享会话日志\n\n会话：{sessionId}\n日志文件：`{logPath}`\n\n如需自动上传到 GitHub Gist，请安装 `gh` CLI：\n  https://cli.github.com/\n\n然后运行：\n  `gh gist create "{logPath}" --secret --filename claude-session.jsonl`\n\n或使用 `--allow-public-fallback` 改为上传到 0x0.st。\n\n_隐私提示：JSONL 包含本会话中输入的所有内容，_\n_包括工具输出。分享前请先检查。_',
  'No conversation content found in session log.': '会话日志中未找到对话内容。',
  'Failed to prepare share file: {error}': '准备分享文件失败：{error}',
  '## Session shared': '## 会话已分享',
  'Session:': '会话：',
  'Visibility:': '可见性：',
  'Method:': '方式：',
  'Content:    summary only (truncated)': '内容：    仅摘要（已截断）',
  'Secrets:    masked before upload': '机密信息：    上传前已脱敏',
  '_Privacy note: the JSONL contains everything typed in this session._':
    '_隐私提示：JSONL 包含此会话中输入的所有内容。_',
  '## Failed to share session': '## 分享会话失败',
  'Make sure you are logged in: `gh auth login`':
    '请确认已登录：`gh auth login`',
  'Install the `gh` CLI: https://cli.github.com/':
    '安装 `gh` CLI：https://cli.github.com/',
  'Log file: `{logPath}`': '日志文件：`{logPath}`',
  'Show skill learning status for current project':
    '显示当前项目的技能学习状态',
  'Enable skill learning for this session': '为此会话启用技能学习',
  'Disable skill learning for this session': '为此会话禁用技能学习',
  'Detailed description of skill learning features': '技能学习功能的详细说明',
  'Skill Learning': '技能学习',
  'Show whether automatic skill matching is active':
    '显示自动技能匹配是否已启用',
  'Enable automatic skill matching for this session':
    '为此会话启用自动技能匹配',
  'Disable automatic skill matching for this session':
    '为此会话禁用自动技能匹配',
  'How automatic skill matching works': '自动技能匹配的工作原理',
  'Skill Search': '技能搜索',
  deprecated: '已弃用',
  'Owner:': '所有者：',
  'No skills found. Use /skill-store create <name> <markdown> to publish one.':
    '未找到技能。使用 /skill-store create <name> <markdown> 发布一个。',
  'Skills ({count})': '技能（{count}）',
  'Skill: {id}': '技能：{id}',
  'Allowed tools: {tools}': '允许的工具：{tools}',
  'No versions found for skill {id}.': '未找到技能 {id} 的任何版本。',
  'Versions for {id} ({count})': '{id} 的版本（{count}）',
  'Version: {version} (skill: {skillId})': '版本：{version}（技能：{skillId}）',
  'Skill created': '技能已创建',
  'Skill {id} deleted.': '技能 {id} 已删除。',
  'Skill installed': '技能已安装',
  'Path: {path}': '路径：{path}',
  'Load with: /skills (bundled skills are not auto-loaded; place in {path})':
    '加载方式：/skills（打包技能不会自动加载；请放置在 {path}）',
  'Show session API usage and activity stats': '显示会话 API 用量和活动统计',
  'Configure a provider/account for Agent sub-sessions. The main session login will not be changed.':
    '为 Agent 子会话配置提供者/账户。主会话的登录不会更改。',
  '{editor} keybindings must be installed on your local machine, not the remote server.':
    '{editor} 按键绑定必须安装在本地机器上，而不是远程服务器上。',
  '- Enabled "Use Option as Meta key"': '- 已启用 "Use Option as Meta key"',
  '- Switched to visual bell': '- 已切换为视觉铃声',
  '{msg} Your settings have been restored from backup.':
    '{msg} 您的设置已从备份恢复。',
  '{msg} Restoring from backup failed, try manually with: defaults import com.apple.Terminal {path}':
    '{msg} 从备份恢复失败，请手动尝试：defaults import com.apple.Terminal {path}',
  '{msg} No backup was available to restore from.':
    '{msg} 没有可用于恢复的备份。',
  'No animation found. Run /think-back first to generate one.':
    '未找到动画。请先运行 /think-back 生成一个。',
  'Could not access animation data: {error}': '无法访问动画数据：{error}',
  'Player script not found. The player.js file is missing from the thinkback skill.':
    '未找到播放器脚本。thinkback 技能中缺少 player.js 文件。',
  'Could not access player script: {error}': '无法访问播放器脚本：{error}',
  'Failed to access terminal instance': '无法访问终端实例',
  'Year in review animation complete!': '年度回顾动画播放完毕！',
  'Updating marketplace...': '正在更新市场…',
  'Failed to install plugin: {error}': '安装插件失败：{error}',
  'Failed to enable plugin: {error}': '启用插件失败：{error}',
  'Checking thinkback installation...': '正在检查 thinkback 安装情况…',
  'Installing marketplace...': '正在安装市场…',
  'Enabling thinkback plugin...': '正在启用 thinkback 插件…',
  'Installing thinkback plugin...': '正在安装 thinkback 插件…',
  'Play animation': '播放动画',
  'Watch your year in review': '观看您的年度回顾',
  'Edit content': '编辑内容',
  'Modify the animation': '修改动画',
  'Fix errors': '修复错误',
  'Fix validation or rendering issues': '修复校验或渲染问题',
  Regenerate: '重新生成',
  'Create a new animation from scratch': '从头创建一个新动画',
  "Let's go!": '开始吧！',
  'Generate your personalized animation': '生成您的个性化动画',
  'Think Back on 2025 with Claude Code': '与 Claude Code 一起回顾 2025',
  'Generate your 2025 Claude Code Think Back (takes a few minutes to run)':
    '生成您的 2025 Claude Code Think Back（需要几分钟运行）',
  'Relive your year of coding with Claude.':
    '与 Claude 一起重温您这一年的编程时光。',
  "We'll create a personalized ASCII animation celebrating your journey.":
    '我们将创建一个个性化的 ASCII 动画，纪念您的这段旅程。',
  'Error with thinkback: {msg}. Try running /plugin to manually install the think-back plugin.':
    'thinkback 出错：{msg}。请尝试运行 /plugin 手动安装 think-back 插件。',
  'Try running /plugin to manually install the think-back plugin.':
    '请尝试运行 /plugin 手动安装 think-back 插件。',
  'Loading thinkback skill…': '正在加载 thinkback 技能…',
  'Show marker and environment override state': '显示标记和环境覆盖状态',
  Toggle: '切换',
  'Flip persisted TUI mode for the next session':
    '为下次会话翻转已持久化的 TUI 模式',
  'Enable flicker-free alternate-screen mode': '启用无闪烁备用屏幕模式',
  'Disable flicker-free alternate-screen mode': '禁用无闪烁备用屏幕模式',
  'TUI Mode': 'TUI 模式',
  'Show subscription plan usage and rate limits': '显示订阅计划用量和速率限制',
  'Value: ***mask***': '值：***mask***',
  '\nInstall audio recording tools? Run: {cmd}': '\n安装录音工具？运行：{cmd}',
  'Tavily Search API (default)': 'Tavily Search API（默认）',
  'Anthropic server-side web search': 'Anthropic 服务端网页搜索',
  'Scrape Bing HTML results': '抓取 Bing HTML 结果',
  'Brave Search API (needs API key)': 'Brave Search API（需要 API key）',
  'Exa AI search (MCP endpoint)': 'Exa AI 搜索（MCP 端点）',
  'Use Tavily /extract (default)': '使用 Tavily /extract（默认）',
  'HTTP Direct': 'HTTP 直连',
  'Fetch URL directly via HTTP': '通过 HTTP 直接获取 URL',
  'Endpoint URL': '端点 URL',
  'Timeout (ms)': '超时（毫秒）',
  'Web Tools': '网络工具',
  'Choose a web search backend:': '选择网页搜索后端：',
  'Choose a web fetch backend:': '选择网页获取后端：',
  'analyzing your sessions': '正在分析您的会话',
  Done: '完成',
  Tools: '工具',
  'Source: {source}': '来源：{source}',
  or: '或',
  ' Generating agent from description...': ' 正在根据描述生成 agent…',
  'A newer {scope} persistent memory snapshot is available for the "{agentType}" agent.\n\nPlease merge the snapshot update into the current {scope} agent memory before continuing:\n- Preserve useful current memory entries.\n- Incorporate newer or more accurate information from the snapshot.\n- Resolve duplicates or conflicts in favor of the most current, specific information.\n- Keep the memory concise and relevant to future runs of this agent.\n\nAfter merging, continue with the user\'s request.':
    '"{agentType}" agent 有一个更新的{scope}持久记忆快照。\n\n请先将快照更新合并到当前{scope} agent 记忆中，然后再继续：\n- 保留当前记忆中有用的条目。\n- 吸收快照中更新或更准确的信息。\n- 遇到重复或冲突时，以最新、最具体的信息为准。\n- 保持记忆简洁，并与此 agent 的后续运行相关。\n\n合并完成后，继续处理用户的请求。',
  '{selected} of {total} tools selected': '已选择 {selected}/{total} 个工具',
  'Detected a custom API key in your environment':
    '检测到您的环境中存在自定义 API key',
  'Auto-updating…': '自动更新中…',
  '✓ Update installed · Restart to apply': '✓ 更新已安装 · 重启后生效',
  '✗ Auto-update failed · Try ': '✗ 自动更新失败 · 请尝试 ',
  'Cloud Authentication': '云端认证',
  'Switch to Stable Channel': '切换到稳定通道',
  "The stable channel may have an older version than what you're currently running ({currentVersion}).":
    '稳定通道的版本可能比您当前运行的版本（{currentVersion}）更旧。',
  'Allow possible downgrade to stable version': '允许降级到稳定版本',
  'Stay on current version ({currentVersion}) until stable catches up':
    '保持当前版本（{currentVersion}），直到稳定版赶上',
  'Yes, install': '是，安装',
  "No, and don't show plugin installation hints again":
    '否，且不再显示插件安装提示',
  'Plugin Recommendation': '插件推荐',
  'Allow external CLAUDE.md file imports?': '允许导入外部 CLAUDE.md 文件？',
  'Yes, allow external imports': '是，允许外部导入',
  'No, disable external imports': '否，禁用外部导入',
  'Summarized conversation': '已总结对话',
  'Summarized {count} messages {direction}':
    '已总结{direction}的 {count} 条消息',
  'up to this point': '截至此处',
  'from this point': '从此处开始',
  'Context: “{context}”': '上下文：“{context}”',
  'Conversation summarized to free up context': '已总结对话以释放上下文',
  'Use models via the Cursor backend (browser sign-in, token, or IDE session)':
    '通过 Cursor 后端使用模型（浏览器登录、token 或 IDE 会话）',
  'Display name, e.g. "Cursor work"': '显示名称，例如 "Cursor work"',
  'Access token': '访问令牌',
  'optional — leave empty to use the signed-in Cursor IDE':
    '可选 — 留空则使用已登录的 Cursor IDE',
  'Machine ID': '机器 ID',
  'optional — auto-detected from the Cursor IDE':
    '可选 — 自动从 Cursor IDE 检测',
  'Connect Cursor IDE': '连接 Cursor IDE',
  'Sign in to the Cursor IDE first, or paste a session token + machine id.':
    '请先登录 Cursor IDE，或粘贴会话 token + machine id。',
  'Connect Cursor': '连接 Cursor',
  'How do you want to sign in?': '您想如何登录？',
  'Sign in with browser (OAuth)': '通过浏览器登录（OAuth）',
  'Opens cursor.com to authorize — no token to copy':
    '打开 cursor.com 授权 — 无需复制 token',
  'Paste token / use signed-in IDE': '粘贴 token / 使用已登录的 IDE',
  'Enter a session token + machine id, or reuse the Cursor IDE':
    '输入会话 token + machine id，或复用 Cursor IDE',
  'Cursor Account Setup': 'Cursor 账户设置',
  'Preparing sign-in…': '正在准备登录…',
  'A browser window was opened. Confirm the sign-in there.':
    '已打开浏览器窗口，请在其中确认登录。',
  'If it did not open, visit this URL:': '如果没有自动打开，请访问此 URL：',
  'Global default model set to {target}': '全局默认模型已设置为 {target}',
  'Session model set to {target}': '会话模型已设置为 {target}',
  'Global subagent model set to {target}': '全局子 agent 模型已设置为 {target}',
  'Session subagent model set to {target}':
    '会话子 agent 模型已设置为 {target}',
  'Please use this option unless you need to login to a special org for accessing sensitive data (e.g. customer data, HIPI data) with the Console option':
    '除非您需要通过 Console 选项登录特殊组织以访问敏感数据（如客户数据、HIPI 数据），否则请使用此选项',
  'Press {key} to go back to login options.': '按 {key} 返回登录选项。',
  'Login successful. Press {key} to continue…': '登录成功。按 {key} 继续…',
  ' save ~{tokens}': ' 节省约 {tokens}',
  'Cache hit rate: {rate}%': '缓存命中率：{rate}%',
  ' (below {threshold}% threshold)': ' （低于 {threshold}% 阈值）',
  "You've spent $5 on the Anthropic API this session.":
    '本次会话您已在 Anthropic API 上花费 $5。',
  'Got it, thanks!': '知道了，谢谢！',
  next: '下一个',
  prev: '上一个',
  '(↓ to select)': '(↓ 选择)',
  'Open in Claude Code Desktop': '在 Claude Code Desktop 中打开',
  'Try Claude Code Desktop': '试用 Claude Code Desktop',
  '[ANT-ONLY] slow sync:': '[ANT-ONLY] 同步缓慢：',
  'WARNING: Loading development channels': '警告：正在加载开发通道',
  'I am using this for local development': '我正在将其用于本地开发',
  Exit: '退出',
  'Tool execution failed': '工具执行失败',
  'Invalid tool parameters': '无效的工具参数',
  '… +{count} {label} ({shortcut}': '… +{count} {label}（{shortcut}',
  line: '行',
  lines: '行',
  'to see all)': '查看全部）',
  'Feedback collection is not available for organizations with custom data retention policies.':
    '使用自定义数据保留策略的组织无法使用反馈收集功能。',
  'Could not submit feedback. Please try again later.':
    '无法提交反馈，请稍后重试。',
  'Submit Feedback / Bug Report': '提交反馈 / Bug 报告',
  'Describe the issue below:': '请在下方描述问题：',
  'Edit and press Enter to retry, or Esc to cancel':
    '编辑后按 Enter 重试，或按 Esc 取消',
  'This report will include:': '此报告将包含：',
  '- Your feedback / bug description: ': '- 您的反馈 / bug 描述： ',
  '- Environment info: ': '- 环境信息： ',
  '- Git repo metadata: ': '- Git 仓库元数据： ',
  ', not synced': '，未同步',
  ', has local changes': '，有本地更改',
  '- Current session transcript': '- 当前会话记录',
  "We will use your feedback to debug related issues or to improve Claude Code's functionality (eg. to reduce the risk of bugs occurring in the future).":
    '我们将使用您的反馈来调试相关问题或改进 Claude Code 的功能（例如降低未来出现 bug 的风险）。',
  'Press {key} to confirm and submit.': '按 {key} 确认并提交。',
  'Submitting report…': '正在提交报告…',
  'Thank you for your report!': '感谢您的报告！',
  'Feedback ID: ': '反馈 ID： ',
  ' to open your browser and draft a GitHub issue, or any other key to close.':
    ' 打开浏览器并起草 GitHub issue，或按任意其他键关闭。',
  'Thanks for sharing your transcript!': '感谢分享您的会话记录！',
  'Sharing transcript…': '正在分享会话记录…',
  'Use /issue to report model behavior issues.':
    '使用 /issue 报告模型行为问题。',
  'Use {command} to share detailed feedback anytime.':
    '随时使用 {command} 分享详细反馈。',
  Bad: '差',
  Fine: '一般',
  Good: '好',
  'Can Anthropic look at your session transcript to help us improve Claude Code?':
    '是否允许 Anthropic 查看您的会话记录，以帮助我们改进 Claude Code？',
  '(No content)': '（无内容）',
  '… +{count} lines': '… +{count} 行',
  '(preview unavailable)': '（预览不可用）',
  'Global Search': '全局搜索',
  'Type to search…': '输入以搜索…',
  'No matches': '无匹配项',
  ' — Allow the use of your chats and coding sessions to train and improve Anthropic AI models. Change anytime in your Privacy Settings (':
    ' — 允许使用您的聊天和编码会话来训练和改进 Anthropic AI 模型。可随时在隐私设置中更改（',
  ').': '）。',
  ' — To help us improve our AI models and safety protections, we’re extending data retention to 5 years.':
    ' — 为帮助我们改进 AI 模型和安全防护，我们将数据保留期延长至 5 年。',
  'Search prompts': '搜索提示词',
  'Filter history…': '筛选历史…',
  'No matching prompts': '无匹配的提示词',
  'No history yet': '暂无历史',
  '{count} {word} configured': '已配置 {count} 个{word}',
  'Do you wish to enable auto-connect to IDE?': '是否启用自动连接 IDE？',
  'Do you wish to disable auto-connect to IDE?': '是否禁用自动连接 IDE？',
  'You can also configure this in /config': '您也可以在 /config 中配置此项',
  ' selected': ' 已选择',
  'In {filename}': '位于 {filename}',
  "You've been away {idle} and this conversation is {tokens} tokens.":
    '您已离开 {idle}，当前对话已达 {tokens} 个 token。',
  'Continue this conversation': '继续此对话',
  'Send message as a new conversation': '作为新对话发送消息',
  "Don't ask me again": '不再询问',
  'Configuration Error': '配置错误',
  'Reset with default configuration': '重置为默认配置',
  'Settings Error': '设置错误',
  'Continue without these settings': '忽略这些设置并继续',
  'Keybinding Configuration Issues': '按键绑定配置问题',
  'tmux session:': 'tmux 会话：',
  '[ANT-ONLY] Logs:': '[ANT-ONLY] 日志：',
  '{amount} in extra usage': '{amount} 额外用量',
  'current worktree': '当前 worktree',
  'Resume Session': '恢复会话',
  'Claude found these results:': 'Claude 找到以下结果：',
  'Search deeply using Claude': '使用 Claude 深度搜索',
  'Rename session:': '重命名会话：',
  'Enter new session name': '输入新的会话名称',
  'Searching with Claude…': '正在使用 Claude 搜索…',
  'Type to Search': '输入以搜索',
  'show current dir': '显示当前目录',
  'show all projects': '显示所有项目',
  'show current worktree': '显示当前 worktree',
  'show all worktrees': '显示所有 worktree',
  'Type to search': '输入以搜索',
  'Disable all LSP recommendations': '禁用所有 LSP 推荐',
  'LSP Plugin Recommendation': 'LSP 插件推荐',
  'Managed settings require approval': '托管设置需要审批',
  'Yes, I trust these settings': '是，我信任这些设置',
  'No, exit Claude Code': '否，退出 Claude Code',
  none: '无',
  ' Accept  ': ' 接受  ',
  ' Decline': ' 拒绝',
  ' Reopen URL  ': ' 重新打开 URL  ',
  ' Cancel': ' 取消',
  "If your browser doesn't open automatically, copy this URL manually:":
    '如果浏览器未自动打开，请手动复制此 URL：',
  '※ Error logs shown inline with --debug': '※ 使用 --debug 可内联显示错误日志',
  '※ Run claude --debug to see error logs':
    '※ 运行 claude --debug 查看错误日志',
  ' for help': ' 获取帮助',
  'Failed to parse': '解析失败',
  'Contains warnings': '包含警告',
  '{serverName} requires authentication': '{serverName} 需要身份验证',
  '{serverName} requires authentication. Use /mcp to authenticate.':
    '{serverName} 需要身份验证。使用 /mcp 进行验证。',
  ' Establishing connection to MCP server': ' 正在建立与 MCP 服务器的连接',
  "Failed to {action} MCP server '{serverName}': {error}":
    "对 MCP 服务器 '{serverName}' 执行 {action} 失败：{error}",
  ' Authenticating via your identity provider':
    ' 正在通过您的身份提供者进行验证',
  "If your browser doesn't open automatically, copy this URL manually ":
    '如果浏览器未自动打开，请手动复制此 URL ',
  "If the redirect page shows a connection error, paste the URL from your browser's address bar:":
    '如果重定向页面显示连接错误，请粘贴浏览器地址栏中的 URL：',
  ' after authenticating in your browser.': ' 在浏览器中完成身份验证后。',
  "If your browser didn't open automatically, copy this URL manually ":
    '如果浏览器未自动打开，请手动复制此 URL ',
  ' when done.': ' 完成后。',
  ' to open the browser.': ' 打开浏览器。',
  ' Restarting MCP server process': ' 正在重启 MCP 服务器进程',
  ' [read-only]': ' [只读]',
  ' [destructive]': ' [破坏性]',
  ' [open-world]': ' [开放世界]',
  ' (required)': '（必填）',
  'Use this and all future MCP servers in this project':
    '在此项目中使用此 MCP 服务器及未来所有 MCP 服务器',
  'Use this MCP server': '使用此 MCP 服务器',
  'Continue without using this MCP server': '不使用此 MCP 服务器并继续',
  'Import MCP Servers from Claude Desktop': '从 Claude Desktop 导入 MCP 服务器',
  'Found {count} MCP {noun} in Claude Desktop.':
    '在 Claude Desktop 中找到 {count} 个 MCP {noun}。',
  '{count} new MCP servers found in .mcp.json':
    '在 .mcp.json 中发现 {count} 个新 MCP 服务器',
  ' (new)': '（新）',
  'User memory': '用户记忆',
  'Project memory': '项目记忆',
  'Saved in ~/.claude/CLAUDE.md': '保存于 ~/.claude/CLAUDE.md',
  'Checked in at ./CLAUDE.md': '已签入 ./CLAUDE.md',
  'Saved in ./CLAUDE.md': '保存于 ./CLAUDE.md',
  '@-imported': '通过 @ 导入',
  'dynamically loaded': '动态加载',
  'Open auto-memory folder': '打开自动记忆文件夹',
  'Open team memory folder': '打开团队记忆文件夹',
  'Open {agentType} agent memory': '打开 {agentType} agent 记忆',
  '{scope} scope': '{scope} 作用域',
  'Auto-memory: {state}': '自动记忆：{state}',
  on: '开',
  off: '关',
  'Auto-dream: {state}': '自动 dream：{state}',
  '/dream to run': '/dream 手动运行',
  path: '路径',
  command: '命令',
  pattern: '模式',
  query: '查询',
  prompt: '提示词',
  collapse: '折叠',
  edit: '编辑',
  'copy {label}': '复制 {label}',
  '· Run in another terminal: security unlock-keychain':
    '· 在另一个终端运行：security unlock-keychain',
  ' (API_TIMEOUT_MS={timeout}ms, try increasing it)':
    '（API_TIMEOUT_MS={timeout}ms，可尝试调大）',
  'To continue immediately, use /model to switch to {model} and continue coding.':
    '要立即继续，请使用 /model 切换到 {model} 并继续编码。',
  '{prefix}: Please wait a moment and try again.':
    '{prefix}：请稍候片刻后重试。',
  '∴ Thinking': '∴ 思考中',
  ' (from {from})': '（来自 {from}）',
  relevant: '个相关',
  skill: '技能',
  cells: '个单元格',
  unchanged: '未更改',
  pages: '页',
  in: '于',
  Recalled: '已回忆',
  memory: '条记忆',
  memories: '条记忆',
  Loaded: '已加载',
  from: '来自',
  available: '可用',
  type: '类型',
  'Plan file referenced ({path})': '已引用计划文件（{path}）',
  'Skills restored ({skillNames})': '技能已恢复（{skillNames}）',
  '{hookName} hook returned blocking error': '{hookName} 钩子返回了阻断性错误',
  '{hookName} hook error': '{hookName} 钩子错误',
  '{hookName} hook warning': '{hookName} 钩子警告',
  '{hookName} hook stopped continuation: {message}':
    '{hookName} 钩子已阻止继续：{message}',
  '{hookName} says: {content}': '{hookName} 提示：{content}',
  Allowed: '已允许',
  Denied: '已拒绝',
  '{action} by {hookEvent} hook': '由 {hookEvent} 钩子{action}',
  teammate: '队友',
  'shut down gracefully': '已正常关闭',
  '✻ Conversation compacted ({historyShortcut} for history)':
    '✻ 对话已压缩（{historyShortcut} 查看历史）',
  'Plan Approval Request from {from}': '来自 {from} 的计划批准请求',
  'Plan file: {path}': '计划文件：{path}',
  '✓ Plan Approved by {name}': '✓ 计划已由 {name} 批准',
  'You can now proceed with implementation. Your plan mode restrictions have been lifted.':
    '现在可以开始实施了。计划模式的限制已解除。',
  '✗ Plan Rejected by {name}': '✗ 计划已被 {name} 拒绝',
  'Feedback: {feedback}': '反馈：{feedback}',
  'Please revise your plan based on the feedback and call ExitPlanMode again.':
    '请根据反馈修改计划，然后再次调用 ExitPlanMode。',
  '[Plan Approval Request from {from}]': '[来自 {from} 的计划批准请求]',
  '[Plan Approved] You can now proceed with implementation':
    '[计划已批准] 现在可以开始实施了',
  'Please revise your plan': '请修改您的计划',
  '[Plan Rejected] {feedback}': '[计划已拒绝] {feedback}',
  'Agent idle': 'Agent 空闲',
  'Task {taskId} {status}': '任务 {taskId} {status}',
  'Last DM: {summary}': '最近私信：{summary}',
  '/extra-usage to finish what you’re working on.':
    '/extra-usage 完成手头的工作。',
  '/login to switch to an API usage-billed account.':
    '/login 切换到按 API 用量计费的账户。',
  '/upgrade to increase your usage limit.': '/upgrade 提高您的用量限制。',
  '/extra-usage to request more usage from your admin.':
    '/extra-usage 向管理员申请更多用量。',
  '/upgrade or /extra-usage to finish what you’re working on.':
    '/upgrade 或 /extra-usage 完成手头的工作。',
  'Shutdown request from {from}': '来自 {from} 的关闭请求',
  'Reason: {reason}': '原因：{reason}',
  'Shutdown rejected by {from}': '关闭请求已被 {from} 拒绝',
  '[Shutdown Request from {from}]': '[来自 {from} 的关闭请求]',
  '[Shutdown Approved] {from} is now exiting': '[关闭已批准] {from} 正在退出',
  '[Shutdown Rejected] {from}: {reason}': '[关闭已拒绝] {from}：{reason}',
  '[snip] Conversation history before this point has been snipped.':
    '[snip] 此处之前的对话历史已被裁剪。',
  'Retrying in {seconds} {secondsLabel}… (attempt {attempt}/{maxRetries})':
    '{seconds} {secondsLabel}后重试…（第 {attempt}/{maxRetries} 次尝试）',
  second: '秒',
  seconds: '秒',
  ' · API_TIMEOUT_MS={timeout}ms, try increasing it':
    ' · API_TIMEOUT_MS={timeout}ms，可尝试调大',
  'Allowed ': '已允许 ',
  'Ran {count} {label} {hooks}': '已运行 {count} 个 {label} {hooks}',
  hook: '钩子',
  hooks: '钩子',
  Ran: '已运行',
  'hook error:': '钩子错误：',
  ' is active. Code in CLI or at': ' 已激活。可在 CLI 中编码，或访问',
  '[Task Assigned] #{taskId} - {subject}': '[任务已分配] #{taskId} - {subject}',
  'Skill({command})': '技能（{command}）',
  'Denied by auto mode classifier {bullet} /feedback if incorrect':
    '已被自动模式分类器拒绝 {bullet} 如判断有误请用 /feedback 反馈',
  ' Auto-approved · matched "{rule}"': ' 已自动批准 · 匹配规则 "{rule}"',
  '{count} new messages': '{count} 条新消息',
  '{shortcut} to show {count} previous messages':
    '{shortcut} 显示之前的 {count} 条消息',
  '{shortcut} to hide {count} previous messages':
    '{shortcut} 隐藏之前的 {count} 条消息',
  'Confirm you want to restore {what}to the point before you sent this message:':
    '请确认要将{what}恢复到发送此消息之前的状态：',
  ' at cell {cell_id}': '（单元格 {cell_id}）',
  '(not installed)': '（未安装）',
  '(already granted)': '（已授权）',
  '{count} other {apps} will be hidden while Claude works.':
    'Claude 工作期间将隐藏其他 {count} 个{apps}。',
  'Tool use': '工具使用',
  'Claude wants to review{title}.': 'Claude 想要审查{title}。',
  'Summary: {summary}': '摘要：{summary}',
  'Press Enter to continue…': '按 Enter 继续…',
  ' [offline]': ' [离线]',
  'Quick Open': '快速打开',
  'Type to search files…': '输入以搜索文件…',
  'No matching files': '没有匹配的文件',
  'Start typing to search…': '开始输入以搜索…',
  ' · loading…': ' · 加载中…',
  'Loading preview…': '正在加载预览…',
  'Enable Remote Control for this session': '为当前会话启用远程控制',
  'Opens a secure connection to claude.ai.': '将建立到 claude.ai 的安全连接。',
  'You can always enable it later with /remote-control.':
    '之后随时可通过 /remote-control 启用。',
  'Denied: {list}': '已拒绝：{list}',
  'Allowed within denied: {list}': '拒绝范围内的允许项：{list}',
  'Allowed: {list}': '已允许：{list}',
  'Denied within allowed: {list}': '允许范围内的拒绝项：{list}',
  ' ({count} more)': '（还有 {count} 个）',
  '✓ Unsandboxed fallback allowed - commands can run outside sandbox when necessary':
    '✓ 允许非沙箱回退 - 必要时命令可在沙箱外运行',
  '✓ Strict sandbox mode - all commands must run in sandbox or be excluded via the `excludedCommands` option':
    '✓ 严格沙箱模式 - 所有命令必须在沙箱中运行，或通过 `excludedCommands` 选项排除',
  '✓ Sandbox enabled with auto-allow for bash commands':
    '✓ 沙箱已启用，bash 命令自动允许',
  '✓ Sandbox enabled with regular bash permissions':
    '✓ 沙箱已启用，bash 使用常规权限',
  '○ Sandbox disabled': '○ 沙箱已禁用',
  Config: '配置',
  'Boundary: {name}': '边界：{name}',
  'Loading session…': '正在加载会话…',
  'MeoW nickname': 'MeoW 昵称',
  '(not set)': '（未设置）',
  'Nickname used by the MeoW push service (chuckfang.com) to deliver notifications.':
    'MeoW 推送服务（chuckfang.com）用于投递通知的昵称。',
  'e.g. my-nickname': '例如 my-nickname',
  'Default view': '默认视图',
  'On-Demand Usage': '按量使用',
  'Provider usage': '提供者用量',
  'Opened changes in {ideName} ⧉': '已在 {ideName} 中打开更改 ⧉',
  'This will modify {symlinkTarget} (outside working directory) via a symlink':
    '此操作将通过符号链接修改 {symlinkTarget}（位于工作目录之外）',
  'Symlink target:': '符号链接目标：',
  'Skill improvement suggested for "{skillName}"':
    '已为 "{skillName}" 提出技能改进建议',
  thinking: '思考中',
  'Loading your Claude Code stats…': '正在加载您的 Claude Code 统计数据…',
  'Failed to load stats: {message}': '加载统计数据失败：{message}',
  'No stats available yet. Start using Claude Code!':
    '暂无统计数据。开始使用 Claude Code 吧！',
  'Loading stats…': '正在加载统计…',
  'Esc to cancel · r to cycle dates · ctrl+s to copy':
    'Esc 取消 · r 切换日期 · ctrl+s 复制',
  'Most active day': '最活跃的一天',
  '{start}-{end} of {total} models (↑↓ to scroll)':
    '{start}-{end} / {total} 个模型（↑↓ 滚动）',
  'copying…': '复制中…',
  'copied!': '已复制！',
  'copy failed': '复制失败',
  'Peak hour': '高峰时段',
  'Stats from the last {days} days': '最近 {days} 天的统计',
  'Session Usage Stats': '会话使用统计',
  'Total cost:': '总成本：',
  '  Input:': '  输入：',
  '  Output:': '  输出：',
  '  Cache read:': '  缓存读取：',
  '  Cache write:': '  缓存写入：',
  'Web search reqs:': '网页搜索请求：',
  Duration: '耗时',
  '  Wall:': '  实际：',
  'Code Changes': '代码更改',
  '  Lines added:': '  新增行数：',
  '  Lines removed:': '  删除行数：',
  'Model Usage': '模型使用',
  '    Tokens:': '    Token：',
  '{input} in / {output} out': '{input} 输入 / {output} 输出',
  '    Cost:': '    成本：',
  'to close': '关闭',
  Completed: '已完成',
  Failed: '失败',
  Stopped: '已停止',
  'Stop ultraplan?': '停止 ultraplan？',
  working: '运行中',
  idle: '空闲',
  'Log in to Claude': '登录 Claude',
  'Login with Claude account': '使用 Claude 账号登录',
  '{path} no longer contains the correct repository. Select another path.':
    '{path} 不再包含正确的仓库。请选择其他路径。',
  'Teleport to Repo': '传送到仓库',
  'Open Claude Code in {targetRepo}:': '在 {targetRepo} 中打开 Claude Code：',
  'Validating repository…': '正在验证仓库…',
  'Run claude --teleport from a checkout of {targetRepo}':
    '请在 {targetRepo} 的检出目录中运行 claude --teleport',
  'Loading "{title}"…': '正在加载“{title}”…',
  'Failed to resume session': '恢复会话失败',
  ' Checking git status': ' 正在检查 git 状态',
  'Working Directory Has Changes': '工作目录有更改',
  '{count} files changed': '{count} 个文件已更改',
  'Stash changes and continue': '暂存更改并继续',
  'Syntax highlighting disabled (via CLAUDE_CODE_SYNTAX_HIGHLIGHT={value})':
    '语法高亮已禁用（通过 CLAUDE_CODE_SYNTAX_HIGHLIGHT={value}）',
  'Syntax highlighting disabled ({shortcut} to enable)':
    '语法高亮已禁用（{shortcut} 启用）',
  'Syntax theme: {theme}{source} ({shortcut} to disable)':
    '语法主题：{theme}{source}（{shortcut} 禁用）',
  ' (from {source})': '（来自 {source}）',
  'Syntax highlighting enabled ({shortcut} to disable)':
    '语法高亮已启用（{shortcut} 禁用）',
  'Claude will think before responding': 'Claude 将在回复前思考',
  'Claude will respond without extended thinking':
    'Claude 将直接回复，不进行扩展思考',
  'Accessing workspace:': '正在访问工作区：',
  'Ultraplan approved': 'Ultraplan 已批准',
  'How should the plan be implemented?': '应如何实施该计划？',
  'Run ultraplan in the cloud?': '在云端运行 ultraplan？',
  '(no content)': '（无内容）',
  'Your directive: ': '您的指令： ',
  'Usage: {input} input, {output} output, {cacheRead} cache read, {cacheWrite} cache write':
    '用量：{input} 输入，{output} 输出，{cacheRead} 缓存读取，{cacheWrite} 缓存写入',
  'Usage by model:': '按模型统计用量：',
  '{input} input, {output} output, {cacheRead} cache read, {cacheWrite} cache write':
    '{input} 输入，{output} 输出，{cacheRead} 缓存读取，{cacheWrite} 缓存写入',
  '(costs may be inaccurate due to usage of unknown models)':
    '（因使用了未知模型，成本可能不准确）',
  'Total cost': '总成本',
  'Total duration (API)': '总耗时（API）',
  'Total duration (wall)': '总耗时（实际）',
  'Total code changes': '代码更改总量',
  added: '新增',
  'Unknown daemon subcommand: {subcommand}':
    '未知的守护进程子命令：{subcommand}',
  '  Status:  running': '  状态：  运行中',
  '  Started: {startedAt}': '  启动于：{startedAt}',
  '  Workers: {workers}': '  Worker 数：{workers}',
  '  Status: stopped': '  状态：已停止',
  '  Status: stale (cleaned up)': '  状态：已过期（已清理）',
  '\n=== Background Sessions ===': '\n=== 后台会话 ===',
  "[daemon] spawning worker '{kind}'": "[守护进程] 正在启动 worker '{kind}'",
  "[daemon] worker '{kind}' exited with permanent error — parking":
    "[守护进程] worker '{kind}' 因永久性错误退出 — 已搁置",
  "[daemon] worker '{kind}' failed {count} times rapidly — parking":
    "[守护进程] worker '{kind}' 短时间内失败 {count} 次 — 已搁置",
  "[daemon] worker '{kind}' exited (code={code}, signal={sig}), restarting in {backoffMs}ms":
    "[守护进程] worker '{kind}' 已退出（code={code}, signal={sig}），将在 {backoffMs}ms 后重启",
  "Error: unknown daemon worker kind '{kind}'":
    "错误：未知的守护进程 worker 类型 '{kind}'",
  '[remoteControl] permanent error: {message}':
    '[remoteControl] 永久性错误：{message}',
  '[remoteControl] transient error: {message}':
    '[remoteControl] 暂时性错误：{message}',
  'Error: --daemon-worker requires DAEMON feature to be enabled. Set FEATURE_DAEMON=1 or add DAEMON to DEFAULT_BUILD_FEATURES.':
    '错误：--daemon-worker 需要启用 DAEMON 功能。请设置 FEATURE_DAEMON=1，或将 DAEMON 添加到 DEFAULT_BUILD_FEATURES。',
  "Error: Remote Control is disabled by your organization's policy.":
    '错误：远程控制已被您所在组织的策略禁用。',
  '[deprecated] Use: claude daemon {cmd}':
    '[已弃用] 请使用：claude daemon {cmd}',
  '[deprecated] Use: claude job {cmd}': '[已弃用] 请使用：claude job {cmd}',
  'Use your existing Claude {plan} plan with Claude Code':
    '在 Claude Code 中使用您现有的 Claude {plan} 计划',
  'Fast limit reset · now using fast mode':
    '快速模式限额已重置 · 现已启用快速模式',
  'Fast mode overloaded and is temporarily unavailable · resets in {resetIn}':
    '快速模式过载，暂时不可用 · 将在 {resetIn} 后重置',
  'Fast limit reached and temporarily disabled · resets in {resetIn}':
    '快速模式限额已用尽，暂时禁用 · 将在 {resetIn} 后重置',
  '{ide} disconnected': '{ide} 已断开连接',
  'IDE plugin not connected · /status for info':
    'IDE 插件未连接 · 运行 /status 查看详情',
  'IDE extension install failed (see /status for info)':
    'IDE 扩展安装失败（运行 /status 查看详情）',
  'LSP for {name} failed': '{name} 的 LSP 失败',
  '{count} MCP servers failed': '{count} 个 MCP 服务器失败',
  '{count} claude.ai connectors unavailable':
    '{count} 个 claude.ai 连接器不可用',
  '{count} MCP servers need auth': '{count} 个 MCP 服务器需要认证',
  '{count} claude.ai connectors need auth':
    '{count} 个 claude.ai 连接器需要认证',
  'Model updated to Sonnet 4.6': '模型已更新为 Sonnet 4.6',
  'Model updated to Opus 4.7 · Set CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 to opt out':
    '模型已更新为 Opus 4.7 · 设置 CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 可退出此行为',
  'Model updated to Opus 4.7': '模型已更新为 Opus 4.7',
  'Plugin updated: {names}': '插件已更新：{names}',
  'Plugins updated: {names}': '插件已更新：{names}',
  '{count} plugins failed to install': '{count} 个插件安装失败',
  'Found {count} settings {word} · /doctor for details':
    '发现 {count} 个设置{word} · /doctor 查看详情',
  issue: '问题',
  issues: '问题',
  '{count} agents spawned': '已启动 {count} 个 agent',
  '{count} agents shut down': '已关闭 {count} 个 agent',
  'search history': '搜索历史',
  'Image in clipboard · {shortcut} to paste':
    '剪贴板中有图片 · {shortcut} 粘贴',
  '{tool} requires permission': '{tool} 需要权限',
  'User aborted': '用户已中止',
  'User denied permission': '用户拒绝了权限',
  'Failed to connect to server at {url}': '无法连接到服务器 {url}',
  'Server disconnected.': '服务器已断开连接。',
  'Plugins flagged. Check /plugins': '有插件被标记。请检查 /plugins',
  'Failed to load plugin commands: {error}': '加载插件命令失败：{error}',
  'Failed to load plugin agents: {error}': '加载插件 agent 失败：{error}',
  'Failed to load plugin hooks: {error}': '加载插件钩子失败：{error}',
  'Plugins changed. Run /reload-plugins to activate.':
    '插件已变更。运行 /reload-plugins 以激活。',
  '[{role} / {name}] Error: {detail}': '[{role} / {name}] 错误：{detail}',
  'no output': '无输出',
  '[{role} / {name}] Completed': '[{role} / {name}] 已完成',
  'Routed to {targets}; main can continue other tasks':
    '已路由至 {targets}；主会话可继续处理其他任务',
  'Selected pipes are unavailable; processing locally.':
    '所选管道不可用；改为本地处理。',
  'Failed to send to: {targets}': '发送失败：{targets}',
  'Plugin {pluginId} not found in marketplace':
    '在插件市场中未找到插件 {pluginId}',
  '{name} installed · restart to apply': '{name} 已安装 · 重启后生效',
  'Failed to install {name}': '安装 {name} 失败',
  'Remote session may be unresponsive. Attempting to reconnect…':
    '远程会话可能无响应。正在尝试重新连接…',
  'disabled after repeated failures · restart to retry':
    '多次失败后已禁用 · 重启以重试',
  'Remote Control failed to connect: {error}': '远程控制连接失败：{error}',
  'Skill "{name}" updated with improvements.': '技能“{name}”已更新并改进。',
  'send message': '发送消息',
  'send message · {status}': '发送消息 · {status}',
  'Use {shortcut} to toggle thinking': '使用 {shortcut} 切换思考模式',
  'Error: Invalid JSON provided to --settings\n':
    '错误：提供给 --settings 的 JSON 无效\n',
  'Error: Settings file not found: {path}\n': '错误：未找到设置文件：{path}\n',
  'Error processing settings: {error}\n': '处理设置时出错：{error}\n',
  'Error processing --setting-sources: {error}\n':
    '处理 --setting-sources 时出错：{error}\n',
  'Your prompt': '您的提示词',
  'Enable debug mode with optional category filtering (e.g., "api,hooks" or "!1p,!file")':
    '启用调试模式，可选类别过滤（例如 "api,hooks" 或 "!1p,!file"）',
  'Enable debug mode (to stderr)': '启用调试模式（输出到 stderr）',
  'Write debug logs to a specific file path (implicitly enables debug mode)':
    '将调试日志写入指定文件路径（隐式启用调试模式）',
  'Override verbose mode setting from config': '覆盖配置中的详细模式设置',
  'Print response and exit (useful for pipes). Note: The workspace trust dialog is skipped when Claude is run with the -p mode. Only use this flag in directories you trust.':
    '打印响应后退出（适用于管道）。注意：以 -p 模式运行 Claude 时会跳过工作区信任对话框。请仅在您信任的目录中使用此标志。',
  'Minimal mode: skip hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. Sets CLAUDE_CODE_SIMPLE=1. Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read). 3P providers (Bedrock/Vertex/Foundry) use their own credentials. Skills still resolve via /skill-name. Explicitly provide context via: --system-prompt[-file], --append-system-prompt[-file], --add-dir (CLAUDE.md dirs), --mcp-config, --settings, --agents, --plugin-dir.':
    '极简模式：跳过钩子、LSP、插件同步、归因、自动记忆、后台预取、钥匙串读取和 CLAUDE.md 自动发现。设置 CLAUDE_CODE_SIMPLE=1。Anthropic 鉴权严格限定为 ANTHROPIC_API_KEY 或通过 --settings 指定的 apiKeyHelper（绝不读取 OAuth 和钥匙串）。第三方提供者（Bedrock/Vertex/Foundry）使用各自的凭据。技能仍可通过 /skill-name 解析。请通过以下方式显式提供上下文：--system-prompt[-file]、--append-system-prompt[-file]、--add-dir（CLAUDE.md 目录）、--mcp-config、--settings、--agents、--plugin-dir。',
  'Run Setup hooks with init trigger, then continue':
    '以 init 触发器运行 Setup 钩子，然后继续',
  'Run Setup and SessionStart:startup hooks, then exit':
    '运行 Setup 和 SessionStart:startup 钩子，然后退出',
  'Run Setup hooks with maintenance trigger, then continue':
    '以 maintenance 触发器运行 Setup 钩子，然后继续',
  'Output format (only works with --print): "text" (default), "json" (single result), or "stream-json" (realtime streaming)':
    '输出格式（仅配合 --print 使用）："text"（默认）、"json"（单一结果）或 "stream-json"（实时流式）',
  'JSON Schema for structured output validation. Example: {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}':
    '用于结构化输出校验的 JSON Schema。示例：{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
  'Include all hook lifecycle events in the output stream (only works with --output-format=stream-json)':
    '在输出流中包含所有钩子生命周期事件（仅配合 --output-format=stream-json 使用）',
  'Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)':
    '在部分消息块到达时即时输出（仅配合 --print 和 --output-format=stream-json 使用）',
  'Input format (only works with --print): "text" (default), or "stream-json" (realtime streaming input)':
    '输入格式（仅配合 --print 使用）："text"（默认）或 "stream-json"（实时流式输入）',
  '[DEPRECATED. Use --debug instead] Enable MCP debug mode (shows MCP server errors)':
    '【已弃用，请改用 --debug】启用 MCP 调试模式（显示 MCP 服务器错误）',
  'Bypass all permission checks. Recommended only for sandboxes with no internet access.':
    '绕过所有权限检查。仅建议在无互联网访问的沙箱中使用。',
  'Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access.':
    '将绕过所有权限检查作为可选项启用，但默认不开启。仅建议在无互联网访问的沙箱中使用。',
  'Thinking mode: enabled (equivalent to adaptive), disabled':
    '思考模式：enabled（等同于 adaptive）、disabled',
  '[DEPRECATED. Use --thinking instead for newer models] Maximum number of thinking tokens (only works with --print)':
    '【已弃用，较新模型请改用 --thinking】思考 token 的最大数量（仅配合 --print 使用）',
  'Maximum number of agentic turns in non-interactive mode. This will early exit the conversation after the specified number of turns. (only works with --print)':
    '非交互模式下 agent 轮次的最大数量。达到指定轮数后将提前结束对话。（仅配合 --print 使用）',
  'Maximum dollar amount to spend on API calls (only works with --print)':
    'API 调用花费的最大美元金额（仅配合 --print 使用）',
  '--max-budget-usd must be a positive number greater than 0':
    '--max-budget-usd 必须是大于 0 的正数',
  'API-side task budget in tokens (output_config.task_budget)':
    'API 侧的任务预算（以 token 计，output_config.task_budget）',
  '--task-budget must be a positive integer': '--task-budget 必须是正整数',
  'Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)':
    '将来自 stdin 的用户消息重新输出到 stdout 以作确认（仅配合 --input-format=stream-json 和 --output-format=stream-json 使用）',
  'Enable auth status messages in SDK mode': '在 SDK 模式下启用鉴权状态消息',
  'Comma or space-separated list of tool names to allow (e.g. "Bash(git:*) Edit")':
    '允许的工具名称列表，以逗号或空格分隔（例如 "Bash(git:*) Edit"）',
  'Specify the list of available tools from the built-in set. Use "" to disable all tools, "default" to use all tools, or specify tool names (e.g. "Bash,Edit,Read").':
    '从内置工具集中指定可用工具列表。使用 "" 禁用所有工具，"default" 使用所有工具，或指定工具名称（例如 "Bash,Edit,Read"）。',
  'Comma or space-separated list of tool names to deny (e.g. "Bash(git:*) Edit")':
    '拒绝的工具名称列表，以逗号或空格分隔（例如 "Bash(git:*) Edit"）',
  'Load MCP servers from JSON files or strings (space-separated)':
    '从 JSON 文件或字符串加载 MCP 服务器（以空格分隔）',
  'MCP tool to use for permission prompts (only works with --print)':
    '用于权限提示的 MCP 工具（仅配合 --print 使用）',
  'System prompt to use for the session': '会话使用的系统提示词',
  'Read system prompt from a file': '从文件读取系统提示词',
  'Append a system prompt to the default system prompt':
    '在默认系统提示词后追加系统提示词',
  'Read system prompt from a file and append to the default system prompt':
    '从文件读取系统提示词并追加到默认系统提示词后',
  'Permission mode to use for the session': '会话使用的权限模式',
  'Continue the most recent conversation in the current directory':
    '继续当前目录中最近的对话',
  'Resume a conversation by session ID, or open interactive picker with optional search term':
    '按会话 ID 恢复对话，或打开交互式选择器（可附带搜索词）',
  'When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)':
    '恢复时创建新的会话 ID 而非复用原有 ID（配合 --resume 或 --continue 使用）',
  'Pre-fill the prompt input with text without submitting it':
    '预填充提示输入框文本但不提交',
  'Signal that this session was launched from a deep link':
    '标记此会话由深层链接启动',
  'Repo slug the deep link ?repo= parameter resolved to the current cwd':
    '深层链接 ?repo= 参数解析到当前 cwd 的仓库 slug',
  'FETCH_HEAD mtime in epoch ms, precomputed by the deep link trampoline':
    'FETCH_HEAD 的 mtime（epoch 毫秒），由深层链接跳板预先计算',
  'Resume a session linked to a PR by PR number/URL, or open interactive picker with optional search term':
    '按 PR 编号/URL 恢复与 PR 关联的会话，或打开交互式选择器（可附带搜索词）',
  'Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)':
    '禁用会话持久化——会话不会保存到磁盘且无法恢复（仅配合 --print 使用）',
  'When resuming, only messages up to and including the assistant message with <message.id> (use with --resume in print mode)':
    '恢复时仅包含至 <message.id> 对应助手消息为止的消息（含该消息，在 print 模式下配合 --resume 使用）',
  'Restore files to state at the specified user message and exit (requires --resume)':
    '将文件恢复到指定用户消息时的状态后退出（需要 --resume）',
  'It must be one of: {values}': '必须是以下值之一：{values}',
  'Beta headers to include in API requests (API key users only)':
    'API 请求中包含的 Beta 标头（仅限 API key 用户）',
  'Enable automatic fallback to specified model when default model is overloaded (only works with --print)':
    '当默认模型过载时自动回退到指定模型（仅配合 --print 使用）',
  'Workload tag for billing-header attribution (cc_workload). Process-scoped; set by SDK daemon callers that spawn subprocesses for cron work. (only works with --print)':
    '用于计费标头归因的工作负载标签（cc_workload）。进程级作用域；由为 cron 任务派生子进程的 SDK 守护进程调用方设置。（仅配合 --print 使用）',
  'Path to a settings JSON file or a JSON string to load additional settings from':
    '设置 JSON 文件的路径或 JSON 字符串，用于加载额外设置',
  'Additional directories to allow tool access to': '允许工具访问的额外目录',
  'Automatically connect to IDE on startup if exactly one valid IDE is available':
    '启动时若恰好只有一个有效 IDE 可用则自动连接',
  'Only use MCP servers from --mcp-config, ignoring all other MCP configurations':
    '仅使用 --mcp-config 中的 MCP 服务器，忽略所有其他 MCP 配置',
  'Use a specific session ID for the conversation (must be a valid UUID)':
    '为对话使用指定的会话 ID（必须是有效的 UUID）',
  'Set a display name for this session (shown in /resume and terminal title)':
    '为此会话设置显示名称（显示在 /resume 和终端标题中）',
  'JSON object defining custom agents (e.g. \'{"reviewer": {"description": "Reviews code", "prompt": "You are a code reviewer"}}\')':
    '定义自定义 agent 的 JSON 对象（例如 \'{"reviewer": {"description": "Reviews code", "prompt": "You are a code reviewer"}}\'）',
  'Comma-separated list of setting sources to load (user, project, local).':
    '要加载的设置来源列表，以逗号分隔（user、project、local）。',
  'Load plugins from a directory for this session only (repeatable: --plugin-dir A --plugin-dir B)':
    '仅为本次会话从目录加载插件（可重复：--plugin-dir A --plugin-dir B）',
  'Disable all skills': '禁用所有技能',
  'Enable Claude in Chrome integration': '启用 Claude in Chrome 集成',
  'Disable Claude in Chrome integration': '禁用 Claude in Chrome 集成',
  'File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)':
    '启动时要下载的文件资源。格式：file_id:relative_path（例如 --file file_abc:doc.txt file_def:img.png）',
  'Assistant mode disabled: directory is not trusted. Accept the trust dialog and restart.':
    '助手模式已禁用：目录不受信任。请接受信任对话框后重启。',
  'Error: --tmux requires --worktree\n': '错误：--tmux 需要 --worktree\n',
  'Error: --tmux is not supported on Windows\n':
    '错误：Windows 不支持 --tmux\n',
  'Error: tmux is not installed.\n{instructions}\n':
    '错误：未安装 tmux。\n{instructions}\n',
  'Error: --agent-id, --agent-name, and --team-name must all be provided together\n':
    '错误：--agent-id、--agent-name 和 --team-name 必须同时提供\n',
  'Error: --session-id can only be used with --continue or --resume if --fork-session is also specified.\n':
    '错误：--session-id 只有在同时指定 --fork-session 时才能与 --continue 或 --resume 一起使用。\n',
  'Error: Invalid session ID. Must be a valid UUID.\n':
    '错误：无效的会话 ID。必须是有效的 UUID。\n',
  'Error: Session ID {id} is already in use.\n':
    '错误：会话 ID {id} 已被占用。\n',
  'Error: Session token required for file downloads. CLAUDE_CODE_SESSION_ACCESS_TOKEN must be set.\n':
    '错误：文件下载需要会话令牌。必须设置 CLAUDE_CODE_SESSION_ACCESS_TOKEN。\n',
  'Error: Cannot use both --system-prompt and --system-prompt-file. Please use only one.\n':
    '错误：不能同时使用 --system-prompt 和 --system-prompt-file，请只使用其中一个。\n',
  'Error: System prompt file not found: {path}\n':
    '错误：未找到系统提示词文件：{path}\n',
  'Error reading system prompt file: {error}\n':
    '读取系统提示词文件出错：{error}\n',
  'Error: Cannot use both --append-system-prompt and --append-system-prompt-file. Please use only one.\n':
    '错误：不能同时使用 --append-system-prompt 和 --append-system-prompt-file，请只使用其中一个。\n',
  'Error: Append system prompt file not found: {path}\n':
    '错误：未找到追加系统提示词文件：{path}\n',
  'Error reading append system prompt file: {error}\n':
    '读取追加系统提示词文件出错：{error}\n',
  'Error: Invalid MCP configuration:\n{errors}\n':
    '错误：无效的 MCP 配置：\n{errors}\n',
  'Invalid MCP configuration: "{name}" is a reserved MCP name.':
    '无效的 MCP 配置："{name}" 是保留的 MCP 名称。',
  'Error: {message}\n': '错误：{message}\n',
  'Warning: MCP {count} blocked by enterprise policy: {names}\n':
    '警告：MCP {count} 已被企业策略拦截：{names}\n',
  'Error: Failed to run with Claude in Chrome.':
    '错误：无法通过 Claude in Chrome 运行。',
  'You cannot use --strict-mcp-config when an enterprise MCP config is present':
    '存在企业 MCP 配置时不能使用 --strict-mcp-config',
  'You cannot dynamically configure MCP servers when an enterprise MCP config is present':
    '存在企业 MCP 配置时不能动态配置 MCP 服务器',
  '{flag} entries must be tagged: {bad}\n  plugin:<name>@<marketplace>  — plugin-provided channel (allowlist enforced)\n  server:<name>                — manually configured MCP server\n':
    '{flag} 条目必须带标签：{bad}\n  plugin:<name>@<marketplace>  — 插件提供的频道（强制执行白名单）\n  server:<name>                — 手动配置的 MCP 服务器\n',
  'Warning: claude.ai MCP {count} blocked by enterprise policy: {names}\n':
    '警告：claude.ai MCP {count} 已被企业策略拦截：{names}\n',
  'Error: The model "{model}" does not support the advisor tool.\n':
    '错误：模型 "{model}" 不支持顾问工具。\n',
  'Error: The model "{model}" cannot be used as an advisor.\n':
    '错误：模型 "{model}" 不能用作顾问。\n',
  '{reason}\n--rc flag ignored.\n': '{reason}\n已忽略 --rc 标志。\n',
  'No conversation found to continue': '未找到可继续的对话',
  'Connected to server at {url}\nSession: {id}':
    '已连接到服务器 {url}\n会话：{id}',
  'Starting local ssh-proxy test session...\n':
    '正在启动本地 ssh-proxy 测试会话...\n',
  'Connecting to {host}...\n': '正在连接到 {host}...\n',
  'Local ssh-proxy test session\ncwd: {cwd}\nAuth: unix socket → local proxy':
    '本地 ssh-proxy 测试会话\ncwd: {cwd}\n鉴权：unix socket → 本地代理',
  'SSH session to {host}\nRemote cwd: {cwd}\nAuth: unix socket -R → local proxy':
    '连接到 {host} 的 SSH 会话\n远程 cwd: {cwd}\n鉴权：unix socket -R → 本地代理',
  'Failed to discover sessions: {error}': '发现会话失败：{error}',
  'Assistant installation failed': '助手安装失败',
  'Assistant installed in {dir}. The daemon is starting up — run `claude assistant` again in a few seconds to connect.':
    '助手已安装到 {dir}。守护进程正在启动 — 请几秒后再次运行 `claude assistant` 以连接。',
  'Error: {message}': '错误：{message}',
  'Failed to authenticate': '身份验证失败',
  'Attached to assistant session {id}...': '已附加到助手会话 {id}...',
  "Error: Remote sessions are disabled by your organization's policy.":
    '错误：您所在组织的策略已禁用远程会话。',
  'Error: --remote requires a description.\nUsage: claude --remote "your task description"':
    '错误：--remote 需要提供描述。\n用法：claude --remote "你的任务描述"',
  'Error: Unable to create remote session': '错误：无法创建远程会话',
  'Created remote session: {title}\n': '已创建远程会话：{title}\n',
  'View: {url}\n': '查看：{url}\n',
  'Resume with: claude --teleport {id}\n': '恢复方式：claude --teleport {id}\n',
  '/remote-control is active. Code in CLI or at {url}':
    '/remote-control 已激活。可在 CLI 中或访问 {url} 进行编码',
  'You must run claude --teleport {teleport} from a checkout of {repo}.':
    '必须在 {repo} 的检出目录中运行 claude --teleport {teleport}。',
  'You must run claude --teleport {teleport} from a checkout of {repo}.\n':
    '必须在 {repo} 的检出目录中运行 claude --teleport {teleport}。\n',
  'Failed to validate session': '会话验证失败',
  'Error: {error}\n': '错误：{error}\n',
  'Unable to load transcript from file: {path}':
    '无法从文件加载对话记录：{path}',
  'No conversation found with session ID: {id}': '未找到会话 ID 为 {id} 的对话',
  'Failed to resume session {id}': '恢复会话 {id} 失败',
  'Warning: {count}/{total} file(s) failed to download.\n':
    '警告：{count}/{total} 个文件下载失败。\n',
  'Error downloading files: {error}': '下载文件出错：{error}',
  'Output the version number': '输出版本号',
  'Create a new git worktree for this session (optionally specify a name)':
    '为此会话创建新的 git worktree（可选指定名称）',
  'Create a tmux session for the worktree (requires --worktree). Uses iTerm2 native panes when available; use --tmux=classic for traditional tmux.':
    '为 worktree 创建 tmux 会话（需要 --worktree）。可用时使用 iTerm2 原生窗格；使用 --tmux=classic 使用传统 tmux。',
  'Enable the server-side advisor tool with the specified model (alias or full ID).':
    '使用指定模型启用服务端顾问工具（别名或完整 ID）。',
  '[ANT-ONLY] Alias for --permission-mode auto.':
    '[ANT-ONLY] --permission-mode auto 的别名。',
  '[ANT-ONLY] Deprecated alias for --permission-mode auto.':
    '[ANT-ONLY] --permission-mode auto 的已弃用别名。',
  '[ANT-ONLY] Tasks mode: watch for tasks and auto-process them. Optional id is used as both the task list ID and agent ID (defaults to "tasklist").':
    '[ANT-ONLY] 任务模式：监视任务并自动处理。可选的 id 同时用作任务列表 ID 和 agent ID（默认为 "tasklist"）。',
  '[ANT-ONLY] Force Claude to use multi-agent mode for solving problems':
    '[ANT-ONLY] 强制 Claude 使用多 agent 模式解决问题',
  'Opt in to auto mode': '选择启用自动模式',
  'Start in proactive autonomous mode': '以主动自主模式启动',
  'Unix domain socket path for the UDS messaging server (defaults to a tmp path)':
    'UDS 消息服务器的 Unix domain socket 路径（默认为临时路径）',
  'Enable SendUserMessage tool for agent-to-user communication':
    '启用 SendUserMessage 工具用于 agent 与用户通信',
  'Force assistant mode (Agent SDK daemon use)':
    '强制助手模式（供 Agent SDK 守护进程使用）',
  'MCP servers whose channel notifications (inbound push) should register this session. Space-separated server names.':
    '其频道通知（入站推送）应注册此会话的 MCP 服务器。服务器名称以空格分隔。',
  'Load channel servers not on the approved allowlist. For local channel development only. Shows a confirmation dialog at startup.':
    '加载不在批准白名单中的频道服务器。仅用于本地频道开发。启动时会显示确认对话框。',
  'Teammate agent ID': '队友 agent ID',
  'Teammate display name': '队友显示名称',
  'Team name for swarm coordination': '用于集群协调的团队名称',
  'Teammate UI color': '队友 UI 颜色',
  'Require plan mode before implementation': '实施前要求进入计划模式',
  'Parent session ID for analytics correlation': '用于分析关联的父会话 ID',
  'How to spawn teammates: "tmux", "in-process", or "auto"':
    '队友的生成方式："tmux"、"in-process" 或 "auto"',
  'Custom agent type for this teammate': '此队友的自定义 agent 类型',
  'Use remote WebSocket endpoint for SDK I/O streaming (only with -p and stream-json format)':
    '使用远程 WebSocket 端点进行 SDK I/O 流式传输（仅限 -p 和 stream-json 格式）',
  'Resume a teleport session, optionally specify session ID':
    '恢复 teleport 会话，可选指定会话 ID',
  'Create a remote session with the given description':
    '使用给定描述创建远程会话',
  'Start an interactive session with Remote Control enabled (optionally named)':
    '启动已启用远程控制的交互式会话（可选命名）',
  'Alias for --remote-control': '--remote-control 的别名',
  'Crash on logError calls instead of silently logging':
    '在 logError 调用时崩溃而不是静默记录日志',
  'Configure and manage MCP servers': '配置和管理 MCP 服务器',
  'Start the Claude Code MCP server': '启动 Claude Code MCP 服务器',
  'Enable debug mode': '启用调试模式',
  'Remove an MCP server': '移除 MCP 服务器',
  'Configuration scope (local, user, or project) - if not specified, removes from whichever scope it exists in':
    '配置范围（local、user 或 project）— 未指定时，从其实际所在的范围中移除',
  'List configured MCP servers. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.':
    '列出已配置的 MCP 服务器。注意：会跳过工作区信任对话框，并会启动 .mcp.json 中的 stdio 服务器进行健康检查。请仅在您信任的目录中使用此命令。',
  'Get details about an MCP server. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.':
    '获取 MCP 服务器的详细信息。注意：会跳过工作区信任对话框，并会启动 .mcp.json 中的 stdio 服务器进行健康检查。请仅在您信任的目录中使用此命令。',
  'Add an MCP server (stdio or SSE) with a JSON string':
    '使用 JSON 字符串添加 MCP 服务器（stdio 或 SSE）',
  'Import MCP servers from Claude Desktop (Mac and WSL only)':
    '从 Claude Desktop 导入 MCP 服务器（仅限 Mac 和 WSL）',
  'Reset all approved and rejected project-scoped (.mcp.json) servers within this project':
    '重置此项目中所有已批准和已拒绝的项目级（.mcp.json）服务器',
  'HTTP port': 'HTTP 端口',
  'Bind address': '绑定地址',
  'Bearer token for auth': '用于鉴权的 Bearer token',
  'Listen on a unix domain socket': '监听 unix domain socket',
  'Default working directory for sessions that do not specify cwd':
    '未指定 cwd 的会话所使用的默认工作目录',
  'Idle timeout for detached sessions in ms (0 = never expire)':
    '分离会话的空闲超时（毫秒，0 = 永不过期）',
  'Maximum concurrent sessions (0 = unlimited)': '最大并发会话数（0 = 无限制）',
  'A claude server is already running (pid {pid}) at {url}\n':
    '已有 claude 服务器在 {url} 运行（pid {pid}）\n',
  'Permission mode for the remote session': '远程会话的权限模式',
  'Skip all permission prompts on the remote (dangerous)':
    '跳过远程端的所有权限提示（危险）',
  'Custom remote binary command (skips probe/deploy). ':
    '自定义远程二进制命令（跳过探测/部署）。 ',
  'e2e test mode — spawn the child CLI locally (skip ssh/deploy). ':
    'e2e 测试模式 — 在本地生成子 CLI（跳过 ssh/部署）。 ',
  'Usage: claude ssh <user@host | ssh-config-alias> [dir]\n\n':
    '用法：claude ssh <user@host | ssh-config-alias> [dir]\n\n',
  'Print mode (headless)': '打印模式（无头）',
  'Output format: text, json, stream-json': '输出格式：text、json、stream-json',
  'Manage authentication': '管理身份验证',
  'Sign in to your Anthropic account': '登录您的 Anthropic 账户',
  'Pre-populate email address on the login page': '在登录页面预填电子邮箱地址',
  'Force SSO login flow': '强制使用 SSO 登录流程',
  'Use Anthropic Console (API usage billing) instead of Claude subscription':
    '使用 Anthropic Console（按 API 用量计费）而非 Claude 订阅',
  'Use Claude subscription (default)': '使用 Claude 订阅（默认）',
  'Show authentication status': '显示身份验证状态',
  'Output as JSON (default)': '以 JSON 格式输出（默认）',
  'Output as human-readable text': '以人类可读的文本格式输出',
  'Log out from your Anthropic account': '退出您的 Anthropic 账户',
  'Use cowork_plugins directory': '使用 cowork_plugins 目录',
  'Validate a plugin or marketplace manifest': '校验插件或市场清单',
  'List installed plugins': '列出已安装的插件',
  'Include available plugins from marketplaces (requires --json)':
    '包含来自市场的可用插件（需要 --json）',
  'Manage Claude Code marketplaces': '管理 Claude Code 市场',
  'Add a marketplace from a URL, path, or GitHub repo':
    '从 URL、路径或 GitHub 仓库添加市场',
  'Limit checkout to specific directories via git sparse-checkout (for monorepos). Example: --sparse .claude-plugin plugins':
    '通过 git sparse-checkout 仅检出指定目录（适用于 monorepo）。示例：--sparse .claude-plugin plugins',
  'Where to declare the marketplace: user (default), project, or local':
    '市场声明位置：user（默认）、project 或 local',
  'List all configured marketplaces': '列出所有已配置的市场',
  'Remove a configured marketplace': '移除已配置的市场',
  'Update marketplace(s) from their source - updates all if no name specified':
    '从来源更新市场 — 未指定名称时更新全部',
  'Install a plugin from available marketplaces (use plugin@marketplace for specific marketplace)':
    '从可用市场安装插件（使用 plugin@marketplace 指定市场）',
  'Installation scope: user, project, or local':
    '安装范围：user、project 或 local',
  'Uninstall an installed plugin': '卸载已安装的插件',
  'Uninstall from scope: user, project, or local':
    '卸载范围：user、project 或 local',
  "Preserve the plugin's persistent data directory (~/.claude/plugins/data/{id}/)":
    '保留插件的持久数据目录（~/.claude/plugins/data/{id}/）',
  'Enable a disabled plugin': '启用已禁用的插件',
  'Disable an enabled plugin': '禁用已启用的插件',
  'Disable all enabled plugins': '禁用所有已启用的插件',
  'Update a plugin to the latest version (restart required to apply)':
    '更新插件到最新版本（需重启生效）',
  'Override which model is used': '覆盖使用的模型',
  'Include teams, pipes, daemon, and remote-control sections':
    '包含 teams、pipes、daemon 和 remote-control 部分',
  'Usage: claude assistant [sessionId]\n\n':
    '用法：claude assistant [sessionId]\n\n',
  'List recent published versions with ages': '列出最近发布的版本及发布时间',
  'Show what would be installed without installing':
    '仅显示将安装的内容，不实际安装',
  'Roll back to the server-pinned safe version (set by oncall during incidents)':
    '回滚到服务端固定的安全版本（由 oncall 在事故期间设置）',
  'Force installation even if already installed': '即使已安装也强制安装',
  'A number (0, 1, 2, etc.) to display a specific log, or the sesssion ID (uuid) of a log':
    '用于显示特定日志的编号（0、1、2 等），或日志的会话 ID（uuid）',
  'A number (0, 1, 2, etc.) to display a specific log':
    '用于显示特定日志的编号（0、1、2 等）',
  'Session ID, log index (0, 1, 2...), or path to a .json/.jsonl log file':
    '会话 ID、日志索引（0、1、2...）或 .json/.jsonl 日志文件路径',
  'Output file path for the exported text': '导出文本的输出文件路径',
  'Task description': '任务描述',
  'Task list ID (defaults to "tasklist")': '任务列表 ID（默认为 "tasklist"）',
  'Show only pending tasks': '仅显示待处理任务',
  'Update subject': '更新主题',
  'Update description': '更新描述',
  'Set owner': '设置负责人',
  'Clear owner': '清除负责人',
  'Write completion script directly to a file instead of stdout':
    '将补全脚本直接写入文件而非 stdout',
  '└ Failed to fetch versions': '└ 获取版本失败',
  '└ Stable version: {version}': '└ 稳定版本：{version}',
  '└ Latest version: {version}': '└ 最新版本：{version}',
  'Managed by package manager': '由包管理器管理',
  '└ Currently running: {type} ({version})': '└ 当前运行：{type}（{version}）',
  '└ Package manager: {pm}': '└ 包管理器：{pm}',
  '└ Path: {path}': '└ 路径：{path}',
  '└ Invoked: {binary}': '└ 调用方式：{binary}',
  '└ Config install method: {method}': '└ 配置的安装方式：{method}',
  '└ Search: {status} ({mode})': '└ 搜索：{status}（{mode}）',
  'Not working': '不可用',
  '└ Note: {note}': '└ 注意：{note}',
  'Recommendation: {text}': '建议：{text}',
  '{type} at {path}': '{type}，位于 {path}',
  'Warning: {issue}': '警告：{issue}',
  'Fix: {fix}': '修复：{fix}',
  '└ Auto-updates: {status}': '└ 自动更新：{status}',
  '└ Update permissions: {status}': '└ 更新权限：{status}',
  '└ Auto-update channel: {channel}': '└ 自动更新通道：{channel}',
  '└ Cleaned {count} stale lock(s)': '└ 已清理 {count} 个过期锁',
  '{version}: PID {pid}': '{version}：PID {pid}',
  '└ Failed to parse {count} agent file(s):':
    '└ {count} 个 agent 文件解析失败：',
  '└ {count} plugin error(s) detected:': '└ 检测到 {count} 个插件错误：',
  'Showing detailed transcript · {shortcut} to toggle':
    '正在显示详细对话记录 · {shortcut} 切换',
  ' · n/N to navigate': ' · n/N 导航',
  ' · {arrows} scroll · home/end top/bottom':
    ' · {arrows} 滚动 · home/end 顶部/底部',
  to: '至',
  'show all': '显示全部',
  'indexing…': '索引中…',
  'indexed in {ms}ms': '索引完成，耗时 {ms}ms',
  'no matches': '无匹配',
  'worker request': 'worker 请求',
  'sandbox request': '沙箱请求',
  'dialog open': '对话框已打开',
  'input needed': '需要输入',
  'Worktree creation took {secs}s. For large repos, set `worktree.sparsePaths` in .claude/settings.json to check out only the directories you need.':
    'worktree 创建耗时 {secs} 秒。对于大型仓库，可在 .claude/settings.json 中设置 `worktree.sparsePaths`，只检出需要的目录。',
  'Allow network connection to {host}?': '允许网络连接到 {host} 吗？',
  'Error: sandbox required but unavailable: {reason}':
    '错误：需要沙箱但不可用：{reason}',
  'sandbox.failIfUnavailable is set — refusing to start without a working sandbox.':
    '已设置 sandbox.failIfUnavailable — 沙箱不可用时拒绝启动。',
  'Sandbox Error: {error}': '沙箱错误：{error}',
  'Running PreCompact hooks…': '正在运行 PreCompact 钩子…',
  'Running PostCompact hooks…': '正在运行 PostCompact 钩子…',
  'Running SessionStart hooks…': '正在运行 SessionStart 钩子…',
  'Detected connection error. Active goal was auto-paused. Run /goal resume after network recovers.':
    '检测到连接错误。活动目标已自动暂停。网络恢复后请运行 /goal resume。',
  'Slave request was interrupted before completion.':
    '从属请求在完成前被中断。',
  copied: '已复制',
  'new task?': '新任务？',
  '{n} tokens': '{n} token',
  'new task? /clear to save {n} tokens': '新任务？/clear 可节省 {n} token',
  'Goal auto-continue ({turn}/1): continue advancing "{objective}".':
    '目标自动继续（{turn}/1）：继续推进“{objective}”。',
  'Goal reached max continuation turns (1). Run /goal continue to reset turn counter and continue.':
    '目标已达到最大继续轮数（1）。运行 /goal continue 重置轮数计数并继续。',
  'Claude Code has been suspended. Run `fg` to bring Claude Code back.':
    'Claude Code 已挂起。运行 `fg` 恢复 Claude Code。',
  'Note: ctrl + z now suspends Claude Code, ctrl + _ undoes input.':
    '注意：ctrl + z 现在会挂起 Claude Code，ctrl + _ 撤销输入。',
  'running {hookType} hook{label}': '正在运行 {hookType} 钩子{label}',
  'running {hookType} hook{label}… {count}/{total}':
    '正在运行 {hookType} 钩子{label}… {count}/{total}',
  'running {hookType} hook': '正在运行 {hookType} 钩子',
  'running stop hooks… {count}/{total}': '正在运行 stop 钩子… {count}/{total}',
  'rendering {count} messages…': '正在渲染 {count} 条消息…',
  'opening {path}': '正在打开 {path}',
  'wrote {path} · no $VISUAL/$EDITOR set':
    '已写入 {path} · 未设置 $VISUAL/$EDITOR',
  'render failed: {error}': '渲染失败：{error}',
  'Waiting for leader to approve network access to {host}':
    '正在等待 leader 批准对 {host} 的网络访问',
  'How well did Claude use its memory? (optional)':
    'Claude 对记忆的使用效果如何？（可选）',
  'That message is no longer in the active context (snipped or pre-compact). Choose a more recent message.':
    '该消息已不在活动上下文中（已被裁剪或位于压缩之前）。请选择更近的消息。',
  'Conversation summarized ({shortcut} for history)':
    '对话已总结（{shortcut} 查看历史）',
  'Session permission mode': '会话权限模式',
  'AI model to use': '要使用的 AI 模型',
  'Standard behavior, prompts for dangerous operations':
    '标准行为，对危险操作进行确认',
  'Auto-accept file edit operations': '自动接受文件编辑操作',
  'Planning mode, no actual tool execution': '计划模式，不实际执行工具',
  'Use a model classifier to approve/deny permission prompts.':
    '使用模型分类器批准/拒绝权限请求。',
  'Skip all permission checks': '跳过所有权限检查',
  "Don't prompt for permissions, deny if not pre-approved":
    '不进行权限确认，未预先批准则直接拒绝',
  'Write {path}': '写入 {path}',
  'Edit {path}': '编辑 {path}',
  'Fetch {url}': '抓取 {url}',
  'Web search': '网页搜索',
  'Update TODOs: {items}': '更新 TODO：{items}',
  'Update TODOs': '更新 TODO',
  'Unknown Tool': '未知工具',
  Reject: '拒绝',
  'Yes, and use "auto" mode': '是，并使用 "auto" 模式',
  'Yes, and auto-accept edits': '是，并自动接受编辑',
  'Yes, and manually approve edits': '是，并手动批准编辑',
  'Auto (Cursor picks)': '自动（由 Cursor 选择）',
  '{error} after {retries} attempts': '尝试 {retries} 次后仍失败：{error}',
  'File not found: {fileId}': '未找到文件：{fileId}',
  'Authentication failed: invalid or missing API key':
    '认证失败：API key 无效或缺失',
  'Access denied to file: {fileId}': '文件访问被拒绝：{fileId}',
  'Upload succeeded but no file ID returned': '上传成功但未返回文件 ID',
  'Access denied for upload': '上传被拒绝',
  'File too large for upload': '文件过大，无法上传',
  'Upload canceled': '上传已取消',
  'Access denied to list files': '列出文件被拒绝',
  'Auth error: {error}': '认证错误：{error}',
  'assertWorkspaceHost: invalid URL "{url}". Workspace API key requests must target {host}.':
    'assertWorkspaceHost：无效 URL "{url}"。Workspace API key 请求必须指向 {host}。',
  'assertWorkspaceHost: refusing to send workspace API key to non-Anthropic host "{hostname}". Workspace API key requests must target {target}. If you are using a custom base URL, workspace endpoints are only available on the Anthropic API.':
    'assertWorkspaceHost：拒绝向非 Anthropic 主机 "{hostname}" 发送 workspace API key。Workspace API key 请求必须指向 {target}。如果您使用自定义 base URL，请注意 workspace 端点仅在 Anthropic API 上可用。',
  'assertSubscriptionBaseUrl: invalid URL "{url}". Subscription OAuth requests must target {host}.':
    'assertSubscriptionBaseUrl：无效 URL "{url}"。订阅 OAuth 请求必须指向 {host}。',
  'assertSubscriptionBaseUrl: refusing subscription OAuth request to non-Anthropic host "{hostname}". Subscription OAuth requests must target {target}.':
    'assertSubscriptionBaseUrl：拒绝向非 Anthropic 主机 "{hostname}" 发起订阅 OAuth 请求。订阅 OAuth 请求必须指向 {target}。',
  'Workspace API key must not be empty.': 'Workspace API key 不能为空。',
  'Workspace API key is too short ({length} chars). Expected at least {min} chars starting with "{prefix}".':
    'Workspace API key 过短（{length} 个字符）。应至少 {min} 个字符且以 "{prefix}" 开头。',
  'Workspace API key is too long ({length} chars). Maximum allowed length is {max} chars.':
    'Workspace API key 过长（{length} 个字符）。最大允许长度为 {max} 个字符。',
  'Workspace API key must start with "{prefix}" (workspace key). Got prefix "{gotPrefix}...". Obtain a workspace API key from https://console.anthropic.com/settings/keys.':
    'Workspace API key 必须以 "{prefix}" 开头（workspace key）。实际前缀为 "{gotPrefix}..."。请前往 https://console.anthropic.com/settings/keys 获取 workspace API key。',
  'Failed to save workspace API key to config: {error}':
    '保存 workspace API key 到配置失败：{error}',
  'Failed to remove workspace API key: {error}':
    '移除 workspace API key 失败：{error}',
  'Cursor credential for "{label}" is missing. Delete this connection and add it again via /connect.':
    '缺少 "{label}" 的 Cursor 凭据。请删除此连接，然后通过 /connect 重新添加。',
  'Cursor auto-selects a model': '由 Cursor 自动选择模型',
  'vault was created with an older format (no KDF salt). ':
    '保险库使用旧格式创建（无 KDF salt）。 ',
  'Please re-set your secrets using /local-vault set to upgrade to the secure format':
    '请使用 /local-vault set 重新设置您的机密，以升级到安全格式',
  'No TTY available to prompt for client secret. Set MCP_CLIENT_SECRET env var instead.':
    '没有可用的 TTY 来输入 client secret。请改为设置 MCP_CLIENT_SECRET 环境变量。',
  'Enter OAuth client secret: ': '输入 OAuth client secret： ',
  "Anthropic's agentic coding tool": 'Anthropic 的智能编程工具',
  'Invalid name {name}. Names can only contain letters, numbers, hyphens, and underscores.':
    '名称 {name} 无效。名称只能包含字母、数字、连字符和下划线。',
  'Cannot add MCP server "{name}": this name is reserved.':
    '无法添加 MCP 服务器 "{name}"：此名称已被保留。',
  'Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers':
    '无法添加 MCP 服务器：企业 MCP 配置已生效，对 MCP 服务器拥有独占控制权',
  'Invalid configuration: {errors}': '配置无效：{errors}',
  'Cannot add MCP server "{name}": server is explicitly blocked by enterprise policy':
    '无法添加 MCP 服务器 "{name}"：该服务器已被企业策略明确阻止',
  'Cannot add MCP server "{name}": not allowed by enterprise policy':
    '无法添加 MCP 服务器 "{name}"：企业策略不允许',
  'MCP server {name} already exists in .mcp.json':
    'MCP 服务器 {name} 已存在于 .mcp.json 中',
  'MCP server {name} already exists in user config':
    'MCP 服务器 {name} 已存在于用户配置中',
  'MCP server {name} already exists in local config':
    'MCP 服务器 {name} 已存在于本地配置中',
  'Cannot add MCP server to scope: dynamic':
    '无法向作用域添加 MCP 服务器：dynamic',
  'Cannot add MCP server to scope: enterprise':
    '无法向作用域添加 MCP 服务器：enterprise',
  'Cannot add MCP server to scope: claudeai':
    '无法向作用域添加 MCP 服务器：claudeai',
  'Failed to write to .mcp.json: {error}': '写入 .mcp.json 失败：{error}',
  'Cannot add MCP server to scope: {scope}':
    '无法向作用域添加 MCP 服务器：{scope}',
  'No MCP server found with name: {name} in .mcp.json':
    '在 .mcp.json 中未找到名为 {name} 的 MCP 服务器',
  'Failed to remove from .mcp.json: {error}': '从 .mcp.json 移除失败：{error}',
  'No user-scoped MCP server found with name: {name}':
    '未找到名为 {name} 的用户级 MCP 服务器',
  'No project-local MCP server found with name: {name}':
    '未找到名为 {name} 的项目本地 MCP 服务器',
  'Cannot remove MCP server from scope: {scope}':
    '无法从作用域移除 MCP 服务器：{scope}',
  'No available ports for OAuth redirect': '没有可用于 OAuth 重定向的端口',
  'Invalid scope: {scope}. Must be one of: {valid}':
    '无效作用域：{scope}。必须是以下之一：{valid}',
  'Invalid transport type: {type}. Must be one of: stdio, sse, http':
    '无效传输类型：{type}。必须是以下之一：stdio、sse、http',
  'Invalid header format: "{header}". Expected format: "Header-Name: value"':
    '请求头格式无效："{header}"。期望格式："Header-Name: value"',
  'Invalid header: "{header}". Header name cannot be empty.':
    '请求头无效："{header}"。请求头名称不能为空。',
  'Authentication failed: Invalid authorization code': '认证失败：授权码无效',
  'Token exchange failed ({status}): {text}':
    '令牌交换失败（{status}）：{text}',
  'Token refresh failed: {statusText}': '令牌刷新失败：{statusText}',
  'Failed to fetch user roles: {statusText}': '获取用户角色失败：{statusText}',
  'OAuth account information not found in config':
    '配置中未找到 OAuth 账户信息',
  '{icon} Failed to {operation}: {error}': '{icon} {operation} 失败：{error}',
  'Installing plugin "{plugin}"...': '正在安装插件 "{plugin}"...',
  'Checking for updates of plugin "{plugin}" in {scope} scope...\n':
    '正在检查 {scope} 作用域中插件 "{plugin}" 的更新...\n',
  'Authentication required for policy limits': '获取策略限制需要认证',
  'Invalid policy limits format': '策略限制格式无效',
  'Not authorized for policy limits': '无权访问策略限制',
  'Policy limits request timeout': '策略限制请求超时',
  'Authentication required for remote settings': '获取远程设置需要认证',
  'Invalid remote settings format': '远程设置格式无效',
  'Invalid settings structure': '设置结构无效',
  'Not authorized for remote settings': '无权访问远程设置',
  'Remote settings request timeout': '远程设置请求超时',
  'Invalid store name: "{name}" is too long (max {maxLength} chars).':
    '存储名称无效："{name}" 过长（最多 {maxLength} 个字符）。',
  'Invalid store name: "{name}" contains illegal characters (path separators, null byte, or colon).':
    '存储名称无效："{name}" 包含非法字符（路径分隔符、null 字节或冒号）。',
  'Invalid store name: "{name}" must not start with ".".':
    '存储名称无效："{name}" 不能以 "." 开头。',
  'Invalid store name: "{name}" is path-like and would escape the base directory.':
    '存储名称无效："{name}" 形似路径，会逃逸出基础目录。',
  'Store "{storeName}" already exists': '存储 "{storeName}" 已存在',
  'Store "{storeName}" does not exist': '存储 "{storeName}" 不存在',
  'Entry value too large: {size} bytes exceeds the 1 MB limit. Use external storage for large data.':
    '条目值过大：{size} 字节超出 1 MB 限制。大数据请使用外部存储。',
  'No messages to summarize': '没有可总结的消息',
  'Invalid settings sync response format': '设置同步响应格式无效',
  'Not authorized for settings sync': '无权进行设置同步',
  'Settings sync request timeout': '设置同步请求超时',
  'No OAuth token available for team memory sync':
    '没有可用于团队记忆同步的 OAuth 令牌',
  'Invalid team memory response format': '团队记忆响应格式无效',
  'Not authorized for team memory sync': '无权进行团队记忆同步',
  'Team memory sync request timeout': '团队记忆同步请求超时',
  'Server did not return entryChecksums (?view=hashes unsupported)':
    '服务器未返回 entryChecksums（不支持 ?view=hashes）',
  Timeout: '超时',
  'ETag mismatch': 'ETag 不匹配',
  'Conflict resolution failed after retries': '重试后冲突解决仍然失败',
  'Conflict resolution hashes probe failed': '冲突解决哈希探测失败',
  'Unexpected end of conflict resolution loop': '冲突解决循环意外结束',
  'ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var is required':
    '需要设置 ANTHROPIC_API_KEY 或 CLAUDE_CODE_OAUTH_TOKEN 环境变量',
  'apiKeyHelper failed: {detail}': 'apiKeyHelper 失败：{detail}',
  'AWS auth refresh timed out after 3 minutes. Run your auth command manually in a separate terminal.':
    'AWS 鉴权刷新已超时（3 分钟）。请在单独的终端中手动运行您的鉴权命令。',
  'Error running awsAuthRefresh (in settings or ~/.claude.json):':
    '运行 awsAuthRefresh 时出错（位于设置或 ~/.claude.json）：',
  'awsCredentialExport did not return a valid value':
    'awsCredentialExport 未返回有效值',
  'awsCredentialExport did not return valid AWS STS output structure':
    'awsCredentialExport 未返回有效的 AWS STS 输出结构',
  'Error getting AWS credentials from awsCredentialExport (in settings or ~/.claude.json):':
    '从 awsCredentialExport 获取 AWS 凭据时出错（位于设置或 ~/.claude.json）：',
  'GCP auth refresh timed out after 3 minutes. Run your auth command manually in a separate terminal.':
    'GCP 鉴权刷新已超时（3 分钟）。请在单独的终端中手动运行您的鉴权命令。',
  'Error running gcpAuthRefresh (in settings or ~/.claude.json):':
    '运行 gcpAuthRefresh 时出错（位于设置或 ~/.claude.json）：',
  'Invalid API key format. API key must contain only alphanumeric characters, dashes, and underscores.':
    'API key 格式无效。API key 只能包含字母、数字、连字符和下划线。',
  'Failed to delete keychain entry': '删除钥匙串条目失败',
  'No autonomy flows recorded.': '未记录任何自治流程。',
  'Autonomy flow not found.': '未找到自治流程。',
  'getAutonomyPersistenceLockCountForTests can only be called in tests':
    'getAutonomyPersistenceLockCountForTests 只能在测试中调用',
  'Autonomy run was unexpectedly skipped.': '自治运行被意外跳过。',
  'Autonomy queued prompt was unexpectedly skipped.':
    '自治队列中的提示被意外跳过。',
  'No autonomy runs recorded.': '未记录任何自治运行。',
  'Failed to quote shell arguments safely': '无法安全地对 shell 参数加引号',
  'Warning: Custom betas are only available for API key users. Ignoring provided betas.':
    '警告：自定义 beta 仅对 API key 用户可用。将忽略提供的 beta。',
  'Warning: Beta header is not allowed.': '警告：不允许使用 Beta 请求头。',
  'Invalid URL format: {url}': 'URL 格式无效：{url}',
  'Invalid URL protocol: must use http:// or https://, got {protocol}':
    'URL 协议无效：必须使用 http:// 或 https://，实际为 {protocol}',
  'Unsupported platform. Claude Desktop integration only works on macOS and WSL.':
    '不支持的平台。Claude Desktop 集成仅支持 macOS 和 WSL。',
  'Could not find Claude Desktop config file in Windows. Make sure Claude Desktop is installed on Windows.':
    '在 Windows 中找不到 Claude Desktop 配置文件。请确认已在 Windows 上安装 Claude Desktop。',
  'Unsupported platform - Claude Desktop integration only works on macOS and WSL.':
    '不支持的平台 — Claude Desktop 集成仅支持 macOS 和 WSL。',
  'Browser extension is not connected. Please ensure the Claude browser extension is installed and running ({extensionUrl}), and that you are logged into claude.ai with the same account as Claude Code. If this is your first time connecting to Chrome, you may need to restart Chrome for the installation to take effect. If you continue to experience issues, please report a bug: {bugUrl}':
    '浏览器扩展未连接。请确保已安装并运行 Claude 浏览器扩展（{extensionUrl}），并且您登录 claude.ai 使用的账户与 Claude Code 相同。如果这是您首次连接 Chrome，可能需要重启 Chrome 以使安装生效。如果问题仍然存在，请报告 bug：{bugUrl}',
  'Navigation completed': '导航已完成',
  'Tab created': '标签页已创建',
  'Tabs read': '标签页已读取',
  'Input completed': '输入已完成',
  'Action completed': '操作已完成',
  'Window resized': '窗口大小已调整',
  'Search completed': '搜索已完成',
  'GIF action completed': 'GIF 操作已完成',
  'Console messages retrieved': '已获取控制台消息',
  'Network requests retrieved': '已获取网络请求',
  'Shortcuts retrieved': '已获取快捷方式',
  'Shortcut executed': '快捷方式已执行',
  'Script executed': '脚本已执行',
  'Page read': '页面已读取',
  'Image uploaded': '图片已上传',
  'Page text retrieved': '已获取页面文本',
  'Plan updated': '计划已更新',
  Captured: '已截取',
  'Access updated': '访问权限已更新',
  Typed: '已输入',
  Pressed: '已按下',
  Scrolled: '已滚动',
  Dragged: '已拖动',
  Opened: '已打开',
  'Every minute': '每分钟',
  'Every {n} minutes': '每 {n} 分钟',
  'Every hour': '每小时',
  'Every hour at :{minute}': '每小时的第 {minute} 分',
  'Every {n} hours': '每 {n} 小时',
  'Every {n} hours at :{minute}': '每 {n} 小时的第 {minute} 分',
  'Every day at {time}': '每天 {time}',
  'Every {day} at {time}': '每{day} {time}',
  'Weekdays at {time}': '工作日 {time}',
  'Invalid deep link: expected {protocol} scheme, got "{uri}"':
    '深层链接无效：期望 {protocol} scheme，实际为 "{uri}"',
  'Invalid deep link URL: "{uri}"': '深层链接 URL 无效："{uri}"',
  'Unknown deep link action: "{action}"': '未知的深层链接操作："{action}"',
  'Invalid cwd in deep link: must be an absolute path, got "{cwd}"':
    '深层链接中的 cwd 无效：必须是绝对路径，实际为 "{cwd}"',
  'Deep link cwd exceeds {max} characters (got {length})':
    '深层链接的 cwd 超过 {max} 个字符（实际 {length}）',
  'Invalid repo in deep link: expected "owner/repo", got "{repo}"':
    '深层链接中的仓库无效：期望 "owner/repo" 格式，实际为 "{repo}"',
  'Deep link query exceeds {max} characters (got {length})':
    '深层链接的查询超过 {max} 个字符（实际 {length}）',
  'Unsupported platform: {platform}': '不支持的平台：{platform}',
  'Invalid manifest: {errors}': 'manifest 无效：{errors}',
  'Invalid JSON in manifest.json': 'manifest.json 中的 JSON 无效',
  'Failed to read or unzip file': '读取或解压文件失败',
  'Invalid environment variable format: environment variables should be added as: -e KEY1=value1 -e KEY2=value2':
    '环境变量格式无效：环境变量应按以下方式添加：-e KEY1=value1 -e KEY2=value2',
  'Fast mode is not available': '快速模式不可用',
  'Fast mode requires the native binary · Install from: https://claude.com/product/claude-code':
    '快速模式需要原生二进制文件 · 安装地址：https://claude.com/product/claude-code',
  'Fast mode is not available in the Agent SDK': 'Agent SDK 中不支持快速模式',
  'Fast mode is not available on Bedrock, Vertex, or Foundry':
    'Bedrock、Vertex 和 Foundry 不支持快速模式',
  'Fast mode disabled · extra usage credits exhausted':
    '快速模式已禁用 · 超额使用额度已耗尽',
  'Fast mode disabled · extra usage disabled by your organization':
    '快速模式已禁用 · 您的组织已禁用超额使用',
  'Fast mode disabled · extra usage spending cap reached':
    '快速模式已禁用 · 已达到超额使用消费上限',
  'Fast mode disabled · extra usage disabled for your account':
    '快速模式已禁用 · 您的账户已禁用超额使用',
  'Fast mode disabled · extra usage not available for your plan':
    '快速模式已禁用 · 您的计划不支持超额使用',
  'Fast mode disabled · extra usage not available':
    '快速模式已禁用 · 超额使用不可用',
  'No auth available': '无可用鉴权',
  'The selected snapshot was not found': '未找到所选快照',
  'No agent available for forked execution': '没有可用于分支执行的 agent',
  'No items in generator': '生成器中没有条目',
  unreachable: '不可达代码',
  'User settings (~/.claude/settings.json)':
    '用户设置（~/.claude/settings.json）',
  'Project settings (.claude/settings.json)':
    '项目设置（.claude/settings.json）',
  'Local settings (.claude/settings.local.json)':
    '本地设置（.claude/settings.local.json）',
  'Plugin hooks (~/.claude/plugins/*/hooks/hooks.json)':
    '插件钩子（~/.claude/plugins/*/hooks/hooks.json）',
  'Session hooks (in-memory, temporary)': '会话钩子（内存中，临时）',
  'Built-in hooks (registered internally by Claude Code)':
    '内置钩子（由 Claude Code 内部注册）',
  'User Settings': '用户设置',
  'Project Settings': '项目设置',
  'Local Settings': '本地设置',
  'Plugin Hooks': '插件钩子',
  'Session Hooks': '会话钩子',
  'Built-in Hooks': '内置钩子',
  User: '用户',
  Project: '项目',
  Local: '本地',
  Session: '会话',
  'Built-in': '内置',
  'Plugin directory does not exist: {root}{extra}':
    '插件目录不存在：{root}{extra}',
  'run /plugin to reinstall': '运行 /plugin 重新安装',
  'PowerShell hook executable not found. Install PowerShell, or remove "shell": "powershell" to use bash.':
    '未找到 PowerShell 钩子可执行文件。请安装 PowerShell，或移除 "shell": "powershell" 以使用 bash。',
  'Stop hook feedback:\n{error}': 'Stop 钩子反馈：\n{error}',
  'TeammateIdle hook feedback:\n{error}': 'TeammateIdle 钩子反馈：\n{error}',
  'TaskCreated hook feedback:\n{error}': 'TaskCreated 钩子反馈：\n{error}',
  'TaskCompleted hook feedback:\n{error}': 'TaskCompleted 钩子反馈：\n{error}',
  'UserPromptSubmit operation blocked by hook:\n{error}':
    'UserPromptSubmit 操作已被钩子阻止：\n{error}',
  'WorktreeCreate hook failed': 'WorktreeCreate 钩子执行失败',
  'Empty key': '键为空',
  'Key too long (max {max})': '键过长（最大 {max}）',
  'Invalid key chars: {key}': '键包含非法字符：{key}',
  'Leading dot forbidden': '不允许以点开头',
  'Windows reserved name: {key}': 'Windows 保留名称：{key}',
  'Start can only be called once per transport.':
    '每个 transport 只能调用一次 start。',
  'WebSocket is not open. Cannot start transport.':
    'WebSocket 未打开，无法启动 transport。',
  'WebSocket is not open. Cannot send message.':
    'WebSocket 未打开，无法发送消息。',
  'Use the default Cursor model (currently {model})':
    '使用默认 Cursor 模型（当前 {model}）',
  'Default Cursor model (currently {model})':
    '默认 Cursor 模型（当前 {model}）',
  'Cell with ID "{cellId}" not found in notebook':
    '在 notebook 中未找到 ID 为 "{cellId}" 的单元格',
  'Path must be a string, received {type}': '路径必须是字符串，实际收到 {type}',
  'Base directory must be a string, received {type}':
    '基础目录必须是字符串，实际收到 {type}',
  'Path contains null bytes': '路径包含空字节',
  'Scratchpad directory feature is not enabled': '暂存目录功能未启用',
  'Cannot delete permission rules from read-only settings':
    '无法从只读设置中删除权限规则',
  'Cannot transition to auto mode: gate is not enabled':
    '无法切换到自动模式：门控未启用',
  'Bypass permissions mode was disabled by your organization policy':
    '绕过权限模式已被您的组织策略禁用',
  'Bypass permissions mode was disabled by settings':
    '绕过权限模式已被设置禁用',
  'Pipe "{name}" not found at {path}. Is the server running?':
    '在 {path} 未找到管道 "{name}"。服务器是否在运行？',
  'Not connected to pipe "{name}"': '未连接到管道 "{name}"',
  'Failed to delete plugin cache': '删除插件缓存失败',
  'Cannot install plugins to managed scope': '无法将插件安装到受管作用域',
  'No result received from shell command': '未收到 shell 命令的结果',
  'Commands are in the form `/command [args]`': '命令格式为 `/command [args]`',
  'Unknown skill: {name}': '未知技能：{name}',
  'Args from unknown skill: {args}': '来自未知技能的参数：{args}',
  'This skill can only be invoked by Claude, not directly by users. Ask Claude to use the "{name}" skill for you.':
    '此技能只能由 Claude 调用，用户无法直接使用。请让 Claude 为您使用 "{name}" 技能。',
  'Unknown command: {name}': '未知命令：{name}',
  'Unexpected {type} command. Expected prompt command. Use /{name} directly in the main conversation.':
    '意外的 {type} 命令，此处应为 prompt 命令。请在主对话中直接使用 /{name}。',
  'Skill "/{name}" is available for workers.':
    '技能 "/{name}" 可供 worker 使用。',
  'Description: {description}': '描述：{description}',
  'When to use: {whenToUse}': '使用时机：{whenToUse}',
  'This skill grants workers additional tool permissions: {tools}':
    '此技能为 worker 授予额外的工具权限：{tools}',
  '\nInstruct a worker to use this skill by including "Use the /{name} skill" in your Agent prompt. The worker has access to the Skill tool and will receive the skill\'s content and permissions when it invokes it.':
    '\n在 Agent prompt 中加入 "Use the /{name} skill" 即可指示 worker 使用此技能。worker 拥有 Skill 工具的访问权限，调用时会获得该技能的内容和权限。',
  'Mode: {mode} requires a string input.': '模式 {mode} 需要字符串输入。',
  'Ink instance not found - cannot pause rendering':
    '未找到 Ink 实例 — 无法暂停渲染',
  '{editor} exited with code {status}': '{editor} 已退出，退出码 {status}',
  'Unsupported address family: {family}': '不支持的地址族：{family}',
  'EISDIR: illegal operation on a directory, read "{path}"':
    'EISDIR：对目录的非法操作，读取 "{path}"',
  'Sandbox failed to initialize.': '沙箱初始化失败。',
  'Unicode sanitization reached maximum iterations':
    'Unicode 净化达到最大迭代次数',
  'No messages found in JSONL file': 'JSONL 文件中未找到消息',
  'No valid conversation chain found in JSONL file':
    'JSONL 文件中未找到有效的对话链',
  'Invalid JSON in transcript file: {error}': '转录文件中的 JSON 无效：{error}',
  'Transcript messages must be an array': '转录消息必须是数组',
  'Transcript must be an array of messages or an object with a messages array':
    '转录必须是消息数组，或包含 messages 数组的对象',
  'Invalid setting source: {name}. Valid options are: user, project, local':
    '无效的设置来源：{name}。可用选项：user、project、local',
  'Invalid value. Expected one of: {expected}':
    '无效的值。期望以下之一：{expected}',
  'Invalid or malformed JSON': 'JSON 无效或格式错误',
  'Expected {expected}, but received {received}':
    '期望 {expected}，实际收到 {received}',
  'Unrecognized {fieldCount}: {keys}': '无法识别的 {fieldCount}：{keys}',
  'Number must be greater than or equal to {minimum}':
    '数字必须大于或等于 {minimum}',
  'No suitable shell found. Claude CLI requires a Posix shell environment. Please ensure you have a valid shell installed and the SHELL environment variable set.':
    '未找到合适的 shell。Claude CLI 需要 Posix shell 环境。请确保已安装有效的 shell 并设置了 SHELL 环境变量。',
  'PowerShell is not available': 'PowerShell 不可用',
  'Path "{path}" does not exist': '路径 "{path}" 不存在',
  'Gemini API request failed': 'Gemini API 请求失败',
  'Invalid ISO date string': '无效的 ISO 日期字符串',
  plugin: '插件',
  extension: '扩展',
  'Error installing {ideName} {type}: {error}':
    '安装 {ideName} {type} 时出错：{error}',
  'Please restart your IDE and try again.': '请重启您的 IDE 后重试。',
  'Connected to {ideName} {type} version {version} (server version: {serverVersion})':
    '已连接到 {ideName} {type} 版本 {version}（服务器版本：{serverVersion}）',
  'Connected to {ideName} {type} version {version}':
    '已连接到 {ideName} {type} 版本 {version}',
  'Installed {ideName} {type}': '已安装 {ideName} {type}',
  'Connected to {ideName} extension': '已连接到 {ideName} 扩展',
  '{n} connected': '{n} 个已连接',
  '{n} need auth': '{n} 个需要认证',
  '{n} pending': '{n} 个等待中',
  '{n} failed': '{n} 个失败',
  'MCP servers': 'MCP 服务器',
  'Large {path} will impact performance ({size} chars > {max})':
    '过大的 {path} 会影响性能（{size} 字符 > {max}）',
  'Enterprise managed settings (remote)': '企业托管设置（远程）',
  'Enterprise managed settings (plist)': '企业托管设置（plist）',
  'Enterprise managed settings (HKLM)': '企业托管设置（HKLM）',
  'Enterprise managed settings (file + drop-ins)':
    '企业托管设置（文件 + drop-ins）',
  'Enterprise managed settings (drop-ins)': '企业托管设置（drop-ins）',
  'Enterprise managed settings (file)': '企业托管设置（文件）',
  'Enterprise managed settings (HKCU)': '企业托管设置（HKCU）',
  'Found invalid settings files: {files}. They will be ignored.':
    '发现无效的设置文件：{files}。这些文件将被忽略。',
  '{plan} Account': '{plan} 账户',
  'AWS auth skipped': '已跳过 AWS 认证',
  'GCP auth skipped': '已跳过 GCP 认证',
  'Microsoft Foundry auth skipped': '已跳过 Microsoft Foundry 认证',
  'Stream can only be iterated once': '流只能被迭代一次',
  'Installing it2 using {pm}…': '正在使用 {pm} 安装 it2…',
  '· Python API is enabled in iTerm2 preferences':
    '· 已在 iTerm2 偏好设置中启用 Python API',
  '· You may need to restart iTerm2 after enabling':
    '· 启用后可能需要重启 iTerm2',
  'Invalid UUID hex length: {length}': '无效的 UUID 十六进制长度：{length}',
  'Mailbox message text exceeds {max} bytes': '邮箱消息文本超过 {max} 字节',
  'Invalid mailbox message: expected object': '无效的邮箱消息：期望对象',
  'Invalid mailbox message shape': '邮箱消息结构无效',
  'Invalid mailbox file: expected message array':
    '无效的邮箱文件：期望消息数组',
  'Mailbox file exceeds {max} bytes: {path}': '邮箱文件超过 {max} 字节：{path}',
  'Compacted mailbox still exceeds {max} bytes':
    '压缩后的邮箱仍超过 {max} 字节',
  'Git working directory is not clean. Please commit or stash your changes before using --teleport.':
    'Git 工作目录不干净。使用 --teleport 前请先提交或暂存您的更改。',
  'Error: Git working directory is not clean. Please commit or stash your changes before using --teleport.\n':
    '错误：Git 工作目录不干净。使用 --teleport 前请先提交或暂存您的更改。\n',
  "Remote sessions are disabled by your organization's policy.":
    '远程会话已被您的组织策略禁用。',
  'Unable to get organization UUID for constructing session URL':
    '无法获取组织 UUID 以构建会话 URL',
  'Failed to validate session repository': '验证会话仓库失败',
  'Unhandled repo validation status: {status}':
    '未处理的仓库验证状态：{status}',
  'Failed to fetch session logs': '获取会话日志失败',
  '{id} not found.': '未找到 {id}。',
  '{id} not found.\n{help}': '未找到 {id}。\n{help}',
  'Run /status in Claude Code to check your account.':
    '在 Claude Code 中运行 /status 检查您的账户。',
  'Failed to fetch session from Sessions API: {error}':
    '从 Sessions API 获取会话失败：{error}',
  'No access token for polling': '没有可用于轮询的访问令牌',
  'No org UUID for polling': '没有可用于轮询的组织 UUID',
  'Failed to fetch session events: {error}': '获取会话事件失败：{error}',
  'Invalid events response': '无效的事件响应',
  '. Please setup GitHub on https://claude.ai/code':
    '。请在 https://claude.ai/code 上设置 GitHub',
  'Repository has no commits — run `git add . && git commit -m "initial"` then retry':
    '仓库没有任何提交 — 请运行 `git add . && git commit -m "initial"` 后重试',
  'Repo is too large to teleport{setup}': '仓库过大，无法 teleport{setup}',
  'Failed to create git bundle ({error}){setup}':
    '创建 git bundle 失败（{error}）{setup}',
  'Bundle upload failed: {error}{setup}': 'Bundle 上传失败：{error}{setup}',
  'Bundle upload failed: {error}': 'Bundle 上传失败：{error}',
  'Failed to create tmux session on socket {socket}: {error}':
    '在套接字 {socket} 上创建 tmux 会话失败：{error}',
  'Failed to get socket info for {socket}': '获取 {socket} 的套接字信息失败',
  'Arguments: {args}': '参数：{args}',
  '[{name}] Bridge not connected': '[{name}] 桥接未连接',
  '[{name}] Tool call timed out: {toolName}':
    '[{name}] 工具调用超时：{toolName}',
  'Bridge client disconnected': '桥接客户端已断开连接',
  '[{name}] Connection attempt timed out after 5000ms':
    '[{name}] 连接尝试在 5000ms 后超时',
  '[{name}] Cannot send request: not connected':
    '[{name}] 无法发送请求：未连接',
  '[{name}] Tool request timed out after {timeout}ms':
    '[{name}] 工具请求在 {timeout}ms 后超时',
  '[{name}] Insecure socket directory permissions: {mode} (expected 0700). Directory may have been tampered with.':
    '[{name}] 套接字目录权限不安全：{mode}（应为 0700）。目录可能已被篡改。',
  'Socket directory not owned by current user (uid: {uid}, dir uid: {dirUid}). Potential security risk.':
    '套接字目录不属于当前用户（uid: {uid}，目录 uid: {dirUid}）。存在潜在安全风险。',
  '[{name}] Path exists but it is not a socket: {path}':
    '[{name}] 路径存在但不是套接字：{path}',
  '[{name}] Insecure socket permissions: {mode} (expected 0600). Socket may have been tampered with.':
    '[{name}] 套接字权限不安全：{mode}（应为 0600）。套接字可能已被篡改。',
  'Socket not owned by current user (uid: {uid}, socket uid: {socketUid}). Potential security risk.':
    '套接字不属于当前用户（uid: {uid}，套接字 uid: {socketUid}）。存在潜在安全风险。',
  '[{name}] No connected sockets available': '[{name}] 没有可用的已连接套接字',
  '[{name}] All sockets failed for tabs_context_mcp':
    '[{name}] tabs_context_mcp 的所有套接字均失败',
  'Error calling tool, please try again. : {detail}':
    '调用工具出错，请重试。：{detail}',
  'Tool execution completed': '工具执行完成',
  'Permission mode set to: {mode}': '权限模式已设置为：{mode}',
  'Browser switching is only available with bridge connections.':
    '浏览器切换仅在桥接连接下可用。',
  'No other browsers available to switch to. Open Chrome with the Claude extension in another browser to switch.':
    '没有其他可切换的浏览器。请在另一个浏览器中打开装有 Claude 扩展的 Chrome 后再切换。',
  'Connected to browser "{name}".': '已连接到浏览器“{name}”。',
  'No browser responded within the timeout. Make sure Chrome is open with the Claude extension installed, then try again.':
    '没有浏览器在超时时间内响应。请确保已打开安装了 Claude 扩展的 Chrome，然后重试。',
  '@ant/computer-use-swift: macOS only':
    '@ant/computer-use-swift：仅支持 macOS',
  'Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported':
    '当前 process.stdin 不支持 raw 模式，而 Ink 默认将其用作输入流。\n如何避免此错误请参阅 https://github.com/vadimdemedes/ink/#israwmodesupported',
  'Raw mode is not supported on the stdin provided to Ink.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported':
    '提供给 Ink 的 stdin 不支持 raw 模式。\n如何避免此错误请参阅 https://github.com/vadimdemedes/ink/#israwmodesupported',
  'useTerminalNotification must be used within TerminalWriteProvider':
    'useTerminalNotification 必须在 TerminalWriteProvider 内使用',
  'Prompt is too long': '提示词过长',
  'Credit balance is too low': '额度余额不足',
  'Not logged in · Please run /login': '未登录 · 请运行 /login',
  'Invalid API key · Fix external API key': 'API key 无效 · 请修复外部 API key',
  'Your ANTHROPIC_API_KEY belongs to a disabled organization · Unset the environment variable to use your subscription instead':
    '您的 ANTHROPIC_API_KEY 属于已被禁用的组织 · 请取消设置该环境变量以改用您的订阅',
  'Your ANTHROPIC_API_KEY belongs to a disabled organization · Update or unset the environment variable':
    '您的 ANTHROPIC_API_KEY 属于已被禁用的组织 · 请更新或取消设置该环境变量',
  'OAuth token revoked · Please run /login':
    'OAuth 令牌已被吊销 · 请运行 /login',
  'Authentication error · This may be a temporary network issue, please try again':
    '鉴权错误 · 可能是临时网络问题，请重试',
  'Repeated 529 Overloaded errors': '反复出现 529 Overloaded 错误',
  'Opus is experiencing high load, please use /model to switch to Sonnet':
    'Opus 当前负载较高，请使用 /model 切换到 Sonnet',
  'Request timed out': '请求超时',
  'Your account does not have access to Claude Code. Please run /login.':
    '您的账户无权访问 Claude Code。请运行 /login。',
  '⚠️  Certificate {status}, regenerating...':
    '⚠️  证书{status}，正在重新生成...',
  expired: '已过期',
  'expires in {days} days': '将在 {days} 天后过期',
  '🔐 Using existing certificate from {dir}': '🔐 使用 {dir} 中的现有证书',
  '   Valid for {days} more days': '   还有 {days} 天有效期',
  '⚠️  LAN IP changed (missing: {ips}), regenerating certificate...':
    '⚠️  局域网 IP 已变更（缺少：{ips}），正在重新生成证书...',
  '⚠️  Invalid certificate, regenerating...': '⚠️  证书无效，正在重新生成...',
  '🔐 Generating self-signed certificate...': '🔐 正在生成自签名证书...',
  '   Including LAN IPs: {ips}': '   包含局域网 IP：{ips}',
  '✅ Certificate saved to {dir}': '✅ 证书已保存到 {dir}',
  '   Valid for {days} days': '   有效期 {days} 天',
  '   ⚠️  First access will show a security warning - click "Advanced" → "Proceed"':
    '   ⚠️  首次访问会显示安全警告 - 请点击“高级”→“继续前往”',
  '⚠️  WARNING: Authentication disabled. This is dangerous for remote access!':
    '⚠️  警告：已禁用身份验证。这对远程访问来说很危险！',
  '\n  Error: port {port} is already in use. Use --port to specify a different port.\n':
    '\n  错误：端口 {port} 已被占用。请使用 --port 指定其他端口。\n',
  '\n  Error: {message}\n': '\n  错误：{message}\n',
  '  🖥️  ACP Manager': '  🖥️  ACP 管理器',
  '    URL:   http://localhost:{port}': '    URL:   http://localhost:{port}',
  '  Press Ctrl+C to stop': '  按 Ctrl+C 停止',
  '  🔗 Dashboard: {url}/code/': '  🔗 控制面板：{url}/code/',
  '     Agent ID: {id}': '     Agent ID：{id}',
  'Invalid session/load payload': '无效的 session/load 载荷',
  'Invalid session/resume payload': '无效的 session/resume 载荷',
  'Invalid session/set_model payload': '无效的 session/set_model 载荷',
  'Not connected to agent': '未连接到 agent',
  'Method not found: {method}': '方法未找到：{method}',
  'Failed to create session: {msg}': '创建会话失败：{msg}',
  'Listing sessions is not supported by this agent': '此 agent 不支持列出会话',
  'Failed to list sessions: {msg}': '列出会话失败：{msg}',
  'Loading sessions is not supported by this agent': '此 agent 不支持加载会话',
  'Failed to load session: {msg}': '加载会话失败：{msg}',
  'Resuming sessions is not supported by this agent': '此 agent 不支持恢复会话',
  'Failed to resume session: {msg}': '恢复会话失败：{msg}',
  'No active session': '没有活动会话',
  'Prompt failed: {msg}': '提示请求失败：{msg}',
  'Model selection not supported by this agent': '此 agent 不支持模型选择',
  'Failed to set model: {msg}': '设置模型失败：{msg}',
  'bypassPermissions requires local ACP_PERMISSION_MODE=bypassPermissions before a client can request it.':
    '客户端请求 bypassPermissions 之前，本地必须先设置 ACP_PERMISSION_MODE=bypassPermissions。',
  'Invalid permissionMode: expected a non-empty string.':
    '无效的 permissionMode：应为非空字符串。',
  'Invalid permissionMode: {mode}.': '无效的 permissionMode：{mode}。',
  'Invalid ACP_RCS_GROUP "{group}": only letters, digits, hyphens, and underscores are allowed':
    '无效的 ACP_RCS_GROUP“{group}”：仅允许字母、数字、连字符和下划线',
  'Unauthorized: Invalid token': '未授权：token 无效',
  '  🚀 ACP Proxy Server{https}': '  🚀 ACP 代理服务器{https}',
  '  Connection:': '  连接：',
  '    URL:   {url}': '    URL:   {url}',
  '    Token: configured': '    Token: 已配置',
  '  ⚠️  Authentication disabled (--no-auth)':
    '  ⚠️  已禁用身份验证（--no-auth）',
  '  📦 Agent: {display}': '  📦 Agent：{display}',
  '     CWD:   {cwd}': '     CWD：   {cwd}',
  'Agent Teams is not yet available on your plan.':
    '您的计划暂不支持 Agent Teams。',
  'Cannot launch remote agent:\n{reasons}': '无法启动远程 agent：\n{reasons}',
  'Unexpected agent tool result status: {status}':
    '意外的 agent 工具结果状态：{status}',
  'No assistant messages found': '未找到助手消息',
  'No transcript found for agent ID: {agentId}':
    '未找到 agent ID 为 {agentId} 的会话记录',
  'Artifact upload failed: HTTP {status} (non-JSON body)':
    '工件上传失败：HTTP {status}（非 JSON 响应体）',
  'Artifact upload failed: {code}': '工件上传失败：{code}',
  'Running {desc}': '正在运行 {desc}',
  "Blocked: {sleepPattern}. Run blocking commands in the background with run_in_background: true — you'll get a completion notification when done. For streaming events (watching logs, polling APIs), use the Monitor tool. If you genuinely need a delay (rate limiting, deliberate pacing), keep it under 2 seconds.":
    '已拦截：{sleepPattern}。请使用 run_in_background: true 在后台运行阻塞命令 — 完成时您会收到通知。对于流式事件（查看日志、轮询 API），请使用 Monitor 工具。如果确实需要延时（限流、刻意节奏），请保持在 2 秒以内。',
  '<error>Command was aborted before completion</error>':
    '<error>命令在完成前已中止</error>',
  'Command exceeded the assistant-mode blocking budget ({blockingBudget}s) and was moved to the background with ID: {backgroundTaskId}. It is still running — you will be notified when it completes. Output is being written to: {outputPath}. In assistant mode, delegate long-running work to a subagent or use run_in_background to keep this conversation responsive.':
    '命令超过了助手模式阻塞预算（{blockingBudget} 秒），已被移至后台运行，ID 为：{backgroundTaskId}。它仍在运行 — 完成时您会收到通知。输出正写入：{outputPath}。在助手模式下，请将长时间运行的工作委派给子 agent，或使用 run_in_background 保持对话响应。',
  'Command was manually backgrounded by user with ID: {backgroundTaskId}. Output is being written to: {outputPath}':
    '命令已由用户手动转入后台，ID 为：{backgroundTaskId}。输出正写入：{outputPath}',
  'Command running in background with ID: {backgroundTaskId}. Output is being written to: {outputPath}':
    '命令正在后台运行，ID 为：{backgroundTaskId}。输出正写入：{outputPath}',
  'Dangerous flag combination detected': '检测到危险的 flag 组合',
  'Getting {setting}': '正在获取 {setting}',
  'Failed: {error}': '失败：{error}',
  'Context: {total_tokens} tokens, {message_count} messages\n{summary}':
    '上下文：{total_tokens} tokens，{message_count} 条消息\n{summary}',
  'Focus: {focused}': '焦点：{focused}',
  'Overall context summary': '整体上下文摘要',
  'Model context: {model}': '模型上下文：{model}',
  'Prompt caching: {status}': 'Prompt cache：{status}',
  'Session memory: {status}': '会话记忆：{status}',
  'Context collapse: {status}': '上下文折叠：{status}',
  'Collapse spans: {collapsedSpans} committed, {stagedSpans} staged, {collapsedMessages} messages summarized':
    '折叠区段：已提交 {collapsedSpans} 个，暂存 {stagedSpans} 个，已总结 {collapsedMessages} 条消息',
  'EnterPlanMode tool cannot be used in agent contexts':
    'EnterPlanMode 工具不能在 agent 上下文中使用',
  'Already in a worktree session': '已处于 worktree 会话中',
  'Tool "{tool_name}" not found. Use SearchExtraTools to discover available tools.':
    '未找到工具 "{tool_name}"。请使用 SearchExtraTools 发现可用工具。',
  'Tool "{tool_name}" has not been discovered yet. You must first use SearchExtraTools to discover this tool before executing it.\n\nUsage: SearchExtraTools("select:{tool_name}")':
    '工具 "{tool_name}" 尚未被发现。执行前必须先使用 SearchExtraTools 发现该工具。\n\n用法：SearchExtraTools("select:{tool_name}")',
  'Invalid parameters for tool "{tool_name}": {message}':
    '工具 "{tool_name}" 的参数无效：{message}',
  'Permission denied for tool "{tool_name}": {message}':
    '工具 "{tool_name}" 被拒绝授权：{message}',
  'Permission denied': '权限被拒绝',
  'Prompts the user to exit plan mode and start coding':
    '提示用户退出计划模式并开始编码',
  'No plan file found at {filePath}. Please write your plan to this file before calling ExitPlanMode.':
    '在 {filePath} 未找到计划文件。请先将计划写入该文件，再调用 ExitPlanMode。',
  'plan exit → default · {notification}': '退出计划 → 默认 · {notification}',
  'Your plan has been submitted to the team lead for approval.\n\nPlan file: {filePath}\n\n**What happens next:**\n1. Wait for the team lead to review your plan\n2. You will receive a message in your inbox with approval/rejection\n3. If approved, you can proceed with implementation\n4. If rejected, refine your plan based on the feedback\n\n**Important:** Do NOT proceed until you receive approval. Check your inbox for response.\n\nRequest ID: {requestId}':
    '您的计划已提交给团队负责人审批。\n\n计划文件：{filePath}\n\n**接下来会发生什么：**\n1. 等待团队负责人审阅您的计划\n2. 您的收件箱将收到批准/驳回的消息\n3. 若获批准，即可开始实施\n4. 若被驳回，请根据反馈完善计划\n\n**重要：**在收到批准之前请勿继续。请留意收件箱中的回复。\n\n请求 ID：{requestId}',
  '\n\nIf this plan can be broken down into multiple independent tasks, consider using the {toolName} tool to create a team and parallelize the work.':
    '\n\n如果此计划可以拆分为多个独立任务，请考虑使用 {toolName} 工具创建团队并行推进工作。',
  'User has approved your plan. You can now start coding. Start with updating your todo list if applicable\n\nYour plan has been saved to: {filePath}\nYou can refer back to it if needed during implementation.{teamHint}\n\n## {planLabel}:\n{plan}':
    '用户已批准您的计划。现在可以开始编码。如有待办清单，请先更新它\n\n您的计划已保存到：{filePath}\n实施过程中如有需要可随时回顾。{teamHint}\n\n## {planLabel}：\n{plan}',
  'Not in a worktree session': '当前不在 worktree 会话中',
  'Returned to {cwd}': '已返回 {cwd}',
  'Editing {summary}': '正在编辑 {summary}',
  'Editing file': '正在编辑文件',
  'File is too large to edit ({fileSize}). Maximum editable file size is {maxFileSize}.':
    '文件过大，无法编辑（{fileSize}）。可编辑文件的最大大小为 {maxFileSize}。',
  'File does not exist. {cwdNote} {cwd}.': '文件不存在。{cwdNote} {cwd}。',
  ' Did you mean {suggestion}?': ' 您是指 {suggestion} 吗？',
  ' Did you mean {similarFilename}?': ' 您是指 {similarFilename} 吗？',
  'File is a Jupyter Notebook. Use the {toolName} to edit this file.':
    '该文件是 Jupyter Notebook。请使用 {toolName} 编辑此文件。',
  '.  The user modified your proposed changes before accepting them. ':
    '。 用户在接受前修改了您提议的更改。 ',
  'The file {filePath} has been updated{modifiedNote}. All occurrences were successfully replaced.':
    '文件 {filePath} 已更新{modifiedNote}。所有匹配项均已成功替换。',
  'The file {filePath} has been updated successfully{modifiedNote}.':
    '文件 {filePath} 已成功更新{modifiedNote}。',
  'String not found in file. Failed to apply edit.':
    '在文件中未找到该字符串。应用编辑失败。',
  'File content ({tokenCount} tokens) exceeds maximum allowed tokens ({maxTokens}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.':
    '文件内容（{tokenCount} tokens）超过允许的最大 token 数（{maxTokens}）。请使用 offset 和 limit 参数读取文件的特定部分，或搜索特定内容而不是读取整个文件。',
  '. Files larger than {maxSize} will return an error; use offset and limit for larger files':
    '。大于 {maxSize} 的文件将返回错误；更大的文件请使用 offset 和 limit',
  'Invalid pages parameter: "{pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.':
    '无效的 pages 参数："{pages}"。请使用 "1-5"、"3" 或 "10-20" 之类的格式。页码从 1 开始。',
  'Page range "{pages}" exceeds maximum of {maxPages} pages per request. Please use a smaller range.':
    '页码范围 "{pages}" 超过了每次请求最多 {maxPages} 页的限制。请使用更小的范围。',
  'This tool cannot read binary files. The file appears to be a binary {ext} file. Please use appropriate tools for binary file analysis.':
    '此工具无法读取二进制文件。该文件似乎是二进制 {ext} 文件。请使用合适的工具分析二进制文件。',
  "Cannot read '{filePath}': this device file would block or produce infinite output.":
    "无法读取 '{filePath}'：该设备文件会阻塞或产生无限输出。",
  'PDF file read: {filePath} ({fileSize})':
    '已读取 PDF 文件：{filePath}（{fileSize}）',
  'PDF pages extracted: {count} page(s) from {filePath} ({fileSize})':
    '已提取 PDF 页面：从 {filePath} 提取 {count} 页（{fileSize}）',
  '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>':
    '<system-reminder>警告：文件存在，但内容为空。</system-reminder>',
  '<system-reminder>Warning: the file exists but is shorter than the provided offset ({startLine}). The file has {totalLines} lines.</system-reminder>':
    '<system-reminder>警告：文件存在，但长度小于提供的 offset（{startLine}）。该文件共有 {totalLines} 行。</system-reminder>',
  'Notebook content ({size}) exceeds maximum allowed size ({maxSize}). ':
    'Notebook 内容（{size}）超过允许的最大大小（{maxSize}）。 ',
  'This PDF has {pageCount} pages, which is too many to read at once. ':
    '此 PDF 共有 {pageCount} 页，无法一次读完。 ',
  'Reading full PDFs is not supported with this model. Use a newer model (Sonnet 3.5 v2 or later), ':
    '此模型不支持读取完整 PDF。请使用更新的模型（Sonnet 3.5 v2 或更高版本）， ',
  'Image file is empty: {filePath}': '图片文件为空：{filePath}',
  'Native image processor not available, falling back to sharp':
    '原生图像处理器不可用，回退到 sharp',
  'Writing {summary}': '正在写入 {summary}',
  'Finding {summary}': '正在查找 {summary}',
  'Directory does not exist: {path}. {cwdNote} {cwd}.':
    '目录不存在：{path}。{cwdNote} {cwd}。',
  'Path is not a directory: {path}': '路径不是目录：{path}',
  'Token usage: {tokensUsed} / {tokenBudget}':
    'Token 用量：{tokensUsed} / {tokenBudget}',
  'Token usage: {tokensUsed}': 'Token 用量：{tokensUsed}',
  '  Active time: {elapsed}': '  活跃时间：{elapsed}',
  '  Continuation turns: {turnsExecuted}': '  续跑轮次：{turnsExecuted}',
  'Updating goal: {status}{reasonSuffix}':
    '正在更新目标：{status}{reasonSuffix}',
  'Goal error: {error}': '目标错误：{error}',
  'Goal "{objective}" — {status}': '目标 "{objective}" — {status}',
  'The "status" field is required for update. Use "complete" or "blocked".':
    '更新时必须提供 "status" 字段。请使用 "complete" 或 "blocked"。',
  'No active goal to update.': '没有可更新的活跃目标。',
  'Goal is not in a state that accepts blocked attempts.':
    '目标当前的状态不接受 blocked 尝试。',
  'Goal marked as blocked after {attempts} consecutive attempts. Reason: {reason}':
    '目标在连续 {attempts} 次尝试后被标记为 blocked。原因：{reason}',
  'Blocked attempt {attempts} recorded. The goal remains active — the same condition must persist for 3 consecutive turns before it is marked blocked.':
    '已记录第 {attempts} 次 blocked 尝试。目标仍保持活跃 — 同一状况需连续持续 3 轮才会被标记为 blocked。',
  'Searching for {summary}': '正在搜索 {summary}',
  'Path does not exist: {path}. {cwdNote} {cwd}.':
    '路径不存在：{path}。{cwdNote} {cwd}。',
  '\n\nFound {matches} total {matchWord} across {files} {fileWord}.{limitInfo}':
    '\n\n在 {files} 个{fileWord}中共找到 {matches} 处{matchWord}。{limitInfo}',
  'Found {numFiles} {fileWord}{limitInfoStr}\n{filenames}':
    '找到 {numFiles} 个{fileWord}{limitInfoStr}\n{filenames}',
  'Stores: {stores}': '存储：{stores}',
  'Hover info {special}': '悬停信息 {special}',
  'Edit Notebook': '编辑 Notebook',
  'Editing notebook {summary}': '正在编辑 notebook {summary}',
  'Updated cell {cell_id} with {new_source}':
    '已用 {new_source} 更新单元格 {cell_id}',
  'Inserted cell {cell_id} with {new_source}':
    '已插入单元格 {cell_id}，内容为 {new_source}',
  'Deleted cell {cell_id}': '已删除单元格 {cell_id}',
  'File has not been read yet. Read it first before writing to it.':
    '文件尚未被读取。写入前请先读取该文件。',
  'Cell with index {parsedCellIndex} does not exist in notebook.':
    'notebook 中不存在索引为 {parsedCellIndex} 的单元格。',
  'Cell with ID "{cell_id}" not found in notebook.':
    '在 notebook 中未找到 ID 为 "{cell_id}" 的单元格。',
  'Unknown error occurred while editing notebook':
    '编辑 notebook 时发生未知错误',
  'Enterprise policy requires sandboxing, but sandboxing is not available on native Windows. Shell command execution is blocked on this platform by policy.':
    '企业策略要求使用沙箱，但原生 Windows 不支持沙箱。根据策略，此平台上的 shell 命令执行已被阻止。',
  'PowerShell is not available on this system.':
    '此系统上没有可用的 PowerShell。',
  'Failed to execute PowerShell command: {error}':
    '执行 PowerShell 命令失败：{error}',
  'getAppState not available in runPowerShellCommand context':
    'runPowerShellCommand 上下文中无法使用 getAppState',
  'Running…': '运行中…',
  'Waiting…': '等待中…',
  '[Image data detected and sent to Claude]':
    '[已检测到图像数据并发送给 Claude]',
  Interrupted: '已中断',
  '(No output)': '（无输出）',
  'Server "{serverName}" is not connected': '服务器 "{serverName}" 未连接',
  'Server "{serverName}" does not support resources':
    '服务器 "{serverName}" 不支持资源',
  'Unable to resolve organization UUID.': '无法解析组织 UUID。',
  'Team "{teamName}" does not exist': '团队 "{teamName}" 不存在',
  'structured messages cannot be broadcast': '结构化消息无法广播',
  'name and prompt are required for spawn operation':
    'spawn 操作必须提供 name 和 prompt',
  'Command processing failed': '命令处理失败',
  'Failed to load remote skill {slug}: {msg}':
    '加载远程技能 {slug} 失败：{msg}',
  'No task found with ID: {task_id}': '未找到 ID 为 {task_id} 的任务',
  'Read output ({shortcut} to expand)': '读取输出（{shortcut} 展开）',
  'Missing required parameter: task_id': '缺少必需参数：task_id',
  'team_name is required for TeamCreate': 'TeamCreate 需要提供 team_name',
  'Create a new team for coordinating multiple agents':
    '创建一个新团队以协调多个 agent',
  'Already leading team "{existingTeam}". A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one.':
    '已在领导团队“{existingTeam}”。一个 leader 同时只能管理一个团队。请先使用 TeamDelete 结束当前团队，再创建新团队。',
  'Shutdown requested for active teammate(s): {requested}. Cleanup is still blocked after waiting {waitMs}ms: {memberNames}.':
    '已请求关闭活跃队友：{requested}。等待 {waitMs}ms 后清理仍被阻塞：{memberNames}。',
  'Shutdown requested for active teammate(s): {requested}. Cleanup is blocked until they exit: {memberNames}.':
    '已请求关闭活跃队友：{requested}。清理将在它们退出前保持阻塞：{memberNames}。',
  'Cannot cleanup team with {count} active member(s): {memberNames}. Use requestShutdown to gracefully terminate teammates first.':
    '无法清理仍有 {count} 个活跃成员的团队：{memberNames}。请先使用 requestShutdown 优雅地终止队友。',
  'No team name found, nothing to clean up': '未找到团队名称，无需清理',
  Received: '已接收',
  'Too many redirects (exceeded {maxRedirects})':
    '重定向次数过多（超过 {maxRedirects} 次）',
  'Redirect missing Location header': '重定向缺少 Location 头',
  'Invalid URL': '无效的 URL',
  'Searching: {query}': '正在搜索：{query}',
  'Web search results for query: "{query}"\n\n':
    '查询“{query}”的网页搜索结果\n\n',
  'No links found.\n\n': '未找到链接。\n\n',
  '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.':
    '\n提醒：您必须在给用户的回复中以 markdown 超链接形式包含上述来源。',
  'MCP connection timed out after {timeoutMs}ms':
    'MCP 连接在 {timeoutMs}ms 后超时',
  'Connection to {serverName} timed out after {timeoutMs}ms':
    '连接 {serverName} 在 {timeoutMs}ms 后超时',
  'Session expired for {serverName}': '{serverName} 的会话已过期',
  'MCP server "{serverName}" requires re-authorization (token expired)':
    'MCP 服务器“{serverName}”需要重新授权（token 已过期）',
  'MCP server "{serverName}" tool "{tool}" timed out after {timeout}s':
    'MCP 服务器“{serverName}”的工具“{tool}”在 {timeout}s 后超时',
  'Server {serverName} is not connected': '服务器 {serverName} 未连接',
  'No API key configured for JWT signing': '未配置用于 JWT 签名的 API key',
  'Session not found': '未找到会话',
  'Environment {environmentId} not found': '未找到环境 {environmentId}',
  'Environment {environmentId} is not active (status: {status})':
    '环境 {environmentId} 未激活（状态：{status}）',
  'Usage:\n  ccb weixin serve\n  ccb weixin login\n  ccb weixin login clear\n  ccb weixin access pair <code>\n\nSession enablement:\n  ccb --channels plugin:weixin@builtin':
    '用法：\n  ccb weixin serve\n  ccb weixin login\n  ccb weixin login clear\n  ccb weixin access pair <code>\n\n会话启用：\n  ccb --channels plugin:weixin@builtin',
  'WeChat account cleared.': '微信账号已清除。',
  'Already connected:\n  User ID: {userId}\n  Connected since: {savedAt}\n\nRun `ccb weixin login clear` to disconnect.\nRestart Claude Code with:\n  ccb --channels plugin:weixin@builtin':
    '已连接：\n  用户 ID：{userId}\n  连接时间：{savedAt}\n\n运行 `ccb weixin login clear` 断开连接。\n使用以下命令重启 Claude Code：\n  ccb --channels plugin:weixin@builtin',
  'Starting WeChat QR login...': '正在启动微信扫码登录...',
  'Scan the QR code above with WeChat, or open this URL:':
    '使用微信扫描上方二维码，或打开此 URL：',
  'Login failed: {message}': '登录失败：{message}',
  'Connected successfully!\n  User ID: {userId}\n  Base URL: {baseUrl}\n\nRestart Claude Code with:\n  ccb --channels plugin:weixin@builtin':
    '连接成功！\n  用户 ID：{userId}\n  Base URL：{baseUrl}\n\n使用以下命令重启 Claude Code：\n  ccb --channels plugin:weixin@builtin',
  'Invalid or expired pairing code.': '配对码无效或已过期。',
  'Paired successfully: {userId}': '配对成功：{userId}',
  '[weixin] serve handler not available in this context.':
    '[weixin] serve 处理器在此上下文中不可用。',
  'Failed to get QR code: HTTP {status}': '获取二维码失败：HTTP {status}',
  'No qrcode in response': '响应中缺少 qrcode 字段',
  'Scan the QR code with WeChat to connect.': '使用微信扫描二维码进行连接。',
  'Connected to WeChat successfully!': '已成功连接微信！',
  'QR code scanned, waiting for confirmation...': '二维码已扫描，等待确认...',
  'QR code expired after maximum retries.':
    '二维码在达到最大重试次数后已过期。',
  'QR code expired, refreshing...': '二维码已过期，正在刷新...',
  'Login timed out.': '登录超时。',
  'Invalid aes_key: expected 16 raw bytes or 32 hex chars, got {length} bytes':
    '无效的 aes_key：期望 16 个原始字节或 32 个十六进制字符，实际为 {length} 字节',
  'CDN download failed: HTTP {status}': 'CDN 下载失败：HTTP {status}',
  'No upload_param in response': '响应中缺少 upload_param 字段',
  'CDN upload failed: HTTP {status}': 'CDN 上传失败：HTTP {status}',
  'Download failed: HTTP {status}': '下载失败：HTTP {status}',
  '[weixin] Failed to download media: {error}\n':
    '[weixin] 下载媒体失败：{error}\n',
  '[weixin] Starting message poll loop...\n':
    '[weixin] 正在启动消息轮询循环...\n',
  '[weixin] Session expired (errcode -14). Pausing for 30s...\n':
    '[weixin] 会话已过期（errcode -14）。暂停 30 秒...\n',
  'getUpdates error: ret={ret} errcode={errcode} {msg}':
    'getUpdates 错误：ret={ret} errcode={errcode} {msg}',
  '[weixin] Poll error ({count}): {msg}\n':
    '[weixin] 轮询错误（{count}）：{msg}\n',
  '[weixin] Too many consecutive errors, backing off 30s...\n':
    '[weixin] 连续错误过多，退避 30 秒...\n',
  '[weixin] Poll loop stopped.\n': '[weixin] 轮询循环已停止。\n',
  'Your pairing code is: {code}\n\nAsk the operator to confirm:\nccb weixin access pair {code}':
    '您的配对码是：{code}\n\n请让操作员确认：\nccb weixin access pair {code}',
  '[weixin] Failed to send pairing code: {error}\n':
    '[weixin] 发送配对码失败：{error}\n',
  '(media attachment)': '（媒体附件）',
  'Claude Code needs your approval.\n\nTool: {toolName}\nReason: {reason}\nInput: {inputPreview}\n\nReply with: yes {requestId}\nOr deny with: no {requestId}':
    'Claude Code 需要您的批准。\n\n工具：{toolName}\n原因：{reason}\n输入：{inputPreview}\n\n回复以批准：yes {requestId}\n回复以拒绝：no {requestId}',
  'WeChat not connected. Run `ccb weixin login` first.':
    '微信未连接。请先运行 `ccb weixin login`。',
  'Missing chat_id or text parameter.': '缺少 chat_id 或 text 参数。',
  'File not found: {filePath}': '未找到文件：{filePath}',
  'Message sent with attachments.': '消息已随附件发送。',
  'Message sent.': '消息已发送。',
  'Failed to send: {error}': '发送失败：{error}',
  'Missing chat_id parameter.': '缺少 chat_id 参数。',
  'Typing indicator sent.': '输入状态指示已发送。',
  'Failed to send typing: {error}': '发送输入状态失败：{error}',
  'Unknown tool: {name}': '未知工具：{name}',
  '[weixin] No account configured. Run `ccb weixin login` to connect your WeChat account.':
    '[weixin] 未配置账号。请运行 `ccb weixin login` 连接您的微信账号。',
  '[weixin] Failed to relay permission request {requestId}: {error}\n':
    '[weixin] 转发权限请求 {requestId} 失败：{error}\n',
  '[weixin] Parent process exited, shutting down...':
    '[weixin] 父进程已退出，正在关闭...',

  // ── Batch-filled missing translations (auto-generated sweep) ────
  'No artifacts uploaded this session. Run /use-artifacts to learn how.':
    '本会话未上传任何工件。运行 /use-artifacts 了解使用方法。',
  'Answering...': '正在回答...',
  'Manage permissions': '管理权限',
  'Reconnect extension': '重新连接扩展',
  'Claude in Chrome is not supported in WSL at this time.':
    'Claude in Chrome 目前不支持 WSL。',
  'Claude in Chrome requires a claude.ai subscription.':
    'Claude in Chrome 需要 claude.ai 订阅。',
  'Not detected': '未检测到',
  'Once installed, select "Reconnect extension" to connect.':
    '安装完成后，选择“重新连接扩展”进行连接。',
  'Usage:': '用法：',
  'Tab to toggle · Enter to confirm · Esc to cancel':
    'Tab 切换 · Enter 确认 · Esc 取消',
  'Fast mode': '快速模式',
  '· Objective:': '· 目标：',
  '· Status:': '· 状态：',
  '· Time:': '· 时间：',
  '· Tokens:': '· Token：',
  'Location:': '位置：',
  'Next: Run': '下一步：运行',
  'to get started': '以开始使用',
  'Store created:': '已创建存储：',
  'Stored entry': '已存储条目',
  'Not found:': '未找到：',
  'No entries in': '无条目：',
  'Archived store:': '已归档存储：',
  'No memory stores found. Use /local-memory create <store> to create one.':
    '未找到记忆存储。使用 /local-memory create <store> 创建一个。',
  'Secret stored:': '机密已存储：',
  'Key not found:': '未找到键：',
  'Deleted:': '已删除：',
  'No secrets stored. Use /local-vault set <key> <value> to add one.':
    '未存储任何机密。使用 /local-vault set <key> <value> 添加。',
  'Enter workspace API key (sk-ant-api03-*):':
    '输入工作区 API key（sk-ant-api03-*）：',
  'Onboarding status': '引导状态',
  'to edit this plan in': '以在以下位置编辑此计划',
  'Loading marketplaces…': '正在加载市场…',
  'Manage marketplaces': '管理市场',
  'Updating marketplace…': '正在更新市场…',
  'Pending changes:': '待处理更改：',
  'Enter to apply': 'Enter 应用',
  'Processing changes…': '正在处理更改…',
  'Claude on the web requires connecting to your GitHub account to clone and push code on your behalf.':
    'Claude 网页版需要连接您的 GitHub 账户，以便代表您克隆和推送代码。',
  'Your local credentials are used to authenticate with GitHub':
    '将使用您的本地凭据向 GitHub 进行身份验证',
  'Open in browser:': '在浏览器中打开：',
  'Tab switch tab': 'Tab 切换标签页',
  'No additional configuration needed.': '无需额外配置。',
  'Do you want to use this API key?': '是否使用此 API key？',
  recommended: '推荐',
  'd to disconnect · space for QR code · Enter/Esc to close':
    'd 断开连接 · space 显示二维码 · Enter/Esc 关闭',
  'By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.':
    '继续即表示您对在绕过权限模式下运行时执行的所有操作承担全部责任。',
  'How would you like to handle this?': '您希望如何处理？',
  The: '该',
  'command suggests installing a plugin.': '命令建议安装一个插件。',
  'Marketplace:': '市场：',
  'Would you like to install it?': '是否安装？',
  'Requires the Chrome extension. Get started at':
    '需要 Chrome 扩展。开始使用请访问',
  'For more info, use': '了解更多信息，请使用',
  'or visit': '或访问',
  'External imports:': '外部导入：',
  'Important: Only use Claude Code with files you trust. Accessing untrusted files may pose security risks':
    '重要提示：仅将 Claude Code 用于您信任的文件。访问不受信任的文件可能带来安全风险',
  'Base URL': '基础 URL',
  'Context Usage': '上下文使用情况',
  'Free space:': '可用空间：',
  '(loaded on-demand)': '（按需加载）',
  Available: '可用',
  'System tools': '系统工具',
  '(some loaded on-demand)': '（部分按需加载）',
  'Custom agents': '自定义 agent',
  'Memory files': '记忆文件',
  'Message breakdown': '消息明细',
  'Tool calls:': '工具调用：',
  'Tool results:': '工具结果：',
  'Attachments:': '附件：',
  'Assistant messages (non-tool):': '助手消息（非工具）：',
  'User messages (non-tool-result):': '用户消息（非工具结果）：',
  'Learn more about how to monitor your spending:': '了解如何监控您的支出：',
  'Same Claude Code with visual diffs, live app preview, parallel sessions, and more.':
    '同样的 Claude Code，还支持可视化差异、实时应用预览、并行会话等更多功能。',
  'Please use --channels to run a list of approved channels.':
    '请使用 --channels 指定已批准的频道列表。',
  'Channels:': '频道：',
  'No diff content': '无差异内容',
  'Enter view': 'Enter 查看',
  'No changed files': '无已更改文件',
  '←/→ adjust · Enter confirm · Esc cancel': '←/→ 调整 · Enter 确认 · Esc 取消',
  Faster: '更快',
  Smarter: '更智能',
  'Thanks for the feedback!': '感谢您的反馈！',
  'An update to our Consumer Terms and Privacy Policy will take effect on':
    '我们的消费者条款和隐私政策更新将生效于',
  '. You can accept the updated terms today.': '。您可以立即接受更新后的条款。',
  'What&apos;s changing?': '有哪些变化？',
  'You can help improve Claude': '您可以帮助改进 Claude',
  'Updates to data retention': '数据保留政策更新',
  'Learn more (': '了解更多（',
  ') or read the updated Consumer Terms (': '）或阅读更新后的消费者条款（',
  ') and Privacy Policy (': '）和隐私政策（',
  ')': '）',
  'We&apos;ve updated our Consumer Terms and Privacy Policy.':
    '我们更新了消费者条款和隐私政策。',
  'Help improve Claude': '帮助改进 Claude',
  'How this affects data retention': '这对数据保留的影响',
  'Please select how you&apos;d like to continue': '请选择您希望如何继续',
  'Your choice takes effect immediately upon confirmation.':
    '您的选择在确认后立即生效。',
  'Review and manage your privacy settings at': '查看和管理您的隐私设置：',
  Type: '输入',
  'to commit changes,': '提交更改，',
  'for commands, or': '查看命令，或',
  'for shortcuts.': '查看快捷键。',
  'You can also configure this in /config or with the --ide flag':
    '您也可以在 /config 中或通过 --ide 标志配置此项',
  'Claude has context of': 'Claude 的上下文包含',
  'open files': '个打开的文件',
  and: '和',
  'selected lines': '个选中行',
  'Review Claude Code&apos;s changes': '审查 Claude Code 的更改',
  'in the comfort of your IDE': '在您熟悉的 IDE 中',
  'for Quick Launch': '用于快速启动',
  'to reference files or lines in your input': '在输入中引用文件或行',
  'If this is a new task, clearing context will save usage and be faster.':
    '如果这是新任务，清除上下文可以节省用量并更快。',
  'The configuration file at': '配置文件',
  'contains invalid JSON.': '包含无效的 JSON。',
  'Choose an option:': '选择一个选项：',
  'Files with errors are skipped entirely, not just the invalid settings.':
    '有错误的文件会被整个跳过，而不仅是无效的设置项。',
  'LSP provides code intelligence like go-to-definition and error checking':
    'LSP 提供跳转到定义、错误检查等代码智能功能',
  'Triggered by:': '触发来源：',
  'Would you like to install this LSP plugin?': '是否安装此 LSP 插件？',
  'Settings requiring approval:': '需要批准的设置：',
  'Enter to confirm · Esc to exit': 'Enter 确认 · Esc 退出',
  'Capabilities:': '能力：',
  'MCP Config Diagnostics': 'MCP 配置诊断',
  'Please select the servers you want to import:': '请选择要导入的服务器：',
  'MCP servers may execute code or access system resources. All tool calls require approval. Learn more in the':
    'MCP 服务器可能会执行代码或访问系统资源。所有工具调用都需要批准。了解更多请参阅',
  'MCP documentation': 'MCP 文档',
  Advising: '顾问建议中',
  'Advisor has reviewed the conversation and will apply the feedback':
    '顾问已审阅对话，将应用反馈',
  'Context limit reached · /compact or /clear to continue':
    '已达上下文上限 · 使用 /compact 或 /clear 继续',
  'Credit balance too low · Add funds: https://platform.claude.com/settings/billing':
    '余额不足 · 充值：https://platform.claude.com/settings/billing',
  'We are experiencing high demand for Opus 4.': 'Opus 4 目前需求量较大。',
  'Waiting for permission…': '等待权限批准…',
  'Task assigned:': '已分配任务：',
  'Discovered tools:': '已发现的工具：',
  'Listed directory': '已列出目录',
  'Referenced file': '已引用文件',
  'Referenced PDF': '已引用 PDF',
  Selected: '已选择',
  'lines from': '行，来自',
  'Read MCP resource': '已读取 MCP 资源',
  'Async hook': '异步钩子',
  You: '您',
  'hook…': '钩子…',
  'hooks…': '钩子…',
  'Teammate is continuing to work. You may request shutdown again later.':
    '队友仍在继续工作。您可以稍后再次请求其停止。',
  'Tool use rejected': '工具使用已被拒绝',
  'Allowed by auto mode classifier': '已由自动模式分类器允许',
  'Summarizing…': '正在总结…',
  'Use Claude Code&apos;s terminal setup?': '使用 Claude Code 的终端设置？',
  'Notes:': '备注：',
  'Ready to submit your answers?': '准备好提交您的回答了吗？',
  'Host:': '主机：',
  'No other pipes found. Start another instance.':
    '未找到其他管道。请启动另一个实例。',
  'listening…': '正在聆听…',
  'keep holding…': '继续按住…',
  'Voice: processing…': '语音：处理中…',
  'You can disconnect remote access anytime by running /remote-control again.':
    '您可以随时再次运行 /remote-control 断开远程访问。',
  'Sandbox is not enabled': '沙箱未启用',
  'Network Restrictions': '网络限制',
  'Warning: Glob patterns not fully supported on Linux':
    '警告：Linux 上未完全支持 Glob 模式',
  '(Managed)': '（托管）',
  Sandbox: '沙箱',
  'Save file to continue…': '保存文件以继续…',
  'Do you want to make this edit to': '是否要将此编辑应用到',
  '· Tab to amend': '· Tab 修改',
  Apply: '应用',
  'Create skills in .claude/skills/ or ~/.claude/skills/':
    '在 .claude/skills/ 或 ~/.claude/skills/ 中创建技能',
  Tokens: '词元',
  'Server:': '服务器：',
  'Resource:': '资源：',
  'This will terminate the Claude Code on the web session.':
    '这将终止 Claude Code on the web 会话。',
  Viewing: '正在查看',
  'No teammates': '无队友',
  Tasks: '任务',
  'Enter to view': 'Enter 查看',
  'Teleport requires a Claude.ai account.': 'Teleport 需要 claude.ai 账号。',
  'Your Claude Pro/Max subscription will be used by Claude Code.':
    'Claude Code 将使用您的 Claude Pro/Max 订阅。',
  Use: '使用',
  'Teleport will switch git branches. The following changes were found:':
    'Teleport 将切换 git 分支。发现以下更改：',
  'No changes detected': '未检测到更改',
  'Would you like to stash these changes and continue with teleport?':
    '是否暂存这些更改并继续 teleport？',
  'Stashing changes...': '正在暂存更改...',
  'Let&apos;s get started.': '开始使用。',
  'Claude in Chrome requires a claude.ai subscription':
    'Claude in Chrome 需要 claude.ai 订阅',
  'Failed to save marketplace retry info · Check ~/.claude.json permissions':
    '保存市场重试信息失败 · 请检查 ~/.claude.json 权限',
  'Failed to install Anthropic marketplace · Will retry on next startup':
    '安装 Anthropic 市场失败 · 将在下次启动时重试',
  'Checking installation status…': '正在检查安装状态…',
  Diagnostics: '诊断',
  'Warning: Multiple installations found': '警告：发现多个安装',
  'Invalid Settings': '无效设置',
  Updates: '更新',
  'Environment Variables': '环境变量',
  'Version Locks': '版本锁定',
  '└ No active version locks': '└ 无活动的版本锁定',
  '(running)': '（运行中）',
  '(stale)': '（已过期）',
  'Context Usage Warnings': '上下文使用警告',
  'Files:': '文件：',
  'Top contributors:': '主要占用来源：',
  'MCP servers:': 'MCP 服务器：',
  'Press Ctrl+C to exit and start a new conversation.':
    '按 Ctrl+C 退出并开始新对话。',
  'Running feedback capture...': '正在运行反馈收集...',
  'This enables teammates to appear as split panes within your current window.':
    '这将使队友以分屏窗格的形式出现在您当前的窗口中。',
  'This may take a moment.': '这可能需要片刻。',
  'Press Enter when ready to verify…': '准备好验证时请按 Enter…',
  'Verifying it2 can communicate with iTerm2…':
    '正在验证 it2 能否与 iTerm2 通信…',
  'Teammates will now appear as split panes.': '队友现在将以分屏窗格形式显示。',
  'Verification failed': '验证失败',
  'Make sure:': '请确保：',
  'Press y to confirm, or n/Esc to cancel.': '按 y 确认，按 n/Esc 取消。',
  "User answered Claude's questions:": '用户回答了 Claude 的问题：',
  'User declined to answer questions': '用户拒绝回答问题',
  'Config change rejected': '配置更改已被拒绝',
  'No scheduled jobs': '无定时任务',
  'Task is still running…': '任务仍在运行…',
  'Task not ready': '任务未就绪',
  'Fetching…': '正在获取…',
}

export default zh
