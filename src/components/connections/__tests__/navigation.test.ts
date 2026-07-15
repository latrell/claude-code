import { describe, expect, test } from 'bun:test'
import {
  connectionOAuthBackTarget,
  type ConnectionsViewMode,
  shouldConnectionsDialogHandleCancel,
} from '../navigation.js'

describe('connection Esc ownership', () => {
  test('only the root list enables the outer close action and its input guide', () => {
    expect(shouldConnectionsDialogHandleCancel('list')).toBe(true)

    const nestedModes: ConnectionsViewMode[] = [
      'menu',
      'model-pick',
      'context-window',
      'effort',
      'duplicate',
      'add',
      'edit',
      'confirm-delete',
      'busy',
      'error',
    ]

    for (const mode of nestedModes) {
      expect(shouldConnectionsDialogHandleCancel(mode)).toBe(false)
    }
  })

  test('OAuth waiting screens return to their immediate parent', () => {
    expect(connectionOAuthBackTarget('claude-oauth')).toBe('kind')
    expect(connectionOAuthBackTarget('chatgpt-oauth')).toBe('kind')
    expect(connectionOAuthBackTarget('cursor-oauth')).toBe('cursor-mode')
  })
})
