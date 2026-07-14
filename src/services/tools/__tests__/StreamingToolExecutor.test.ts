import { describe, expect, mock, test } from 'bun:test'
import { z } from 'zod/v4'
import { StreamingToolExecutor } from '../StreamingToolExecutor.js'
import type { Tool, ToolUseContext } from '../../../Tool.js'
import { createAssistantMessage } from '../../../utils/messages.js'

function makeMinimalContext(): ToolUseContext {
  const abortController = new AbortController()
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { builtinAgents: [], customAgents: [] },
    },
    abortController,
    readFileState: {
      get: () => undefined,
      set: () => {},
      delete: () => false,
      has: () => false,
      clear: () => {},
    } as any,
    getAppState: () => ({}) as any,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as unknown as ToolUseContext
}

describe('StreamingToolExecutor.discard()', () => {
  test('clears the internal tools array', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    // Access internal state via reflection
    const toolsBefore = (executor as unknown as { tools: unknown[] }).tools
    expect(toolsBefore).toHaveLength(0)

    executor.discard()

    const toolsAfter = (executor as unknown as { tools: unknown[] }).tools
    expect(toolsAfter).toHaveLength(0)
  })

  test('aborts the sibling abort controller', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    const siblingController = (
      executor as unknown as { siblingAbortController: AbortController }
    ).siblingAbortController
    expect(siblingController.signal.aborted).toBe(false)

    executor.discard()

    expect(siblingController.signal.aborted).toBe(true)
  })

  test('sets discarded flag so getCompletedResults yields nothing', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const results = [...executor.getCompletedResults()]
    expect(results).toHaveLength(0)
  })

  test('sets discarded flag so getRemainingResults yields nothing', async () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const results: unknown[] = []
    for await (const update of executor.getRemainingResults()) {
      results.push(update)
    }
    expect(results).toHaveLength(0)
  })

  test('clears progressAvailableResolve', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const resolve = (
      executor as unknown as { progressAvailableResolve?: () => void }
    ).progressAvailableResolve
    expect(resolve).toBeUndefined()
  })

  test('can be called multiple times without error', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    expect(() => {
      executor.discard()
      executor.discard()
      executor.discard()
    }).not.toThrow()
  })

  test('releases references to allow GC of discarded executor', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    // All internal references should be cleared/released
    const internals = executor as unknown as {
      tools: unknown[]
      progressAvailableResolve?: () => void
      turnSpan: unknown
    }
    expect(internals.tools).toHaveLength(0)
    expect(internals.progressAvailableResolve).toBeUndefined()
    expect(internals.turnSpan).toBeNull()
  })
})

describe('StreamingToolExecutor cancellation checkpoints', () => {
  test('does not call a tool when cancellation happens during async validation', async () => {
    const context = makeMinimalContext()
    const call = mock(async () => ({ data: 'should not run' }))
    const inputSchema = z.object({ value: z.string() })
    const validateInput = mock(
      async (
        _input: z.infer<typeof inputSchema>,
        toolContext: ToolUseContext,
      ) => {
        toolContext.abortController.abort('user-cancel')
        return { result: true as const }
      },
    )
    const tool = {
      name: 'CancellationCheckpointTest',
      inputSchema,
      maxResultSizeChars: 1000,
      isConcurrencySafe: () => true,
      isEnabled: () => true,
      isReadOnly: () => true,
      validateInput,
      call,
    } as unknown as Tool
    context.options.tools = [tool]
    const executor = new StreamingToolExecutor(
      [tool],
      () => Promise.resolve({ behavior: 'allow', updatedInput: {} }),
      context,
    )
    executor.addTool(
      {
        type: 'tool_use',
        id: 'tool-1',
        name: tool.name,
        input: { value: 'test' },
        caller: { type: 'direct' },
      },
      createAssistantMessage({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: tool.name,
            input: { value: 'test' },
          },
        ],
      }),
    )

    const results = []
    for await (const result of executor.getRemainingResults()) {
      results.push(result)
    }

    expect(call).not.toHaveBeenCalled()
    expect(validateInput).toHaveBeenCalledTimes(1)
    expect(context.abortController.signal.aborted).toBe(true)
    expect(results).toHaveLength(1)
  })

  test('aborts orphaned tools when the remaining-results consumer returns early', async () => {
    const context = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, context)
    const internals = executor as unknown as {
      tools: Array<Record<string, unknown>>
      siblingAbortController: AbortController
    }
    internals.tools.push({
      id: 'tool-pending',
      block: {
        type: 'tool_use',
        id: 'tool-pending',
        name: 'PendingTool',
        input: {},
        caller: { type: 'direct' },
      },
      assistantMessage: createAssistantMessage({ content: [] }),
      status: 'executing',
      isConcurrencySafe: true,
      promise: new Promise<void>(() => {}),
      pendingProgress: [createAssistantMessage({ content: 'progress' })],
    })
    const iterator = executor.getRemainingResults()

    expect((await iterator.next()).done).toBe(false)
    await iterator.return()

    expect(internals.siblingAbortController.signal.aborted).toBe(true)
  })
})
