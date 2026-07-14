/**
 * Tests for src/utils/sessionTitle.ts
 *
 * Covers the pure parts: buildSessionTitleSystemPrompt (language following)
 * and extractConversationText. generateSessionTitle's network path is not
 * exercised — mocking src/services/api/claude.ts would be a process-global
 * mock of a core module (see CLAUDE.md on cross-file mock pollution).
 */
import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../tests/mocks/debug'
import { logMock } from '../../../tests/mocks/log'

// Mock leaf side-effect modules before importing the module under test
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))

import type { Message } from '../../types/message'
import { StopConfirmationError } from '../stopConfirmation'
import {
  buildSessionTitleSystemPrompt,
  createSessionTitleRequestGuard,
  extractConversationText,
  fallbackSessionTitle,
} from '../sessionTitle'

describe('createSessionTitleRequestGuard', () => {
  test('invalidates and aborts a pending request on session reset', () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('old-session')
    if (!request) throw new Error('expected title request')

    guard.invalidate()

    expect(request.signal.aborted).toBe(true)
    expect(guard.isCurrent(request, 'old-session')).toBe(false)
  })

  test('rejects late callbacks after switching sessions', () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('old-session')
    if (!request) throw new Error('expected title request')

    expect(guard.isCurrent(request, 'new-session')).toBe(false)
  })

  test('only treats the latest request generation as current', () => {
    const guard = createSessionTitleRequestGuard()
    const first = guard.begin('session')
    const second = guard.begin('session')
    if (!first || !second) throw new Error('expected title requests')

    expect(first.signal.aborted).toBe(true)
    expect(guard.isCurrent(first, 'session')).toBe(false)
    expect(guard.isCurrent(second, 'session')).toBe(true)
  })

  test('fails closed when an aborted title request never settles', async () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('session')
    if (!request) throw new Error('expected title request')
    guard.track(request, new Promise<void>(() => {}))

    await expect(guard.cancelAndWait(5)).rejects.toBeInstanceOf(
      StopConfirmationError,
    )
  })

  test('confirms cancellation after the title request rejects on abort', async () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('session')
    if (!request) throw new Error('expected title request')
    const title = new Promise<void>((_resolve, reject) => {
      request.signal.addEventListener('abort', () =>
        reject(new Error('aborted')),
      )
    })
    guard.track(request, title)

    await expect(guard.cancelAndWait(5)).resolves.toBeUndefined()
  })

  test('aborts and fails closed when title completion misses its deadline', async () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('session')
    if (!request) throw new Error('expected title request')
    guard.track(request, new Promise<void>(() => {}))

    await expect(guard.finish(5, 5)).rejects.toBeInstanceOf(
      StopConfirmationError,
    )
    expect(request.signal.aborted).toBe(true)
  })

  test('lets Escape interrupt a title request already in turn finalization', async () => {
    const guard = createSessionTitleRequestGuard()
    const request = guard.begin('session')
    if (!request) throw new Error('expected title request')
    const title = new Promise<void>((_resolve, reject) => {
      request.signal.addEventListener('abort', () =>
        reject(new Error('aborted')),
      )
    })
    guard.track(request, title)

    const finalization = guard.finish(1_000)
    guard.invalidate()

    await expect(finalization).resolves.toBeUndefined()
    expect(request.signal.aborted).toBe(true)
  })

  test('does not overlap a pending title request and retries after it settles', async () => {
    const guard = createSessionTitleRequestGuard()
    const first = guard.begin('session')
    if (!first) throw new Error('expected first title request')

    let resolveFirst!: () => void
    const firstRun = new Promise<void>(resolve => {
      resolveFirst = resolve
    })
    guard.track(first, firstRun)

    expect(guard.begin('session')).toBeUndefined()
    expect(first.signal.aborted).toBe(true)

    resolveFirst()
    await firstRun
    await Promise.resolve()

    expect(guard.begin('session')).toBeDefined()
  })

  test('permanently suppresses replacement after unconfirmed title Stop', async () => {
    const guard = createSessionTitleRequestGuard()
    const first = guard.begin('session')
    if (!first) throw new Error('expected first title request')

    const failure = Promise.reject(
      new StopConfirmationError('title request did not confirm Stop'),
    )
    guard.track(first, failure)
    await failure.catch(() => {})
    await Promise.resolve()

    expect(guard.begin('session')).toBeUndefined()
    await expect(guard.finish()).rejects.toBeInstanceOf(StopConfirmationError)
    expect(guard.begin('session')).toBeUndefined()
  })
})

describe('buildSessionTitleSystemPrompt', () => {
  test('keeps the base prompt instructions', () => {
    const prompt = buildSessionTitleSystemPrompt(undefined)
    expect(prompt).toContain('Return JSON with a single "title" field.')
    expect(prompt).toContain('sentence-case title (3-7 words)')
  })

  test('follows the user message language when no language is set', () => {
    const prompt = buildSessionTitleSystemPrompt(undefined)
    expect(prompt).toContain(
      "Write the title in the same language as the user's message.",
    )
  })

  test('uses the configured language when set', () => {
    const prompt = buildSessionTitleSystemPrompt('简体中文')
    expect(prompt).toContain('Write the title in 简体中文.')
    expect(prompt).not.toContain("same language as the user's message")
  })

  test('accepts arbitrary custom language names', () => {
    const prompt = buildSessionTitleSystemPrompt('Japanese')
    expect(prompt).toContain('Write the title in Japanese.')
  })

  test('marks the few-shot examples as language-neutral', () => {
    // Guards against the model copying the English examples' language
    expect(buildSessionTitleSystemPrompt('简体中文')).toContain(
      'not the output language',
    )
    expect(buildSessionTitleSystemPrompt(undefined)).toContain(
      'not the output language',
    )
  })
})

function userMessage(
  content: unknown,
  extra?: Record<string, unknown>,
): Message {
  return { type: 'user', message: { content }, ...extra } as unknown as Message
}

function assistantMessage(content: unknown): Message {
  return { type: 'assistant', message: { content } } as unknown as Message
}

describe('extractConversationText', () => {
  test('joins string and text-block content from user and assistant messages', () => {
    const text = extractConversationText([
      userMessage('修复登录按钮'),
      assistantMessage([
        { type: 'text', text: 'Looking into it' },
        { type: 'tool_use', name: 'Grep', id: 'x', input: {} },
      ]),
    ])
    expect(text).toBe('修复登录按钮\nLooking into it')
  })

  test('skips meta and non-human-origin messages', () => {
    const text = extractConversationText([
      userMessage('<system>meta</system>', { isMeta: true }),
      userMessage('hook output', { origin: { kind: 'hook' } }),
      userMessage('real question'),
    ])
    expect(text).toBe('real question')
  })

  test('tail-slices long conversations to the last 1000 chars', () => {
    const text = extractConversationText([
      userMessage('a'.repeat(900)),
      userMessage('b'.repeat(900)),
    ])
    expect(text.length).toBe(1000)
    expect(text.endsWith('b'.repeat(900))).toBe(true)
  })
})

describe('fallbackSessionTitle', () => {
  test('uses the first non-empty line', () => {
    expect(fallbackSessionTitle('\n\n  修复登录按钮  \n其他内容')).toBe(
      '修复登录按钮',
    )
  })

  test('truncates long lines with an ellipsis', () => {
    const title = fallbackSessionTitle('x'.repeat(100))
    expect(title).toBe(`${'x'.repeat(32)}…`)
  })

  test('truncates on grapheme boundaries without splitting surrogate pairs', () => {
    const title = fallbackSessionTitle('🎉'.repeat(40))
    expect(title).toBe(`${'🎉'.repeat(32)}…`)
    expect(title!.isWellFormed()).toBe(true)
  })

  test('keeps short lines untouched', () => {
    expect(fallbackSessionTitle('Fix CI')).toBe('Fix CI')
  })

  test('returns null for blank input', () => {
    expect(fallbackSessionTitle('   \n  \n')).toBeNull()
  })
})
