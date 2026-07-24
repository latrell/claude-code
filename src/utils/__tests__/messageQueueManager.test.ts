import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  captureConversationClearQueueBarrier,
  commitTaskNotificationLease,
  clearCommandQueue,
  clearCommandsForConversationReset,
  dequeue,
  dequeueAllMatching,
  discardParkedTaskNotificationsAddressedTo,
  enqueue,
  enqueuePendingNotification,
  getCommandsByMaxPriorityBeforeConversationReset,
  hasCommandsAddressedTo,
  hasCommandsInQueue,
  hasParkedTaskNotificationDeliveryAddressedTo,
  hasRetryingTaskNotificationDeliveryAddressedTo,
  hasTaskNotificationDeliveryAddressedTo,
  isConversationResetCommand,
  isSlashCommand,
  leaseTaskNotificationBatch,
  peek,
  popAllEditable,
  reactivateParkedTaskNotifications,
  releaseDueTaskNotificationRetries,
  resetCommandQueue,
  retryTaskNotificationLease,
  stampCommandQueuePosition,
} from '../messageQueueManager.js'

// Reset module-level queue state between tests
beforeEach(() => {
  resetCommandQueue()
})

afterEach(() => {
  resetCommandQueue()
})

function parkTaskNotification(value: string, agentId?: any): void {
  enqueuePendingNotification({
    value,
    mode: 'task-notification',
    agentId,
  } as any)
  const firstLease = leaseTaskNotificationBatch(
    command => command.agentId === agentId && command.value === value,
  )
  expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
  releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
  const retryLease = leaseTaskNotificationBatch(
    command => command.agentId === agentId && command.value === value,
  )
  expect(retryTaskNotificationLease(retryLease!)).toBe('parked')
}

describe('messageQueueManager.isSlashCommand', () => {
  test('treats normal slash commands as slash commands', () => {
    expect(isSlashCommand({ value: '/help', mode: 'prompt' } as any)).toBe(true)
  })

  test('keeps remote bridge slash commands slash-routed when bridgeOrigin is set', () => {
    expect(
      isSlashCommand({
        value: '/proactive',
        mode: 'prompt',
        skipSlashCommands: true,
        bridgeOrigin: true,
      } as any),
    ).toBe(true)
  })

  test('keeps skipSlashCommands text-only when bridgeOrigin is absent', () => {
    expect(
      isSlashCommand({
        value: '/proactive',
        mode: 'prompt',
        skipSlashCommands: true,
      } as any),
    ).toBe(false)
  })

  test('recognizes slash commands in content block input', () => {
    expect(
      isSlashCommand({
        value: [{ type: 'text', text: '/clear' }],
        mode: 'prompt',
      } as any),
    ).toBe(true)
  })
})

describe('messageQueueManager.isConversationResetCommand', () => {
  test('recognizes clear and its aliases only', () => {
    for (const value of ['/clear', '/reset', '/new', '/clear now']) {
      expect(isConversationResetCommand({ value, mode: 'prompt' } as any)).toBe(
        true,
      )
    }
    for (const value of ['/help', '/CLEAR', '/clear\nnow']) {
      expect(isConversationResetCommand({ value, mode: 'prompt' } as any)).toBe(
        false,
      )
    }
  })
})

describe('messageQueueManager.enqueue', () => {
  test('adds command to queue with default next priority', () => {
    enqueue({ value: 'hello', mode: 'prompt' } as any)
    expect(hasCommandsInQueue()).toBe(true)
    const cmd = dequeue()
    expect(cmd).toBeDefined()
    expect(cmd!.value).toBe('hello')
    expect(cmd!.priority).toBe('next')
  })

  test('preserves explicit priority', () => {
    enqueue({ value: 'urgent', mode: 'prompt', priority: 'now' } as any)
    const cmd = dequeue()
    expect(cmd!.priority).toBe('now')
  })
})

describe('messageQueueManager.enqueuePendingNotification', () => {
  test('adds command with later priority', () => {
    enqueuePendingNotification({
      value: '<task-notification/>',
      mode: 'task-notification',
    } as any)
    const cmd = dequeue()
    expect(cmd).toBeDefined()
    expect(cmd!.priority).toBe('later')
    expect(cmd!.mode).toBe('task-notification')
  })
})

describe('messageQueueManager.hasCommandsAddressedTo', () => {
  test('isolates main-thread and subagent queue ownership', () => {
    enqueuePendingNotification({
      value: 'private completion',
      mode: 'task-notification',
      agentId: 'agent-1' as any,
    })

    expect(hasCommandsInQueue()).toBe(true)
    expect(hasCommandsAddressedTo(undefined)).toBe(false)
    expect(hasCommandsAddressedTo('agent-1' as any)).toBe(true)

    enqueuePendingNotification({
      value: 'main completion',
      mode: 'task-notification',
    })

    expect(hasCommandsAddressedTo(undefined)).toBe(true)
  })
})

describe('messageQueueManager task notification delivery ownership', () => {
  test('tracks scheduled, retrying, and parked delivery independent of selectability', () => {
    enqueuePendingNotification({
      value: 'main completion',
      mode: 'task-notification',
    } as any)
    expect(hasRetryingTaskNotificationDeliveryAddressedTo(undefined)).toBe(
      false,
    )
    expect(hasParkedTaskNotificationDeliveryAddressedTo(undefined)).toBe(false)
    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(false)

    const firstLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    expect(peek()).toBeUndefined()
    expect(hasRetryingTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
    expect(
      hasRetryingTaskNotificationDeliveryAddressedTo('agent-1' as any),
    ).toBe(false)
    expect(hasParkedTaskNotificationDeliveryAddressedTo(undefined)).toBe(false)
    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)

    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retryLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(retryLease!)).toBe('parked')
    expect(peek()).toBeUndefined()
    expect(hasRetryingTaskNotificationDeliveryAddressedTo(undefined)).toBe(
      false,
    )
    expect(hasParkedTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
    expect(hasParkedTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(
      false,
    )
    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
  })

  test('tracks an active lease until ACK', () => {
    enqueuePendingNotification({
      value: 'private completion',
      mode: 'task-notification',
      agentId: 'agent-1' as any,
    })
    const lease = leaseTaskNotificationBatch(
      command => command.agentId === ('agent-1' as any),
    )
    expect(lease).toBeDefined()
    expect(
      hasRetryingTaskNotificationDeliveryAddressedTo('agent-1' as any),
    ).toBe(false)
    expect(hasParkedTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(
      false,
    )
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(true)
    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(false)

    commitTaskNotificationLease(lease!)

    expect(
      hasRetryingTaskNotificationDeliveryAddressedTo('agent-1' as any),
    ).toBe(false)
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(false)
  })

  test('reset clears queued and actively leased delivery state', () => {
    enqueuePendingNotification({
      value: 'queued completion',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: 'leased completion',
      mode: 'task-notification',
      agentId: 'agent-1' as any,
    })
    expect(
      leaseTaskNotificationBatch(
        command => command.agentId === ('agent-1' as any),
      ),
    ).toBeDefined()

    resetCommandQueue()

    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(false)
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(false)
  })

  test('internal enqueue does not reactivate parked delivery', () => {
    parkTaskNotification('parked completion')

    enqueue({
      value: '<goal-continuation/>',
      mode: 'prompt',
      isMeta: true,
    } as any)

    expect(
      peek(command => command.mode === 'task-notification'),
    ).toBeUndefined()
    expect(hasTaskNotificationDeliveryAddressedTo(undefined)).toBe(true)
  })

  test('main input reactivates only the main owner', () => {
    parkTaskNotification('main parked')
    parkTaskNotification('private parked', 'agent-1' as any)

    reactivateParkedTaskNotifications()

    expect(
      peek(
        command =>
          command.mode === 'task-notification' && command.agentId === undefined,
      )?.value,
    ).toBe('main parked')
    expect(
      peek(
        command =>
          command.mode === 'task-notification' &&
          command.agentId === ('agent-1' as any),
      ),
    ).toBeUndefined()
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(true)
  })

  test('discard removes only parked delivery for the requested owner', () => {
    parkTaskNotification('main parked')
    enqueuePendingNotification({
      value: 'main fresh',
      mode: 'task-notification',
    } as any)
    parkTaskNotification('private parked', 'agent-1' as any)

    expect(discardParkedTaskNotificationsAddressedTo(undefined)).toBe(1)

    expect(
      peek(
        command =>
          command.mode === 'task-notification' && command.agentId === undefined,
      )?.value,
    ).toBe('main fresh')
    expect(hasTaskNotificationDeliveryAddressedTo('agent-1' as any)).toBe(true)
    expect(discardParkedTaskNotificationsAddressedTo(undefined)).toBe(0)
  })
})

describe('messageQueueManager.popAllEditable', () => {
  test('pops only editable commands addressed to the requested owner', () => {
    enqueue({
      value: 'private subagent prompt',
      mode: 'prompt',
      agentId: 'agent-1' as any,
    })
    enqueue({ value: 'main prompt', mode: 'prompt' })

    const result = popAllEditable('draft', 5)

    expect(result?.text).toBe('main prompt\ndraft')
    expect(hasCommandsAddressedTo(undefined)).toBe(false)
    expect(hasCommandsAddressedTo('agent-1' as any)).toBe(true)
    expect(dequeue(command => command.agentId === 'agent-1')?.value).toBe(
      'private subagent prompt',
    )
  })
})

describe('messageQueueManager.dequeue', () => {
  test('returns undefined when queue empty', () => {
    expect(dequeue()).toBeUndefined()
  })

  test('returns highest priority command', () => {
    enqueuePendingNotification({
      value: 'later-cmd',
      mode: 'task-notification',
    } as any)
    enqueue({ value: 'next-cmd', mode: 'prompt' } as any)
    enqueue({ value: 'now-cmd', mode: 'prompt', priority: 'now' } as any)

    const first = dequeue()
    expect(first!.value).toBe('now-cmd')

    const second = dequeue()
    expect(second!.value).toBe('next-cmd')

    const third = dequeue()
    expect(third!.value).toBe('later-cmd')
  })

  test('FIFO within same priority', () => {
    enqueue({ value: 'first', mode: 'prompt' } as any)
    enqueue({ value: 'second', mode: 'prompt' } as any)

    expect(dequeue()!.value).toBe('first')
    expect(dequeue()!.value).toBe('second')
  })

  test('respects filter parameter', () => {
    enqueue({ value: 'prompt-cmd', mode: 'prompt' } as any)
    enqueuePendingNotification({
      value: 'task-cmd',
      mode: 'task-notification',
    } as any)

    // Filter to only task-notification commands
    const cmd = dequeue(c => c.mode === 'task-notification')
    expect(cmd).toBeDefined()
    expect(cmd!.value).toBe('task-cmd')

    // Prompt command should still be in queue
    expect(hasCommandsInQueue()).toBe(true)
    expect(dequeue()!.value).toBe('prompt-cmd')
  })
})

describe('messageQueueManager.peek', () => {
  test('returns undefined when queue empty', () => {
    expect(peek()).toBeUndefined()
  })

  test('returns highest priority without removing', () => {
    enqueuePendingNotification({
      value: 'later',
      mode: 'task-notification',
    } as any)
    enqueue({ value: 'next', mode: 'prompt' } as any)

    expect(peek()!.value).toBe('next')
    expect(hasCommandsInQueue()).toBe(true)
    expect(dequeue()!.value).toBe('next')
  })
})

describe('messageQueueManager.dequeueAllMatching', () => {
  test('removes all matching commands', () => {
    enqueue({ value: 'a', mode: 'prompt' } as any)
    enqueue({ value: 'b', mode: 'task-notification' } as any)
    enqueue({ value: 'c', mode: 'task-notification' } as any)

    const matched = dequeueAllMatching(c => c.mode === 'task-notification')
    expect(matched).toHaveLength(2)
    expect(matched.map(c => c.value)).toEqual(['b', 'c'])

    // Remaining command should still be in queue
    expect(dequeue()!.value).toBe('a')
  })

  test('returns empty array when no matches', () => {
    enqueue({ value: 'a', mode: 'prompt' } as any)
    const matched = dequeueAllMatching(c => c.mode === 'bash')
    expect(matched).toHaveLength(0)
    expect(hasCommandsInQueue()).toBe(true)
  })

  test('returns empty array when queue empty', () => {
    const matched = dequeueAllMatching(() => true)
    expect(matched).toHaveLength(0)
  })
})

describe('messageQueueManager.clearCommandQueue', () => {
  test('removes all commands', () => {
    enqueue({ value: 'a', mode: 'prompt' } as any)
    enqueue({ value: 'b', mode: 'prompt' } as any)
    expect(hasCommandsInQueue()).toBe(true)

    clearCommandQueue()
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('no-op on empty queue', () => {
    clearCommandQueue()
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('invalidates an active task-notification lease', () => {
    enqueuePendingNotification({
      value: 'leased notification',
      mode: 'task-notification',
    } as any)
    const lease = leaseTaskNotificationBatch(() => true)
    expect(lease).toBeDefined()

    clearCommandQueue()
    expect(retryTaskNotificationLease(lease!)).toBe('invalidated')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('acks before a fallible post-commit event is published', () => {
    const eventFailure = new Error('SDK event failed')
    enqueuePendingNotification({
      value: 'committed notification',
      mode: 'task-notification',
    } as any)
    const lease = leaseTaskNotificationBatch(() => true)
    expect(lease).toBeDefined()

    expect(() =>
      commitTaskNotificationLease(lease!, () => {
        expect(retryTaskNotificationLease(lease!)).toBe('invalidated')
        throw eventFailure
      }),
    ).toThrow(eventFailure)
    expect(retryTaskNotificationLease(lease!)).toBe('invalidated')
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('reset removes a parked task notification', () => {
    enqueuePendingNotification({
      value: 'parked notification',
      mode: 'task-notification',
    } as any)
    const firstLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retryLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(retryLease!)).toBe('parked')
    expect(hasCommandsInQueue()).toBe(false)

    resetCommandQueue()
    enqueue({ value: 'new command', mode: 'prompt' } as any)
    expect(dequeue()?.value).toBe('new command')
    expect(dequeue()).toBeUndefined()
  })

  test('fresh direct input can reactivate a parked task notification', () => {
    enqueuePendingNotification({
      value: 'parked notification',
      mode: 'task-notification',
    } as any)
    const firstLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retryLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(retryLease!)).toBe('parked')
    expect(peek()).toBeUndefined()

    reactivateParkedTaskNotifications()

    expect(peek()?.value).toBe('parked notification')
  })

  test('a new background notification does not reactivate a parked failure', () => {
    enqueuePendingNotification({
      value: 'parked notification',
      mode: 'task-notification',
    } as any)
    const firstLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retryLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(retryLease!)).toBe('parked')

    enqueuePendingNotification({
      value: 'new background notification',
      mode: 'task-notification',
    } as any)

    expect(peek()).toBeUndefined()
    reactivateParkedTaskNotifications()
    expect(dequeue()?.value).toBe('parked notification')
    expect(dequeue()?.value).toBe('new background notification')
  })

  test('parks a mixed-age failed batch instead of silently blocking its retry', () => {
    enqueuePendingNotification({
      value: 'older notification',
      mode: 'task-notification',
    } as any)
    const olderLease = leaseTaskNotificationBatch(() => true)
    expect(retryTaskNotificationLease(olderLease!)).toBe('retry-scheduled')

    enqueuePendingNotification({
      value: 'newer notification',
      mode: 'task-notification',
    } as any)
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const mixedLease = leaseTaskNotificationBatch(() => true)
    expect(mixedLease?.commands.map(command => command.value)).toEqual([
      'older notification',
      'newer notification',
    ])

    expect(retryTaskNotificationLease(mixedLease!)).toBe('parked')
    expect(hasCommandsInQueue()).toBe(false)

    reactivateParkedTaskNotifications()
    expect(dequeue()?.value).toBe('older notification')
    expect(dequeue()?.value).toBe('newer notification')
  })
})

describe('messageQueueManager conversation clear barrier', () => {
  test('drops old main-thread work but preserves everything submitted later', () => {
    enqueue({ value: 'old prompt', mode: 'prompt' } as any)
    enqueuePendingNotification({
      value: 'old notification',
      mode: 'task-notification',
    } as any)
    enqueue({ value: '/clear', mode: 'prompt' } as any)

    const clearCommand = dequeue(command => command.value === '/clear')
    expect(clearCommand).toBeDefined()
    const barrier = captureConversationClearQueueBarrier(clearCommand)

    enqueue({ value: 'new prompt', mode: 'prompt' } as any)
    enqueuePendingNotification({
      value: 'post-clear notification',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: 'agent-private notification',
      mode: 'task-notification',
      agentId: 'agent-1',
    } as any)
    enqueuePendingNotification({
      value: 'stopped-agent notification',
      mode: 'task-notification',
      agentId: 'agent-2',
    } as any)

    const removed = clearCommandsForConversationReset(
      barrier,
      new Set(['agent-1']),
    )

    expect(removed.map(command => command.value)).toEqual([
      'old prompt',
      'old notification',
      'stopped-agent notification',
    ])
    expect(dequeue()!.value).toBe('new prompt')
    expect(dequeue()!.value).toBe('post-clear notification')
    expect(dequeue()!.value).toBe('agent-private notification')
  })

  test('uses a stamped direct command when capture happens after later input', () => {
    enqueue({ value: 'old prompt', mode: 'prompt' } as any)
    const directClear = { value: '/clear', mode: 'prompt' } as any
    stampCommandQueuePosition(directClear)

    enqueue({ value: 'new prompt', mode: 'prompt' } as any)
    const barrier = captureConversationClearQueueBarrier(directClear)

    clearCommandsForConversationReset(barrier)
    expect(dequeue()!.value).toBe('new prompt')
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('keeps submission order across two queued clears', () => {
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueue({ value: 'new prompt', mode: 'prompt' } as any)

    const firstClear = dequeue()
    clearCommandsForConversationReset(
      captureConversationClearQueueBarrier(firstClear),
    )

    const secondClear = dequeue()
    expect(secondClear?.value).toBe('/clear')
    clearCommandsForConversationReset(
      captureConversationClearQueueBarrier(secondClear),
    )

    expect(dequeue()?.value).toBe('new prompt')
  })

  test('removes parked and active old notifications without reviving them', () => {
    enqueuePendingNotification({
      value: 'old parked notification',
      mode: 'task-notification',
    } as any)
    enqueuePendingNotification({
      value: 'old active notification',
      mode: 'task-notification',
    } as any)
    const directClear = { value: '/clear', mode: 'prompt' } as any
    stampCommandQueuePosition(directClear)
    enqueuePendingNotification({
      value: 'new notification',
      mode: 'task-notification',
    } as any)

    const firstLease = leaseTaskNotificationBatch(
      command => command.value === 'old parked notification',
    )
    expect(retryTaskNotificationLease(firstLease!)).toBe('retry-scheduled')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    const retryLease = leaseTaskNotificationBatch(
      command => command.value === 'old parked notification',
    )
    expect(retryTaskNotificationLease(retryLease!)).toBe('parked')

    const activeLease = leaseTaskNotificationBatch(
      command => command.value === 'old active notification',
    )
    expect(activeLease).toBeDefined()
    const removed = clearCommandsForConversationReset(
      captureConversationClearQueueBarrier(directClear),
    )

    expect(removed.map(command => command.value)).toEqual([
      'old parked notification',
      'old active notification',
    ])
    expect(retryTaskNotificationLease(activeLease!)).toBe('invalidated')
    releaseDueTaskNotificationRetries(Number.POSITIVE_INFINITY)
    expect(dequeue()?.value).toBe('new notification')
    expect(dequeue()).toBeUndefined()
  })
})

describe('messageQueueManager conversation reset drain barrier', () => {
  test('does not expose commands queued after a reset command', () => {
    enqueue({ value: 'old prompt', mode: 'prompt' } as any)
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueue({ value: 'new prompt', mode: 'prompt' } as any)

    const commands = getCommandsByMaxPriorityBeforeConversationReset(
      'later',
      command => command.agentId === undefined,
    )

    expect(commands.map(command => command.value)).toEqual(['old prompt'])
  })

  test('scopes reset barriers so main-thread commands do not block agents', () => {
    enqueue({ value: '/clear', mode: 'prompt' } as any)
    enqueuePendingNotification({
      value: 'agent notification',
      mode: 'task-notification',
      agentId: 'agent-1',
    } as any)

    const commands = getCommandsByMaxPriorityBeforeConversationReset(
      'later',
      command => command.agentId === 'agent-1',
    )

    expect(commands.map(command => command.value)).toEqual([
      'agent notification',
    ])
  })

  test('does not drain lower-priority old work ahead of a reset command', () => {
    enqueuePendingNotification({
      value: 'old notification',
      mode: 'task-notification',
    } as any)
    enqueue({ value: '/clear', mode: 'prompt' } as any)

    const commands = getCommandsByMaxPriorityBeforeConversationReset(
      'later',
      command => command.agentId === undefined,
    )

    expect(commands).toEqual([])
  })
})

describe('messageQueueManager priority ordering', () => {
  test('now dequeued before next and later', () => {
    enqueuePendingNotification({
      value: 'later',
      mode: 'task-notification',
    } as any)
    enqueue({ value: 'next', mode: 'prompt' } as any)
    enqueue({ value: 'now', mode: 'prompt', priority: 'now' } as any)

    expect(dequeue()!.value).toBe('now')
    expect(dequeue()!.value).toBe('next')
    expect(dequeue()!.value).toBe('later')
  })

  test('next dequeued before later', () => {
    enqueuePendingNotification({
      value: 'later',
      mode: 'task-notification',
    } as any)
    enqueue({ value: 'next', mode: 'prompt' } as any)

    expect(dequeue()!.value).toBe('next')
    expect(dequeue()!.value).toBe('later')
  })
})
