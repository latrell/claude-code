/**
 * Defer execution to the next event-loop tick, after React/Ink has flushed
 * pending state updates (e.g. clearing suggestion dropdowns). Use to ensure
 * UI state is rendered before a side-effect like command execution runs.
 */
export function deferUntilNextFrame(fn: () => void): void {
  setTimeout(fn, 0)
}

/**
 * Returns a Promise that resolves after the next macrotask tick, giving
 * React/Ink one render cycle to flush pending state changes. Await this
 * after a setState that clears UI (e.g. suggestions) and before a
 * side-effect that may terminate the process (e.g. /exit).
 */
export function waitUntilNextFrame(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Wait long enough for an Ink render throttle window to pass.
 *
 * Ink throttles renders to FRAME_INTERVAL_MS (16ms) via a lodash-style
 * throttle with leadingEdge=true. After a setState that changes visible UI:
 *   - The FIRST onRender() fires immediately (leading edge).
 *   - If a SECOND render is scheduled within the 16ms window, the throttle
 *     defers it to the trailing edge (setTimeout).
 *
 * `setTimeout(0)` / `waitUntilNextFrame()` only guarantees the NEXT macrotask
 * tick, which may fire BEFORE the throttle's trailing-edge setTimeout(16ms).
 * This is racy: gracefulShutdown's cleanupTerminalModes() calls
 * detachForShutdown() which cancels pending throttled renders. If the trailing
 * render hasn't fired yet, the terminal never sees the updated frame.
 *
 * Waiting 20ms (FRAME_INTERVAL_MS + 4ms margin) ensures the throttled render
 * has fired before the caller proceeds to gracefulShutdown.
 */
export function waitForInkRenderFrame(): Promise<void> {
  // Ink FRAME_INTERVAL_MS = 16; use 20ms for a small safety margin.
  return new Promise(resolve => setTimeout(resolve, 20))
}
