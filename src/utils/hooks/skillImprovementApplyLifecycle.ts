import { createAbortController } from '../abortController.js'
import { isAbortError } from '../errors.js'

/**
 * Owns the one in-flight skill-improvement apply request started by the UI.
 * Starting a replacement request aborts the older one, while settle() uses
 * identity checks so an older promise cannot clear a newer request.
 */
export class SkillImprovementApplyLifecycle {
  private activeController: AbortController | null = null

  start(): AbortController {
    this.cancel()
    const controller = createAbortController()
    this.activeController = controller
    return controller
  }

  cancel(): boolean {
    const controller = this.activeController
    if (!controller || controller.signal.aborted) return false

    // Keep the controller current until its promise settles. This lets the UI
    // distinguish "abort requested" from "HTTP/filesystem work has actually
    // stopped" and prevents loading from clearing too early.
    controller.abort()
    return true
  }

  isCurrent(controller: AbortController): boolean {
    return this.activeController === controller && !controller.signal.aborted
  }

  settle(controller: AbortController): boolean {
    if (this.activeController !== controller) return false
    this.activeController = null
    return true
  }

  get isActive(): boolean {
    return this.activeController !== null
  }
}

/**
 * Run the final file commit only while its request is still active. The
 * operation also receives the signal so cancellable filesystem APIs can stop
 * work if cancellation races with an already-started write.
 */
export async function commitSkillImprovementIfActive(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<void>,
): Promise<boolean> {
  if (signal.aborted) return false

  try {
    await operation(signal)
    return !signal.aborted
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return false
    throw error
  }
}
