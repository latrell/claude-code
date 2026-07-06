# Cursor 提供者（Cursor Provider）

复用 **Cursor IDE 的后端 API**，让 CCB 直接调用 Cursor 提供的模型（Claude / GPT 等）。无需 Anthropic 官方 key —— 只要本机登录过 Cursor IDE，或手动提供 Cursor 会话 token 即可。

> ⚠️ Cursor 后端未公开协议，本实现基于社区逆向工程（ConnectRPC + protobuf）。协议随 Cursor 版本变化，字段/端点可能失效；相关行为通过环境变量可调。主要参考项目：
> - [eisbaw/cursor_api_demo](https://github.com/eisbaw/cursor_api_demo) — 协议、鉴权、`x-cursor-checksum`（Jyh cipher）逆向
> - [kaitranntt/ccs](https://github.com/kaitranntt/ccs) — TypeScript 版 protobuf 编解码 / 帧解析参考

## 工作原理

Cursor 后端 `api2.cursor.sh` 使用 **ConnectRPC**（HTTP/2 + 二进制 protobuf），不是 OpenAI 兼容协议。CCB 的 Cursor 提供者采用与 Gemini 一致的"原生客户端 + 流适配器"模式：

1. 复用共享的 `Anthropic → OpenAI` 消息/工具转换器，把会话历史拍平成 OpenAI 形状。
2. `translator.ts` 再转成 Cursor 的对话结构（system → 带前缀的 user；tool 结果 → 结构化 user 文本块）。
3. `protobuf*.ts` 把请求编码为 Cursor 的 `StreamUnifiedChatWithTools` protobuf，并用 ConnectRPC 帧（`[flags:1][len:4BE][payload]`）封装。
4. `clientPolicy.ts` 生成伪装成 Cursor IDE 的身份请求头，含时间派生的 `x-cursor-checksum`（Jyh cipher，seed=165）。
5. `client.ts` 通过 `fetch`（Bun 下自动协商 HTTP/2）流式发送，`streamParser.ts` 增量解析响应帧。
6. `streamAdapter.ts` 把帧（text / thinking / toolCall / error）转换回 Anthropic `BetaRawMessageStreamEvent`，下游 query loop / REPL 完全无感。

代码位于 [`src/services/api/cursor/`](../../src/services/api/cursor/)；模型名映射位于 [`packages/@ant/model-provider/src/providers/cursor/modelMapping.ts`](../../packages/@ant/model-provider/src/providers/cursor/modelMapping.ts)。

## 工具调用（Tool Calling）

Cursor 有**两套工具通道**，且不同模型对它们的支持不同（逆向自 `workbench.desktop.main.js` 的 `aiserver.v1` 定义）：

- **MCP 工具**：`mcp_tools`（Chat field 34），模型经 `call_mcp_tool` 包装器调用。**通用模型**（`claude-4.5-sonnet`、`gpt-5.5`）支持；**Cursor 自家的 agent 调优模型**（Fable 5 / Sonnet 5 / Composer）**完全拒绝** MCP 工具，会报「没有可用工具」。
- **内置工具**：Cursor 的 `ClientSideToolV2` 工具（`run_terminal_cmd`、`read_file` 等），在 `supported_tools` 中按枚举 id 广告，模型直接按内置名调用。**所有模型**都支持。

因此 CCB 采用**双通道**策略（`toolMapping.ts` 集中管理映射）：

1. **可映射工具走内置通道**：`Bash → run_terminal_cmd`、`Read → read_file`。这些工具在 `supported_tools`（Chat field 29 + 最后一条 Message field 51，unpacked repeated enum）中广告内置枚举 id，**不**再注册为 `mcp_tools`。这样 Fable/Sonnet 5 等也能调用。其余操作（编辑、搜索）agent 模型会自然经 `run_terminal_cmd`（→ Bash）走 shell。
2. **其余工具走 MCP 通道**：注册为 `mcp_tools` + `supported_tools` 含 `CALL_MCP_TOOL`（`ClientSideToolV2 = 49`）+ `has_mcp_descriptors`（Chat field 90）置 `true`。通用模型经 `call_mcp_tool` 调用。
3. **调用回读**（`protobufDecoder.ts`）：
   - `call_mcp_tool` 包装器 → `raw_args` 信封 `{ mcpServer, toolName, arguments }`，按 `toolName` 拆回原始工具名 + 参数。
   - 内置工具调用（`run_terminal_cmd` / `read_file`）→ 按 `toolMapping` 反查回 CCB 工具名（`Bash`/`Read`），并把 Cursor 的参数 schema 转回 CCB 的（如 `is_background↔run_in_background`、`target_file↔file_path`、行号↔`offset/limit`）。
4. **结构化工具结果回传**（关键）：agent 调优模型**只接受与其调用的内置工具匹配的结构化 `ClientSideToolV2Result`**——纯文本结果会让它们**反复重试**同一工具。`translator.ts` 把 assistant 的 tool_use 与其结果配对，对可映射工具在 assistant 回合上产出结构化 `tool_results`（ConversationMessage field 18，含 `result`=对应的 `RunTerminalCommandV2Result`/`ReadFileResult`）；未映射工具仍渲染为 `<tool_result>` 用户文本块（通用模型可接受）。
5. **工具调用后的流结束**：聊天 RPC 是**服务端单向流**（非 bidi），模型以工具调用结束回合时，后端发 `aborted` / `ERROR_USER_ABORTED_REQUEST`（"Tool call ended before result was received"）end-stream trailer。这是**正常的回合结束**，`streamParser.ts` 视为良性流结束（不抛错），CCB 本地执行工具后于下一次请求继续。
6. **多轮请求压缩**：带工具结果的后续请求通常 ≥3 条消息，会走 gzip 压缩路径；此时必须发送 `connect-content-encoding: gzip` 头，否则后端以 `received compressed envelope, but do not know how to decompress` 拒绝（曾导致工具对话在第二轮整体失败）。

> **模型差异小结**：`Bash`/`Read` 在所有 Cursor 模型上都可用（走内置通道）；其余 CCB 工具（`Edit`/`Grep`/`Task`/`WebFetch` 等）仅在通用模型（`claude-4.5-sonnet`、`gpt-5.5`）上作为 MCP 工具可用，agent 调优模型上这些操作由模型经 shell（`Bash`）完成。

## 启用

任选其一：

```bash
# 1) 通过 /connect 添加并管理（推荐）——见下节
/connect

# 2) 会话内切换（持久化到 settings.json 的 modelType）
/provider cursor

# 3) 环境变量（进程级）
CLAUDE_CODE_USE_CURSOR=1 bun run dev

# 4) 本次进程覆盖（不持久化）
bun run dev --provider cursor
```

### 通过 /connect 管理

Cursor 已接入连接注册表（`~/.claude/ccb-connections.json`），可像其它 provider 一样在 `/connect` 面板里增删改、设默认、按会话/全局切换主/子 agent：

1. `/connect` → **+ Add connection…** → **Cursor IDE**
2. 选择登录方式：
   - **Sign in with browser (OAuth)**（推荐）：打开 `cursor.com` 授权页，浏览器确认后自动回填凭据，无需手动复制 token。详见下节「OAuth 浏览器登录」。
   - **Paste token / use signed-in IDE**：进入表单手动配置：
     - **Name**：连接显示名（默认 `Cursor`）
     - **Access token**（可选）：留空则激活时自动读取已登录的 Cursor IDE 会话
     - **Machine ID**（可选）：留空则自动探测 / 从 token 派生
     - **Haiku / Sonnet / Opus**（可选）：把家族别名映射到具体 Cursor 模型
3. 创建后在连接菜单里选择「本会话使用 / 设为全局默认」（主 agent 与子 agent 各自独立），并可用内置模型列表（`auto` / `claude-4.5-sonnet` / `gpt-5` …）或「Custom model…」自定义模型 id。

### OAuth 浏览器登录

与 Codex（ChatGPT）订阅登录同构的 **PKCE deep-link 轮询**流程（无本地回调服务器）：

1. 本地生成 PKCE `verifier` + `challenge`（`base64url(sha256(verifier))`）和随机 `uuid`。
2. 打开 `https://www.cursor.com/loginDeepControl?challenge=…&uuid=…&mode=login`，用户在浏览器确认登录。
3. CLI 轮询 `GET https://api2.cursor.sh/auth/poll?uuid=…&verifier=…`（404 = 尚未确认），成功后拿到 `{ accessToken, refreshToken, authId }`。
4. 凭据写入 `~/.claude/cursor-auth.<scope>.json`（权限 `0600`，`scope` = 连接的 `credentialRef`），支持多账号并存。
5. access JWT 短寿命，临近过期（10 分钟内）时用 `POST https://api2.cursor.sh/oauth/token`（`grant_type=refresh_token`）自动刷新；`shouldLogout=true` 表示需重新登录。

激活 OAuth 连接时注入 `CURSOR_AUTH_MODE=oauth` + `CURSOR_CREDENTIAL_SCOPE=<scope>`，客户端凭据解析（`resolveCursorCredentials`）据此读取对应文件并按需刷新，优先级高于环境变量与 IDE 会话。删除连接或 `/logout` 会清理对应的 `cursor-auth.<scope>.json`。

> ⚠️ `loginDeepControl` / `auth/poll` 为逆向出的非公开端点，Cursor 更新后端后可能失效；轮询需带 Cursor-IDE 的 User-Agent。仅供学习研究用途，请遵守 Cursor 服务条款。

会话级激活只改进程内状态；设为全局默认会把凭据写入 `ccb-provider-auth.json` 的 `cursor` 槽位、把 `settings.modelType` 设为 `cursor`，启动时自动注入。`/connect` 首次打开时也会把已有的 `ccb-provider-auth.json` `cursor` 槽位幂等导入为连接。

## 认证

凭据 = 一个 Cursor 访问令牌（JWT）+ 一个 machine id。解析顺序：

0. **OAuth 凭据文件**（`CURSOR_AUTH_MODE=oauth` 时）：读取 `cursor-auth.<scope>.json`，临近过期自动刷新（见上节「OAuth 浏览器登录」）
1. **环境变量**：`CURSOR_API_KEY`（或 `CURSOR_ACCESS_TOKEN`）+ `CURSOR_MACHINE_ID`
2. **本地 Cursor IDE 会话**：自动从 `state.vscdb` 读取（需已登录 Cursor IDE，且运行在 Bun 上）

自动读取的默认路径（可用 `CURSOR_STATE_DB` / `CURSOR_CONFIG_DIR` 覆盖）：

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` |

未提供 machine id 时，会从 token 派生一个确定性值（`sha256(token + "machineId")`）作为兜底。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_CODE_USE_CURSOR` | 设为 `1` 强制选用 Cursor 提供者 | — |
| `CURSOR_AUTH_MODE` | 设为 `oauth` 时从 OAuth 凭据文件读取（由 `/connect` OAuth 登录设置） | — |
| `CURSOR_CREDENTIAL_SCOPE` | OAuth 凭据文件 scope（对应 `cursor-auth.<scope>.json`） | `default` |
| `CURSOR_API_KEY` / `CURSOR_ACCESS_TOKEN` | Cursor 会话访问令牌（JWT，可含 `userId::` 前缀） | 自动从 IDE 读取 |
| `CURSOR_MACHINE_ID` | Cursor machine id | 自动读取 / 从 token 派生 |
| `CURSOR_STATE_DB` | `state.vscdb` 完整路径 | 按平台推断 |
| `CURSOR_CONFIG_DIR` | Cursor 的 `User` 配置目录 | 按平台推断 |
| `CURSOR_BASE_URL` | 后端地址 | `https://api2.cursor.sh` |
| `CURSOR_CHAT_PATH` | 聊天端点路径 | `/aiserver.v1.ChatService/StreamUnifiedChatWithTools` |
| `CURSOR_CLIENT_VERSION` | 伪装的 Cursor 客户端版本 | `2.6.22` |
| `CURSOR_MODEL` | 强制所有请求使用的 Cursor 模型名 | — |
| `CURSOR_MODEL_MAP` | 按 family 覆盖映射的 JSON，如 `{"opus":"claude-4-opus"}` | — |
| `CURSOR_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` | 按 family 覆盖默认模型 | — |
| `CURSOR_REASONING_EFFORT` | `medium` / `high`，映射为 Cursor thinking level | — |
| `CURSOR_GHOST_MODE` | `0`/`false` 关闭 ghost mode（默认开启，不留存对话） | `true` |
| `CURSOR_COMPRESS_REQUESTS` | `1`/`0` 覆盖请求体 gzip 策略（默认 ≥3 条消息时压缩） | 自动 |
| `CURSOR_HTTP2` | `0`/`false` 关闭对聊天请求强制 HTTP/2（见「传输」） | 自动开启（Bun） |
| `CURSOR_MAX_MODE` | `0`/`false` 关闭 Max Mode（完整/1M 上下文，按量计费） | 默认开启 |

## 模型列表与选择

- **`/model`（单 agent 选择器）**：Cursor 为当前 provider 时显示 Cursor 的策展模型列表（`Default` + Composer 2.5 / Opus 4.8 / Sonnet 5 / Fable 5 / GPT-5.x / Codex / Gemini / Grok / GLM / Kimi 等），不再错误显示 Claude 列表。实现见 `src/utils/model/modelOptions.ts` 的 `getCursorModelOptions()`。
- **`/connect` + `/models`（跨 provider 选择器）**：静态策展列表（`src/services/api/cursor/models.ts` 的 `CURSOR_MODELS`）之上，会**实时拉取** Cursor 完整模型目录并合并（`supportsRemoteModelList('cursor')` = true）。
- **实时目录**：`POST /aiserver.v1.AiService/AvailableModels`（ConnectRPC 的 **JSON** 变体 + h2），返回 150+ 个模型（含 effort 变体 `-low/-high/-thinking-*/-fast`）。`fetchCursorAvailableModels()` 过滤出 agent-capable 模型，并从 tooltip 解析上下文窗口。凭据走签入的 Cursor 会话（env / OAuth 文件 / IDE），非 `connection.apiKey`。
- 选择器仍保留「Custom model…」，可输入任意 Cursor 接受的模型 id。

## 模型映射

会话里选用的若是 Anthropic 家族别名（`sonnet` / `opus` / `haiku` / `fable`），发请求前 `resolveCursorModel()` 把它映射为 Cursor 模型名；直接选 Cursor 原生 id（如 `composer-2.5`、`gpt-5.5-medium`）则原样透传。优先级：

- `CURSOR_MODEL` 最高优先（一刀切）
- 其次 `CURSOR_MODEL_MAP` / `CURSOR_DEFAULT_{FAMILY}_MODEL`
- 再次内置默认映射（映射目标为 Cursor 当前存在的模型名，如 `sonnet` → `claude-4.5-sonnet`、`opus` → `claude-opus-4-8-thinking-high`、`haiku` → `claude-4.5-haiku`）
- 都不匹配则原样透传

> Cursor 会淘汰旧模型 id，映射目标需对齐其 AvailableModels 目录里当前存在的名字，否则用别名默认档会命中已下线的模型。

## 传输（HTTP/2）

`api2.cursor.sh` 是 ConnectRPC/gRPC 服务，部署在只接受 HTTP/2 的 AWS ALB 后面。用 HTTP/1.1 直连会在到达后端前被负载均衡器以 **`464 Incompatible protocol`** 拒绝（`API Error: [464] Cursor upstream error`）。

Bun 的 `fetch` 默认走 HTTP/1.1，因此聊天请求通过 per-request 选项 `{ protocol: 'http2' }` 强制协商 h2（经 TLS ALPN，无需全局 `--experimental-http2-fetch` 标志）。该逻辑：

- 仅在 Bun 运行时生效（`protocol` 为 Bun 扩展；Node 的 undici 8.x 默认按 ALPN 协商 h2）；
- 配置了 HTTP 代理时自动跳过（Bun 实验性 h2 客户端暂不支持 CONNECT 隧道），退回 h1；
- 可用 `CURSOR_HTTP2=0` 关闭。

## 上下文窗口与 Max Mode

Cursor 每个模型有两个上下文窗口：non-max（如 Opus 4.8 = 300k、Sonnet 4.5 = 200k）和 **Max Mode**（多为 1M）。

- **Max Mode 默认开启**：聊天请求置位 protobuf 的 `LARGE_CONTEXT`（field 35）启用模型完整（≤1M）窗口，上下文窗口按 `maxContextWindow` 计算。设 `CURSOR_MAX_MODE=0` 关闭（回到 non-max 窗口）。注意 Max Mode 会产生 Cursor 的按量计费。
- `getContextWindowForModel()` 对 Cursor 当前 provider 会先经 `getCursorContextWindowForModel()`（`src/services/api/cursor/models.ts`）解析：把家族别名（`sonnet`/`opus`/`fable`）映射为 Cursor 模型 id，再按当前 Max Mode 查策展目录的窗口。**修复了 Cursor 模型一律回退到 200k 默认值的问题**——auto-compact 阈值与状态栏上下文百分比现按真实窗口计算（默认即 1M 级）。
- `/models` 实时拉取的窗口也随 Max Mode 取 non-max / max tooltip。

## 订阅用量（/usage）

Cursor 是当前 provider 时，`/usage` 会显示订阅计划的额度使用情况。数据来自 Cursor dashboard 用的两个逆向端点（已实测）：

- `GET /auth/usage-summary` —— 计费周期、`membershipType`、plan 与 on-demand 用量（金额单位为**美分**）
- `GET /auth/full_stripe_profile` —— `subscriptionStatus`（active / trialing…）

展示的指标：Included usage（计划内总用量）、Included API / Auto usage（分项百分比）、On-demand usage（按量付费，附 `$used / $limit`），并以计费周期结束时间作为重置时间。用量同时写入统一的 provider-usage store。实现见 `src/services/api/cursor/cursorUsage.ts`。

**状态栏**：启动时（`main.tsx` / `interactiveHelpers.tsx`，与 Codex 同一处）调用 `fetchCursorUsage()` 填充 provider-usage store，状态栏据此显示 Cursor 额度。状态栏空间有限，只展示 headline 的「Included usage」一项（`selectStatusLineProviderBuckets` 的 cursor 分支，标签压缩为 `额度`/`Usage`）。

> `/usage` 面板按**当前激活的 provider**（`getAPIProvider()`）取数：用 `/connect` 切换 agent 后，面板会显示新 agent 的额度，而不是切换前的。

## 已知限制

- **无 token 用量**：Cursor 流不返回 token 计数（对话成本统计恒为 0）；`/usage` 的订阅额度是独立的 dashboard 数据，不受此限制。
- **side query 走 Anthropic**：压缩摘要、标题生成等后台调用当前不经过 Cursor（会尝试 Anthropic 默认路径）；纯 Cursor 用户这些非关键操作会静默失败，不影响主循环。
- **协议脆弱**：依赖逆向出的 protobuf 字段与端点，Cursor 更新后端后可能需要同步调整。
- **仅供学习研究用途**，请遵守 Cursor 的服务条款。
