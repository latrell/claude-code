import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../../../tests/mocks/debug'
import { logMock } from '../../../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

const requestMock = mock(
  async (_request: unknown, _schema: unknown, _options?: unknown) => ({
    contents: [
      {
        uri: 'memory://example',
        mimeType: 'text/plain',
        text: 'example',
      },
    ],
  }),
)

const actualMcpClient = await import('src/services/mcp/client.js')
mock.module('src/services/mcp/client.ts', () => ({
  ...actualMcpClient,
  ensureConnectedClient: async (client: Record<string, unknown>) => ({
    ...client,
    client: { request: requestMock },
  }),
}))

const { ReadMcpResourceTool } = await import('../ReadMcpResourceTool.js')

describe('ReadMcpResourceTool cancellation', () => {
  test('passes the tool abort signal to the MCP request', async () => {
    const abortController = new AbortController()
    const context = {
      abortController,
      options: {
        mcpClients: [
          {
            name: 'test-server',
            type: 'connected',
            capabilities: { resources: {} },
          },
        ],
      },
    } as unknown as Parameters<typeof ReadMcpResourceTool.call>[1]

    const result = await ReadMcpResourceTool.call(
      { server: 'test-server', uri: 'memory://example' },
      context,
    )

    expect(result.data.contents[0]?.text).toBe('example')
    const requestOptions = requestMock.mock.calls[0]?.[2] as
      | { signal?: AbortSignal }
      | undefined
    expect(requestOptions?.signal).toBe(abortController.signal)
  })
})
