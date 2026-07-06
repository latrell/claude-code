# Provider 连接管理（/connect + /models）

参考 opencode 的 `/connect` + `/models` 交互，为 CCB 提供统一的"连接（provider + 账号）"管理：多提供者、多账号并存，主/子 agent 模型可分别在会话级或全局切换。

Feature flag：`PROVIDER_CONNECTIONS`（dev/build 默认启用）。

## 核心概念

**连接（Connection）** = 提供者类型 + 端点 + 一份账号凭据 + 模型目录。同一提供者可以保存多个连接（即多账号）。连接注册表存于 `~/.claude/ccb-connections.json`（chmod 600）。

支持的连接类型（`kind`）：

| kind | 说明 | 凭据存储 |
|------|------|---------|
| `anthropic-oauth` | claude.ai 订阅账号 | secure storage 多账号槽位（`claudeAiOauthAccounts`），`claudeAiOauth` 保持为"当前活跃账号"镜像，兼容官方读取路径 |
| `anthropic-api` | Anthropic 兼容网关（Base URL + Auth Token） | 注册表内联 |
| `chatgpt-oauth` | ChatGPT 订阅（Codex OAuth 设备码） | `openai-chatgpt-auth.<scope>.json` 按连接分文件 |
| `openai-compat` | 任意 OpenAI Chat Completions 端点（DeepSeek、智谱、Ollama…） | 注册表内联 |
| `gemini` | Google Gemini API | 注册表内联 |
| `grok` | xAI Grok API | 注册表内联 |
| `cursor` | Cursor IDE 后端 API（ConnectRPC/protobuf） | 注册表内联（session token + machine id，均可留空自动读取已登录的 Cursor IDE）；见 [`docs/features/cursor-provider.md`](./cursor-provider.md) |

## 命令

### `/connect` — 连接管理面板

- 列表展示所有连接，标记全局默认（主/子 agent）与本会话使用中的连接。
- 添加连接：中国厂商预设（DeepSeek / 智谱 / 通义 / MiMo，含 API 与编程套餐两种接入方式）、OpenAI 兼容自定义端点、Anthropic 兼容网关、Gemini、Grok、Cursor IDE、Claude OAuth 账号、ChatGPT 订阅账号。
- 每个连接的操作菜单：本会话使用 / 设为全局默认（主 agent 与子 agent 各自独立）、重命名、删除。
- 首次打开自动从旧存储导入（幂等）：`ccb-provider-auth.json` 各 provider 槽位（openai / gemini / grok / cursor）、`settings.env` 的 Anthropic 自定义端点、当前 OAuth 账号、ChatGPT 默认凭据。

### `/models` — 跨 provider 模型选择器

- 扁平列出 `连接 / 模型`，支持模糊搜索；OpenAI 兼容端点（含 Grok）异步拉取 `GET {baseUrl}/models`、Gemini 拉取 ListModels API 补充模型列表。
- `Enter` = 本会话切换；`Shift+Tab` = 设为全局默认；`Tab` = 在主 agent / 子 agent 槽位间切换。
- `/models sub` 直接打开子 agent 槽位。
- 标记：`●` 当前会话使用中，`★` 全局默认；条目附带已知的上下文窗口（`ctx 1M` 等）。

## 模型上下文窗口

第三方模型的上下文窗口不再一律按 200k 硬编码处理，`getContextWindowForModel()` 会读取连接注册表中的配置（`Connection.modelContextWindows`），使自动压缩阈值（auto-compact）、状态栏上下文百分比等按真实窗口计算。

三个来源（优先级从高到低）：

1. **manual** — 用户在 `/connect` 中手动设置，永远不会被自动识别覆盖。
2. **auto** — 打开 `/models` 或 `/connect` 模型选择器时，从提供者的模型列表端点自动识别并持久化：
   - OpenAI 兼容 / Grok：`GET {baseUrl}/models` 条目上的 `context_length`（OpenRouter/Together）、`max_model_len`（vLLM）、`max_context_length`（LM Studio）、`context_window`、`max_input_tokens` 等字段（官方 OpenAI 响应不含这些字段，识别不到就留空）
   - Gemini：ListModels 的 `inputTokenLimit`
3. **preset** — 中国厂商预设目录（`CHINA_LLM_PROVIDERS`）中的 `contextWindow` 展示字符串（如 `"1M"`、`"203K"`），运行时解析兜底。

交互入口：

- `/connect` → 连接菜单 → **Model context windows…**：选择模型后输入窗口大小（支持 `200000` / `128K` / `1M` 格式，留空清除手动值）。
- `/connect` 激活路径选中一个**窗口未知**的第三方模型时，自动插入一步可跳过的窗口输入（识别到的模型不打断）。
- 切换成功消息会附带生效的窗口（`ctx 1M`）或未知提示，便于确认识别结果。

运行时查找顺序（`getConnectionContextWindow(model)`，按 model id 匹配）：会话激活连接（主 → 子）→ 全局默认连接 → 注册表其余连接。均未命中时维持原有解析链（Anthropic 能力缓存、1M beta、ChatGPT plan 窗口、200k 默认）。

## 激活（部署式）语义

激活一个连接不会引入新的运行时读取路径，而是把配置"部署"到现有存储槽位，启动链路零改动：

- **会话级**：仅进程内生效 — 注入 `process.env`、`setProviderCliOverride()`、清空 provider SDK client 缓存、更新 `AppState.mainLoopModel`。不写盘。
- **全局**：写入现有持久层后立即对当前会话生效 —
  - `openai-compat` / `gemini` / `grok` → `~/.claude/ccb-provider-auth.json` 对应槽位 + `settings.modelType` + `providerModels.<key>.model`
  - `anthropic-api` → `settings.env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / tier 映射）
  - `anthropic-oauth` → secure storage 活跃槽位切换 + 清除 `settings.env` 中的自定义端点残留
  - `chatgpt-oauth` → 连接的 scope 凭据文件拷贝到默认文件 + `OPENAI_AUTH_MODE=chatgpt`
  - 子 agent 槽位 → `settings.subagentProvider` + `providerModels.<key>.subagentModel`（复用现有 `getSubagentProviderRuntimeConfig()` 管线）

tier 映射（`tierModels.haiku/sonnet/opus`）写成 `*_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` 环境变量，使 `haiku` 等别名（后台任务、small-fast model）按连接解析。

### 注意事项

- OAuth 账号槽位切换（`anthropic-oauth` / `chatgpt-oauth` 的凭据部署）本质是全局副作用：其他并行会话在 token 刷新后也会读到新账号。provider/模型选择本身仍是会话隔离的。
- 子 agent 使用 `anthropic-api` / `anthropic-oauth` 连接时，Anthropic 客户端路径不消费 scoped env 凭据（既有管线限制），子 agent 实际共享主会话的 Anthropic 凭据，仅模型不同。
- Token 刷新自动写回账号槽位：`saveOAuthTokensIfNeeded()` 会在写 `claudeAiOauth` 的同时同步当前账号的槽位，避免切回旧账号时拿到过期 token。

## 登录/登出联动

- `/login` 成功后自动注册对应连接（claude.ai OAuth → `anthropic-oauth`；OpenAI 兼容 / 中国厂商 / Gemini 表单 → 对应 kind；ChatGPT 订阅 → `chatgpt-oauth`），按凭据签名去重。
- `/logout` 清空连接注册表并删除各连接的 scope 凭据文件（与现有"清空全部凭据"语义一致）。

## 代码结构

```
src/services/connections/
  types.ts               # Zod schema：Connection / ConnectionsFile / SlotAssignment
  store.ts               # 注册表读写（原子写 + 进程内缓存 + chmod 600）
  oauthAccounts.ts       # Anthropic OAuth 多账号槽位（secure storage）
  migrate.ts             # 旧存储幂等导入
  sessionAssignments.ts  # 会话槽位记录（轻量模块，供底层查找使用）
  activate.ts            # 会话级/全局激活引擎
  modelCatalog.ts        # 每连接模型目录（静态 + /v1/models、Gemini ListModels 动态拉取）
  contextWindows.ts      # 模型上下文窗口：解析/格式化/查找/持久化
  autoRegister.ts        # /login 成功后的自动注册
  logoutCleanup.ts       # /logout 清理
src/components/connections/
  ConnectionsPanel.tsx / AddConnectionWizard.tsx / ConnectionForm.tsx
  ChatGPTDeviceLogin.tsx / ModelsPicker.tsx
src/commands/connect/  src/commands/models/
```
