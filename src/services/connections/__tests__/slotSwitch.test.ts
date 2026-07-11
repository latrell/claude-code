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

const { connectionSummary, parseConnectionSwitchArgs } = await import(
  '../slotSwitch.js'
)
import type { Connection } from '../types.js'

function conn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    ...overrides,
  }
}

describe('parseConnectionSwitchArgs', () => {
  test('bare ref selects session scope', () => {
    expect(parseConnectionSwitchArgs('deepseek')).toEqual({
      ref: 'deepseek',
      scope: 'session',
    })
  })

  test('trailing global token selects global scope', () => {
    expect(parseConnectionSwitchArgs('deepseek global')).toEqual({
      ref: 'deepseek',
      scope: 'global',
    })
  })

  test('global token is case-insensitive and ref keeps inner spaces', () => {
    expect(parseConnectionSwitchArgs('DeepSeek Personal GLOBAL')).toEqual({
      ref: 'DeepSeek Personal',
      scope: 'global',
    })
  })

  test('a lone "global" is treated as the connection ref', () => {
    expect(parseConnectionSwitchArgs('global')).toEqual({
      ref: 'global',
      scope: 'session',
    })
  })

  test('surrounding whitespace is trimmed', () => {
    expect(parseConnectionSwitchArgs('  deepseek   global  ')).toEqual({
      ref: 'deepseek',
      scope: 'global',
    })
  })
})

describe('connectionSummary', () => {
  test('shows pinned model', () => {
    expect(connectionSummary(conn({ model: 'deepseek-chat' }))).toBe(
      'DeepSeek (deepseek-chat)',
    )
  })

  test('includes thinking effort when pinned', () => {
    expect(
      connectionSummary(
        conn({ model: 'deepseek-reasoner', thinkingEffort: 'high' }),
      ),
    ).toBe('DeepSeek (deepseek-reasoner, effort high)')
  })

  test('falls back to provider default when no model is pinned', () => {
    expect(connectionSummary(conn())).toBe('DeepSeek (provider default)')
  })
})
