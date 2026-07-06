import { describe, expect, test } from 'bun:test'
import { resolveCursorModel } from '../../../../../packages/@ant/model-provider/src/providers/cursor/modelMapping.js'

describe('resolveCursorModel', () => {
  test('CURSOR_MODEL overrides everything', () => {
    expect(
      resolveCursorModel('claude-sonnet-4-5-20250929', {
        CURSOR_MODEL: 'gpt-5',
      }),
    ).toBe('gpt-5')
  })

  test('maps known Anthropic model ids via the default map', () => {
    expect(resolveCursorModel('claude-sonnet-4-5-20250929', {})).toBe(
      'claude-4.5-sonnet',
    )
  })

  test('maps by family when the exact id is unknown', () => {
    expect(resolveCursorModel('claude-opus-4-8', {})).toBe('claude-4-opus')
  })

  test('maps the fable family to the sonnet slot', () => {
    expect(resolveCursorModel('claude-fable-5', {})).toBe('claude-4.5-sonnet')
  })

  test('honours CURSOR_DEFAULT_SONNET_MODEL override', () => {
    expect(
      resolveCursorModel('claude-sonnet-4-6', {
        CURSOR_DEFAULT_SONNET_MODEL: 'cursor-small',
      }),
    ).toBe('cursor-small')
  })

  test('honours a CURSOR_MODEL_MAP family override', () => {
    expect(
      resolveCursorModel('claude-opus-4-6', {
        CURSOR_MODEL_MAP: JSON.stringify({ opus: 'my-opus' }),
      }),
    ).toBe('my-opus')
  })

  test('passes unknown non-family model names through unchanged', () => {
    expect(resolveCursorModel('llama-3-70b', {})).toBe('llama-3-70b')
  })
})
