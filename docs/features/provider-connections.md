# Provider 连接管理（/connect + /provider + /model）

为 CCB 提供统一的"连接（命名档案）"管理：多提供者、多账号、多档案并存，主/子 agent 与小快模型（HAIKU）调用可在会话级或全局一键切换完整档案。

Feature flag：`PROVIDER_CONNECTIONS`（dev/build 默认启用）。

## 核心概念

**连接（Connection）= 命名档案**：提供者类型 + 端点 + 一份账号凭据 + **固定模型（`model`）** + **思考强度（`thinkingEffort`：off/low/medium/high/max）** + **上下文窗口（`contextWindow`，tokens 单值）**。

- 同一提供者可以保存多个连接（多账号），**同一份凭据也可以建多个连接**（多档案）：例如用同一个 DeepSeek key 建 `deepseek1`（deepseek-v4-pro、1M 上下文、max 思考）和 `deepseek2`（deepseek-v4-flash、low 思考），之后 `/provider deepseek1`、`/subagent-provider deepseek2`、`/fast-provider deepseek2` 一键切换完整档案。
- **三个 agent 槽位（AgentSlot）**：`main`（主 agent）、`subagent`（AgentTool 子 agent）、`fast`（小快模型/HAIKU 内部调用：会话标题、通知总结、工具用途摘要、bash 前缀分析、auto mode、会话搜索、away summary 等）。fast 槽位未配置时，HAIKU 调用跟随主 agent 连接——在第三方连接下这意味着实际打到连接的固定主模型（贵且慢），在 Anthropic 兼容中转下则直发 `claude-haiku-4-5`（中转无该通道时 503），配置 fast 槽位即可把这些调用路由到独立的小模型档案。
- `Connection.model` 是连接实际使用模型的**唯一真相源**；`models[]` 目录仅供选择 UI 展示。`tierModels` 与 per-model 的 `modelContextWindows` 已 deprecated（仅作旧文件解析与窗口回退来源，不再新增写入）。
- 连接注册表存于 `~/.claude/ccb-connections.json`（chmod 600）。旧格式文件在加载时懒迁移（从 tierModels/目录推导 pinned model）。

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

### CLI：`--provider` / `--subagent-provider` / `--fast-provider` / `connect`

启动时可用连接名称（`/connect` 配置的 id、label 或 presetId）指定主/子 agent 与小快模型调用使用的连接，进程级生效、不写盘：

```bash
# 主 agent 用 deepseek1 档案，子 agent 用 deepseek2 档案
ccb --provider deepseek1 --subagent-provider deepseek2

# 小快模型（HAIKU）调用走 deepseek2 的 flash 档案
ccb --provider zhuanbit --fast-provider deepseek2

# 子 agent / 小快调用完全继承主连接
ccb --provider deepseek1 --subagent-provider unset --fast-provider unset

# 打印已配置连接列表后退出
ccb connect
```

解析顺序：精确 id → 不区分大小写 id → 不区分大小写 label → 不区分大小写 presetId。重名时报错并提示用 id 消歧。`--subagent-provider unset` / `--fast-provider unset` 表示对应槽位完全继承主连接（同时屏蔽 `settings.subagentProvider`/`settings.fastProvider`、`SUBAGENT_*`/`FAST_*` 环境变量和 `providerModels.<key>.subagentModel`/`.fastModel` 的全局默认）。

会话激活的 env 增量会记录为 session overlay（`sessionEnvOverlay.ts`），在每次 `applyConfigEnvironmentVariables()`（信任对话框、print 模式、settings 变更、`/provider`）之后重放，保证全局默认（如 `ccb-provider-auth.json` 里的 `OPENAI_AUTH_MODE=chatgpt`、`settings.env` 的 `ANTHROPIC_BASE_URL`）不会覆盖会话内激活的连接。`/login` 和 `/logout` 会清除 overlay。

### `/connect` — 连接管理面板

- 列表展示所有连接，行内附带档案摘要（`模型 · effort 强度 · ctx 窗口`），标记全局默认（主/子 agent/fast）与本会话使用中的连接。
- **添加连接向导**：选择类型/预设 → 填凭据（或 OAuth 登录）→ **档案三步**：
  1. **模型**：列出该连接可用模型（静态目录 + 远程实时拉取），支持手动输入任意模型 id（自定义端点目录可能为空）；OAuth 类连接（Claude / ChatGPT）可选"Default"走 provider 默认。
  2. **思考强度**：off/low/medium/high/max + "默认（不设置）"。Cursor 连接跳过此步（effort 编码在模型 id 里）。
  3. **上下文窗口**：可跳过的输入（支持 `200000` / `128K` / `1M`）；远程目录已上报该模型窗口时自动预填，回车即确认。OAuth 类连接（窗口由 provider 决定）跳过此步。
  三步均可 Esc 返回上一步。
- **连接操作菜单**：
  - 本会话使用 / 设为全局默认（主 agent、子 agent 与 fast/HAIKU 调用各自独立）——**直接按档案激活，不再强制选模型**。仅当 key 型第三方连接（openai-compat / gemini / grok）还没有固定模型时，先引导补选（选中即落盘到 `Connection.model` 后激活）。
  - **更换固定模型…** —— 模型选择器（静态目录 + 远程拉取 + 自定义输入），选中 `updateConnectionModel` 落盘；若该连接正在会话/全局的主或子 agent 槽位使用，自动重新部署刷新。
  - **思考强度…** —— 五档 + 默认，写回连接并按需重新部署。
  - **上下文窗口…** —— 直接编辑连接级 `contextWindow` 单值（留空清除）。
  - **复制连接…** —— 输入新名称（预填 `<label> 2`），复制凭据与档案字段（model / thinkingEffort / contextWindow 可再改）生成新连接。这是"同一凭据、多套档案"（deepseek1/deepseek2）场景的核心入口。
  - 编辑（名称/凭据）、删除。
- 首次打开自动从旧存储导入（幂等）：`ccb-provider-auth.json` 各 provider 槽位（openai / gemini / grok / cursor）、`settings.env` 的 Anthropic 自定义端点、当前 OAuth 账号、ChatGPT 默认凭据。

### `/provider` / `/subagent-provider` / `/fast-provider` — 连接切换器

- 模糊搜索连接列表，行内显示档案摘要；`Enter` = 本会话切换，`Shift+Tab` = 设为全局默认，标记 `●` 当前会话 / `★` 全局默认。
- 也支持直接传参：`/provider deepseek1`、`/subagent-provider deepseek2 global`、`/fast-provider deepseek2`、`/fast-provider unset`。
- 切换即部署完整档案：凭据 + 固定模型 + 思考强度 + 上下文窗口一起生效。
- **`/fast-provider`（alias `/fastapi`）**：把所有小快模型（HAIKU）内部调用（`queryHaiku` 家族：会话标题、MeoW 通知总结、工具用途摘要、bash 前缀分析、日期解析、skill 意图归一化；`sideQuery` 家族：auto mode 穷鬼档、会话搜索、away summary、穷鬼模式权限解释器；及 hook 小模型调用）路由到指定连接。持久化为 `settings.fastProvider` + `providerModels.<key>.fastModel`。绑定主凭据的调用不受影响（claude.ai 限额探测、API key 校验、countTokens 估算、服务端 web_search、hook agent 主循环）。anthropic-oauth 连接作为 fast 槽位时共享主会话 OAuth 凭据（与 subagent 同限制）；anthropic-api 连接则携带独立 Base URL/Token（`getAnthropicClient` env 覆盖）。

### `/model` — 当前连接的模型选择

主 agent 运行在某个连接上时，`/model` 列出该连接的模型目录；选中**直写连接档案**（`updateConnectionModel`）并重新部署（连接是全局默认时同步持久化）。

## 上下文窗口

第三方模型的上下文窗口不再一律按 200k 硬编码处理：`getContextWindowForModel()` 经 `getConnectionContextWindow()` 优先读取**连接级 `contextWindow`**，使自动压缩阈值（auto-compact）、状态栏上下文百分比等按真实窗口计算。

`contextWindow` 的来源：

1. **手动** — `/connect` 连接菜单"上下文窗口…"、向导第 3 步或激活引导中输入。
2. **自动同步** — `updateConnectionModel()` 换模型时从已识别的 per-model 窗口（远程模型列表端点上报的 `context_length` / `max_model_len` / Gemini `inputTokenLimit` 等）同步；识别不到则清空，避免旧模型的窗口误用到新模型。
3. **预设兜底** — 中国厂商预设目录（`CHINA_LLM_PROVIDERS`）的 `contextWindow` 展示字符串（如 `"1M"`）运行时解析。

激活路径选中一个**窗口未知**的第三方模型时，自动插入一步可跳过的窗口输入（已识别的模型不打断）。切换成功消息附带生效的窗口（`ctx 1M`），便于确认。

运行时查找顺序（`getConnectionContextWindow(model)`）：活跃主槽连接的连接级 `contextWindow`（pinned model 匹配时）→ 该连接的 per-model/预设窗口 → 旧版全局搜索（会话/默认/其余连接的 per-model 表）。均未命中时维持原有解析链（Anthropic 能力缓存、1M beta、ChatGPT plan 窗口、200k 默认）。

## 思考强度

连接档案的 `thinkingEffort`（off/low/medium/high/max）在连接激活期间生效，已接线到各协议请求层（`getConnectionThinkingEffort()` 按槽位解析：会话分配 > 全局默认分配）。`off` 对 OpenAI 兼容层写 `OPENAI_ENABLE_THINKING=0` 硬关闭。

## 激活（部署式）语义

激活一个连接不会引入新的运行时读取路径，而是把档案"部署"到现有存储槽位，启动链路零改动。model 缺省时自动使用 `connection.model`（`resolveActivationModel`）：

- **会话级**：仅进程内生效 — 注入 `process.env`、`setProviderCliOverride()`、清空 provider SDK client 缓存、更新 `AppState.mainLoopModel`。不写盘。
- **全局**：写入现有持久层后立即对当前会话生效 —
  - `openai-compat` / `gemini` / `grok` / `cursor` → `~/.claude/ccb-provider-auth.json` 对应槽位 + `settings.modelType` + `providerModels.<key>.model`
  - `anthropic-api` → `settings.env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` 等）
  - `anthropic-oauth` → secure storage 活跃槽位切换 + 清除 `settings.env` 中的自定义端点残留
  - `chatgpt-oauth` → 连接的 scope 凭据文件拷贝到默认文件 + `OPENAI_AUTH_MODE=chatgpt`
  - 子 agent 槽位 → `settings.subagentProvider`（含 model + thinkingEffort）+ `providerModels.<key>.subagentModel`（复用现有 `getSubagentProviderRuntimeConfig()` 管线）

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
  store.ts               # 注册表读写（原子写 + 缓存 + chmod 600）+ updateConnectionModel + 懒迁移
  profile.ts             # 档案纯函数：duplicateConnection / withPinnedModel /
                         #   withThinkingEffort / withContextWindow / 档案摘要
  oauthAccounts.ts       # Anthropic OAuth 多账号槽位（secure storage）
  migrate.ts             # 旧存储幂等导入
  sessionAssignments.ts  # 会话槽位记录（轻量模块，供底层查找使用）
  activate.ts            # 会话级/全局激活引擎（model 缺省 = connection.model）
  slotSwitch.ts          # /provider、/subagent-provider、/fast-provider 共享的切换辅助
  cliResolve.ts          # CLI --provider/--subagent-provider/--fast-provider/`connect` 解析与列表格式化
  modelCatalog.ts        # 每连接模型目录（静态 + /v1/models、Gemini ListModels 动态拉取）
  contextWindows.ts      # 上下文窗口：解析/格式化/查找
  thinkingEffort.ts      # 连接思考强度的运行时解析
  autoRegister.ts        # /login 成功后的自动注册
  logoutCleanup.ts       # /logout 清理
src/utils/model/
  subagentProvider.ts    # subagent 槽位运行时配置（ProviderRuntimeConfig）
  fastProvider.ts        # fast 槽位运行时配置 + getFastModelAndRuntime()
src/components/connections/
  ConnectionsPanel.tsx / AddConnectionWizard.tsx / ConnectionForm.tsx
  ConnectionPicker.tsx / ModelsPicker.tsx
  ChatGPTDeviceLogin.tsx / CursorDeviceLogin.tsx
src/commands/connect/  src/commands/provider/  src/commands/fast-provider/
```
