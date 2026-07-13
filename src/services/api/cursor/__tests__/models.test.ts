import { describe, expect, mock, test } from 'bun:test'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  availableModelToInfo,
  CURSOR_MODELS,
  fetchCursorAvailableModels,
  getCursorContextWindowForModel,
  getCursorModelContextWindow,
  isCursorMaxModeEnabled,
  parseContextWindowFromTooltip,
} from '../models.js'

describe('CURSOR_MODELS', () => {
  test('uses Claude-style display aliases without hyphens', () => {
    for (const model of CURSOR_MODELS) {
      expect(model.label).not.toContain('-')
    }
  })

  test('leads with the Auto tier and covers current model families', () => {
    // Cursor's Auto tier is serverModelName `default`; the `auto` alias is
    // rejected by the chat endpoint with "AI Model Not Found".
    expect(CURSOR_MODELS[0]?.id).toBe('default')
    const ids = CURSOR_MODELS.map(m => m.id)
    expect(ids).not.toContain('auto')
    // Current families, not the old gpt-5 / o3 / gemini-2.5-pro placeholders.
    expect(ids).toContain('composer-2.5')
    expect(ids).toContain('claude-sonnet-5-thinking-high')
    expect(ids).toContain('gpt-5.5-medium')
    expect(ids).toContain('gemini-3.1-pro-preview')
    expect(ids).not.toContain('gpt-5')
    expect(ids).not.toContain('o3')
  })
})

describe('parseContextWindowFromTooltip', () => {
  test('parses k and M context windows', () => {
    expect(parseContextWindowFromTooltip('foo · 200k context window')).toBe(
      200_000,
    )
    expect(parseContextWindowFromTooltip('**X**<br />1M context window')).toBe(
      1_000_000,
    )
    expect(parseContextWindowFromTooltip('300k context window · x')).toBe(
      300_000,
    )
  })

  test('returns undefined when no context window is present', () => {
    expect(parseContextWindowFromTooltip('no window here')).toBeUndefined()
    expect(parseContextWindowFromTooltip(undefined)).toBeUndefined()
  })
})

describe('availableModelToInfo', () => {
  const entry = {
    serverModelName: 'claude-4.5-sonnet',
    clientDisplayName: 'Sonnet 4.5',
    supportsAgent: true,
    tooltipData: { markdownContent: '200k context window' },
    tooltipDataForMaxMode: { markdownContent: '1M context window' },
  }

  test('uses the non-max window by default, keeps the max ceiling', () => {
    const info = availableModelToInfo(entry)
    expect(info).toEqual({
      id: 'claude-4.5-sonnet',
      label: 'Sonnet 4.5',
      contextWindow: 200_000,
      maxContextWindow: 1_000_000,
    })
  })

  test('uses the max-mode window when maxMode is true', () => {
    const info = availableModelToInfo(entry, true)
    expect(info?.contextWindow).toBe(1_000_000)
    expect(info?.maxContextWindow).toBe(1_000_000)
  })

  test('falls back to name and id when display fields are missing', () => {
    const info = availableModelToInfo({ name: 'default' })
    expect(info?.id).toBe('default')
    expect(info?.label).toBe('default')
    expect(info?.contextWindow).toBeUndefined()
  })

  test('returns null when there is no id', () => {
    expect(availableModelToInfo({ clientDisplayName: 'x' })).toBeNull()
  })
})

describe('isCursorMaxModeEnabled', () => {
  test('on by default, off only for explicitly falsy CURSOR_MAX_MODE', () => {
    expect(isCursorMaxModeEnabled({})).toBe(true)
    expect(isCursorMaxModeEnabled({ CURSOR_MAX_MODE: '1' })).toBe(true)
    expect(isCursorMaxModeEnabled({ CURSOR_MAX_MODE: 'true' })).toBe(true)
    expect(isCursorMaxModeEnabled({ CURSOR_MAX_MODE: '0' })).toBe(false)
    expect(isCursorMaxModeEnabled({ CURSOR_MAX_MODE: 'false' })).toBe(false)
    expect(isCursorMaxModeEnabled({ CURSOR_MAX_MODE: 'off' })).toBe(false)
  })
})

describe('getCursorModelContextWindow', () => {
  test('returns the max window by default and non-max when Max Mode is off', () => {
    // Default (Max Mode on) → 1M ceiling.
    expect(getCursorModelContextWindow('claude-4.5-sonnet', {})).toBe(1_000_000)
    expect(
      getCursorModelContextWindow('claude-4.5-sonnet', {
        CURSOR_MAX_MODE: '0',
      }),
    ).toBe(200_000)
  })

  test('returns undefined for unknown ids', () => {
    expect(getCursorModelContextWindow('llama-3', {})).toBeUndefined()
  })
})

describe('getCursorContextWindowForModel', () => {
  test('resolves a Cursor model id directly', () => {
    // composer-2.5 is 200k in both modes.
    expect(getCursorContextWindowForModel('composer-2.5', {})).toBe(200_000)
  })

  test('resolves Anthropic family aliases via resolveCursorModel', () => {
    // sonnet → claude-4.5-sonnet: 1M by default (Max Mode), 200k when off.
    expect(getCursorContextWindowForModel('sonnet', {})).toBe(1_000_000)
    expect(
      getCursorContextWindowForModel('sonnet', { CURSOR_MAX_MODE: '0' }),
    ).toBe(200_000)
    // opus → claude-opus-4-8-thinking-high: 1M default, 300k when off.
    expect(getCursorContextWindowForModel('opus', {})).toBe(1_000_000)
    expect(
      getCursorContextWindowForModel('opus', { CURSOR_MAX_MODE: '0' }),
    ).toBe(300_000)
  })

  test('returns undefined for models outside the curated catalog', () => {
    expect(getCursorContextWindowForModel('llama-3', {})).toBeUndefined()
  })
})

describe('fetchCursorAvailableModels', () => {
  test('parses the live catalog and filters non-agent models', async () => {
    const body = JSON.stringify({
      models: [
        {
          serverModelName: 'default',
          clientDisplayName: 'Auto',
          supportsAgent: true,
        },
        {
          serverModelName: 'composer-2.5',
          clientDisplayName: 'Composer 2.5',
          supportsAgent: true,
          tooltipData: { markdownContent: '200k context window' },
        },
        {
          serverModelName: 'legacy-nonagent',
          clientDisplayName: 'Legacy',
          supportsAgent: false,
        },
      ],
    })
    const fetchOverride = (async () =>
      new Response(body, { status: 200 })) as unknown as typeof fetch

    const models = await fetchCursorAvailableModels(
      {
        CURSOR_API_KEY: 'user::jwt',
        CURSOR_MACHINE_ID: 'm-1',
        CURSOR_STATE_DB: '/no/such/db',
      },
      { fetchOverride },
    )

    const ids = models.map(m => m.id)
    expect(ids).toContain('default')
    expect(ids).toContain('composer-2.5')
    expect(ids).not.toContain('legacy-nonagent')
    expect(models.find(m => m.id === 'composer-2.5')?.contextWindow).toBe(
      200_000,
    )
  })

  test('returns [] on HTTP error', async () => {
    const fetchOverride = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch
    const models = await fetchCursorAvailableModels(
      {
        CURSOR_API_KEY: 'user::jwt',
        CURSOR_MACHINE_ID: 'm-1',
        CURSOR_STATE_DB: '/no/such/db',
      },
      { fetchOverride },
    )
    expect(models).toEqual([])
  })
})
