import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createChildAbortController } from '../abortController.js'
import { isAbortError, toError } from '../errors.js'
import { logError } from '../log.js'
import { StopConfirmationError } from '../stopConfirmation.js'
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
      if (error instanceof StopConfirmationError) throw error
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
 * latency behaviour. Their exact settlement stays owned by this lifecycle:
 * abnormal teardown waits for it, while successful completion may transfer it
 * to the detached auxiliary registry. The child controller also lets generator
 * teardown cancel hook work even when the caller closes the generator without
 * first aborting the main turn controller.
 */
export class PostSamplingHookLifecycle {
  private readonly abortController: AbortController
  private readonly pending = new Set<Promise<unknown>>()
  private readonly unconfirmedFailures: StopConfirmationError[] = []
  private finalized = false
  private finishPromise: Promise<void> | undefined

  constructor(parentAbortController: AbortController) {
    this.abortController = createChildAbortController(parentAbortController)
  }

  /**
   * Signal for side requests owned by this lifecycle. Unlike the parent turn
   * signal, this also aborts when detached post-turn work is cancelled after
   * the foreground query has already completed.
   */
  get signal(): AbortSignal {
    return this.abortController.signal
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

    this.trackOwnedRequest(promise)
  }

  /**
   * Add a concurrent request whose lifetime belongs to this query turn. This
   * is also used for non-hook side requests such as tool-use summaries.
   */
  trackOwnedRequest<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise)

    // Use both branches instead of Promise.prototype.finally(): an ignored
    // promise returned by finally would reject when the owned promise rejects.
    // Retain an early StopConfirmationError after removing the settled promise;
    // otherwise finish() can miss a rejection that happened before its drain.
    void promise.then(
      () => this.pending.delete(promise),
      error => {
        this.pending.delete(promise)
        if (error instanceof StopConfirmationError) {
          this.unconfirmedFailures.push(error)
        }
      },
    )
    return promise
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
    const results = await Promise.allSettled([...this.pending])

    // Remove the child controller's listener from the parent after normal
    // completion as well as cancellation.
    if (!this.abortController.signal.aborted) {
      this.abortController.abort('post-sampling-hooks-complete')
    }

    const unconfirmed = [
      ...new Set([
        ...this.unconfirmedFailures,
        ...results.flatMap(result =>
          result.status === 'rejected' &&
          result.reason instanceof StopConfirmationError
            ? [result.reason]
            : [],
        ),
      ]),
    ]
    if (unconfirmed.length > 0) {
      throw new StopConfirmationError(
        'Post-sampling hook cancellation could not be confirmed',
        unconfirmed,
      )
    }
  }
}
