import { describe, expect, test } from 'bun:test'
import { decideTeammateAutoExit } from '../useTeammateViewAutoExit.js'
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskStateBase } from '../../Task.js'

// ── Helpers ──

function makeTeammate(
  overrides: Partial<InProcessTeammateTaskState> = {},
): InProcessTeammateTaskState {
  return {
    type: 'in_process_teammate' as const,
    id: 't-001',
    status: 'running' as const,
    description: 'Test teammate',
    startTime: Date.now(),
    outputFile: '/tmp/output/t-001',
    outputOffset: 0,
    notified: false,
    identity: {
      agentId: 'test@team',
      agentName: 'test',
      teamName: 'team',
      planModeRequired: false,
      parentSessionId: 'leader',
    },
    prompt: 'test prompt',
    awaitingPlanApproval: false,
    permissionMode: 'default',
    isIdle: false,
    shutdownRequested: false,
    pendingUserMessages: [],
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    ...overrides,
  }
}

function makeLocalAgent(
  overrides: Partial<LocalAgentTaskState> = {},
): LocalAgentTaskState {
  return {
    type: 'local_agent' as const,
    id: 'a-001',
    status: 'running' as const,
    description: 'Test agent',
    startTime: Date.now(),
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

// ── Tests ──

describe('decideTeammateAutoExit', () => {
  describe('in_process_teammate', () => {
    test('killed teammate → exit-now', () => {
      const task = makeTeammate({ status: 'killed' })
      expect(decideTeammateAutoExit(task)).toBe('exit-now')
    })

    test('failed teammate → exit-now', () => {
      const task = makeTeammate({ status: 'failed' })
      expect(decideTeammateAutoExit(task)).toBe('exit-now')
    })

    test('teammate with error → exit-now', () => {
      const task = makeTeammate({ error: 'Something broke' })
      expect(decideTeammateAutoExit(task)).toBe('exit-now')
    })

    test('completed teammate → stay (user reviews transcript)', () => {
      const task = makeTeammate({ status: 'completed' })
      expect(decideTeammateAutoExit(task)).toBe('stay')
    })

    test('running teammate → stay', () => {
      const task = makeTeammate({ status: 'running' })
      expect(decideTeammateAutoExit(task)).toBe('stay')
    })

    test('pending teammate → stay', () => {
      const task = makeTeammate({ status: 'pending' })
      expect(decideTeammateAutoExit(task)).toBe('stay')
    })
  })

  describe('local_agent', () => {
    test('completed local_agent → exit-after-grace', () => {
      const task = makeLocalAgent({ status: 'completed' })
      expect(decideTeammateAutoExit(task)).toBe('exit-after-grace')
    })

    test('failed local_agent → exit-after-grace', () => {
      const task = makeLocalAgent({ status: 'failed' })
      expect(decideTeammateAutoExit(task)).toBe('exit-after-grace')
    })

    test('killed local_agent → exit-after-grace', () => {
      const task = makeLocalAgent({ status: 'killed' })
      expect(decideTeammateAutoExit(task)).toBe('exit-after-grace')
    })

    test('running local_agent → stay', () => {
      const task = makeLocalAgent({ status: 'running' })
      expect(decideTeammateAutoExit(task)).toBe('stay')
    })

    test('pending local_agent → stay', () => {
      const task = makeLocalAgent({ status: 'pending' })
      expect(decideTeammateAutoExit(task)).toBe('stay')
    })
  })

  describe('edge cases', () => {
    test('undefined task (evicted) → exit-now', () => {
      expect(decideTeammateAutoExit(undefined)).toBe('exit-now')
    })

    test('null task → exit-now', () => {
      expect(decideTeammateAutoExit(null)).toBe('exit-now')
    })

    test('unknown task type → stay', () => {
      const unknownTask = { type: 'local_bash', status: 'failed' }
      expect(decideTeammateAutoExit(unknownTask)).toBe('stay')
    })
  })
})
