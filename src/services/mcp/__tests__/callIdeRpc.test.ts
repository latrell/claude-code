import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
import { StopConfirmationError } from '../../../utils/stopConfirmation.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO ??= {
  VERSION: '0.0.0-test',
}

const callToolMock = mock(
  async (
    _request: unknown,
    _schema: unknown,
    _options?: { signal?: AbortSignal },
  ) => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
)

const { callIdeRpc, callMCPTool } = await import('../client.js')

function makeIdeClient(): Parameters<typeof callIdeRpc>[2] {
  return {
    type: 'connected',
    name: 'ide',
    config: { type: 'stdio', command: 'test' },
    capabilities: {},
    client: { callTool: callToolMock },
  } as unknown as Parameters<typeof callIdeRpc>[2]
}

beforeEach(() => {
  callToolMock.mockClear()
})

describe('callIdeRpc cancellation', () => {
  test('passes a caller-owned abort signal to the MCP SDK', async () => {
    const abortController = new AbortController()

    await callIdeRpc('test_tool', {}, makeIdeClient(), abortController.signal)

    expect(callToolMock.mock.calls[0]?.[2]?.signal).toBe(abortController.signal)
  })

  test('aborts its owned signal after a detached RPC completes', async () => {
    await callIdeRpc('test_tool', {}, makeIdeClient())

    const ownedSignal = callToolMock.mock.calls[0]?.[2]?.signal
    expect(ownedSignal).toBeDefined()
    expect(ownedSignal?.aborted).toBe(true)
  })

  test('reports unconfirmed termination when the MCP SDK ignores abort', async () => {
    const abortController = new AbortController()
    const hungClient = makeIdeClient()
    hungClient.client = {
      callTool: () => new Promise<never>(() => {}),
    } as unknown as typeof hungClient.client

    const call = callMCPTool({
      client: hungClient,
      tool: 'hung_tool',
      args: {},
      signal: abortController.signal,
      abortSettlementGraceMs: 10,
    })
    abortController.abort('user-cancel')

    await expect(call).rejects.toBeInstanceOf(StopConfirmationError)
  })
})
