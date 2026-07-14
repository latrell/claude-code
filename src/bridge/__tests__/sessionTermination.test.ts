import { describe, expect, test } from 'bun:test'
import {
  terminateSessionHandles,
  terminateTimedOutSession,
} from '../sessionTermination.js'

describe('terminateSessionHandles', () => {
  test('uses a stable snapshot and awaits every termination confirmation', async () => {
    const confirmations = new Map<string, (stopped: boolean) => void>()
    const calls: string[] = []
    const sessions = new Map([
      [
        'one',
        {
          terminate: () => {
            calls.push('one')
            return new Promise<boolean>(resolve => {
              confirmations.set('one', resolve)
            })
          },
        },
      ],
      [
        'two',
        {
          terminate: () => {
            calls.push('two')
            return new Promise<boolean>(resolve => {
              confirmations.set('two', resolve)
            })
          },
        },
      ],
    ])

    const result = terminateSessionHandles(sessions, 10, 20)
    sessions.clear()
    expect(calls).toEqual(['one', 'two'])

    let settled = false
    void result.then(() => {
      settled = true
    })
    confirmations.get('one')?.(true)
    await Promise.resolve()
    expect(settled).toBe(false)

    confirmations.get('two')?.(true)
    expect(await result).toEqual([])
  })

  test('reports false and rejected termination attempts as failures', async () => {
    const sessions = new Map([
      ['alive', { terminate: async () => false }],
      ['error', { terminate: async () => Promise.reject(new Error('boom')) }],
      ['stopped', { terminate: async () => true }],
    ])

    expect(await terminateSessionHandles(sessions, 0, 0)).toEqual([
      'alive',
      'error',
    ])
  })
})

describe('terminateTimedOutSession', () => {
  test('starts remote cancellation without waiting for local TERM grace', async () => {
    let confirmLocal: ((stopped: boolean) => void) | undefined
    let remoteStarted = false
    const handle = {
      terminate: () =>
        new Promise<boolean>(resolve => {
          confirmLocal = resolve
        }),
    }

    const result = terminateTimedOutSession(
      handle,
      async () => {
        remoteStarted = true
      },
      10,
      20,
    )

    expect(remoteStarted).toBe(true)
    confirmLocal?.(true)
    expect(await result).toEqual({
      localStopped: true,
      remoteStopped: true,
    })
  })

  test('reports each unconfirmed stop independently', async () => {
    const result = await terminateTimedOutSession(
      { terminate: async () => false },
      async () => Promise.reject(new Error('offline')),
      0,
      0,
    )

    expect(result).toEqual({
      localStopped: false,
      remoteStopped: false,
    })
  })
})
