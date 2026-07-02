import { describe, expect, test } from 'bun:test'
import { computeElapsedMs } from '../useElapsedTime.js'

describe('computeElapsedMs', () => {
  test('returns correct elapsed time without pausedMs', () => {
    const startTime = 1000
    const now = 5000
    expect(computeElapsedMs(startTime, now)).toBe(4000)
  })

  test('subtracts pausedMs from elapsed time', () => {
    const startTime = 1000
    const now = 10000
    const pausedMs = 3000
    expect(computeElapsedMs(startTime, now, pausedMs)).toBe(6000)
  })

  test('returns 0 when pausedMs exceeds elapsed time', () => {
    const startTime = 5000
    const now = 6000
    const pausedMs = 2000
    expect(computeElapsedMs(startTime, now, pausedMs)).toBe(0)
  })

  test('returns 0 when startTime equals nowOrEndTime', () => {
    const t = Date.now()
    expect(computeElapsedMs(t, t)).toBe(0)
  })

  test('returns 0 when nowOrEndTime is before startTime (Math.max guard)', () => {
    expect(computeElapsedMs(5000, 3000)).toBe(0)
  })

  test('terminal task with endTime is stable regardless of actual Date.now', () => {
    // Simulate a task that started at t=0 and ended at t=10s.
    // If we pass endTime=10000, the result should always be ~10s
    // even if real Date.now() has advanced to 1 hour later.
    const startTime = 0
    const endTime = 10_000 // 10s later
    const pausedMs = 0

    const elapsed = computeElapsedMs(startTime, endTime, pausedMs)
    expect(elapsed).toBe(10_000)

    // Verify it stays the same regardless of "current time" — the caller
    // passes endTime directly, so computeElapsedMs never sees Date.now().
    const elapsedAgain = computeElapsedMs(startTime, endTime, pausedMs)
    expect(elapsedAgain).toBe(10_000)
  })

  test('paused terminal task uses correct elapsed time', () => {
    // Started at t=0, ended at t=30s, paused for 5s → net 25s
    const startTime = 0
    const endTime = 30_000
    const pausedMs = 5_000
    expect(computeElapsedMs(startTime, endTime, pausedMs)).toBe(25_000)
  })

  test('handles large values consistently', () => {
    // 2 minutes 5 seconds = 125,000ms
    expect(computeElapsedMs(0, 125_000)).toBe(125_000)
    // 1 hour = 3,600,000ms
    expect(computeElapsedMs(0, 3_600_000)).toBe(3_600_000)
  })
})
