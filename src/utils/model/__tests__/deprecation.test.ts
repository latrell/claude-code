import { describe, expect, mock, test } from 'bun:test'

mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({}),
}))

const { getModelDeprecationWarning } = await import('../deprecation.js')

describe('getModelDeprecationWarning', () => {
  test.each([
    ['claude-opus-4-1-20250805', 'August 5, 2026'],
    ['claude-opus-4-20250514', 'June 15, 2026'],
    ['claude-sonnet-4-20250514', 'June 15, 2026'],
    ['claude-3-5-sonnet-20241022', 'October 28, 2025'],
    ['claude-3-haiku-20240307', 'April 20, 2026'],
  ] as const)('warns for retired/deprecated model %s', (model, date) => {
    expect(getModelDeprecationWarning(model)).toContain(date)
  })

  test('does not overmatch current dateless model ids', () => {
    expect(getModelDeprecationWarning('claude-opus-4-8')).toBeNull()
    expect(getModelDeprecationWarning('claude-sonnet-5')).toBeNull()
  })
})
