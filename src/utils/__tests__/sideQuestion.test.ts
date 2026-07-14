import { describe, expect, mock, test } from 'bun:test'
import { runSideQuestion } from '../sideQuestion.js'

let receivedController: AbortController | undefined
const runForkedAgentMock = mock(
  (options: { overrides?: { abortController?: AbortController } }) => {
    receivedController = options.overrides?.abortController
    return new Promise<never>((_resolve, reject) => {
      const signal = receivedController?.signal
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    })
  },
)

describe('runSideQuestion cancellation', () => {
  test('passes the UI controller to the forked query so dismiss aborts HTTP work', async () => {
    const controller = new AbortController()
    const result = runSideQuestion(
      {
        question: 'status?',
        cacheSafeParams: {} as never,
        abortController: controller,
      },
      runForkedAgentMock as never,
    )

    expect(receivedController).toBe(controller)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
