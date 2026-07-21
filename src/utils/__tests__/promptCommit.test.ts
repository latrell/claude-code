import { describe, expect, test } from 'bun:test'
import type { Message } from '../../types/message.js'
import { appendPromptMessagesAndCommit } from '../promptCommit.js'

describe('appendPromptMessagesAndCommit', () => {
  test('calls the commit hook only after prompt messages are appended', () => {
    const existing = { type: 'user', uuid: 'existing' } as unknown as Message
    const prompt = { type: 'user', uuid: 'prompt' } as unknown as Message
    const destination = [existing]
    let visibleAtCommit: Message[] = []

    appendPromptMessagesAndCommit(destination, [prompt], () => {
      visibleAtCommit = [...destination]
    })

    expect(visibleAtCommit).toEqual([existing, prompt])
  })

  test('keeps the prompt committed when the commit hook throws', () => {
    const prompt = { type: 'user', uuid: 'prompt' } as unknown as Message
    const destination: Message[] = []
    const failure = new Error('post-commit event failed')

    expect(() =>
      appendPromptMessagesAndCommit(destination, [prompt], () => {
        throw failure
      }),
    ).toThrow(failure)
    expect(destination).toEqual([prompt])
  })

  test('does not publish a commit when preprocessing produced no messages', () => {
    let committed = false

    appendPromptMessagesAndCommit([], [], () => {
      committed = true
    })

    expect(committed).toBe(false)
  })
})
