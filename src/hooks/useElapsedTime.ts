import { useCallback, useRef, useSyncExternalStore } from 'react'
import { formatDuration } from '../utils/format.js'

/**
 * Compute elapsed milliseconds from startTime to now/endTime, minus pausedMs.
 *
 * This is the pure computation shared by useElapsedTime and tested in isolation.
 * Callers that don't use the hook (e.g. Spinner.tsx idle branch) should use
 * this helper directly to avoid Date.now() leakage on completed tasks.
 *
 * @param startTime - Task start timestamp in ms
 * @param nowOrEndTime - Current time (Date.now()) or task endTime for terminal tasks
 * @param pausedMs - Total paused duration to subtract
 * @returns Non-negative elapsed milliseconds
 */
export function computeElapsedMs(
  startTime: number,
  nowOrEndTime: number,
  pausedMs: number = 0,
): number {
  return Math.max(0, nowOrEndTime - startTime - pausedMs)
}

/**
 * Hook that returns formatted elapsed time since startTime.
 * Uses useSyncExternalStore with interval-based updates for efficiency.
 *
 * @param startTime - Unix timestamp in ms
 * @param isRunning - Whether to actively update the timer
 * @param ms - How often should we trigger updates?
 * @param pausedMs - Total paused duration to subtract
 * @param endTime - If set, freezes the duration at this timestamp (for
 *   terminal tasks). Without this, viewing a 2-min task 30 min after
 *   completion would show "32m".
 * @returns Formatted duration string (e.g., "1m 23s")
 */
export function useElapsedTime(
  startTime: number,
  isRunning: boolean,
  ms: number = 1000,
  pausedMs: number = 0,
  endTime?: number,
): string {
  // Freeze a snapshot when we stop running without an explicit endTime.
  // Without this, every re-render recalculates with Date.now() causing the
  // displayed duration to grow even though the task has finished.
  const frozenRef = useRef<number | null>(null)
  if (!isRunning && endTime === undefined && frozenRef.current === null) {
    frozenRef.current = Date.now()
  }
  if (isRunning || endTime !== undefined) {
    frozenRef.current = null
  }

  const get = () =>
    formatDuration(
      computeElapsedMs(
        startTime,
        endTime ?? frozenRef.current ?? Date.now(),
        pausedMs,
      ),
    )

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!isRunning) return () => {}
      const interval = setInterval(notify, ms)
      return () => clearInterval(interval)
    },
    [isRunning, ms],
  )

  return useSyncExternalStore(subscribe, get, get)
}
