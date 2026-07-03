import { describe, expect, mock, test } from 'bun:test'

import type { Tool } from '../../Tool.js'

// Helper to create minimal tool objects for filtering tests.
// Cast via `as any` to satisfy the full Tool interface without importing
// the entire tool infrastructure chain.
function tool(name: string): Tool {
  return { name } as any as Tool
}

// Mock bun:bundle to enable COORDINATOR_MODE. The real coordinatorMode module's
// isCoordinatorMode() checks feature('COORDINATOR_MODE') first, then reads
// process.env.CLAUDE_CODE_COORDINATOR_MODE via isEnvTruthy.
mock.module('bun:bundle', () => ({
  feature(_name: string): boolean {
    if (_name === 'COORDINATOR_MODE') return true
    return false
  },
}))

import { applyCoordinatorToolFilter, mergeAndFilterTools } from '../toolPool.js'
import { COORDINATOR_MODE_ALLOWED_TOOLS } from '../../constants/tools.js'

// The real coordinator-allowed tool names (from constants)
// AGENT_TOOL_NAME = 'Agent'
// TASK_STOP_TOOL_NAME = 'TaskStop'
// SEND_MESSAGE_TOOL_NAME = 'SendMessage'
// SYNTHETIC_OUTPUT_TOOL_NAME = 'StructuredOutput'

describe('applyCoordinatorToolFilter', () => {
  test('filters to only coordinator-allowed tools', () => {
    const tools = [
      tool('Bash'),
      tool('Read'),
      tool('Write'),
      tool('Agent'),
      tool('TaskStop'),
      tool('Glob'),
      tool('Grep'),
      tool('Skill'),
      tool('SendMessage'),
      tool('StructuredOutput'),
      tool('mcp__some_server__do_thing'),
      tool('mcp__github__subscribe_pr_activity'),
    ]

    const result = applyCoordinatorToolFilter(tools)

    const names = result.map(t => t.name)
    // Coordinator-allowed tools
    expect(names).toContain('Agent')
    expect(names).toContain('TaskStop')
    expect(names).toContain('SendMessage')
    expect(names).toContain('StructuredOutput')
    // PR activity subscription tool should pass (orchestration)
    expect(names).toContain('mcp__github__subscribe_pr_activity')
    // Regular tools and non-orchestration MCP tools should be filtered out
    expect(names).not.toContain('Bash')
    expect(names).not.toContain('Read')
    expect(names).not.toContain('Write')
    expect(names).not.toContain('Glob')
    expect(names).not.toContain('Grep')
    expect(names).not.toContain('Skill')
    expect(names).not.toContain('mcp__some_server__do_thing')
  })

  test('allows unsubscribe_pr_activity as PR subscription tool', () => {
    const tools = [
      tool('mcp__github__unsubscribe_pr_activity'),
      tool('mcp__gitlab__subscribe_pr_activity'),
    ]

    const result = applyCoordinatorToolFilter(tools)
    const names = result.map(t => t.name)

    expect(names).toContain('mcp__github__unsubscribe_pr_activity')
    expect(names).toContain('mcp__gitlab__subscribe_pr_activity')
  })

  test('COORDINATOR_MODE_ALLOWED_TOOLS contains expected tool names', () => {
    expect(COORDINATOR_MODE_ALLOWED_TOOLS.has('Agent')).toBe(true)
    expect(COORDINATOR_MODE_ALLOWED_TOOLS.has('TaskStop')).toBe(true)
    expect(COORDINATOR_MODE_ALLOWED_TOOLS.has('SendMessage')).toBe(true)
    expect(COORDINATOR_MODE_ALLOWED_TOOLS.has('StructuredOutput')).toBe(true)
    expect(COORDINATOR_MODE_ALLOWED_TOOLS.has('Bash')).toBe(false)
  })
})

describe('mergeAndFilterTools', () => {
  test('without coordinator mode, returns all tools merged and deduplicated', () => {
    const initial = [tool('Bash'), tool('Read'), tool('Glob')]
    const assembled = [
      tool('Glob'),
      tool('Grep'),
      tool('Write'),
      tool('mcp__server__fetch'),
    ]

    const result = mergeAndFilterTools(initial, assembled, 'default')

    const names = result.map(t => t.name)
    expect(names).toContain('Bash')
    expect(names).toContain('Read')
    expect(names).toContain('Glob')
    expect(names).toContain('Grep')
    expect(names).toContain('Write')
    expect(names).toContain('mcp__server__fetch')
    // Deduplication: Glob appears only once
    expect(names.filter(n => n === 'Glob')).toHaveLength(1)
  })

  test('merge gives initialTools precedence over assembled for same-named tools', () => {
    // Both pools have 'Agent' — initialTools version should win
    const initial = [tool('Agent')]
    const assembled = [tool('Agent')]

    const result = mergeAndFilterTools(initial, assembled, 'default')

    // Agent appears once (deduplicated), and it's from initialTools (first in uniqBy)
    const names = result.map(t => t.name)
    expect(names).toHaveLength(1)
    expect(names[0]).toBe('Agent')
  })

  test('partitions tools: built-ins first, then MCP tools, each sorted by name', () => {
    const initial = [tool('Zulu'), tool('mcp__alpha')]
    const assembled = [tool('Alpha'), tool('mcp__zed')]

    const result = mergeAndFilterTools(initial, assembled, 'default')

    const names = result.map(t => t.name)
    // Built-ins sorted: Alpha, Zulu (from both pools, initial wins on Zulu)
    // MCP tools sorted: mcp__alpha, mcp__zed
    expect(names).toEqual(['Alpha', 'Zulu', 'mcp__alpha', 'mcp__zed'])
  })
})

describe('coordinator mode filtering integration (pure function)', () => {
  // These tests verify that the coordinator filtering logic is correctly
  // composed: applyCoordinatorToolFilter is what mergeAndFilterTools delegates
  // to when coordinator mode is active. Since the module-level require of
  // coordinatorMode.js can't be cleanly mocked across different specifier
  // contexts in Bun tests, we verify the filter function directly and test
  // composition by asserting the expected behavior contract.

  test('applyCoordinatorToolFilter returns a subset of the input', () => {
    const tools = [tool('Bash'), tool('Agent'), tool('Read'), tool('TaskStop')]
    const result = applyCoordinatorToolFilter(tools)
    expect(result.length).toBeLessThanOrEqual(tools.length)
    for (const t of result) {
      expect(tools).toContain(t)
    }
  })

  test('coordinator-allowed tools is a fixed, known set', () => {
    // This documents the final filtering outcome: in coordinator mode,
    // only Agent, TaskStop, SendMessage, StructuredOutput, and
    // PR-activity MCP tools survive.
    const names = Array.from(COORDINATOR_MODE_ALLOWED_TOOLS).sort()
    expect(names).toEqual(
      ['Agent', 'SendMessage', 'StructuredOutput', 'TaskStop'].sort(),
    )
  })
})
