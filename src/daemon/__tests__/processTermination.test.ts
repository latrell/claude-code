import { describe, expect, test } from 'bun:test'
import {
  terminateProcessTree,
  terminateWithEscalation,
  type TerminationSignal,
} from '../../utils/processTermination.js'

describe('terminateWithEscalation', () => {
  test('returns only after graceful exit is confirmed', async () => {
    const signals: TerminationSignal[] = []
    let confirmExit: ((value: boolean) => void) | undefined
    const exitConfirmation = new Promise<boolean>(resolve => {
      confirmExit = resolve
    })

    const result = terminateWithEscalation({
      signal: async signal => {
        signals.push(signal)
      },
      waitForExit: () => exitConfirmation,
      graceMs: 10,
      forceWaitMs: 10,
    })

    await Promise.resolve()
    expect(signals).toEqual(['SIGTERM'])
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    confirmExit?.(true)
    expect(await result).toBe(true)
    expect(signals).toEqual(['SIGTERM'])
  })

  test('escalates to SIGKILL and waits for force-exit confirmation', async () => {
    const signals: TerminationSignal[] = []
    let forceConfirmation: ((value: boolean) => void) | undefined
    const forceExitConfirmation = new Promise<boolean>(resolve => {
      forceConfirmation = resolve
    })
    let confirmKillDelivery: (() => void) | undefined
    const killDelivered = new Promise<void>(resolve => {
      confirmKillDelivery = resolve
    })
    let waitCount = 0

    const result = terminateWithEscalation({
      signal: async signal => {
        signals.push(signal)
        if (signal === 'SIGKILL') confirmKillDelivery?.()
      },
      waitForExit: async () => {
        waitCount++
        if (waitCount === 1) return false
        return forceExitConfirmation
      },
      graceMs: 10,
      forceWaitMs: 20,
    })

    await killDelivered
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    forceConfirmation?.(true)
    expect(await result).toBe(true)
  })

  test('does not claim success when the tree survives SIGKILL', async () => {
    const signals: TerminationSignal[] = []
    const result = await terminateWithEscalation({
      signal: async signal => {
        signals.push(signal)
      },
      waitForExit: async () => false,
      graceMs: 0,
      forceWaitMs: 0,
    })

    expect(result).toBe(false)
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  test('continues to force-kill after a SIGTERM delivery error', async () => {
    const signals: TerminationSignal[] = []
    const errors: TerminationSignal[] = []
    let waitCount = 0

    const result = await terminateWithEscalation({
      signal: async signal => {
        signals.push(signal)
        if (signal === 'SIGTERM') throw new Error('delivery failed')
      },
      waitForExit: async () => ++waitCount > 1,
      graceMs: 0,
      forceWaitMs: 0,
      onSignalError: signal => {
        errors.push(signal)
      },
    })

    expect(result).toBe(true)
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(errors).toEqual(['SIGTERM'])
  })

  test('does not hang when signal delivery never settles', async () => {
    const signals: TerminationSignal[] = []
    const errors: TerminationSignal[] = []

    const result = await terminateWithEscalation({
      signal: signal => {
        signals.push(signal)
        return signal === 'SIGTERM'
          ? new Promise<void>(() => {})
          : Promise.resolve()
      },
      waitForExit: async () => false,
      graceMs: 0,
      forceWaitMs: 0,
      signalTimeoutMs: 1,
      onSignalError: signal => {
        errors.push(signal)
      },
    })

    expect(result).toBe(false)
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(errors).toEqual(['SIGTERM'])
  })
})

describe('terminateProcessTree', () => {
  test('tracks and force-kills a child after the root exits on TERM', async () => {
    const identities = new Map([
      [100, 'root-start'],
      [101, 'child-start'],
    ])
    const signals: Array<[number, TerminationSignal]> = []

    const confirmed = await terminateProcessTree(100, {
      graceMs: 0,
      forceWaitMs: 0,
      runtime: {
        snapshotTree: async pid =>
          pid === 100
            ? [
                { pid: 100, startedAt: 'root-start' },
                { pid: 101, startedAt: 'child-start' },
              ]
            : [{ pid: 101, startedAt: 'child-start' }],
        inspectLive: async expected =>
          expected.filter(
            identity => identities.get(identity.pid) === identity.startedAt,
          ),
        signalTree: async (identity, signal) => {
          signals.push([identity.pid, signal])
          if (signal === 'SIGTERM' && identity.pid === 100) {
            identities.delete(100)
          }
          if (signal === 'SIGKILL') identities.delete(identity.pid)
        },
      },
    })

    expect(confirmed).toBe(true)
    expect(signals).toEqual([
      [100, 'SIGTERM'],
      [101, 'SIGTERM'],
      [101, 'SIGKILL'],
    ])
  })

  test('does not claim success when a snapshotted child survives force kill', async () => {
    const identities = new Map([
      [200, 'root-start'],
      [201, 'child-start'],
    ])

    const confirmed = await terminateProcessTree(200, {
      graceMs: 0,
      forceWaitMs: 0,
      runtime: {
        snapshotTree: async pid =>
          pid === 200
            ? [
                { pid: 200, startedAt: 'root-start' },
                { pid: 201, startedAt: 'child-start' },
              ]
            : [{ pid: 201, startedAt: 'child-start' }],
        inspectLive: async expected =>
          expected.filter(
            identity => identities.get(identity.pid) === identity.startedAt,
          ),
        signalTree: async (identity, signal) => {
          if (identity.pid === 200 && signal === 'SIGTERM') {
            identities.delete(identity.pid)
          }
        },
      },
    })

    expect(confirmed).toBe(false)
    expect(identities.has(201)).toBe(true)
  })

  test('never force-kills a PID reused after the original child exits', async () => {
    const identities = new Map([
      [300, 'root-start'],
      [301, 'child-start'],
    ])
    const signals: Array<[number, string, TerminationSignal]> = []

    const confirmed = await terminateProcessTree(300, {
      graceMs: 0,
      forceWaitMs: 0,
      runtime: {
        snapshotTree: async pid =>
          pid === 300
            ? [
                { pid: 300, startedAt: 'root-start' },
                { pid: 301, startedAt: 'child-start' },
              ]
            : [],
        inspectLive: async expected =>
          expected.filter(
            identity => identities.get(identity.pid) === identity.startedAt,
          ),
        signalTree: async (identity, signal) => {
          signals.push([identity.pid, identity.startedAt, signal])
          identities.delete(300)
          identities.set(301, 'replacement-start')
        },
      },
    })

    expect(confirmed).toBe(true)
    expect(signals).toEqual([
      [300, 'root-start', 'SIGTERM'],
      [301, 'child-start', 'SIGTERM'],
    ])
    expect(
      signals.some(
        ([, startedAt, signal]) =>
          startedAt === 'replacement-start' || signal === 'SIGKILL',
      ),
    ).toBe(false)
    expect(identities.get(301)).toBe('replacement-start')
  })

  test('fails closed when a descendant refresh cannot be proven', async () => {
    const identities = new Map([[400, 'root-start']])
    let snapshots = 0

    const confirmed = await terminateProcessTree(400, {
      graceMs: 0,
      forceWaitMs: 0,
      runtime: {
        snapshotTree: async () => {
          snapshots++
          if (snapshots > 1) throw new Error('snapshot unavailable')
          return [{ pid: 400, startedAt: 'root-start' }]
        },
        inspectLive: async expected =>
          expected.filter(
            identity => identities.get(identity.pid) === identity.startedAt,
          ),
        signalTree: async identity => {
          identities.delete(identity.pid)
        },
      },
    })

    expect(confirmed).toBe(false)
    expect(identities.size).toBe(0)
  })
})
