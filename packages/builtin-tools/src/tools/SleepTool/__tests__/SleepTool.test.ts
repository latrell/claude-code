import { beforeEach, describe, expect, test } from 'bun:test'
import { SleepTool } from '../SleepTool'
import {
  enqueue,
  getCommandQueue,
  resetCommandQueue,
} from 'src/utils/messageQueueManager.js'

describe('SleepTool', () => {
  beforeEach(() => {
    resetCommandQueue()
  })

  test('declares cancel interrupt behavior', () => {
    expect(SleepTool.interruptBehavior()).toBe('cancel')
  })

  test('wakes early when queued work arrives', async () => {
    const sleepPromise = SleepTool.call({ duration_seconds: 10 }, {
      abortController: new AbortController(),
    } as any)

    setTimeout(() => {
      enqueue({
        value: 'wake up',
        mode: 'prompt',
      })
    }, 20)

    const result = await sleepPromise

    expect(result.data.interrupted).toBe(true)
    expect(result.data.slept_seconds).toBeLessThan(10)
    expect(getCommandQueue()).toHaveLength(1)
    expect(getCommandQueue()[0]).toMatchObject({
      value: 'wake up',
      mode: 'prompt',
    })
  })

  test('ignores queued work addressed to another conversation owner', async () => {
    const sleepPromise = SleepTool.call({ duration_seconds: 0.65 }, {
      abortController: new AbortController(),
      agentId: undefined,
    } as any)

    setTimeout(() => {
      enqueue({
        value: 'private wake up',
        mode: 'task-notification',
        agentId: 'other-agent' as any,
      })
    }, 20)

    const result = await sleepPromise

    expect(result.data.interrupted).toBe(false)
  })

  test('wakes for queued work addressed to the sleeping subagent', async () => {
    const sleepPromise = SleepTool.call({ duration_seconds: 10 }, {
      abortController: new AbortController(),
      agentId: 'sleeping-agent',
    } as any)

    setTimeout(() => {
      enqueue({
        value: 'private wake up',
        mode: 'task-notification',
        agentId: 'sleeping-agent' as any,
      })
    }, 20)

    const result = await sleepPromise

    expect(result.data.interrupted).toBe(true)
    expect(result.data.slept_seconds).toBeLessThan(10)
  })
})
