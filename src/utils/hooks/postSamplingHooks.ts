import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createChildAbortController } from '../abortController.js'
import { isAbortError, toError } from '../errors.js'
import { logError } from '../log.js'
import type { SystemPrompt } from '../systemPromptType.js'

// Post-sampling hook - not exposed in settings.json config (yet), only used programmatically

// Generic context for REPL hooks (both post-sampling and stop hooks)
export type REPLHookContext = {
  messages: Message[] // Full message history including assistant responses
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  toolUseContext: ToolUseContext
  querySource?: QuerySource
}

export type PostSamplingHook = (
  context: REPLHookContext,
) => Promise<void> | void

// Internal registry for post-sampling hooks
const postSamplingHooks: PostSamplingHook[] = []

/**
 * Register a post-sampling hook that will be called after model sampling completes
 * This is an internal API not exposed through settings
 */
export function registerPostSamplingHook(hook: PostSamplingHook): void {
  postSamplingHooks.push(hook)
}

/**
 * Clear all registered post-sampling hooks (for testing)
 */
export function clearPostSamplingHooks(): void {
  postSamplingHooks.length = 0
}

/**
 * Execute all registered post-sampling hooks
 */
export async function executePostSamplingHooks(
  messages: Message[],
  systemPrompt: SystemPrompt,
  userContext: { [k: string]: string },
  systemContext: { [k: string]: string },
  toolUseContext: ToolUseContext,
  querySource?: QuerySource,
): Promise<void> {
  const context: REPLHookContext = {
    messages,
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource,
  }

  for (const hook of postSamplingHooks) {
    if (toolUseContext.abortController.signal.aborted) return
    try {
      await hook(context)
    } catch (error) {
      if (
        toolUseContext.abortController.signal.aborted ||
        isAbortError(error)
      ) {
        return
      }
      // Log but don't fail on hook errors
      logError(toError(error))
    }
  }
}

/**
 * Owns every post-sampling hook started by one query turn.
 *
 * Hooks still overlap subsequent tool/model work, preserving the existing
 * latency behaviour, but the turn cannot finish while one of its hooks is
 * still running. The child controller also gives generator teardown an
 * explicit way to cancel hook work even when the caller closes the generator
 * without first aborting the main turn controller.
 */
export class PostSamplingHookLifecycle {
  private readonly abortController: AbortController
  private readonly pending = new Set<Promise<void>>()
  private finalized = false
  private finishPromise: Promise<void> | undefined

  constructor(parentAbortController: AbortController) {
    this.abortController = createChildAbortController(parentAbortController)
  }

  schedule(
    messages: Message[],
    systemPrompt: SystemPrompt,
    userContext: { [k: string]: string },
    systemContext: { [k: string]: string },
    toolUseContext: ToolUseContext,
    querySource?: QuerySource,
  ): void {
    if (this.finalized || this.abortController.signal.aborted) return

    const promise = executePostSamplingHooks(
      messages,
      systemPrompt,
      userContext,
      systemContext,
      {
        ...toolUseContext,
        abortController: this.abortController,
      },
      querySource,
    )
    this.pending.add(promise)

    // Use both branches instead of Promise.prototype.finally(): an ignored
    // promise returned by finally would reject when the hook promise rejects.
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    )
  }

  finish(options?: { abort?: boolean; reason?: unknown }): Promise<void> {
    if (options?.abort && !this.abortController.signal.aborted) {
      this.abortController.abort(options.reason)
    }

    if (!this.finishPromise) {
      this.finalized = true
      this.finishPromise = this.drain()
    }
    return this.finishPromise
  }

  private async drain(): Promise<void> {
    await Promise.allSettled([...this.pending])

    // Remove the child controller's listener from the parent after normal
    // completion as well as cancellation.
    if (!this.abortController.signal.aborted) {
      this.abortController.abort('post-sampling-hooks-complete')
    }
  }
}
