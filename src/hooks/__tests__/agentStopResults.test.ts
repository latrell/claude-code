import { describe, expect, test } from 'bun:test'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from '../../tasks/types.js'
import {
  reconcileAgentStopResults,
  shouldEmitAggregateStoppedSdk,
} from '../agentStopResults.js'

function agent(
  id: string,
  status: LocalAgentTaskState['status'],
): LocalAgentTaskState {
  return {
    id,
    type: 'local_agent',
    status,
    description: id,
    startTime: 1,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    agentId: id,
    prompt: 'test',
    agentType: 'general-purpose',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  }
}

describe('reconcileAgentStopResults', () => {
  test('reports only tasks whose fresh state confirms killed', () => {
    const tasks: Record<string, TaskState> = {
      killed: agent('killed', 'killed'),
      completed: agent('completed', 'completed'),
      failed: agent('failed', 'failed'),
    }

    const result = reconcileAgentStopResults(
      ['killed', 'completed', 'failed'],
      [],
      [],
      tasks,
    )

    expect(result.stoppedIds).toEqual(['killed'])
    expect(result.failures).toEqual([])
  })

  test('turns a fulfilled-but-still-running result into a confirmation failure', () => {
    const result = reconcileAgentStopResults(['agent-1'], [], [], {
      'agent-1': agent('agent-1', 'running'),
    })

    expect(result.stoppedIds).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(String(result.failures[0]!.error)).toContain('remained running')
  })

  test('preserves kill rejections', () => {
    const error = new Error('abort failed')
    const result = reconcileAgentStopResults(
      [],
      [],
      [{ taskId: 'agent-1', error }],
      { 'agent-1': agent('agent-1', 'running') },
    )

    expect(result.failures).toEqual([{ taskId: 'agent-1', error }])
  })

  test('rejects a replacement generation after the old task became terminal', () => {
    const result = reconcileAgentStopResults([], ['agent-1'], [], {
      'agent-1': agent('agent-1', 'running'),
    })

    expect(result.stoppedIds).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(String(result.failures[0]!.error)).toContain(
      'replaced by a running execution',
    )
  })
})

describe('shouldEmitAggregateStoppedSdk', () => {
  test('replaces the suppressed SDK event only for background agents', () => {
    expect(
      shouldEmitAggregateStoppedSdk({
        ...agent('background', 'killed'),
        isBackgrounded: true,
      }),
    ).toBe(true)
    expect(
      shouldEmitAggregateStoppedSdk({
        ...agent('foreground', 'killed'),
        isBackgrounded: false,
      }),
    ).toBe(false)
  })
})
