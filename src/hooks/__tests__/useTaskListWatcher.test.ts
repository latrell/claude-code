import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderSync, type Instance } from '@anthropic/ink'
import { createElement } from 'react'
import { PassThrough } from 'stream'

import {
  cleanupTempDir,
  createTempDir,
} from '../../../tests/mocks/file-system.js'
import { useTaskListWatcher } from '../useTaskListWatcher.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import {
  claimTask,
  createTask,
  getTask,
  updateTask,
} from '../../utils/tasks.js'

const TASK_LIST_ID = 'watcher-test-list'

type HarnessProps = {
  isLoading: boolean
  onSubmitTask: (prompt: string) => boolean
}

function TaskListWatcherHarness({
  isLoading,
  onSubmitTask,
}: HarnessProps): null {
  useTaskListWatcher({
    taskListId: TASK_LIST_ID,
    isLoading,
    onSubmitTask,
  })
  return null
}

type MountedHarness = {
  instance: Instance
  stdin: PassThrough
  stdout: PassThrough
}

let configDir: string
let originalConfigDir: string | undefined
const mounted: MountedHarness[] = []

function mountHarness(props: HarnessProps): Instance {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: false })
  const instance = renderSync(createElement(TaskListWatcherHarness, props), {
    exitOnCtrlC: false,
    patchConsole: false,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
  })
  mounted.push({ instance, stdin, stdout })
  return instance
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for task watcher')
}

async function createPendingTask(): Promise<string> {
  return createTask(TASK_LIST_ID, {
    subject: 'Finish the incomplete work',
    description: 'Verify the result before completing the task.',
    status: 'pending',
    blocks: [],
    blockedBy: [],
  })
}

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  configDir = await createTempDir('task-list-watcher-')
  process.env.CLAUDE_CONFIG_DIR = configDir
  getClaudeConfigHomeDir.cache.clear?.()
})

afterEach(async () => {
  for (const harness of mounted.splice(0)) {
    harness.instance.unmount()
    harness.instance.cleanup()
    harness.stdin.destroy()
    harness.stdout.destroy()
  }

  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  getClaudeConfigHomeDir.cache.clear?.()
  await cleanupTempDir(configDir)
})

describe('useTaskListWatcher unfinished-task recovery', () => {
  test('submits the same claimed task again after the prior turn goes idle', async () => {
    const taskId = await createPendingTask()
    const prompts: string[] = []
    const onSubmitTask = (prompt: string): boolean => {
      prompts.push(prompt)
      return true
    }
    const instance = mountHarness({ isLoading: false, onSubmitTask })

    await waitFor(() => prompts.length === 1)
    const claimed = await getTask(TASK_LIST_ID, taskId)
    expect(claimed?.owner).toBe(TASK_LIST_ID)
    expect(claimed?.status).toBe('in_progress')

    instance.rerender(
      createElement(TaskListWatcherHarness, {
        isLoading: true,
        onSubmitTask,
      }),
    )
    await Promise.resolve()
    instance.rerender(
      createElement(TaskListWatcherHarness, {
        isLoading: false,
        onSubmitTask,
      }),
    )

    await waitFor(() => prompts.length === 2)
    expect(prompts[1]).toBe(prompts[0])
  })

  test('recovers an owned incomplete task after the watcher remounts', async () => {
    const taskId = await createPendingTask()
    expect((await claimTask(TASK_LIST_ID, taskId, TASK_LIST_ID)).success).toBe(
      true,
    )
    await updateTask(TASK_LIST_ID, taskId, { status: 'in_progress' })

    const prompts: string[] = []
    mountHarness({
      isLoading: false,
      onSubmitTask: prompt => {
        prompts.push(prompt)
        return true
      },
    })

    await waitFor(() => prompts.length === 1)
    expect(prompts[0]).toContain(`task #${taskId}`)
  })
})
