import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  createUserMessage,
  REJECT_MESSAGE,
  withMemoryCorrectionHint,
} from 'src/utils/messages.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { findToolByName, type Tools, type ToolUseContext } from '../../Tool.js'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import type { AssistantMessage, Message } from '../../types/message.js'
import { createChildAbortController } from '../../utils/abortController.js'
import { runToolUse } from './toolExecution.js'
import { createToolBatchSpan, endToolBatchSpan } from '../langfuse/index.js'
import type { LangfuseSpan } from '../langfuse/index.js'
import {
  AbortSettlementTimeoutError,
  waitForAbortSettlement,
} from '../../utils/abortSettlement.js'
import { StopConfirmationError } from '../../utils/stopConfirmation.js'

const TOOL_ABORT_SETTLEMENT_GRACE_MS = 2_000

type StreamingToolExecutorOptions = {
  /** @internal Allows cancellation tests to use a deterministic short grace. */
  abortSettlementGraceMs?: number
}

type MessageUpdate = {
  message?: Message
  newContext?: ToolUseContext
}

type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded'

type TrackedTool = {
  id: string
  block: ToolUseBlock
  assistantMessage: AssistantMessage
  status: ToolStatus
  isConcurrencySafe: boolean
  promise?: Promise<void>
  results?: Message[]
  // Progress messages are stored separately and yielded immediately
  pendingProgress: Message[]
  contextModifiers?: Array<(context: ToolUseContext) => ToolUseContext>
}

/**
 * Executes tools as they stream in with concurrency control.
 * - Concurrent-safe tools can execute in parallel with other concurrent-safe tools
 * - Non-concurrent tools must execute alone (exclusive access)
 * - Results are buffered and emitted in the order tools were received
 */
export class StreamingToolExecutor {
  private tools: TrackedTool[] = []
  private toolUseContext: ToolUseContext
  private hasErrored = false
  private erroredToolDescription = ''
  private siblingAbortController: AbortController
  private discarded = false
  private progressAvailableResolve?: () => void
  private turnSpan: LangfuseSpan | null = null
  private readonly abortSettlementGraceMs: number
  private terminationPromise?: Promise<void>

  constructor(
    private readonly toolDefinitions: Tools,
    private readonly canUseTool: CanUseToolFn,
    toolUseContext: ToolUseContext,
    options: StreamingToolExecutorOptions = {},
  ) {
    this.toolUseContext = toolUseContext
    this.abortSettlementGraceMs =
      options.abortSettlementGraceMs ?? TOOL_ABORT_SETTLEMENT_GRACE_MS
    this.siblingAbortController = createChildAbortController(
      toolUseContext.abortController,
    )
  }

  /**
   * Discards all pending and in-progress tools. Called when streaming fallback
   * occurs and results from the failed attempt should be abandoned.
   * Queued tools won't start, and in-progress tools will receive synthetic errors.
   *
   * Releases internal references only after every executing promise settles.
   * An abort-ignoring tool remains owned and rejects discard confirmation, so a
   * fallback attempt cannot overlap it.
   */
  discard(): Promise<void> {
    return this.terminateOwnedTools(
      'streaming_fallback',
      'discarded streaming tool execution',
    )
  }

  /**
   * Stop every execution owned by this executor and retain their promises until
   * they really settle. Merely dispatching AbortSignal is not confirmation: a
   * tool adapter can ignore it and continue a subprocess or remote request.
   */
  private terminateOwnedTools(
    reason: string,
    operation: string,
  ): Promise<void> {
    if (this.terminationPromise) return this.terminationPromise

    // Publish the closing state before the first await so processQueue cannot
    // start a queued tool while teardown is taking its promise snapshot.
    this.discarded = true
    for (const tool of this.tools) {
      if (tool.status === 'queued') tool.status = 'completed'
    }

    // Cancellation must be dispatched before waiting for settlement.
    this.siblingAbortController.abort(reason)
    this.progressAvailableResolve?.()
    this.progressAvailableResolve = undefined

    const executingPromises = this.tools.flatMap(tool =>
      tool.status === 'executing' && tool.promise ? [tool.promise] : [],
    )
    const actualSettlement = Promise.allSettled(executingPromises).then(
      () => undefined,
    )
    const settlementDeadline = new AbortController()
    settlementDeadline.abort(reason)

    const releaseReferences = (): void => {
      for (const tool of this.tools) {
        if (tool.status !== 'yielded') {
          markToolUseAsComplete(this.toolUseContext, tool.id)
        }
      }
      this.tools.length = 0
      if (this.turnSpan) {
        endToolBatchSpan(this.turnSpan)
        this.turnSpan = null
      }
    }

    const termination = waitForAbortSettlement(
      actualSettlement,
      settlementDeadline.signal,
      this.abortSettlementGraceMs,
      operation,
    ).then(
      () => {
        releaseReferences()
      },
      error => {
        if (error instanceof AbortSettlementTimeoutError) {
          // Keep the executor's references until a late settlement so the live
          // promises are not orphaned after reporting failed confirmation.
          void actualSettlement.then(() => {
            try {
              releaseReferences()
            } catch {
              // The caller already received the authoritative confirmation
              // failure. Late UI/telemetry cleanup must not create an unhandled
              // rejection after the owned execution eventually settles.
            }
          })
          throw new StopConfirmationError(
            `${operation} did not confirm termination after cancellation`,
            [error],
          )
        }
        throw error
      },
    )
    this.terminationPromise = termination
    return termination
  }

  /**
   * Add a tool to the execution queue. Will start executing immediately if conditions allow.
   */
  addTool(block: ToolUseBlock, assistantMessage: AssistantMessage): void {
    // Create turn span on first tool — will be ended in getRemainingResults
    if (this.tools.length === 0 && this.turnSpan === null) {
      this.turnSpan = createToolBatchSpan(
        this.toolUseContext.langfuseTrace ?? null,
        { toolNames: [block.name], batchIndex: 0 },
      )
      if (this.turnSpan) {
        this.toolUseContext = {
          ...this.toolUseContext,
          langfuseBatchSpan: this.turnSpan,
        }
      }
    }
    const toolDefinition = findToolByName(this.toolDefinitions, block.name)
    if (!toolDefinition) {
      this.tools.push({
        id: block.id,
        block,
        assistantMessage,
        status: 'completed',
        isConcurrencySafe: true,
        pendingProgress: [],
        results: [
          createUserMessage({
            content: [
              {
                type: 'tool_result',
                content: `<tool_use_error>Error: No such tool available: ${block.name}</tool_use_error>`,
                is_error: true,
                tool_use_id: block.id,
              },
            ],
            toolUseResult: `Error: No such tool available: ${block.name}`,
            sourceToolAssistantUUID: assistantMessage.uuid,
          }),
        ],
      })
      return
    }

    const parsedInput = toolDefinition.inputSchema.safeParse(block.input)
    const isConcurrencySafe = parsedInput?.success
      ? (() => {
          try {
            return Boolean(toolDefinition.isConcurrencySafe(parsedInput.data))
          } catch {
            return false
          }
        })()
      : false
    this.tools.push({
      id: block.id,
      block,
      assistantMessage,
      status: 'queued',
      isConcurrencySafe,
      pendingProgress: [],
    })

    void this.processQueue()
  }

  /**
   * Check if a tool can execute based on current concurrency state
   */
  private canExecuteTool(isConcurrencySafe: boolean): boolean {
    const executingTools = this.tools.filter(t => t.status === 'executing')
    return (
      executingTools.length === 0 ||
      (isConcurrencySafe && executingTools.every(t => t.isConcurrencySafe))
    )
  }

  /**
   * Process the queue, starting tools when concurrency conditions allow
   */
  private async processQueue(): Promise<void> {
    for (const tool of this.tools) {
      if (tool.status !== 'queued') continue

      if (this.canExecuteTool(tool.isConcurrencySafe)) {
        await this.executeTool(tool)
      } else {
        // Can't execute this tool yet, and since we need to maintain order for non-concurrent tools, stop here
        if (!tool.isConcurrencySafe) break
      }
    }
  }

  private createSyntheticErrorMessage(
    toolUseId: string,
    reason: 'sibling_error' | 'user_interrupted' | 'streaming_fallback',
    assistantMessage: AssistantMessage,
  ): Message {
    // For user interruptions (ESC to reject), use REJECT_MESSAGE so the UI shows
    // "User rejected edit" instead of "Error editing file"
    if (reason === 'user_interrupted') {
      return createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: withMemoryCorrectionHint(REJECT_MESSAGE),
            is_error: true,
            tool_use_id: toolUseId,
          },
        ],
        toolUseResult: 'User rejected tool use',
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
    if (reason === 'streaming_fallback') {
      return createUserMessage({
        content: [
          {
            type: 'tool_result',
            content:
              '<tool_use_error>Error: Streaming fallback - tool execution discarded</tool_use_error>',
            is_error: true,
            tool_use_id: toolUseId,
          },
        ],
        toolUseResult: 'Streaming fallback - tool execution discarded',
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
    const desc = this.erroredToolDescription
    const msg = desc
      ? `Cancelled: parallel tool call ${desc} errored`
      : 'Cancelled: parallel tool call errored'
    return createUserMessage({
      content: [
        {
          type: 'tool_result',
          content: `<tool_use_error>${msg}</tool_use_error>`,
          is_error: true,
          tool_use_id: toolUseId,
        },
      ],
      toolUseResult: msg,
      sourceToolAssistantUUID: assistantMessage.uuid,
    })
  }

  /**
   * Determine why a tool should be cancelled.
   */
  private getAbortReason(
    tool: TrackedTool,
  ): 'sibling_error' | 'user_interrupted' | 'streaming_fallback' | null {
    if (this.discarded) {
      return 'streaming_fallback'
    }
    if (this.hasErrored) {
      return 'sibling_error'
    }
    if (this.toolUseContext.abortController.signal.aborted) {
      // 'interrupt' means the user typed a new message while tools were
      // running. Only cancel tools whose interruptBehavior is 'cancel';
      // 'block' tools shouldn't reach here (abort isn't fired).
      if (this.toolUseContext.abortController.signal.reason === 'interrupt') {
        return this.getToolInterruptBehavior(tool) === 'cancel'
          ? 'user_interrupted'
          : null
      }
      return 'user_interrupted'
    }
    return null
  }

  private getToolInterruptBehavior(tool: TrackedTool): 'cancel' | 'block' {
    const definition = findToolByName(this.toolDefinitions, tool.block.name)
    if (!definition?.interruptBehavior) return 'block'
    try {
      return definition.interruptBehavior()
    } catch {
      return 'block'
    }
  }

  private getToolDescription(tool: TrackedTool): string {
    const input = tool.block.input as Record<string, unknown> | undefined
    const summary = input?.command ?? input?.file_path ?? input?.pattern ?? ''
    if (typeof summary === 'string' && summary.length > 0) {
      const truncated =
        summary.length > 40 ? summary.slice(0, 40) + '\u2026' : summary
      return `${tool.block.name}(${truncated})`
    }
    return tool.block.name
  }

  private updateInterruptibleState(): void {
    const executing = this.tools.filter(t => t.status === 'executing')
    this.toolUseContext.setHasInterruptibleToolInProgress?.(
      executing.length > 0 &&
        executing.every(t => this.getToolInterruptBehavior(t) === 'cancel'),
    )
  }

  /**
   * Execute a tool and collect its results
   */
  private async executeTool(tool: TrackedTool): Promise<void> {
    tool.status = 'executing'
    this.toolUseContext.setInProgressToolUseIDs(prev =>
      new Set(prev).add(tool.id),
    )
    this.updateInterruptibleState()

    const messages: Message[] = []
    const contextModifiers: Array<(context: ToolUseContext) => ToolUseContext> =
      []

    const collectResults = async () => {
      // If already aborted (by error or user), generate synthetic error block instead of running the tool
      const initialAbortReason = this.getAbortReason(tool)
      if (initialAbortReason) {
        messages.push(
          this.createSyntheticErrorMessage(
            tool.id,
            initialAbortReason,
            tool.assistantMessage,
          ),
        )
        tool.results = messages
        tool.contextModifiers = contextModifiers
        tool.status = 'completed'
        this.updateInterruptibleState()
        return
      }

      // Per-tool child controller. Lets siblingAbortController kill running
      // subprocesses (Bash spawns listen to this signal) when a Bash error
      // cascades. Permission-dialog rejection also aborts this controller
      // (PermissionContext.ts cancelAndAbort) — that abort must bubble up to
      // the query controller so the query loop's post-tool abort check ends
      // the turn. Without bubble-up, ExitPlanMode "clear context + auto"
      // sends REJECT_MESSAGE to the model instead of aborting (#21056 regression).
      const toolAbortController = createChildAbortController(
        this.siblingAbortController,
      )
      toolAbortController.signal.addEventListener(
        'abort',
        () => {
          if (
            toolAbortController.signal.reason !== 'sibling_error' &&
            !this.toolUseContext.abortController.signal.aborted &&
            !this.discarded
          ) {
            this.toolUseContext.abortController.abort(
              toolAbortController.signal.reason,
            )
          }
        },
        { once: true },
      )

      const generator = runToolUse(
        tool.block,
        tool.assistantMessage,
        this.canUseTool,
        { ...this.toolUseContext, abortController: toolAbortController },
      )

      // Track if this specific tool has produced an error result.
      // This prevents the tool from receiving a duplicate "sibling error"
      // message when it is the one that caused the error.
      let thisToolErrored = false

      for await (const update of generator) {
        // Check if we were aborted by a sibling tool error or user interruption.
        // Only add the synthetic error if THIS tool didn't produce the error.
        const abortReason = this.getAbortReason(tool)
        if (abortReason && !thisToolErrored) {
          messages.push(
            this.createSyntheticErrorMessage(
              tool.id,
              abortReason,
              tool.assistantMessage,
            ),
          )
          break
        }

        const isErrorResult =
          update.message.type === 'user' &&
          Array.isArray(update.message.message!.content) &&
          update.message.message!.content.some(
            _ => _.type === 'tool_result' && _.is_error === true,
          )

        if (isErrorResult) {
          thisToolErrored = true
          // Only Bash errors cancel siblings. Bash commands often have implicit
          // dependency chains (e.g. mkdir fails → subsequent commands pointless).
          // Read/WebFetch/etc are independent — one failure shouldn't nuke the rest.
          if (tool.block.name === BASH_TOOL_NAME) {
            this.hasErrored = true
            this.erroredToolDescription = this.getToolDescription(tool)
            this.siblingAbortController.abort('sibling_error')
          }
        }

        if (update.message) {
          // Progress messages go to pendingProgress for immediate yielding
          if (update.message.type === 'progress') {
            tool.pendingProgress.push(update.message)
            // Signal that progress is available
            if (this.progressAvailableResolve) {
              this.progressAvailableResolve()
              this.progressAvailableResolve = undefined
            }
          } else {
            messages.push(update.message)
          }
        }
        if (update.contextModifier) {
          contextModifiers.push(update.contextModifier.modifyContext)
        }
      }
      tool.results = messages
      tool.contextModifiers = contextModifiers
      tool.status = 'completed'
      this.updateInterruptibleState()

      // NOTE: we currently don't support context modifiers for concurrent
      //       tools. None are actively being used, but if we want to use
      //       them in concurrent tools, we need to support that here.
      if (!tool.isConcurrencySafe && contextModifiers.length > 0) {
        for (const modifier of contextModifiers) {
          this.toolUseContext = modifier(this.toolUseContext)
        }
      }
    }

    const promise = collectResults()
    tool.promise = promise

    // Process more queue when done
    void promise.then(
      () => {
        void this.processQueue()
      },
      () => {
        void this.processQueue()
      },
    )
  }

  /**
   * Get any completed results that haven't been yielded yet (non-blocking)
   * Maintains order where necessary
   * Also yields any pending progress messages immediately
   */
  *getCompletedResults(): Generator<MessageUpdate, void> {
    if (this.discarded) {
      return
    }

    for (const tool of this.tools) {
      // Always yield pending progress messages immediately, regardless of tool status
      while (tool.pendingProgress.length > 0) {
        const progressMessage = tool.pendingProgress.shift()!
        yield { message: progressMessage, newContext: this.toolUseContext }
      }

      if (tool.status === 'yielded') {
        continue
      }

      if (tool.status === 'completed' && tool.results) {
        tool.status = 'yielded'

        for (const message of tool.results) {
          yield { message, newContext: this.toolUseContext }
        }

        markToolUseAsComplete(this.toolUseContext, tool.id)
      } else if (tool.status === 'executing' && !tool.isConcurrencySafe) {
        break
      }
    }
  }

  /**
   * Check if any tool has pending progress messages
   */
  private hasPendingProgress(): boolean {
    return this.tools.some(t => t.pendingProgress.length > 0)
  }

  /**
   * Wait for remaining tools and yield their results as they complete
   * Also yields progress messages as they become available
   */
  async *getRemainingResults(): AsyncGenerator<MessageUpdate, void> {
    if (this.discarded) {
      await this.terminationPromise
      return
    }

    let resolveDrainSettlement!: () => void
    let rejectDrainSettlement!: (error: unknown) => void
    const drainSettlement = new Promise<void>((resolve, reject) => {
      resolveDrainSettlement = resolve
      rejectDrainSettlement = reject
    })
    const abortGuard = waitForAbortSettlement(
      drainSettlement,
      this.toolUseContext.abortController.signal,
      this.abortSettlementGraceMs,
      'streaming tool execution',
    ).catch(error => {
      if (error instanceof AbortSettlementTimeoutError) {
        throw new StopConfirmationError(
          'Tool execution did not confirm termination after cancellation',
          [error],
        )
      }
      throw error
    })
    // A consumer may pause between yielded progress messages. Keep the guard's
    // rejection handled until the next iterator step races it explicitly.
    void abortGuard.catch(() => {})

    let didThrow = false
    let primaryError: unknown
    try {
      while (this.hasUnfinishedTools()) {
        await Promise.race([this.processQueue(), abortGuard])

        for (const result of this.getCompletedResults()) {
          yield result
        }

        // If we still have executing tools but nothing completed, wait for any to complete
        // OR for progress to become available
        if (
          this.hasExecutingTools() &&
          !this.hasCompletedResults() &&
          !this.hasPendingProgress()
        ) {
          const executingPromises = this.tools
            .filter(t => t.status === 'executing' && t.promise)
            .map(t => t.promise!)

          // Also wait for progress to become available
          const progressPromise = new Promise<void>(resolve => {
            this.progressAvailableResolve = resolve
          })

          if (executingPromises.length > 0) {
            await Promise.race([
              ...executingPromises,
              progressPromise,
              abortGuard,
            ])
          }
        }
      }

      for (const result of this.getCompletedResults()) {
        yield result
      }
    } catch (error) {
      didThrow = true
      primaryError = error
      throw error
    } finally {
      this.progressAvailableResolve?.()
      this.progressAvailableResolve = undefined

      let terminationError: unknown
      try {
        // An early consumer return or exception must not leave tools running
        // without an owner. Await the actual promises after dispatching abort;
        // resolving the iterator drain alone is not execution settlement.
        if (this.hasUnfinishedTools()) {
          await this.terminateOwnedTools(
            'stream_consumer_cancelled',
            'streaming tool execution',
          )
        } else if (this.terminationPromise) {
          await this.terminationPromise
        }
        resolveDrainSettlement()
      } catch (error) {
        terminationError = error
        rejectDrainSettlement(error)
      }

      if (!this.terminationPromise) {
        endToolBatchSpan(this.turnSpan)
        this.turnSpan = null
      }

      if (terminationError !== undefined) {
        if (primaryError instanceof StopConfirmationError) {
          // The primary watchdog already states exactly which Stop could not
          // be confirmed. Do not replace it with a secondary teardown timeout.
        } else if (didThrow) {
          // biome-ignore lint/correctness/noUnsafeFinally: unconfirmed owned tool execution must override a less informative primary failure.
          throw new StopConfirmationError(
            'Tool execution failed and owned tool termination was not confirmed',
            [primaryError, terminationError],
          )
        } else {
          // biome-ignore lint/correctness/noUnsafeFinally: consumer return cannot report success while owned tools remain unconfirmed.
          throw terminationError
        }
      }
    }
  }

  /**
   * Check if there are any completed results ready to yield
   */
  private hasCompletedResults(): boolean {
    return this.tools.some(t => t.status === 'completed')
  }

  /**
   * Check if there are any tools still executing
   */
  private hasExecutingTools(): boolean {
    return this.tools.some(t => t.status === 'executing')
  }

  /**
   * Check if there are any unfinished tools
   */
  private hasUnfinishedTools(): boolean {
    return this.tools.some(t => t.status !== 'yielded')
  }

  /**
   * Get the current tool use context (may have been modified by context modifiers)
   */
  getUpdatedContext(): ToolUseContext {
    return this.toolUseContext
  }
}

function markToolUseAsComplete(
  toolUseContext: ToolUseContext,
  toolUseID: string,
) {
  toolUseContext.setInProgressToolUseIDs(prev => {
    const next = new Set(prev)
    next.delete(toolUseID)
    return next
  })
}
