import { randomUUID, type UUID } from 'node:crypto'
import type { UserMessage } from '../../types/message.js'
import { getResolvedLanguage } from '../../utils/language.js'

export function buildSummaryPrompt(previousSummary: string | null): string {
  const lang = getResolvedLanguage()
  const prevLine = previousSummary
    ? `\nPrevious: "${previousSummary}" — say something NEW.\n`
    : ''

  if (lang === 'zh') {
    return `请用中文简要描述你最近的操作，使用 3-8 个字或包含文件名的短语。不要使用工具。
${prevLine}
Good: "读取 runAgent.ts"
Good: "修复 validate.ts 空指针"
Good: "运行 auth 模块测试"
Good: "添加 fetchUser 重试逻辑"
Good: "运行 precheck"

Bad (过长): "全面审查分支差异与 AgentTool.tsx 集成"
Bad (分支名): "分析 adam/background-summary 分支差异"
Bad (过于模糊): "调查问题"
Bad (过去式): "分析了分支差异"`
  }

  return `Describe your most recent action in 3-5 words using present tense (-ing). Name the file or function, not the branch. Do not use tools.
${prevLine}
Good: "Reading runAgent.ts"
Good: "Fixing null check in validate.ts"
Good: "Running auth module tests"
Good: "Adding retry logic to fetchUser"

Bad (past tense): "Analyzed the branch diff"
Bad (too vague): "Investigating the issue"
Bad (too long): "Reviewing full branch diff and AgentTool.tsx integration"
Bad (branch name): "Analyzed adam/background-summary branch diff"`
}

export function createSummaryPromptMessage(content: string): UserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    uuid: randomUUID() as UUID,
    timestamp: new Date().toISOString(),
  }
}
