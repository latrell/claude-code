import { describe, expect, mock, test } from 'bun:test'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

const sendRequests: Array<ReturnType<typeof deferred<void>>> = []
const interruptMock = mock(() => Promise.resolve())

mock.module('../api/client', () => ({
  apiBind: async () => {},
  apiFetchSession: async () => ({ status: 'idle' }),
  apiFetchSessionHistory: async () => [],
  apiInterrupt: interruptMock,
  apiSendControl: async () => {},
  apiSendEvent: () => {
    const request = deferred<void>()
    sendRequests.push(request)
    return request.promise
  },
  getUuid: () => 'test-uuid',
}))

const { RCSChatAdapter } = await import('../lib/rcs-chat-adapter')

describe('RCSChatAdapter.interrupt', () => {
  test('waits for every older user-event POST before the final interrupt', async () => {
    sendRequests.length = 0
    interruptMock.mockClear()
    let entries: unknown[] = []
    const adapter = new RCSChatAdapter('session-1', update => {
      entries =
        typeof update === 'function'
          ? update(entries as never)
          : (update as unknown[])
    })

    const firstSend = adapter.sendMessage('first')
    const secondSend = adapter.sendMessage('second')
    expect(sendRequests).toHaveLength(2)

    const stopping = adapter.interrupt()
    await Promise.resolve()
    expect(interruptMock).toHaveBeenCalledTimes(1)

    sendRequests[1]?.resolve()
    await Promise.resolve()
    expect(interruptMock).toHaveBeenCalledTimes(1)

    sendRequests[0]?.resolve()
    await Promise.all([firstSend, secondSend, stopping])
    expect(interruptMock).toHaveBeenCalledTimes(2)
  })
})

describe('RCSChatAdapter turn completion', () => {
  test('does not finish loading from assistant text or a tool result', () => {
    let entries: unknown[] = []
    let completed = 0
    const adapter = new RCSChatAdapter(
      'session-1',
      update => {
        entries =
          typeof update === 'function'
            ? update(entries as never)
            : (update as unknown[])
      },
      { onTurnComplete: () => completed++ },
    )

    adapter.handleEvent({
      type: 'assistant',
      payload: { content: 'I will use a tool next.' },
    })
    adapter.handleEvent({
      type: 'tool_result',
      payload: { content: 'done' },
    })
    adapter.handleEvent({
      type: 'session_status',
      payload: { status: 'running' },
    })

    expect(completed).toBe(0)
  })

  test('finishes loading only on terminal events or a confirmed interrupt', () => {
    let completed = 0
    const adapter = new RCSChatAdapter('session-1', () => {}, {
      onTurnComplete: () => completed++,
    })

    adapter.handleEvent({ type: 'result_success' })
    expect(completed).toBe(1)

    adapter.handleEvent({
      type: 'session_status',
      payload: { status: 'idle' },
    })
    expect(completed).toBe(2)

    adapter.handleEvent({ type: 'interrupt', direction: 'outbound' })
    expect(completed).toBe(2)

    adapter.handleEvent({ type: 'interrupt', direction: 'inbound' })
    expect(completed).toBe(3)
  })

  test('does not publish entries or terminal callbacks after disconnect', () => {
    let entryUpdates = 0
    let completed = 0
    const adapter = new RCSChatAdapter(
      'session-1',
      () => {
        entryUpdates++
      },
      { onTurnComplete: () => completed++ },
    )

    adapter.disconnect()
    adapter.handleEvent({
      type: 'assistant',
      payload: { content: 'late SSE data' },
    })
    adapter.handleEvent({ type: 'result_success' })

    expect(entryUpdates).toBe(0)
    expect(completed).toBe(0)
  })
})
