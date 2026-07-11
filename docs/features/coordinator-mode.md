# COORDINATOR_MODE — 多 Agent 编排

> Feature Flag: `FEATURE_COORDINATOR_MODE=1` + 环境变量 `CLAUDE_CODE_COORDINATOR_MODE=1`
> 实现状态：编排者完整可用，worker agent 为通用 AgentTool worker
> 引用数：32

## 一、功能概述

COORDINATOR_MODE 将 CLI 变为"编排者"角色。编排者不直接操作文件，而是通过 AgentTool 派发任务给多个 worker 并行执行。适用于大型任务拆分、并行研究、实现+验证分离等场景。

### 核心约束

- 编排者只能使用：`Agent`（派发 worker）、`SendMessage`（继续 worker）、`TaskStop`（停止 worker）
- Worker 可以使用所有标准工具（Bash、Read、Edit 等）+ MCP 工具 + Skill 工具
- 编排者的每条消息都是给用户看的；worker 结果以 `<task-notification>` XML 形式到达

## 二、用户交互

### 启用方式

```bash
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev
```

需要同时设置 feature flag 和环境变量。`CLAUDE_CODE_COORDINATOR_MODE` 可在会话恢复时自动切换（`matchSessionMode`）。

### /coordinator 命令（会话级 + 全局）

会话内通过 `/coordinator` 命令切换，支持两个层级：

| 输入 | 行为 |
|------|------|
| `/coordinator` | toggle 当前会话 |
| `/coordinator on` / `off` | 显式设置当前会话（状态未变时仅报告，不重复刷新/提醒） |
| `/coordinator global` | toggle 当前会话 + 把新状态写入全局 settings |
| `/coordinator on global` / `off global` | 显式设置当前会话 + 写全局 |

**全局默认**持久化在 `settings.json` 的 `coordinatorMode` 字段（`src/coordinator/coordinatorGlobal.ts`），语义是"新会话的默认模式"：

- 启动时（`main.tsx` 主 action 早期）若 `CLAUDE_CODE_COORDINATOR_MODE` **未设置**，`applyGlobalCoordinatorDefault()` 按 settings 部署环境变量
- 显式设置的环境变量（truthy 或 falsy）始终优先——`CLAUDE_CODE_COORDINATOR_MODE=0` 可单次覆盖全局默认
- 运行时唯一真相源仍是环境变量（`isCoordinatorMode()` 实时读取）；resume 时 `matchSessionMode` 按会话存储的模式覆盖
- spawned teammate（`--agent-id`）跳过全局默认部署，不会因全局开关变成编排者

### 典型工作流

```
用户: "修复 auth 模块的 null pointer"

编排者:
  1. 并行派发两个 worker:
     - Agent({ description: "调查 auth bug", prompt: "..." })
     - Agent({ description: "研究 auth 测试", prompt: "..." })

  2. 收到 <task-notification>:
     - Worker A: "在 validate.ts:42 发现 null pointer"
     - Worker B: "测试覆盖情况..."

  3. 综合发现，继续 Worker A:
     - SendMessage({ to: "agent-a1b", message: "修复 validate.ts:42..." })

  4. 收到修复结果，派发验证:
     - Agent({ description: "验证修复", prompt: "..." })
```

## 三、实现架构

### 3.1 模式检测

文件：`src/coordinator/coordinatorMode.ts:36-41`

```ts
export function isCoordinatorMode(): boolean {
  return feature('COORDINATOR_MODE') &&
    isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
}
```

### 3.2 会话模式恢复

`matchSessionMode(sessionMode)` 在恢复旧会话时检查存储的模式，如果当前环境变量与存储不一致，自动翻转环境变量。防止在普通模式下恢复编排会话（或反之）。

### 3.3 Worker 工具集

`getCoordinatorUserContext()` 告知编排者 worker 可用的工具列表：

- **标准模式**：`ASYNC_AGENT_ALLOWED_TOOLS` 排除内部工具（TeamCreate、TeamDelete、SendMessage、SyntheticOutput）
- **Simple 模式**（`CLAUDE_CODE_SIMPLE=1`）：仅 Bash、Read、Edit
- **MCP 工具**：列出已连接的 MCP 服务器名称
- **Scratchpad**：如果 GrowthBook `tengu_scratch` 启用，提供跨 worker 共享的 scratchpad 目录

### 3.4 系统提示

文件：`src/coordinator/coordinatorMode.ts:111-369`

编排者系统提示（`getCoordinatorSystemPrompt()`）约 370 行，包含：

| 章节 | 内容 |
|------|------|
| 1. Your Role | 编排者职责定义 |
| 2. Your Tools | Agent/SendMessage/TaskStop 使用说明 |
| 3. Workers | Worker 能力和限制 |
| 4. Task Workflow | Research → Synthesis → Implementation → Verification 流程 |
| 5. Writing Worker Prompts | 自包含 prompt 编写指南 + 好坏示例对比 |
| 6. Example Session | 完整示例对话 |

### 3.5 Worker Agent

文件：`src/coordinator/workerAgent.ts`

当前为 stub。Worker 实际使用通用 AgentTool 的 `worker` subagent_type。

### 3.6 数据流

```
用户消息
      │
      ▼
编排者 REPL（受限工具集）
      │
      ├──→ Agent({ subagent_type: "worker", prompt: "..." })
      │         │
      │         ▼
      │    Worker Agent（完整工具集）
      │    ├── 执行任务（Bash/Read/Edit/...）
      │    └── 返回 <task-notification>
      │
      ├──→ SendMessage({ to: "agent-id", message: "..." })
      │         │
      │         ▼
      │    继续已存在的 Worker
      │
      └──→ TaskStop({ task_id: "agent-id" })
                │
                ▼
           停止运行中的 Worker
```

## 四、关键设计决策

1. **双开关设计**：feature flag 控制代码可用性，环境变量控制实际激活。允许编译时包含但不默认启用
2. **编排者受限**：只能用 Agent/SendMessage/TaskStop，确保编排者专注于派发而非执行
3. **Worker 不可见编排者对话**：每个 worker 的 prompt 必须自包含（所有必要上下文）
4. **并行优先**：系统提示强调"Parallelism is your superpower"，鼓励并行派发独立任务
5. **综合而非转发**：编排者必须理解 worker 发现，再写出具体的实现指令。禁止 "based on your findings" 类懒惰委托
6. **Scratchpad 可选共享**：通过 GrowthBook 门控的共享目录，让 worker 之间持久化共享知识

## 五、使用方式

```bash
# 基本启用
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev

# 配合 Fork Subagent
FEATURE_COORDINATOR_MODE=1 FEATURE_FORK_SUBAGENT=1 \
CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev

# Simple 模式（worker 只有 Bash/Read/Edit）
FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 \
CLAUDE_CODE_SIMPLE=1 bun run dev
```

会话内命令：

```
/coordinator              # toggle 当前会话
/coordinator on global    # 开启并设为全局默认（写 settings.json）
/coordinator off          # 仅关闭当前会话（全局默认不变）
/coordinator off global   # 关闭并清除全局默认
```

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/coordinator/coordinatorMode.ts` | 370 | 模式检测 + 系统提示 + 用户上下文 |
| `src/coordinator/coordinatorGlobal.ts` | — | 全局默认持久化（settings.coordinatorMode 读写 + 启动部署） |
| `src/coordinator/workerAgent.ts` | — | Worker agent 定义（stub） |
| `src/commands/coordinator.ts` | — | /coordinator 命令（会话级 + 全局参数解析） |
| `src/constants/tools.ts` | — | `ASYNC_AGENT_ALLOWED_TOOLS` 工具白名单 |
