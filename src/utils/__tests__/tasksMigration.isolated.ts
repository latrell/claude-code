import { readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'
import { asSessionId } from '../../types/ids'
import type { Task } from '../tasks'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))

const {
  getIsInteractive,
  getSessionId: getBootstrapSessionId,
  setIsInteractive,
  switchSession,
} = await import('../../bootstrap/state')
const {
  beginSessionTaskListTransition,
  clearLeaderTeamName,
  copyTaskListForSessionTransition,
  createTask,
  getTask,
  getTaskListId,
  getTasksDir,
  isUsingSessionScopedTaskList,
  listTasks,
  setLeaderTeamName,
  updateTask,
  deleteTask,
} = await import('../tasks')

let configDir = ''
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID
const originalSessionId = getBootstrapSessionId()
const originalIsInteractive = getIsInteractive()

beforeEach(async () => {
  configDir = join(
    tmpdir(),
    `claude-test-task-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = configDir
  delete process.env.CLAUDE_CODE_TASK_LIST_ID
  switchSession(asSessionId('test-session-123'))
  setIsInteractive(true)
  const { getClaudeConfigHomeDir } = await import('src/utils/envUtils')
  getClaudeConfigHomeDir.cache.clear?.()
})

afterEach(async () => {
  clearLeaderTeamName()
  switchSession(originalSessionId)
  setIsInteractive(originalIsInteractive)
  if (originalTaskListId === undefined) {
    delete process.env.CLAUDE_CODE_TASK_LIST_ID
  } else {
    process.env.CLAUDE_CODE_TASK_LIST_ID = originalTaskListId
  }
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  const { getClaudeConfigHomeDir } = await import('src/utils/envUtils')
  getClaudeConfigHomeDir.cache.clear?.()
  await rm(configDir, { recursive: true, force: true }).catch(() => {})
})

describe('session-scoped task-list transitions', () => {
  test('identifies the default standalone list as session-scoped', () => {
    expect(getTaskListId()).toBe('test-session-123')
    expect(isUsingSessionScopedTaskList()).toBe(true)
  })

  test('does not identify explicit or team task lists as session-scoped', () => {
    process.env.CLAUDE_CODE_TASK_LIST_ID = 'explicit-list'
    expect(getTaskListId()).toBe('explicit-list')
    expect(isUsingSessionScopedTaskList()).toBe(false)

    delete process.env.CLAUDE_CODE_TASK_LIST_ID
    setLeaderTeamName('team-list')
    expect(getTaskListId()).toBe('team-list')
    expect(isUsingSessionScopedTaskList()).toBe(false)
  })

  test('pins implicit in-process writers to the source during regeneration', () => {
    const endTransition = beginSessionTaskListTransition('transition-source')
    try {
      expect(getTaskListId()).toBe('transition-source')
    } finally {
      endTransition()
    }
    expect(getTaskListId()).toBe('test-session-123')
  })

  test('copies task state and leaves the source independently resumable', async () => {
    const sourceListId = 'old-session'
    const targetListId = 'new-session'
    const blockerId = await createTask(sourceListId, {
      subject: 'Prepare migration',
      description: 'Keep this completed task',
      status: 'completed',
      blocks: [],
      blockedBy: [],
      owner: 'agent-old',
    })
    const activeId = await createTask(sourceListId, {
      subject: 'Continue after plan exit',
      description: 'This work is not done yet',
      status: 'in_progress',
      blocks: [],
      blockedBy: [blockerId],
      owner: 'agent-current',
    })

    await copyTaskListForSessionTransition(sourceListId, targetListId)

    expect(await listTasks(targetListId)).toEqual(await listTasks(sourceListId))
    expect(await getTask(targetListId, activeId)).toMatchObject({
      status: 'in_progress',
      owner: 'agent-current',
      blockedBy: [blockerId],
    })

    await updateTask(targetListId, activeId, { status: 'completed' })
    expect((await getTask(targetListId, activeId))?.status).toBe('completed')
    expect((await getTask(sourceListId, activeId))?.status).toBe('in_progress')
  })

  test('can transfer task state without allowing source ID reuse', async () => {
    const sourceListId = 'team-transition-source'
    const targetListId = 'team-transition-target'
    const taskId = await createTask(sourceListId, {
      subject: 'Transfer task',
      description: 'Move this task into a team list',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    })

    await copyTaskListForSessionTransition(sourceListId, targetListId, {
      removeSourceTasks: true,
    })

    expect(await getTask(sourceListId, taskId)).toBeNull()
    expect(await getTask(targetListId, taskId)).toMatchObject({
      status: 'in_progress',
    })
    expect(
      await createTask(sourceListId, {
        subject: 'Resumed source task',
        description: 'Must receive a fresh ID',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      }),
    ).toBe('2')
  })

  test('treats case-aliased Windows task-list directories as identical', async () => {
    if (process.platform !== 'win32') return

    const sourceListId = 'CASE-ALIASED-LIST'
    const targetListId = sourceListId.toLowerCase()
    const taskId = await createTask(sourceListId, {
      subject: 'Keep aliased task',
      description: 'A same-directory transfer must be a no-op',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    await copyTaskListForSessionTransition(sourceListId, targetListId, {
      removeSourceTasks: true,
    })

    expect(await getTask(sourceListId, taskId)).not.toBeNull()
    expect(await getTask(targetListId, taskId)).not.toBeNull()
  })

  test('serializes transfers with concurrent source updates and deletes', async () => {
    for (let iteration = 0; iteration < 6; iteration++) {
      const updateSource = `concurrent-update-source-${iteration}`
      const updateTarget = `concurrent-update-target-${iteration}`
      const updateTaskId = await createTask(updateSource, {
        subject: 'Concurrent update',
        description: 'The successful update must survive a transfer',
        status: 'in_progress',
        blocks: [],
        blockedBy: [],
      })
      const [, updated] = await Promise.all([
        copyTaskListForSessionTransition(updateSource, updateTarget, {
          removeSourceTasks: true,
        }),
        updateTask(updateSource, updateTaskId, { status: 'completed' }),
      ])
      expect(await getTask(updateSource, updateTaskId)).toBeNull()
      expect((await getTask(updateTarget, updateTaskId))?.status).toBe(
        updated ? 'completed' : 'in_progress',
      )

      const deleteSource = `concurrent-delete-source-${iteration}`
      const deleteTarget = `concurrent-delete-target-${iteration}`
      const deleteTaskId = await createTask(deleteSource, {
        subject: 'Concurrent delete',
        description: 'A successful delete must not be resurrected',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      })
      const [, deleted] = await Promise.all([
        copyTaskListForSessionTransition(deleteSource, deleteTarget, {
          removeSourceTasks: true,
        }),
        deleteTask(deleteSource, deleteTaskId),
      ])
      expect(await getTask(deleteSource, deleteTaskId)).toBeNull()
      expect(await getTask(deleteTarget, deleteTaskId)).toEqual(
        deleted ? null : expect.objectContaining({ status: 'pending' }),
      )
    }
  })

  test('never overwrites a concurrent target task with the same ID', async () => {
    for (let iteration = 0; iteration < 6; iteration++) {
      const sourceListId = `target-race-source-${iteration}`
      const targetListId = `target-race-target-${iteration}`
      await createTask(sourceListId, {
        subject: 'Migrated source task',
        description: 'Must not overwrite target work',
        status: 'in_progress',
        blocks: [],
        blockedBy: [],
      })

      const [migration, targetCreate] = await Promise.allSettled([
        copyTaskListForSessionTransition(sourceListId, targetListId),
        createTask(targetListId, {
          subject: 'Concurrent target task',
          description: 'Must remain intact',
          status: 'pending',
          blocks: [],
          blockedBy: [],
        }),
      ])
      expect(targetCreate.status).toBe('fulfilled')
      expect(await getTask(sourceListId, '1')).toMatchObject({
        subject: 'Migrated source task',
      })

      const targetTasks = await listTasks(targetListId)
      if (migration.status === 'fulfilled') {
        expect(targetTasks.map(task => task.subject).sort()).toEqual([
          'Concurrent target task',
          'Migrated source task',
        ])
      } else {
        expect(String(migration.reason)).toContain(
          'Task list migration conflict',
        )
        expect(targetTasks).toHaveLength(1)
        expect(targetTasks[0]?.subject).toBe('Concurrent target task')
      }
    }
  })

  test('publishes migrated task JSON only after an atomic copy completes', async () => {
    const sourceListId = 'atomic-copy-source'
    const targetListId = 'atomic-copy-target'
    const payload = 'x'.repeat(2 * 1024 * 1024)
    for (let task = 0; task < 6; task++) {
      await createTask(sourceListId, {
        subject: `Large migrated task ${task}`,
        description: payload,
        status: 'pending',
        blocks: [],
        blockedBy: [],
      })
    }

    let migrationComplete = false
    const invalidFinalFiles: string[] = []
    const migration = copyTaskListForSessionTransition(
      sourceListId,
      targetListId,
    ).finally(() => {
      migrationComplete = true
    })
    while (!migrationComplete) {
      const files = await readdir(getTasksDir(targetListId)).catch(() => [])
      for (const file of files.filter(candidate =>
        candidate.endsWith('.json'),
      )) {
        try {
          JSON.parse(
            await readFile(join(getTasksDir(targetListId), file), 'utf-8'),
          )
        } catch {
          invalidFinalFiles.push(file)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await migration

    expect(invalidFinalFiles).toEqual([])
    expect(await listTasks(targetListId)).toHaveLength(6)
  })
})

test('concurrent readers observe only complete atomic task revisions', async () => {
  const taskListId = 'atomic-reader-list'
  const payload = 'x'.repeat(128 * 1024)
  const id = await createTask(taskListId, {
    subject: 'Atomic task',
    description: `0:${payload}`,
    status: 'pending',
    blocks: [],
    blockedBy: [],
    metadata: { revision: 0 },
  })
  const observations: Array<Task | null> = []

  await Promise.all([
    (async () => {
      for (let revision = 1; revision <= 24; revision++) {
        await updateTask(taskListId, id, {
          description: `${revision}:${payload}`,
          status: revision % 2 === 0 ? 'pending' : 'in_progress',
          metadata: { revision },
        })
      }
    })(),
    ...Array.from({ length: 6 }, async () => {
      for (let read = 0; read < 80; read++) {
        observations.push(await getTask(taskListId, id))
      }
    }),
  ])

  expect(observations.length).toBe(480)
  for (const task of observations) {
    expect(task).not.toBeNull()
    const revision = task?.metadata?.revision
    expect(typeof revision).toBe('number')
    expect(task?.description.startsWith(`${String(revision)}:`)).toBe(true)
  }
})
