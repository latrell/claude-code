import { describe, expect, test } from 'bun:test'
import { QueryGuard } from '../QueryGuard.js'

describe('QueryGuard', () => {
  test('retains the running reservation until async finalization completes', async () => {
    const guard = new QueryGuard()
    const generation = guard.tryStart()
    expect(generation).not.toBeNull()

    let releaseCleanup: (() => void) | undefined
    let cleanupStarted = false
    const finalizing = guard.finalize(generation!, async () => {
      cleanupStarted = true
      await new Promise<void>(resolve => {
        releaseCleanup = resolve
      })
    })

    await Promise.resolve()
    expect(cleanupStarted).toBe(true)
    expect(guard.status).toBe('running')
    expect(guard.reserve()).toBe(false)
    expect(guard.tryStart()).toBeNull()

    releaseCleanup?.()
    expect(await finalizing).toBe(true)
    expect(guard.status).toBe('idle')
    expect(guard.reserve()).toBe(true)
  })

  test('releases the reservation when finalization throws', async () => {
    const guard = new QueryGuard()
    const generation = guard.tryStart()
    expect(generation).not.toBeNull()

    const error = new Error('cleanup failed')
    await expect(
      guard.finalize(generation!, async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(guard.status).toBe('idle')
  })

  test('does not run stale finalization against a newer generation', async () => {
    const guard = new QueryGuard()
    const staleGeneration = guard.tryStart()
    expect(staleGeneration).not.toBeNull()
    guard.forceEnd()

    const currentGeneration = guard.tryStart()
    expect(currentGeneration).not.toBeNull()
    let cleanupRan = false

    expect(
      await guard.finalize(staleGeneration!, () => {
        cleanupRan = true
      }),
    ).toBe(false)
    expect(cleanupRan).toBe(false)
    expect(guard.status).toBe('running')
    expect(guard.end(currentGeneration!)).toBe(true)
  })

  test('reports whether dispatching entered a query or returned idle', async () => {
    const runningGuard = new QueryGuard()
    expect(runningGuard.reserve()).toBe(true)
    const runningSettlement = runningGuard.waitForDispatchSettlement()
    expect(runningGuard.tryStart()).not.toBeNull()
    expect(await runningSettlement).toBe('running')

    const idleGuard = new QueryGuard()
    expect(idleGuard.reserve()).toBe(true)
    const idleSettlement = idleGuard.waitForDispatchSettlement()
    idleGuard.cancelReservation()
    expect(await idleSettlement).toBe('idle')
  })
})
