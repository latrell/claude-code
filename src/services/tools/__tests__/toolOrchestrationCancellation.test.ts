import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ToolUseContext, Tools } from '../../../Tool.js'
import type { AssistantMessage } from '../../../types/message.js'
import { toArray } from '../../../utils/generators.js'
import * as toolExecution from '../toolExecution.js'
import { runTools } from '../toolOrchestration.js'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(() => {
  mock.restore()
})

describe('runTools concurrent ownership', () => {
  test('dispatches owner cancellation before awaiting sibling return', async () => {
    const owner = new AbortController()
    const siblingStarted = deferred()
    const siblingSettled = deferred()
    const failure = new Error('tool generator failed')
    const toolUseMessages = [
      { type: 'tool_use', id: 'failing', name: 'TestTool', input: {} },
      { type: 'tool_use', id: 'sibling', name: 'TestTool', input: {} },
    ] as ToolUseBlock[]
    const tools = [
      {
        name: 'TestTool',
        inputSchema: {
          safeParse: () => ({ success: true, data: {} }),
        },
        isConcurrencySafe: () => true,
      },
    ] as unknown as Tools
    const context = {
      abortController: owner,
      options: { tools },
      setInProgressToolUseIDs: () => {},
    } as unknown as ToolUseContext
    const assistantMessages = [
      {
        type: 'assistant',
        message: { content: toolUseMessages },
      },
    ] as unknown as AssistantMessage[]

    async function* failingTool() {
      await siblingStarted.promise
      yield* []
      throw failure
    }

    async function* siblingTool() {
      siblingStarted.resolve()
      try {
        if (!owner.signal.aborted) {
          await new Promise<void>(resolve => {
            owner.signal.addEventListener('abort', () => resolve(), {
              once: true,
            })
          })
        }
      } finally {
        siblingSettled.resolve()
      }
      yield* []
    }

    spyOn(toolExecution, 'runToolUse').mockImplementation(toolUse =>
      toolUse.id === 'failing' ? failingTool() : siblingTool(),
    )

    const running = toArray(
      runTools(
        toolUseMessages,
        assistantMessages,
        (() => Promise.reject(new Error('unused'))) as never,
        context,
      ),
    )

    await expect(running).rejects.toBe(failure)
    expect(owner.signal.aborted).toBe(true)
    expect(owner.signal.reason).toBe('concurrent-tool-batch-cancelled')
    await siblingSettled.promise
  })
})
