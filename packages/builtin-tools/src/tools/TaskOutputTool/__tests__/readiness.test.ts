import { describe, expect, test } from 'bun:test'
import { isTaskOutputReady, markTaskOutputRetrieved } from '../readiness.js'

function task(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'task-1',
    type: 'local_agent',
    status: 'running',
    description: 'agent',
    ...overrides,
  }
}

describe('isTaskOutputReady', () => {
  test('treats a running local agent with a published result as result-ready', () => {
    expect(isTaskOutputReady(task({ result: { content: [] } }))).toBe(true)
  })

  test('keeps a running local agent without a result pending', () => {
    expect(isTaskOutputReady(task())).toBe(false)
  })

  test('does not treat result fields on other running task types as ready', () => {
    expect(
      isTaskOutputReady(task({ type: 'local_bash', result: { code: 0 } })),
    ).toBe(false)
  })

  test('treats every terminal task as ready', () => {
    expect(isTaskOutputReady(task({ status: 'completed' }))).toBe(true)
    expect(isTaskOutputReady(task({ status: 'failed' }))).toBe(true)
    expect(isTaskOutputReady(task({ status: 'killed' }))).toBe(true)
  })
})

describe('markTaskOutputRetrieved', () => {
  test('marks result-ready agent retrieved without consuming final notification', () => {
    const updated = markTaskOutputRetrieved(
      task({ result: { content: [] }, retrieved: false, notified: false }),
    )

    expect(updated.retrieved).toBe(true)
    expect(updated.notified).toBe(false)
    expect(updated.status).toBe('running')
  })

  test('marks a terminal agent retrieved and notified', () => {
    const updated = markTaskOutputRetrieved(
      task({ status: 'completed', retrieved: false, notified: false }),
    )

    expect(updated.retrieved).toBe(true)
    expect(updated.notified).toBe(true)
  })
})
