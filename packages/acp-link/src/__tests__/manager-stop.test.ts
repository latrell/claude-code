import { describe, expect, mock, test } from 'bun:test'
import type { ProcessManager } from '../manager/manager.js'
import { createApp } from '../manager/routes.js'
import type { AcpInstance } from '../manager/types.js'

function runningInstance(): AcpInstance {
  return {
    id: 'instance-123',
    group: 'test',
    command: 'agent',
    status: 'running',
    pid: 123,
    startTime: Date.now(),
    exitCode: null,
    logs: [],
    subscribers: new Set(),
  }
}

describe('manager Stop endpoint', () => {
  test('waits for confirmed process termination before returning success', async () => {
    const instance = runningInstance()
    let confirmStop: ((stopped: boolean) => void) | undefined
    const stop = mock(
      () =>
        new Promise<boolean>(resolve => {
          confirmStop = resolve
        }),
    )
    const manager = {
      get: () => instance,
      stop,
    } as unknown as ProcessManager
    const app = createApp(manager)

    let settled = false
    const responsePromise = Promise.resolve(
      app.request(`/api/instances/${instance.id}/stop`, { method: 'POST' }),
    ).then(response => {
      settled = true
      return response
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    confirmStop?.(true)
    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  test('returns an error when termination cannot be confirmed', async () => {
    const instance = runningInstance()
    const manager = {
      get: () => instance,
      stop: mock(async () => false),
    } as unknown as ProcessManager
    const app = createApp(manager)

    const response = await app.request(`/api/instances/${instance.id}/stop`, {
      method: 'POST',
    })
    expect(response.status).toBe(500)
    expect(await response.json()).toHaveProperty('error')
  })
})
