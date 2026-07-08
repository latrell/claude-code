import { describe, expect, test } from 'bun:test'
import {
  apiProviderToSettingsProviderKey,
  firstPartyNameToCanonical,
  getProviderScopedModelSetting,
  resolveInitialMainLoopModelSetting,
} from '../model'

describe('provider-scoped model settings', () => {
  test('maps API providers to settings provider keys', () => {
    expect(apiProviderToSettingsProviderKey('firstParty')).toBe('anthropic')
    expect(apiProviderToSettingsProviderKey('openai')).toBe('openai')
    expect(apiProviderToSettingsProviderKey('gemini')).toBe('gemini')
    expect(apiProviderToSettingsProviderKey('grok')).toBe('grok')
    expect(apiProviderToSettingsProviderKey('bedrock')).toBeUndefined()
  })

  test('keeps legacy settings.model scoped to Anthropic only', () => {
    const settings = { model: 'claude-opus-4-8' }

    expect(getProviderScopedModelSetting(settings, 'firstParty', {})).toBe(
      'claude-opus-4-8',
    )
    expect(
      getProviderScopedModelSetting(settings, 'openai', {}),
    ).toBeUndefined()
  })

  test('uses provider-specific model before legacy model', () => {
    const settings = {
      model: 'claude-opus-4-8',
      providerModels: {
        openai: { model: 'gpt-5.5-codex' },
        gemini: { model: 'gemini-3-pro' },
        grok: { model: 'grok-5' },
      },
    }

    expect(getProviderScopedModelSetting(settings, 'openai', {})).toBe(
      'gpt-5.5-codex',
    )
    expect(getProviderScopedModelSetting(settings, 'gemini', {})).toBe(
      'gemini-3-pro',
    )
    expect(getProviderScopedModelSetting(settings, 'grok', {})).toBe('grok-5')
  })

  test('uses provider-specific env before providerModels', () => {
    const settings = {
      providerModels: {
        openai: { model: 'settings-openai' },
        gemini: { model: 'settings-gemini' },
        grok: { model: 'settings-grok' },
      },
    }

    expect(
      getProviderScopedModelSetting(settings, 'openai', {
        OPENAI_MODEL: 'env-openai',
      }),
    ).toBe('env-openai')
    expect(
      getProviderScopedModelSetting(settings, 'gemini', {
        GEMINI_MODEL: 'env-gemini',
      }),
    ).toBe('env-gemini')
    expect(
      getProviderScopedModelSetting(settings, 'grok', {
        GROK_MODEL: 'env-grok',
      }),
    ).toBe('env-grok')
  })
})

describe('resolveInitialMainLoopModelSetting', () => {
  test('explicit override wins over default1mContext', () => {
    expect(
      resolveInitialMainLoopModelSetting('opus', true, 'claude-fable-5'),
    ).toBe('opus')
    expect(
      resolveInitialMainLoopModelSetting(
        'sonnet[1m]',
        undefined,
        'claude-fable-5',
      ),
    ).toBe('sonnet[1m]')
  })

  test('restores default model pinned with [1m] when preference is set', () => {
    expect(
      resolveInitialMainLoopModelSetting(undefined, true, 'claude-fable-5'),
    ).toBe('claude-fable-5[1m]')
    expect(
      resolveInitialMainLoopModelSetting(null, true, 'claude-fable-5'),
    ).toBe('claude-fable-5[1m]')
  })

  test('does not double the [1m] suffix on an already-1M default', () => {
    expect(
      resolveInitialMainLoopModelSetting(undefined, true, 'claude-fable-5[1m]'),
    ).toBe('claude-fable-5[1m]')
  })

  test('returns null (default, no 1M) when preference is unset or false', () => {
    expect(
      resolveInitialMainLoopModelSetting(
        undefined,
        undefined,
        'claude-fable-5',
      ),
    ).toBeNull()
    expect(
      resolveInitialMainLoopModelSetting(undefined, false, 'claude-fable-5'),
    ).toBeNull()
    expect(
      resolveInitialMainLoopModelSetting(null, false, 'claude-fable-5'),
    ).toBeNull()
  })
})

describe('firstPartyNameToCanonical', () => {
  test('maps opus-4-6 full name to canonical', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps sonnet-4-6 full name', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-6-20250514')).toBe(
      'claude-sonnet-4-6',
    )
  })

  test('maps haiku-4-5', () => {
    expect(firstPartyNameToCanonical('claude-haiku-4-5-20251001')).toBe(
      'claude-haiku-4-5',
    )
  })

  test('maps 3P provider format', () => {
    expect(firstPartyNameToCanonical('us.anthropic.claude-opus-4-6-v1:0')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps claude-3-7-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-7-sonnet-20250219')).toBe(
      'claude-3-7-sonnet',
    )
  })

  test('maps claude-3-5-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-5-sonnet-20241022')).toBe(
      'claude-3-5-sonnet',
    )
  })

  test('maps claude-3-5-haiku', () => {
    expect(firstPartyNameToCanonical('claude-3-5-haiku-20241022')).toBe(
      'claude-3-5-haiku',
    )
  })

  test('maps claude-3-opus', () => {
    expect(firstPartyNameToCanonical('claude-3-opus-20240229')).toBe(
      'claude-3-opus',
    )
  })

  test('is case insensitive', () => {
    expect(firstPartyNameToCanonical('Claude-Opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('falls back to input for unknown model', () => {
    expect(firstPartyNameToCanonical('unknown-model')).toBe('unknown-model')
  })

  test('differentiates opus-4 vs opus-4-5 vs opus-4-6', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-20240101')).toBe(
      'claude-opus-4',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-5-20240101')).toBe(
      'claude-opus-4-5',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-6-20240101')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps opus-4-1', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-1-20240101')).toBe(
      'claude-opus-4-1',
    )
  })

  test('maps sonnet-4-5', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-5-20240101')).toBe(
      'claude-sonnet-4-5',
    )
  })

  test('maps sonnet-4', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-20240101')).toBe(
      'claude-sonnet-4',
    )
  })

  test('maps fable-5', () => {
    expect(firstPartyNameToCanonical('claude-fable-5')).toBe('claude-fable-5')
  })

  test('maps opus-4-8', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-8')).toBe('claude-opus-4-8')
  })

  test('maps sonnet-5', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-5')).toBe('claude-sonnet-5')
  })

  test('differentiates opus-4-7 vs opus-4-8', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-8')).toBe('claude-opus-4-8')
    expect(firstPartyNameToCanonical('claude-opus-4-7')).toBe('claude-opus-4-7')
  })
})
