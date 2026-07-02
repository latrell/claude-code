import { describe, expect, test } from 'bun:test'
import {
  collectLocalAgentEvictions,
  decideLocalAgentEviction,
} from '../useLocalAgentEvictionTick.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from '../../tasks/types.js'

// ── Helpers ──

const BASE_NOW = 1_000_000

function makeTask(
  overrides: Partial<LocalAgentTaskState> = {},
): LocalAgentTaskState {
  return {
    type: 'local_agent' as const,
    id: 'a-001',
    status: 'running' as const,
    description: 'Test agent',
    startTime: BASE_NOW - 10_000,
    outputFile: '/tmp/output/a-001',
    outputOffset: 0,
    notified: false,
    agentId: 'test-agent',
    agentType: 'test',
    prompt: 'test prompt',
    retrieved: false,
    isBackgrounded: true,
    retain: false,
    diskLoaded: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingMessages: [],
    ...overrides,
  }
}

// ── Tests: decideLocalAgentEviction ──

describe('decideLocalAgentEviction', () => {
  describe('terminal + notified + retain', () => {
    test('retain + NOT viewed → release', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: true,
      })
      expect(decideLocalAgentEviction(task, 'other-task', BASE_NOW)).toEqual({
        type: 'release',
        taskId: 'a-001',
      })
    })

    test('retain + currently viewed → skip', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: true,
      })
      expect(decideLocalAgentEviction(task, 'a-001', BASE_NOW)).toEqual({
        type: 'skip',
      })
    })

    test('retain + no viewingAgentTaskId → release', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: true,
      })
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'release',
        taskId: 'a-001',
      })
    })
  })

  describe('terminal + notified + !retain', () => {
    test('evictAfter past → evict', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: false,
        evictAfter: BASE_NOW - 1000, // 1s ago
      })
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'evict',
        taskId: 'a-001',
      })
    })

    test('evictAfter not yet past → skip', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: false,
        evictAfter: BASE_NOW + 30_000, // 30s in the future
      })
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'skip',
      })
    })

    test('no evictAfter (undefined) → skip', () => {
      const task = makeTask({
        status: 'completed',
        notified: true,
        retain: false,
      })
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'skip',
      })
    })
  })

  describe('non-terminal or non-notified → skip', () => {
    test('terminal + !notified → skip', () => {
      const task = makeTask({
        status: 'completed',
        notified: false,
        retain: false,
        evictAfter: BASE_NOW - 1000,
      })
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'skip',
      })
    })

    test('running + notified + retain → skip', () => {
      const task = makeTask({
        status: 'running',
        notified: true,
        retain: true,
      })
      expect(decideLocalAgentEviction(task, 'other-task', BASE_NOW)).toEqual({
        type: 'skip',
      })
    })
  })

  describe('non-local_agent task → skip', () => {
    test('local_bash task is skipped', () => {
      // Use a cast through unknown — we only need type/status/notified fields
      // for decideLocalAgentEviction, but TaskState union requires full shape.
      const task = {
        type: 'local_bash',
        id: 'b-001',
        status: 'completed',
        description: 'bash task',
        startTime: BASE_NOW,
        outputFile: '/tmp/output/b-001',
        outputOffset: 0,
        notified: true,
      } as unknown as TaskState
      expect(decideLocalAgentEviction(task, undefined, BASE_NOW)).toEqual({
        type: 'skip',
      })
    })
  })
})

// ── Tests: collectLocalAgentEvictions ──

describe('collectLocalAgentEvictions', () => {
  test('returns only non-skip actions in order', () => {
    const tasks: Record<string, TaskState> = {
      'a-running': makeTask({
        id: 'a-running',
        status: 'running',
        notified: true,
      }),
      'a-release': makeTask({
        id: 'a-release',
        status: 'completed',
        notified: true,
        retain: true,
      }),
      'a-evict': makeTask({
        id: 'a-evict',
        status: 'killed',
        notified: true,
        retain: false,
        evictAfter: BASE_NOW - 1,
      }),
      'a-skip': makeTask({
        id: 'a-skip',
        status: 'completed',
        notified: true,
        retain: false,
        // no evictAfter → skip
      }),
    }

    const actions = collectLocalAgentEvictions(tasks, undefined, BASE_NOW)
    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual({ type: 'release', taskId: 'a-release' })
    expect(actions[1]).toEqual({ type: 'evict', taskId: 'a-evict' })
  })

  test('returns empty array when no actions needed', () => {
    const tasks: Record<string, TaskState> = {
      'a-running': makeTask({ id: 'a-running', status: 'running' }),
      'a-pending': makeTask({ id: 'a-pending', status: 'pending' }),
    }
    expect(collectLocalAgentEvictions(tasks, undefined, BASE_NOW)).toEqual([])
  })

  test('respects viewingAgentTaskId — viewed task is not released', () => {
    const tasks: Record<string, TaskState> = {
      'a-viewed': makeTask({
        id: 'a-viewed',
        status: 'completed',
        notified: true,
        retain: true,
      }),
      'a-not-viewed': makeTask({
        id: 'a-not-viewed',
        status: 'completed',
        notified: true,
        retain: true,
      }),
    }

    const actions = collectLocalAgentEvictions(tasks, 'a-viewed', BASE_NOW)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({ type: 'release', taskId: 'a-not-viewed' })
  })

  test('handles empty tasks map', () => {
    expect(collectLocalAgentEvictions({}, undefined, BASE_NOW)).toEqual([])
  })
})
