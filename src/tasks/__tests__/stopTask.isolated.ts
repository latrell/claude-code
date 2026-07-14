import { beforeEach, describe, expect, mock, test } from 'bun:test'

let killImpl: () => Promise<void>

mock.module('src/tasks.ts', () => ({
  getTaskByType: () => ({
    name: 'HungTask',
    type: 'local_agent',
    kill: () => killImpl(),
  }),
}))

const { stopTask } = await import('../stopTask.js')
const { StopConfirmationError } = await import(
  '../../utils/stopConfirmation.js'
)

describe('stopTask', () => {
  beforeEach(() => {
    killImpl = () => new Promise<void>(() => {})
  })

  test('fails closed when a task kill implementation never settles', async () => {
    let state = {
      tasks: {
        hung: {
          id: 'hung',
          type: 'local_agent',
          status: 'running',
          description: 'hung agent',
          startTime: Date.now(),
          notified: false,
        },
      },
    }

    const stopping = stopTask('hung', {
      getAppState: () => state as never,
      setAppState: update => {
        state = update(state as never) as unknown as typeof state
      },
      stopTimeoutMs: 5,
    })

    await expect(stopping).rejects.toBeInstanceOf(StopConfirmationError)
    expect(state.tasks.hung.status).toBe('running')
  })

  test('rejects a stop handler that resolves while the task stays running', async () => {
    killImpl = async () => {}
    const state = {
      tasks: {
        running: {
          id: 'running',
          type: 'local_agent',
          status: 'running',
          description: 'running agent',
          startTime: Date.now(),
          notified: false,
        },
      },
    }

    await expect(
      stopTask('running', {
        getAppState: () => state as never,
        setAppState: () => {},
      }),
    ).rejects.toBeInstanceOf(StopConfirmationError)
    expect(state.tasks.running.status).toBe('running')
  })
})
