# 全量代码审计报告

- **仓库**: claude-code fork（Bun + TypeScript，版本 2.1.888）
- **审计日期**: 2026-07-18
- **审计方式**: 38 个只读审计子代理并行分区审计（src/ 2,146 个源文件 + packages/ 738 个源文件 + 构建/测试基建），覆盖全部生产代码
- **基线状态**: `tsc --noEmit` 零错误 ✅ · `biome lint` 通过 ✅（本报告不含风格/类型标注类问题）
- **完整原始发现**: 见 [audit-appendix.md](audit-appendix.md)（38 个分区逐条列出）

## 发现统计

| 严重度 | 数量 | 说明 |
|---|---|---|
| Critical | 2 | 均已人工复核确认 |
| High | 17 | 其中 1 条经复核为误报，降级为 Low（见「验证与更正」） |
| Medium | 98 | 按主题归纳见下文 |
| Low | 227 | 完整清单见附录 |
| **合计** | **344** | |

---

## 一、Critical 发现（2 条，已验证）

### C1. React hooks 在 switch 分支内被条件调用 — `src/components/ConsoleOAuthFlow.tsx:696`

`OAuthStatusMessage` 组件在 `switch (oauthStatus.state)` 的 `case 'custom_platform'` 分支内直接调用 `useState`（×2）与 `useCallback`。当 OAuth 状态切换到其他 case 时，hook 调用数量和顺序改变，违反 Rules of Hooks，运行时将直接抛出 "Rendered more/fewer hooks than expected" 并使组件树崩溃。已人工复核确认。

**修复**: 把 hooks 提升到组件顶层（无条件调用），switch 内只保留纯渲染逻辑。

### C2. acp-link Manager HTTP 服务无鉴权且默认绑定全部网卡 — `packages/acp-link/src/manager/index.ts:35`

`serve({ fetch: app.fetch, port })` 未传 `hostname`，`@hono/node-server` 默认绑定 `0.0.0.0`；Manager 的实例管理 API（启动/停止/列表 agent 实例）没有任何鉴权中间件。局域网内任意主机可远程操控本机所有 ACP agent 实例。已人工复核确认。

**修复**: 默认绑定 `127.0.0.1`（显式对外时再开放）；为 Manager 路由加 token 鉴权（CLI 侧已有 token 机制可复用）。

---

## 二、High 发现（17 条）

### 安全类

1. **路径穿越 → 任意目录递归删除/写入** — `src/workflow/service.ts:212` 与 `packages/workflow-engine/src/engine/journal.ts:25,47`（同一缺陷两处）。模型可控的 `resumeFromRunId` 仅校验 `z.string()`，直接拼入 run 目录路径，`../..` 可逃逸到任意目录；journal 清理逻辑会对其递归删除。
2. **ACP 会话删除路径穿越** — `src/services/acp/agent/AcpAgent.ts:272-293,303-309`。`unstable_deleteSession` / `extMethod('session/delete')` 仅校验 sessionId 非空，随后拼路径删除，未防 `..`。
3. **ExecuteTool 吞掉 `ask` 权限结果继续执行** — `packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts:198-217`。已人工复核：只对 `deny` 做了处理，`ask` 结果落入静默分支后直接 `targetTool.call(...)`，deferred 工具的交互确认被完全绕过。
4. **WebBrowserTool SSRF** — `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserTool.ts:93-114`。`fetch(input.url)` 前无协议白名单、不过滤 userinfo、不拦截 `169.254.169.254` 等内网/云元数据地址，`redirect: 'follow'`。
5. **AppleScript 命令注入** — `packages/@ant/computer-use-input/src/backends/darwin.ts:101`。`key()`/`keys()` 把未转义的按键名拼进 `keystroke "${...}"`，`"` 与 `\` 可逃逸字符串注入任意 AppleScript。
6. **LAN pipes TCP 零认证** — `src/utils/pipeTransport.ts:268`。`enableTcp` 开启后（`feature('LAN_PIPES')`，非默认构建）绑定 `0.0.0.0`，NDJSON 协议无认证，局域网任意主机可 attach。
7. **LLM 生成的 agent identifier 未校验直接作文件名** — `src/components/agents/new-agent-creation/wizard-steps/GenerateStep.tsx:108`，可路径穿越写出预期目录。
8. **RCS Web UI 令牌 key 冲突覆盖用户身份** — `packages/remote-control-server/web/src/hooks/useTokens.ts:11`。`ACTIVE_TOKEN_KEY = 'rcs_uuid'` 与 `api/client.ts` 存储用户身份 UUID 的 localStorage key 同名，`setActiveTokenId()` 会覆盖身份 UUID。

### Bug / 数据正确性类

9. **预测式 autocompact 分支与主压缩路径不一致** — `src/query.ts:1298-1310`。不 yield 压缩边界消息、不结转 `taskBudgetRemaining`、不重置 tracking，触发预测压缩后会话状态与另两条路径产生分叉。
10. **Gemini 兼容层丢弃 stop_reason 与 usage** — `src/services/api/gemini/index.ts:226-228`。完全忽略 `message_delta`/`message_stop` 事件，下游无法得知停止原因与 token 用量。
11. **401 会话过期错误被同 try 块捕获误分类** — `src/services/api/sessionIngress.ts:462-468`。`throw new Error('Your session has expired...')` 与网络请求共用 try，可能被外层 catch 当作普通网络错误重试/包装。
12. **cachedMicrocompact 的 `deletedRefs` 生产代码从未写入** — `src/services/compact/cachedMicrocompact.ts:87-93`（仅测试文件写入），`getToolResult...` 的删除判定在生产中恒失效。
13. **chrome-mcp socket 单 responseCallback 并发覆盖** — `packages/@ant/claude-for-chrome-mcp/src/mcpSocketClient.ts:324`。并发请求相互覆盖回调，响应错配。
14. **acp-link dispatch 的 `pendingJsonRpc` 单槽与并发模型矛盾** — `packages/acp-link/src/server/dispatch.ts:316-329`。并发消息下 response 路由错乱。
15. **微信包 `stripCodeBlocks` 闭合 fence 判定错误** — `packages/weixin/src/send.ts:32`。闭合 fence 在文本末尾且带尾换行时误判为未闭合，错误剥离内容。

### 降级更正

16. ~~**Ctrl+C 双击退出失效** — `src/hooks/useExitOnCtrlCD.ts`~~ **复核为误报**：主应用经 `src/hooks/useDoublePress.ts` re-export 的是 Ink 包公开的 ref 版实现（`packages/@ant/ink/src/hooks/useDoublePress.ts`，正确）。闭包变量版仅存在于 Ink 包内一个标注 "Stub" 的私有函数（`ink/src/hooks/useExitOnCtrlCD.ts:23` 的 `useExitOnCtrlCDWithKeybindings`），不被主应用调用。**降级为 Low**（stub 内隐患，建议清理或改用 ref 版）。

---

## 三、Medium 发现主题归纳（98 条，全量见附录）

**安全（约 20 条）**
- `scripts/postinstall.cjs:38` 下载 ripgrep 无校验和/签名验证，回退镜像为第三方代理（供应链投毒面）
- `src/utils/managedEnvConstants.ts:170` `SAFE_ENV_VARS` 混入 `OPENAI_API_KEY`/`GEMINI_API_KEY`/`CURSOR_ACCESS_TOKEN` 等凭证变量
- `src/services/oauth/index.ts:157` 手动粘贴授权码路径不校验 `state`（OAuth CSRF 缺口）
- `src/commands/copy/copy.tsx:20` 复制内容写入 tmpdir 可预测共享路径（本地信息泄露/抢占）
- `packages/remote-control-server/src/routes/web/auth.ts:11` `POST /web/bind` 无鉴权，任意 sessionId+uuid 可绑定他人会话
- `src/services/connections/activate.ts:240` 清理同族陈旧 key 逻辑与环境注释承诺不符（凭证遮蔽风险）
- `src/services/langfuse/sanitize.ts:72` 脱敏只按 key 名，FileWrite/Edit 工具的文件内容整体进入 trace
- `src/utils/teammateMailbox.ts:657`、`LocalMemoryRecallTool.ts:167` 等多处 XML 拼接未转义（提示注入面）
- `src/utils/bash/prefix.ts:169` 复合命令权限建议前缀折叠过宽（权限放大）
- `src/services/mcp/utils.ts:563` "日志安全 URL" 未剥 userinfo 与 hash（凭证入日志）

**Bug（约 35 条）**，代表性条目：
- `src/utils/genericProcessUtils.ts:43` PowerShell 脚本给只读自动变量 `$PID` 赋值，Windows 分支必然抛错
- `src/commands/ide/ide.tsx:308` 选 Cursor/Windsurf 后仍固定调 `code` CLI
- `src/commands/insights.ts:2745` SessionMeta 缓存无 mtime 失效机制
- `src/utils/promptShellExecution.ts:92` prompt 内嵌 shell 命令被 `Promise.all` 并发执行（文档语义为顺序）
- `src/utils/sideQuery.ts:1035` OpenAI 端点返回非法 JSON tool arguments 时在重试/降级逻辑外直接崩溃
- `src/cli/transports/WebSocketTransport.ts:253` 读 `upgradeReq`（ws 服务端属性）导致客户端重连重放永不触发
- `src/vim/transitions.ts:146` 无法区分"未输入计数"与显式 `1`（`1G` ≠ `G`）
- `src/utils/messages/mappers.ts:55` `case 'user'` 提前 return 使 compact_boundary 分支不可达
- `packages/mcp-client/src/discovery.ts:146` 工具发现缓存键不含 `skipPrefix`，缓存错配
- `packages/@ant/computer-use-mcp/src/toolCalls.ts:4140` bound-window 模式水平滚动方向错误

**错误处理（约 20 条）**：普遍模式为 Promise 链缺 `.catch`（`launchLocalVault.tsx`、`MCPSettings.tsx`、`MCPRemoteServerMenu.tsx`、`useTasksV2.ts`、`acp-link/manager.ts` 等）、catch 静默吞异常（`useTasksV2`、`Usage.tsx` 的 `setError` 恒 null）、错误分类过粗（`tasks.ts:606` 任意错误都返回同一兜底）。

**并发与资源（约 20 条）**：check-then-act 竞态（`pipeRegistry.ts:256`、`cronTasksLock.ts:141`、`teamHelpers.ts:306`、`observationStore.ts:262`）、监听器/定时器未清理（`weixin/api.ts:48`、`cursorUsage.ts:265`、`install.tsx:159`）、泄漏（`SSHProbe.ts:40` 超时后 ssh 子进程泄漏、`useMasterMonitor.ts:89` history 无上限、`mcpSocketClient` 重连资源）。

**未完成/死代码（约 10 条）**：`TeamsDialog.tsx:595` 空函数桩、`server/parseConnectUrl.ts` 等 8 文件 stub、`OverflowTestTool`/`TungstenTool`/`TerminalCaptureTool`/`VerifyPlanExecutionTool` 等工具桩（详见下节）。

---

## 四、系统性问题模式（跨分区反复出现）

1. **"Auto-generated stub" 还原残留**：全仓散布数十个 `// Auto-generated stub — replace with real implementation` 文件/函数，且部分已被生产路径引用——`src/types/connectorText.ts:16`（`isConnectorTextBlock` 恒 false 但已被调用）、`src/services/skillSearch/remoteSkillLoader.ts` 等 3 文件、`src/utils/secureStorage/types.ts`（`SecureStorage = any`）、`src/utils/eventLoopStallDetector.ts`、`src/services/oauth/types.ts`（11 个核心类型全 `any`）、`TerminalCaptureTool`（忽略入参恒返回空成功）、`VerifyPlanExecutionTool`（仅回显模型自我声明）。**这是最影响功能完整性的系统性问题，建议建立 stub 清单逐一核销。**
2. **`feature()` 未按 Bun 编译器约束使用**（20+ 处）：`feature()` 出现在 `&&`/`||` 链或赋值表达式中（`log.ts:160`、`toolPool.ts:72`、`Config.tsx:665`、`imagePaste.ts:103,136`、`useMergedTools.ts:38`、`PowerShellTool.tsx:451` 等）。按 AGENTS.md 这可能导致 DCE/常量折叠失效。
3. **生产代码 `as any`**（40+ 处）：违反项目规范（`cli.tsx:14`、`runAgent.ts`、`worktree.ts:1300`、`sse-writer.ts`、`inProcessRunner.ts:1567` 等）。
4. **Promise 链缺 `.catch` / fire-and-forget**（30+ 处）：交互组件与后台任务中普遍存在，未处理 rejection 会吞掉真实故障。
5. **check-then-act 竞态**（15+ 处）：文件锁、token 刷新、read-modify-write 配置更新均无互斥。
6. **XML/命令/路径拼接未转义**（10+ 处）：teammate 消息、任务通知、multipart filename、AppleScript、SendKeys、`which.ts` shell 插值等，构成分散但同源的注入面。

---

## 五、验证与更正记录

| 发现 | 复核结果 |
|---|---|
| C1 hooks-in-switch（ConsoleOAuthFlow） | ✅ 确认（读码验证） |
| C2 acp-link Manager 无鉴权绑 0.0.0.0 | ✅ 确认（读码验证） |
| ExecuteTool 吞 ask | ✅ 确认（读码验证：仅处理 deny） |
| Ctrl+C 双击退出失效 | ❌ 误报，降级 Low（主链路用 ref 版；问题在 Ink 包 stub 私有函数） |

Medium/Low 条目为单审计员产出，未经逐条复核；修复前建议对目标条目快速读码确认（附录含文件:行号与证据片段）。

## 六、修复优先级建议

1. **立即（本周）**: C1、C2、ExecuteTool ask 绕过、workflow `resumeFromRunId` 两处路径穿越、AcpAgent session 删除穿越、WebBrowserTool SSRF、AppleScript 注入、RCS `/web/bind` 鉴权与 token key 冲突
2. **下一迭代**: 17 条 High 其余项 + postinstall 下载校验、OAuth state 校验、`SAFE_ENV_VARS` 凭证剥离、Gemini usage 丢失、autocompact 分支对齐
3. **持续清理**: stub 清单核销（模式 1）、`feature()` 调用位置批量修正（可写 codemod）、`as any` 逐步收紧、Promise `.catch` 补齐
4. **流程加固**: 将"权限结果必须三分支显式处理（allow/ask/deny）""`startsWith` 路径判断必须带分隔符边界"写入评审 checklist

---

*生成方式：38 分区并行只读审计 + 关键发现人工复核。原始 344 条发现（含代码证据片段）见 audit-appendix.md。*
