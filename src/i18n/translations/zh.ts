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
  thinking: '思考中',
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
  idle: '空闲',
  working: '工作中',
  'No tasks currently running': '当前无任务运行',
  'Viewing teammate': '查看队友',
  'Viewing leader': '查看领导者',
  'Background tasks': '后台任务',
  'active agent': '活跃智能体',
  'active agents': '活跃智能体',
  Agents: '智能体',
  Shells: 'Shell',
  Monitors: '监控',
  Completed: '已完成',
  Failed: '失败',
  Stopped: '已停止',
  'Async agent': '异步智能体',
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
  'background agents launched': '个后台智能体已启动',
  agents: '智能体',
  '{type} agents': '{type} 智能体',
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
  Plan: '计划',
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
  'Tool use': '工具使用',
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
  'Invalid --provider value: "{provider}". Valid: {values}':
    '无效的 --provider 值："{provider}"。有效值：{values}',
  'Invalid --subagent-provider value: "{provider}". Valid: {values}':
    '无效的 --subagent-provider 值："{provider}"。有效值：{values}',
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
  Exit: '退出',
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
  'API provider for this process (anthropic/openai/gemini/grok/bedrock/vertex/foundry/unset). Process-scoped, not persisted.':
    '此进程的 API 提供商（anthropic/openai/gemini/grok/bedrock/vertex/foundry/unset）。进程级生效，不持久化。',
  'Subagent API provider for this process (anthropic/openai/gemini/grok/unset). Process-scoped, not persisted.':
    '此进程的子智能体 API 提供商（anthropic/openai/gemini/grok/unset）。进程级生效，不持久化。',

  // ── Provider connections (/connect + /models) ─────────────────
  'Manage provider connections and accounts (add, switch, remove)':
    '管理提供者连接与账号（添加、切换、删除）',
  'Pick the model for the main agent or subagents across all connections':
    '跨所有连接为主 agent 或子 agent 选择模型',
  Connections: '连接管理',
  'Connections closed': '已关闭连接管理',
  'No connections yet. Add one to manage providers and accounts.':
    '还没有任何连接。添加一个以管理提供者和账号。',
  '+ Add connection…': '+ 添加连接…',
  'Clear subagent default (inherit main)': '清除子 agent 默认（继承主 agent）',
  Close: '关闭',
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
  Rename: '重命名',
  Delete: '删除',
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
  'Claude Account': 'Claude 账号',
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
  Cancel: '取消',
}

export default zh
