import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  enqueue,
  enqueuePendingNotification,
  reactivateParkedTaskNotifications,
  releaseDueTaskNotificationRetries,
  resetCommandQueue,
} from '../messageQueueManager.js'
import {
  hasQueuedCommands,
  processQueueIfReady,
  TaskNotificationDeliveryParkedError,
} from '../queueProcessor.js'

beforeEach(() => {
  resetCommandQueue()
})

afterEach(() => {
  resetCommandQueue()
})

describe('processQueueIfReady', () => {
  test('returns processed:false when queue empty', () => {
    const result = processQueueIfReady({
      executeInput: async () => {},
    })
    expect(result.processed).toBe(false)
  })

  test('processes single slash command individually', () => {
    const executed: string[][] = []
    enqueue({ value: '/help', mode: 'prompt' } as any)

    const result = processQueueIfReady({
      executeInput: async cmds => {
        executed.push(cmds.map(c => c.value as string))
      },
    })

    expect(result.processed).toBe(true)
    expect(executed).toHaveLength(1)
    expect(executed[0]).toEqual(['/help'])
  })

  test('does not batch prompts across a slash command', () => {
    const executed: string[][] = []
    const executeInput = async (commands: any[]) => {
      executed.push(commands.map(command => command.value as string))
    }
    enqueue({ value: 'old prompt', mode: 'prompt' } as any)
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueue({ value: 'new prompt', mode: 'prompt' } as any)

    processQueueIfReady({ executeInput })
    expect(executed).toEqual([['old prompt']])

    processQueueIfReady({ executeInput })
    expect(executed).toEqual([['old prompt'], ['/clear']])

    processQueueIfReady({ executeInput })
    expect(executed).toEqual([['old prompt'], ['/clear'], ['new prompt']])
  })

  test('processes a reset barrier before higher-priority commands submitted later', () => {
    const executed: string[][] = []
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueue({
      value: 'new urgent prompt',
      mode: 'prompt',
      priority: 'now',
    } as any)

    processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
      },
    })

    expect(executed).toEqual([['/clear']])
  })

  test('retains priority ordering for non-reset slash commands', () => {
    const executed: string[][] = []
    enqueue({ value: '/help', mode: 'prompt' } as any)
    enqueue({
      value: 'urgent prompt',
      mode: 'prompt',
      priority: 'now',
    } as any)

    processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
      },
    })

    expect(executed).toEqual([['urgent prompt']])
  })

  test('processes bash mode command individually', () => {
    const executed: string[][] = []
    enqueue({ value: 'git status', mode: 'bash' } as any)

    const result = processQueueIfReady({
      executeInput: async cmds => {
        executed.push(cmds.map(c => c.value as string))
      },
    })

    expect(result.processed).toBe(true)
    expect(executed).toHaveLength(1)
    expect(executed[0]).toEqual(['git status'])
  })

  test('batches commands with same mode', () => {
    const executed: string[][] = []
    enqueuePendingNotification({
      value: '<task1/>',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: '<task2/>',
      mode: 'task-notification',
    } as any)

    const result = processQueueIfReady({
      executeInput: async cmds => {
        executed.push(cmds.map(c => c.value as string))
      },
    })

    expect(result.processed).toBe(true)
    expect(executed).toHaveLength(1)
    expect(executed[0]).toEqual(['<task1/>', '<task2/>'])
  })

  test('retries an async pre-query notification failure once', async () => {
    const failure = new Error('notification continuation failed')
    const executed: string[][] = []
    let attempts = 0
    let generation = 0
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const result = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
        attempts++
        if (attempts === 1) throw failure
      },
      getExecutionGeneration: () => generation,
    })

    expect(result.processed).toBe(true)
    if (!result.processed) throw new Error('Expected queued command execution')
    await expect(result.execution).rejects.toBe(failure)
    expect(hasQueuedCommands()).toBe(false)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retry = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
        attempts++
        generation++
      },
      getExecutionGeneration: () => generation,
    })
    expect(retry.processed).toBe(true)
    if (!retry.processed) throw new Error('Expected notification retry')
    await retry.execution

    expect(executed).toEqual([
      ['<task-notification/>'],
      ['<task-notification/>'],
    ])
    expect(attempts).toBe(2)
    expect(hasQueuedCommands()).toBe(false)
  })

  test('retries a synchronous pre-query notification failure', async () => {
    const failure = new Error('sync preprocessing failed')
    let attempts = 0
    let generation = 0
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const failed = processQueueIfReady({
      executeInput: () => {
        attempts++
        throw failure
      },
      getExecutionGeneration: () => generation,
    })
    expect(failed.processed).toBe(true)
    if (!failed.processed) throw new Error('Expected notification execution')
    await expect(failed.execution).rejects.toBe(failure)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retry = processQueueIfReady({
      executeInput: async () => {
        attempts++
        generation++
      },
      getExecutionGeneration: () => generation,
    })
    expect(retry.processed).toBe(true)
    if (!retry.processed) throw new Error('Expected notification retry')
    await retry.execution
    expect(attempts).toBe(2)
  })

  test('retries a fulfilled notification that never committed onQuery', async () => {
    let generation = 0
    let attempts = 0
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const uncommitted = processQueueIfReady({
      executeInput: async () => {
        attempts++
      },
      getExecutionGeneration: () => generation,
    })
    expect(uncommitted.processed).toBe(true)
    if (!uncommitted.processed) {
      throw new Error('Expected notification execution')
    }
    await uncommitted.execution
    expect(hasQueuedCommands()).toBe(false)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retry = processQueueIfReady({
      executeInput: async () => {
        attempts++
        generation++
      },
      getExecutionGeneration: () => generation,
    })
    expect(retry.processed).toBe(true)
    if (!retry.processed) throw new Error('Expected notification retry')
    await retry.execution
    expect(attempts).toBe(2)
    expect(hasQueuedCommands()).toBe(false)
  })

  test('acks a post-query notification failure without redelivery', async () => {
    const failure = new Error('model turn failed after commit')
    let generation = 0
    let attempts = 0
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const result = processQueueIfReady({
      executeInput: async () => {
        attempts++
        generation++
        throw failure
      },
      getExecutionGeneration: () => generation,
    })
    expect(result.processed).toBe(true)
    if (!result.processed) throw new Error('Expected notification execution')
    await expect(result.execution).rejects.toBe(failure)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    expect(hasQueuedCommands()).toBe(false)
    expect(
      processQueueIfReady({
        executeInput: async () => {
          attempts++
        },
        getExecutionGeneration: () => generation,
      }).processed,
    ).toBe(false)
    expect(attempts).toBe(1)
  })

  test('keeps failed batch order while user input wins the retry boundary', async () => {
    const failure = new Error('pre-query batch failure')
    const executed: string[][] = []
    let generation = 0
    enqueuePendingNotification({
      value: '<task1/>',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: '<task2/>',
      mode: 'task-notification',
    } as any)

    const failed = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
        throw failure
      },
      getExecutionGeneration: () => generation,
    })
    expect(failed.processed).toBe(true)
    if (!failed.processed) throw new Error('Expected notification execution')
    await expect(failed.execution).rejects.toBe(failure)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    enqueue({ value: 'user prompt', mode: 'prompt' } as any)
    const user = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
      },
      getExecutionGeneration: () => generation,
    })
    expect(user.processed).toBe(true)
    if (!user.processed) throw new Error('Expected user command execution')
    await user.execution

    const retry = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
        generation++
      },
      getExecutionGeneration: () => generation,
    })
    expect(retry.processed).toBe(true)
    if (!retry.processed) throw new Error('Expected notification retry')
    await retry.execution
    expect(executed).toEqual([
      ['<task1/>', '<task2/>'],
      ['user prompt'],
      ['<task1/>', '<task2/>'],
    ])
  })

  test('parks after one automatic retry until explicit external input activity', async () => {
    const failure = new Error('persistent pre-query failure')
    let notificationAttempts = 0
    const failNotification = async () => {
      notificationAttempts++
      throw failure
    }
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const first = processQueueIfReady({
      executeInput: failNotification,
      getExecutionGeneration: () => 0,
    })
    expect(first.processed).toBe(true)
    if (!first.processed) throw new Error('Expected notification execution')
    await expect(first.execution).rejects.toBe(failure)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const second = processQueueIfReady({
      executeInput: failNotification,
      getExecutionGeneration: () => 0,
    })
    expect(second.processed).toBe(true)
    if (!second.processed) throw new Error('Expected notification retry')
    await expect(second.execution).rejects.toMatchObject({
      name: 'TaskNotificationDeliveryParkedError',
      cause: failure,
    })
    await expect(second.execution).rejects.toBeInstanceOf(
      TaskNotificationDeliveryParkedError,
    )

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    expect(hasQueuedCommands()).toBe(false)
    expect(
      processQueueIfReady({
        executeInput: failNotification,
        getExecutionGeneration: () => 0,
      }).processed,
    ).toBe(false)
    expect(notificationAttempts).toBe(2)

    const executed: string[][] = []
    enqueue({ value: 'wake with user input', mode: 'prompt' } as any)
    reactivateParkedTaskNotifications()
    const user = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
      },
      getExecutionGeneration: () => 0,
    })
    expect(user.processed).toBe(true)
    if (!user.processed) throw new Error('Expected user command execution')
    await user.execution

    const reactivated = processQueueIfReady({
      executeInput: async commands => {
        executed.push(commands.map(command => command.value as string))
        notificationAttempts++
      },
      getExecutionGeneration: () => 0,
    })
    expect(reactivated.processed).toBe(true)
    if (!reactivated.processed) {
      throw new Error('Expected reactivated notification')
    }
    await reactivated.execution
    expect(executed).toEqual([
      ['wake with user input'],
      ['<task-notification/>'],
    ])
    expect(notificationAttempts).toBe(3)
  })

  test('preserves a notification when live execution became active after render', async () => {
    const executed: string[][] = []
    let executionActive = true
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)

    const executeInput = async (commands: any[]) => {
      executed.push(commands.map(command => command.value as string))
    }
    const isExecutionActive = () => executionActive

    const deferred = processQueueIfReady({
      executeInput,
      isExecutionActive,
    })
    expect(deferred.processed).toBe(false)
    expect(executed).toHaveLength(0)
    expect(hasQueuedCommands()).toBe(true)

    executionActive = false
    const resumed = processQueueIfReady({
      executeInput,
      isExecutionActive,
    })
    expect(resumed.processed).toBe(true)
    if (!resumed.processed) throw new Error('Expected deferred notification')
    await resumed.execution
    expect(executed).toEqual([['<task-notification/>']])
  })

  test('does not mix different modes in same batch', () => {
    const executed: string[][] = []
    enqueue({ value: 'hello', mode: 'prompt' } as any)
    enqueuePendingNotification({
      value: '<task/>',
      mode: 'task-notification',
    } as any)

    const result = processQueueIfReady({
      executeInput: async cmds => {
        executed.push(cmds.map(c => c.value as string))
      },
    })

    expect(result.processed).toBe(true)
    // Only the 'prompt' mode command should be processed (higher priority than task-notification)
    expect(executed).toHaveLength(1)
    expect(executed[0]).toEqual(['hello'])

    // The task-notification is still in queue
    expect(hasQueuedCommands()).toBe(true)
  })

  test('skips commands with agentId set (subagent notifications)', () => {
    // This simulates the v2.1.119 fix: subagent task-notification with agentId
    // should not be processed by the main thread queue processor
    enqueuePendingNotification({
      value: '<task-notification>subagent result</task-notification>',
      mode: 'task-notification',
      agentId: 'agent-123',
    } as any)

    const result = processQueueIfReady({
      executeInput: async () => {},
    })

    // Should not process — it's a subagent notification
    expect(result.processed).toBe(false)
  })

  test('returns processed:false when only subagent commands in queue', () => {
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
      agentId: 'agent-456',
    } as any)
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
      agentId: 'agent-789',
    } as any)

    const result = processQueueIfReady({
      executeInput: async () => {},
    })

    expect(result.processed).toBe(false)
    expect(hasQueuedCommands()).toBe(true)
  })

  test('processes main-thread command but skips subagent command', () => {
    const executed: string[][] = []
    enqueuePendingNotification({
      value: '<main-task/>',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: '<sub-task/>',
      mode: 'task-notification',
      agentId: 'agent-123',
    } as any)

    const result = processQueueIfReady({
      executeInput: async cmds => {
        executed.push(cmds.map(c => c.value as string))
      },
    })

    expect(result.processed).toBe(true)
    expect(executed).toHaveLength(1)
    expect(executed[0]).toEqual(['<main-task/>'])

    // Subagent command still in queue
    expect(hasQueuedCommands()).toBe(true)
  })
})

describe('hasQueuedCommands', () => {
  test('returns false when queue empty', () => {
    expect(hasQueuedCommands()).toBe(false)
  })

  test('returns true when commands in queue', () => {
    enqueue({ value: 'hello', mode: 'prompt' } as any)
    expect(hasQueuedCommands()).toBe(true)
  })
})
