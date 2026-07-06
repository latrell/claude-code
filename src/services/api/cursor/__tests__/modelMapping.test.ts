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

  test('maps by family to a current Cursor model when the exact id is unknown', () => {
    expect(resolveCursorModel('claude-opus-4-8', {})).toBe(
      'claude-opus-4-8-thinking-high',
    )
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

  // The chat endpoint only accepts serverModelName values; catalog aliases
  // (idAliases/legacySlugs) 404 with "AI Model Not Found" if sent verbatim.
  test('normalizes the auto alias to the default server model', () => {
    expect(resolveCursorModel('auto', {})).toBe('default')
    expect(resolveCursorModel('default', {})).toBe('default')
  })

  test('normalizes legacy slugs to their current server model', () => {
    expect(resolveCursorModel('gpt-5.5', {})).toBe('gpt-5.5-medium')
    expect(resolveCursorModel('glm-5.2', {})).toBe('glm-5.2-high')
  })

  test('normalizes aliases coming from CURSOR_MODEL and family overrides', () => {
    expect(resolveCursorModel('sonnet', { CURSOR_MODEL: 'auto' })).toBe(
      'default',
    )
    expect(
      resolveCursorModel('claude-sonnet-4-6', {
        CURSOR_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
      }),
    ).toBe('claude-sonnet-5-thinking-high')
  })

  test('keeps ids that are both a legacy slug and a live model unchanged', () => {
    // composer-2.5 is composer-2.5-fast's legacySlug but also a real current
    // serverModelName — it must pass through untouched.
    expect(resolveCursorModel('composer-2.5', {})).toBe('composer-2.5')
  })

  // Cursor-native Claude serverModelNames (picked in /model | /models or typed
  // as a custom model) must be sent verbatim — the family regexes used to
  // remap e.g. claude-sonnet-5-thinking-high to the sonnet slot, silently
  // calling claude-4.5-sonnet instead of the picked model.
  test('sends Cursor-native Claude ids verbatim instead of family-remapping', () => {
    expect(resolveCursorModel('claude-sonnet-5-thinking-high', {})).toBe(
      'claude-sonnet-5-thinking-high',
    )
    expect(resolveCursorModel('claude-fable-5-thinking-high', {})).toBe(
      'claude-fable-5-thinking-high',
    )
    expect(resolveCursorModel('claude-opus-4-8-thinking-max', {})).toBe(
      'claude-opus-4-8-thinking-max',
    )
    expect(resolveCursorModel('claude-4.6-opus-high', {})).toBe(
      'claude-4.6-opus-high',
    )
    expect(resolveCursorModel('claude-4.5-haiku-thinking', {})).toBe(
      'claude-4.5-haiku-thinking',
    )
    expect(resolveCursorModel('claude-4-sonnet', {})).toBe('claude-4-sonnet')
    // Native ids are exact picks; family env overrides don't apply to them.
    expect(
      resolveCursorModel('claude-sonnet-5-thinking-high', {
        CURSOR_DEFAULT_SONNET_MODEL: 'composer-2.5',
      }),
    ).toBe('claude-sonnet-5-thinking-high')
    // …but CURSOR_MODEL (force-all) still wins.
    expect(
      resolveCursorModel('claude-sonnet-5-thinking-high', {
        CURSOR_MODEL: 'composer-2.5',
      }),
    ).toBe('composer-2.5')
  })

  test('still family-maps Anthropic ids that resemble no Cursor shape', () => {
    // Anthropic ids (date-suffixed or plain) keep the existing mapping flow.
    expect(resolveCursorModel('claude-sonnet-4-5-20250929', {})).toBe(
      'claude-4.5-sonnet',
    )
    expect(resolveCursorModel('claude-haiku-4-5-20251001', {})).toBe(
      'claude-4.5-haiku',
    )
  })
})
