/**
 * Regression tests for fix: config 语言选择无法用上下键切换选项
 *
 * LanguagePicker listens for confirm:previous / confirm:next / confirm:yes /
 * confirm:no. Those actions are key-bound (up/down/enter/escape) only in the
 * Confirmation context. The bug: the component registered its handlers with
 * `{ context: 'Settings' }`, where up/down resolve to select:previous /
 * select:next and enter resolves to settings:close — so the resolved action
 * never matched the registered one and arrow keys (and Enter) did nothing.
 */
import { describe, expect, test } from 'bun:test'
import { resolveKey } from '@anthropic/ink'
import type { Key } from '@anthropic/ink'
import { DEFAULT_BINDINGS } from '../defaultBindings.js'
import { parseBindings } from '../parser.js'

function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    wheelUp: false,
    wheelDown: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    fn: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    ...overrides,
  }
}

const bindings = parseBindings(DEFAULT_BINDINGS)

describe('LanguagePicker keybindings — confirm:* actions resolve in Confirmation context', () => {
  test('up resolves to confirm:previous in Confirmation context', () => {
    const result = resolveKey(
      '',
      makeKey({ upArrow: true }),
      ['Confirmation', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:previous' })
  })

  test('down resolves to confirm:next in Confirmation context', () => {
    const result = resolveKey(
      '',
      makeKey({ downArrow: true }),
      ['Confirmation', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:next' })
  })

  test('enter resolves to confirm:yes in Confirmation context', () => {
    const result = resolveKey(
      '',
      makeKey({ return: true }),
      ['Confirmation', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:yes' })
  })

  test('escape resolves to confirm:no in Confirmation context', () => {
    const result = resolveKey(
      '',
      makeKey({ escape: true }),
      ['Confirmation', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'confirm:no' })
  })
})

describe('Settings context does NOT resolve arrow keys/enter to confirm:* (the original bug)', () => {
  test('up resolves to select:previous, not confirm:previous', () => {
    const result = resolveKey(
      '',
      makeKey({ upArrow: true }),
      ['Settings', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'select:previous' })
  })

  test('down resolves to select:next, not confirm:next', () => {
    const result = resolveKey(
      '',
      makeKey({ downArrow: true }),
      ['Settings', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'select:next' })
  })

  test('enter resolves to settings:close, not confirm:yes', () => {
    const result = resolveKey(
      '',
      makeKey({ return: true }),
      ['Settings', 'Global'],
      bindings,
    )
    expect(result).toEqual({ type: 'match', action: 'settings:close' })
  })
})
