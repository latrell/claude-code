import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { renderSync, type Instance } from '@anthropic/ink'
import { createElement, type RefObject, useSyncExternalStore } from 'react'
import { PassThrough } from 'stream'

mock.module('src/services/goal/goalStorage.ts', () => ({
  persistCurrentGoal: () => {},
}))

import { useCommandQueue } from '../useCommandQueue.js'
import { useGoalContinuation } from '../useGoalContinuation.js'
import { usePriorityNowInterrupt } from '../usePriorityNowInterrupt.js'
import { useQueueProcessor } from '../useQueueProcessor.js'
import {
  _clearAllGoalsForTesting,
  setGoal,
} from '../../services/goal/goalState.js'
import type { QueuedCommand } from '../../types/textInputTypes.js'
import {
  enqueue,
  getCommandQueueSnapshot,
  resetCommandQueue,
} from '../../utils/messageQueueManager.js'
import { QueryGuard } from '../../utils/QueryGuard.js'

type HarnessProps = {
  abortControllerRef: RefObject<AbortController | null>
  executeQueuedInput: (commands: QueuedCommand[]) => Promise<void>
  onContinuationEnqueued?: (payload: {
    turn: number
    maxTurns: number
    objective: string
  }) => void
  queryGuard: QueryGuard
}

function QueueLifecycleHarness({
  abortControllerRef,
  executeQueuedInput,
  onContinuationEnqueued,
  queryGuard,
}: HarnessProps): null {
  const queueSnapshot = useCommandQueue()
  const isQueryActive = useSyncExternalStore(
    queryGuard.subscribe,
    queryGuard.getSnapshot,
  )

  // Keep this order aligned with REPL: queue processing runs before the
  // interrupt effect in the passive-effect flush.
  useQueueProcessor({
    executeQueuedInput,
    hasActiveLocalJsxUI: false,
    onExecutionError: error => {
      throw error
    },
    queryGuard,
  })
  useGoalContinuation({
    isLoading: isQueryActive,
    wasAborted: false,
    queuedCommandsLength: queueSnapshot.filter(
      command => command.agentId === undefined,
    ).length,
    hasActiveLocalJsxUI: false,
    isInPlanMode: false,
    isQueryActiveNow: queryGuard.getSnapshot,
    onContinuationEnqueued,
  })
  usePriorityNowInterrupt({ abortControllerRef, queueSnapshot })

  return null
}

type MountedHarness = {
  instance: Instance
  stdin: PassThrough
  stdout: PassThrough
}

const mounted: MountedHarness[] = []

function mountHarness(props: HarnessProps): void {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: false })

  const instance = renderSync(createElement(QueueLifecycleHarness, props), {
    exitOnCtrlC: false,
    patchConsole: false,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
  })
  mounted.push({ instance, stdin, stdout })
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for hook effects')
}

beforeEach(() => {
  _clearAllGoalsForTesting()
  resetCommandQueue()
})

afterEach(() => {
  for (const harness of mounted.splice(0)) {
    harness.instance.unmount()
    harness.instance.cleanup()
    harness.stdin.destroy()
    harness.stdout.destroy()
  }
  _clearAllGoalsForTesting()
  resetCommandQueue()
})

describe('usePriorityNowInterrupt with useQueueProcessor', () => {
  test('does not abort a goal continuation query started from idle', async () => {
    const queryGuard = new QueryGuard()
    const abortControllerRef: { current: AbortController | null } = {
      current: null,
    }
    let startedController: AbortController | null = null
    let executedCommands: QueuedCommand[] = []
    let continuationPayload:
      | { turn: number; maxTurns: number; objective: string }
      | undefined
    let releaseExecution: (() => void) | null = null
    const executionReleased = new Promise<void>(resolve => {
      releaseExecution = resolve
    })

    setGoal('keep working')

    mountHarness({
      abortControllerRef,
      executeQueuedInput: async commands => {
        const generation = queryGuard.tryStart()
        if (generation === null) {
          throw new Error('query did not start')
        }
        const controller = new AbortController()
        abortControllerRef.current = controller
        startedController = controller
        executedCommands = commands
        await executionReleased
        queryGuard.end(generation)
      },
      onContinuationEnqueued: payload => {
        continuationPayload = payload
      },
      queryGuard,
    })

    await waitFor(() => startedController !== null)
    await Promise.resolve()

    expect(getCommandQueueSnapshot()).toHaveLength(0)
    expect(startedController!.signal.aborted).toBe(false)
    expect(executedCommands).toHaveLength(1)
    expect(executedCommands[0]?.origin).toBe('goal-continuation')
    expect(executedCommands[0]?.priority).toBe('now')
    expect(continuationPayload).toEqual({
      turn: 1,
      maxTurns: 150,
      objective: 'keep working',
    })

    // Prevent the active goal from scheduling a second turn while this
    // lifecycle is being released and the renderer is about to unmount.
    _clearAllGoalsForTesting()
    releaseExecution!()
    await waitFor(() => !queryGuard.isActive)
  })

  test('still aborts an active query for a newly queued user now command', async () => {
    const queryGuard = new QueryGuard()
    const generation = queryGuard.tryStart()
    expect(generation).not.toBeNull()

    const controller = new AbortController()
    const abortControllerRef = { current: controller }
    let queuedExecutionStarted = false

    mountHarness({
      abortControllerRef,
      executeQueuedInput: async () => {
        queuedExecutionStarted = true
      },
      queryGuard,
    })
    await Promise.resolve()

    enqueue({
      value: 'interrupt the current query',
      mode: 'prompt',
      priority: 'now',
    })

    await waitFor(() => controller.signal.aborted)

    expect(controller.signal.reason).toBe('interrupt')
    expect(queuedExecutionStarted).toBe(false)
    expect(getCommandQueueSnapshot()).toHaveLength(1)

    queryGuard.end(generation!)
  })
})
