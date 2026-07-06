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
2. 表单：
   - **Name**：连接显示名（默认 `Cursor`）
   - **Access token**（可选）：留空则激活时自动读取已登录的 Cursor IDE 会话
   - **Machine ID**（可选）：留空则自动探测 / 从 token 派生
   - **Haiku / Sonnet / Opus**（可选）：把家族别名映射到具体 Cursor 模型
3. 创建后在连接菜单里选择「本会话使用 / 设为全局默认」（主 agent 与子 agent 各自独立），并可用内置模型列表（`auto` / `claude-4.5-sonnet` / `gpt-5` …）或「Custom model…」自定义模型 id。

会话级激活只改进程内状态；设为全局默认会把凭据写入 `ccb-provider-auth.json` 的 `cursor` 槽位、把 `settings.modelType` 设为 `cursor`，启动时自动注入。`/connect` 首次打开时也会把已有的 `ccb-provider-auth.json` `cursor` 槽位幂等导入为连接。

## 认证

凭据 = 一个 Cursor 访问令牌（JWT）+ 一个 machine id。解析顺序：

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

## 模型映射

会话里选用的仍是 Anthropic 家族别名（`sonnet` / `opus` / `haiku` / `fable`）。发请求前 `resolveCursorModel()` 把它映射为 Cursor 模型名：

- `CURSOR_MODEL` 最高优先（一刀切）
- 其次 `CURSOR_MODEL_MAP` / `CURSOR_DEFAULT_{FAMILY}_MODEL`
- 再次内置默认映射（如 `claude-sonnet-4-5-*` → `claude-4.5-sonnet`）
- 都不匹配则原样透传

## 已知限制

- **无 token 用量**：Cursor 流不返回 token 计数，成本统计恒为 0。
- **side query 走 Anthropic**：压缩摘要、标题生成等后台调用当前不经过 Cursor（会尝试 Anthropic 默认路径）；纯 Cursor 用户这些非关键操作会静默失败，不影响主循环。
- **协议脆弱**：依赖逆向出的 protobuf 字段与端点，Cursor 更新后端后可能需要同步调整。
- **仅供学习研究用途**，请遵守 Cursor 的服务条款。
