import { describe, expect, test } from 'bun:test'

import { createAssistantMessage, createUserMessage } from '../messages.js'
import {
  buildTaskCompletionNotification,
  getCompletionSummaryFromMessages,
  getTaskTitleFromMessages,
  truncateForNotification,
} from '../notificationContent.js'

describe('truncateForNotification', () => {
  test('collapses whitespace and trims', () => {
    expect(truncateForNotification('  a\n\n  b\tc  ', 100)).toBe('a b c')
  })

  test('truncates by code points with an ellipsis', () => {
    const text = '一'.repeat(200)
    const result = truncateForNotification(text, 150)
    expect(Array.from(result).length).toBe(150)
    expect(result.endsWith('…')).toBe(true)
  })

  test('returns short text unchanged', () => {
    expect(truncateForNotification('done', 150)).toBe('done')
  })
})

describe('getTaskTitleFromMessages', () => {
  test('returns the most recent real user prompt', () => {
    const messages = [
      createUserMessage({ content: 'first task' }),
      createAssistantMessage({ content: 'ok' }),
      createUserMessage({ content: 'fix the login bug' }),
      createAssistantMessage({ content: 'done' }),
    ]
    expect(getTaskTitleFromMessages(messages)).toBe('fix the login bug')
  })

  test('skips meta scaffolding messages', () => {
    const messages = [
      createUserMessage({ content: 'real prompt' }),
      createUserMessage({
        content: '<system-reminder>noise</system-reminder>',
        isMeta: true,
      }),
    ]
    expect(getTaskTitleFromMessages(messages)).toBe('real prompt')
  })

  test('truncates long prompts to 60 chars', () => {
    const messages = [createUserMessage({ content: 'x'.repeat(200) })]
    const title = getTaskTitleFromMessages(messages)
    expect(title).not.toBeNull()
    expect(Array.from(title!).length).toBe(60)
    expect(title!.endsWith('…')).toBe(true)
  })

  test('returns null when there is no user prompt', () => {
    expect(getTaskTitleFromMessages([])).toBeNull()
  })
})

describe('getCompletionSummaryFromMessages', () => {
  test('returns the last assistant text capped at 150 chars', () => {
    const messages = [
      createUserMessage({ content: 'task' }),
      createAssistantMessage({ content: 'early reply' }),
      createAssistantMessage({ content: `all done. ${'y'.repeat(300)}` }),
    ]
    const summary = getCompletionSummaryFromMessages(messages)
    expect(summary).not.toBeNull()
    expect(summary!.startsWith('all done.')).toBe(true)
    expect(Array.from(summary!).length).toBe(150)
  })

  test('returns null without assistant messages', () => {
    const messages = [createUserMessage({ content: 'task' })]
    expect(getCompletionSummaryFromMessages(messages)).toBeNull()
  })
})

describe('buildTaskCompletionNotification', () => {
  test('combines task title and completion summary', () => {
    const messages = [
      createUserMessage({ content: 'refactor auth module' }),
      createAssistantMessage({ content: 'Refactor complete, tests pass.' }),
    ]
    expect(buildTaskCompletionNotification(messages, 'fallback')).toEqual({
      title: 'refactor auth module',
      message: 'Refactor complete, tests pass.',
    })
  })

  test('falls back to the plain message when nothing usable exists', () => {
    expect(buildTaskCompletionNotification([], 'fallback')).toEqual({
      title: undefined,
      message: 'fallback',
    })
  })
})
