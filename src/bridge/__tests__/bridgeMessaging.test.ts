import { describe, expect, test } from 'bun:test'

import {
  handleServerControlRequest,
  shouldReportRunningForMessage,
  shouldReportRunningForMessages,
} from '../bridgeMessaging.js'
import { createUserMessage } from '../../utils/messages.js'
import type {
  SDKControlRequest,
  StdoutMessage,
} from '../../entrypoints/sdk/controlTypes.js'
import type { ReplBridgeTransport } from '../replBridgeTransport.js'

function interruptRequest(requestId = 'interrupt-1'): SDKControlRequest {
  return {
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'interrupt' },
  }
}

function recordingTransport(writes: unknown[]): ReplBridgeTransport {
  return {
    write: async (message: StdoutMessage) => {
      writes.push(message)
    },
  } as unknown as ReplBridgeTransport
}

describe('bridge running-state classification', () => {
  test('treats real user prompts as turn-starting work', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({ content: 'please inspect the repo' }),
      ),
    ).toBe(true)
  })

  test('keeps tool-result style user messages eligible during mid-turn attach', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<local-command-stdout>done</local-command-stdout>',
          toolUseResult: { ok: true },
        }),
      ),
    ).toBe(true)
  })

  test('ignores local slash-command scaffolding that should not reopen a turn', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
          isMeta: true,
        }),
      ),
    ).toBe(false)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts.\n</system-reminder>',
          isMeta: true,
        }),
      ),
    ).toBe(false)
  })

  test('still marks real automation triggers as running', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<tick>2:56:47 PM</tick>',
          isMeta: true,
        }),
      ),
    ).toBe(true)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: 'scheduled job: refresh analytics cache',
          isMeta: true,
        }),
      ),
    ).toBe(true)
  })

  test('classifies batches by any work-starting message', () => {
    const scaffoldingOnly = [
      createUserMessage({
        content:
          '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
        isMeta: true,
      }),
      createUserMessage({
        content:
          '<system-reminder>\nProactive mode is now enabled.\n</system-reminder>',
        isMeta: true,
      }),
    ]
    expect(shouldReportRunningForMessages(scaffoldingOnly)).toBe(false)

    expect(
      shouldReportRunningForMessages([
        ...scaffoldingOnly,
        createUserMessage({
          content: '<tick>2:57:17 PM</tick>',
          isMeta: true,
        }),
      ]),
    ).toBe(true)
  })
})

describe('bridge interrupt acknowledgements', () => {
  test('waits for active-turn settlement before writing success', async () => {
    let settle = (): void => {}
    const settled = new Promise<void>(resolve => {
      settle = resolve
    })
    const writes: unknown[] = []

    const response = handleServerControlRequest(interruptRequest(), {
      transport: recordingTransport(writes),
      sessionId: 'session-1',
      onInterrupt: async () => {
        await settled
        return true
      },
    })

    await Promise.resolve()
    expect(writes).toHaveLength(0)
    settle()
    await response

    expect(writes).toHaveLength(1)
    expect(
      (writes[0] as { response: { subtype: string } }).response.subtype,
    ).toBe('success')
  })

  test('releases the cancellation gate only after the response write settles', async () => {
    let finishWrite = (): void => {}
    const writeBlocked = new Promise<void>(resolve => {
      finishWrite = resolve
    })
    const events: string[] = []
    const transport = {
      write: async (_message: StdoutMessage) => {
        events.push('write-started')
        await writeBlocked
        events.push('write-settled')
      },
    } as unknown as ReplBridgeTransport

    const response = handleServerControlRequest(interruptRequest('ordered'), {
      transport,
      sessionId: 'session-1',
      onInterrupt: async () => ({
        confirmed: true,
        afterAcknowledgement: () => events.push('gate-released'),
      }),
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['write-started'])

    finishWrite()
    await response
    expect(events).toEqual(['write-started', 'write-settled', 'gate-released'])
  })

  test('returns an error when interrupt handling is unavailable', async () => {
    const writes: unknown[] = []

    await handleServerControlRequest(interruptRequest('missing'), {
      transport: recordingTransport(writes),
      sessionId: 'session-1',
    })

    const response = (
      writes[0] as {
        response: { subtype: string; request_id: string; error: string }
      }
    ).response
    expect(response.subtype).toBe('error')
    expect(response.request_id).toBe('missing')
    expect(response.error).toContain('not supported')
  })

  test('returns an error when settlement fails', async () => {
    const writes: unknown[] = []

    await handleServerControlRequest(interruptRequest('failed'), {
      transport: recordingTransport(writes),
      sessionId: 'session-1',
      onInterrupt: async () => {
        throw new Error('still running')
      },
    })

    const response = (
      writes[0] as {
        response: { subtype: string; error: string }
      }
    ).response
    expect(response.subtype).toBe('error')
    expect(response.error).toContain('still running')
  })
})
