import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../tests/mocks/debug.js'
import {
  cleanupTempDir,
  createTempDir,
} from '../../../../tests/mocks/file-system.js'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import {
  _clearAllGoalsForTesting,
  completeGoal,
  getGoal,
  pauseGoal,
  setGoal,
} from '../../../services/goal/goalState.js'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import {
  clearLeaderTeamName,
  createTask,
  getTask,
  updateTask,
} from '../../../utils/tasks.js'
import {
  captureModeTransitionState,
  restoreModeTransitionState,
} from '../modeTransitionState.js'

const SOURCE_SESSION = 'plan-source-session'
const TARGET_SESSION = 'plan-target-session'

let configDir: string
let originalConfigDir: string | undefined
let originalTaskListId: string | undefined

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  originalTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID
  delete process.env.CLAUDE_CODE_TASK_LIST_ID
  clearLeaderTeamName()
  _clearAllGoalsForTesting()

  configDir = await createTempDir('mode-transition-state-')
  process.env.CLAUDE_CONFIG_DIR = configDir
  getClaudeConfigHomeDir.cache.clear?.()
})

afterEach(async () => {
  _clearAllGoalsForTesting()
  clearLeaderTeamName()
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
  getClaudeConfigHomeDir.cache.clear?.()
  await cleanupTempDir(configDir)
})

describe('plan-exit mode transition state', () => {
  test('copies active goal and standalone tasks without coupling old and new sessions', async () => {
    const sourceGoal = setGoal('Finish the accepted plan', {
      sessionId: SOURCE_SESSION,
    })
    const taskId = await createTask(SOURCE_SESSION, {
      subject: 'Implement the plan',
      description: 'Continue after the context clear',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
      owner: 'plan-agent',
    })

    const captured = captureModeTransitionState(SOURCE_SESSION)
    expect(captured.activeGoal).not.toBe(sourceGoal)
    expect(captured.migrateSessionTaskList).toBe(true)

    const restored = await restoreModeTransitionState(captured, TARGET_SESSION)
    expect(restored.goalRestored).toBe(true)

    const targetGoal = getGoal(TARGET_SESSION)
    expect(targetGoal).toEqual(sourceGoal)
    expect(targetGoal).not.toBe(sourceGoal)
    expect(targetGoal).not.toBe(captured.activeGoal)
    expect(await getTask(TARGET_SESSION, taskId)).toEqual(
      await getTask(SOURCE_SESSION, taskId),
    )

    completeGoal(TARGET_SESSION)
    await updateTask(TARGET_SESSION, taskId, { status: 'completed' })
    expect(getGoal(SOURCE_SESSION)?.status).toBe('active')
    expect((await getTask(SOURCE_SESSION, taskId))?.status).toBe('in_progress')
  })

  test('does not carry a non-active goal or an explicit task list', async () => {
    setGoal('Paused before plan exit', { sessionId: SOURCE_SESSION })
    pauseGoal(SOURCE_SESSION)
    process.env.CLAUDE_CODE_TASK_LIST_ID = 'stable-explicit-list'

    const captured = captureModeTransitionState(SOURCE_SESSION)
    expect(captured.activeGoal).toBeNull()
    expect(captured.migrateSessionTaskList).toBe(false)

    const restored = await restoreModeTransitionState(captured, TARGET_SESSION)
    expect(restored.goalRestored).toBe(false)
    expect(getGoal(TARGET_SESSION)).toBeNull()
  })

  test('advances a retry from the latest successfully restored target', async () => {
    const sourceGoal = setGoal('Retry the accepted plan safely', {
      sessionId: SOURCE_SESSION,
    })
    const taskId = await createTask(SOURCE_SESSION, {
      subject: 'Keep the original migration source',
      description: 'A replacement session must not become the retry source',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    })
    const captured = captureModeTransitionState(SOURCE_SESSION)

    const firstTarget = `${TARGET_SESSION}-failed-attempt`
    await restoreModeTransitionState(captured, firstTarget)
    completeGoal(firstTarget)
    await updateTask(firstTarget, taskId, { status: 'completed' })

    await restoreModeTransitionState(captured, TARGET_SESSION)
    expect(sourceGoal.status).toBe('active')
    expect(getGoal(TARGET_SESSION)).toBeNull()
    expect((await getTask(TARGET_SESSION, taskId))?.status).toBe('completed')
    expect(captured.sourceSessionId).toBe(TARGET_SESSION)
  })
})
