import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
// Spread-real settings mock: pin the resolved language to 'en' so the
// t()-translated summaries assert deterministically on any dev machine.
import * as realSettings from '../../../utils/settings/settings.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))
mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getInitialSettings: () => ({}),
}))

const {
  connectionProfileSummary,
  connectionRequiresPinnedModel,
  duplicateConnection,
  withContextWindow,
  withPinnedModel,
  withThinkingEffort,
} = await import('../profile.js')
import type { Connection } from '../types.js'

function conn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'deepseek1',
    label: 'deepseek1',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    ...overrides,
  }
}

describe('connectionRequiresPinnedModel', () => {
  test('key-based third-party kinds require an explicit model', () => {
    expect(connectionRequiresPinnedModel('openai-compat')).toBe(true)
    expect(connectionRequiresPinnedModel('gemini')).toBe(true)
    expect(connectionRequiresPinnedModel('grok')).toBe(true)
  })

  test('kinds with a provider default do not', () => {
    expect(connectionRequiresPinnedModel('anthropic-oauth')).toBe(false)
    expect(connectionRequiresPinnedModel('anthropic-api')).toBe(false)
    expect(connectionRequiresPinnedModel('chatgpt-oauth')).toBe(false)
    expect(connectionRequiresPinnedModel('cursor')).toBe(false)
  })
})

describe('withPinnedModel', () => {
  test('pins the model and clears a stale context window', () => {
    const next = withPinnedModel(
      conn({ model: 'deepseek-chat', contextWindow: 128_000 }),
      'deepseek-reasoner',
    )
    expect(next.model).toBe('deepseek-reasoner')
    expect(next.contextWindow).toBeUndefined()
  })

  test('syncs the context window from the per-model map when known', () => {
    const next = withPinnedModel(
      conn({
        modelContextWindows: {
          'deepseek-reasoner': { tokens: 1_000_000, source: 'auto' },
        },
      }),
      'deepseek-reasoner',
    )
    expect(next.contextWindow).toBe(1_000_000)
  })

  test('undefined clears both the model and the context window', () => {
    const next = withPinnedModel(
      conn({ model: 'deepseek-chat', contextWindow: 128_000 }),
      undefined,
    )
    expect(next.model).toBeUndefined()
    expect(next.contextWindow).toBeUndefined()
  })

  test('does not mutate the source connection', () => {
    const source = conn({ model: 'deepseek-chat' })
    withPinnedModel(source, 'other')
    expect(source.model).toBe('deepseek-chat')
  })
})

describe('withThinkingEffort', () => {
  test('sets and clears the effort', () => {
    const set = withThinkingEffort(conn(), 'max')
    expect(set.thinkingEffort).toBe('max')
    const cleared = withThinkingEffort(set, undefined)
    expect(cleared.thinkingEffort).toBeUndefined()
    expect('thinkingEffort' in cleared).toBe(false)
  })
})

describe('withContextWindow', () => {
  test('sets and clears the window', () => {
    const set = withContextWindow(conn(), 1_000_000)
    expect(set.contextWindow).toBe(1_000_000)
    const cleared = withContextWindow(set, undefined)
    expect('contextWindow' in cleared).toBe(false)
  })
})

describe('duplicateConnection', () => {
  test('copies credentials, catalogs and profile fields', () => {
    const source = conn({
      machineId: 'machine-1',
      credentialRef: 'scope-a',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      tierModels: { sonnet: 'deepseek-chat' },
      modelContextWindows: {
        'deepseek-chat': { tokens: 128_000, source: 'auto' },
      },
      presetId: 'deepseek',
      model: 'deepseek-chat',
      thinkingEffort: 'max',
      contextWindow: 1_000_000,
      accountEmail: 'me@example.com',
      createdAt: '2020-01-01T00:00:00.000Z',
      lastUsedAt: '2024-01-01T00:00:00.000Z',
    })
    const copy = duplicateConnection(
      source,
      'deepseek2',
      'deepseek2',
      '2026-07-11T00:00:00.000Z',
    )
    expect(copy.id).toBe('deepseek2')
    expect(copy.label).toBe('deepseek2')
    expect(copy.kind).toBe('openai-compat')
    expect(copy.baseUrl).toBe(source.baseUrl)
    expect(copy.apiKey).toBe(source.apiKey)
    expect(copy.machineId).toBe('machine-1')
    expect(copy.credentialRef).toBe('scope-a')
    expect(copy.models).toEqual(source.models)
    expect(copy.tierModels).toEqual(source.tierModels)
    expect(copy.modelContextWindows).toEqual(source.modelContextWindows)
    expect(copy.presetId).toBe('deepseek')
    expect(copy.model).toBe('deepseek-chat')
    expect(copy.thinkingEffort).toBe('max')
    expect(copy.contextWindow).toBe(1_000_000)
    expect(copy.createdAt).toBe('2026-07-11T00:00:00.000Z')
    expect(copy.lastUsedAt).toBeUndefined()
  })

  test('profile fields on the copy can diverge without touching the source', () => {
    const source = conn({ model: 'deepseek-v4-pro', thinkingEffort: 'max' })
    let copy = duplicateConnection(source, 'deepseek2', 'deepseek2')
    copy = withPinnedModel(copy, 'deepseek-v4-flash')
    copy = withThinkingEffort(copy, 'low')
    expect(copy.model).toBe('deepseek-v4-flash')
    expect(copy.thinkingEffort).toBe('low')
    expect(source.model).toBe('deepseek-v4-pro')
    expect(source.thinkingEffort).toBe('max')
  })
})

describe('connectionProfileSummary', () => {
  test('full profile renders model, effort and ctx', () => {
    expect(
      connectionProfileSummary(
        conn({
          presetId: 'deepseek',
          model: 'deepseek-v4-pro',
          thinkingEffort: 'max',
          contextWindow: 1_000_000,
        }),
      ),
    ).toBe('DeepSeek V4 Pro · effort max · ctx 1M')
  })

  test('without a pinned model falls back to the provider default label', () => {
    expect(connectionProfileSummary(conn())).toBe('provider default')
  })

  test('omits unset effort and ctx', () => {
    expect(connectionProfileSummary(conn({ model: 'deepseek-chat' }))).toBe(
      'deepseek-chat',
    )
  })

  test('falls back to the raw id for a model without a catalog alias', () => {
    expect(connectionProfileSummary(conn({ model: 'custom-model' }))).toBe(
      'custom-model',
    )
  })
})
