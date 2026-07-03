import { beforeEach, describe, expect, mock, test } from 'bun:test'
import * as realSettings from '../../../utils/settings/settings.js'
import type { LocalCommandCall } from '../../../types/command.js'

// Mock settings to track writes and control getSettings_DEPRECATED /
// getInitialSettings. Do NOT mock subagentProvider.js — it would
// pollute other subagent tests (Bun mock.module is process-global).
// Instead, control behavior through mockSettings which the real
// getEffectiveSubagentProvider reads via getInitialSettings.
let mockSettings: Record<string, unknown> = {}
const updateCalls: Array<{ source: string; update: unknown }> = []
mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getSettings_DEPRECATED: () => mockSettings,
  getInitialSettings: () => mockSettings,
  updateSettingsForSource: (source: string, update: unknown) => {
    updateCalls.push({ source, update })
    return { error: null }
  },
}))

const { default: cmdModule } = await import('../index.js')

describe('subagent-provider command', () => {
  let call: LocalCommandCall

  beforeEach(async () => {
    mockSettings = {}
    updateCalls.length = 0
    const loaded = await cmdModule.load()
    call = loaded.call
  })

  test('no args shows current subagent provider', async () => {
    mockSettings = { subagentProvider: { modelType: 'openai' } }
    const result = await call('', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain(
      'Current subagent provider:',
    )
    expect((result as { value: string }).value).toContain(
      '(from settings: openai)',
    )
  })

  test('no args shows no settings source when unconfigured', async () => {
    mockSettings = {}
    const result = await call('', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain(
      'Current subagent provider:',
    )
    // Should not show "(from settings: ...)" when no settings override
    expect((result as { value: string }).value).not.toContain('(from settings:')
  })

  test('set to openai writes settings', async () => {
    const result = await call('openai', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Subagent provider set to openai.',
    })
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.source).toBe('userSettings')
    expect(updateCalls[0]?.update).toEqual({
      subagentProvider: {
        modelType: 'openai',
        credentialScope: 'subagent',
      },
    })
  })

  test('set to gemini writes settings', async () => {
    const result = await call('gemini', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Subagent provider set to gemini.',
    })
    expect(updateCalls[0]?.update).toEqual({
      subagentProvider: {
        modelType: 'gemini',
        credentialScope: 'subagent',
      },
    })
  })

  test('set to grok writes settings', async () => {
    const result = await call('grok', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Subagent provider set to grok.',
    })
    expect(updateCalls[0]?.update).toEqual({
      subagentProvider: {
        modelType: 'grok',
        credentialScope: 'subagent',
      },
    })
  })

  test('set to anthropic writes settings', async () => {
    const result = await call('anthropic', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Subagent provider set to anthropic.',
    })
    expect(updateCalls[0]?.update).toEqual({
      subagentProvider: {
        modelType: 'anthropic',
        credentialScope: 'subagent',
      },
    })
  })

  test('unset clears subagent provider', async () => {
    const result = await call('unset', {} as never)
    expect(result).toEqual({
      type: 'text',
      value:
        'Subagent provider cleared. Subagents will now inherit the main provider.',
    })
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.source).toBe('userSettings')
    expect(updateCalls[0]?.update).toEqual({ subagentProvider: undefined })
  })

  test('preserves existing env when changing provider', async () => {
    mockSettings = {
      subagentProvider: {
        modelType: 'openai',
        env: { OPENAI_API_KEY: 'some-key' },
        credentialScope: 'subagent',
      },
    }
    const result = await call('gemini', {} as never)
    expect(result).toEqual({
      type: 'text',
      value: 'Subagent provider set to gemini.',
    })
    expect(updateCalls[0]?.update).toEqual({
      subagentProvider: {
        modelType: 'gemini',
        env: { OPENAI_API_KEY: 'some-key' },
        credentialScope: 'subagent',
      },
    })
  })

  test('bedrock gives clear error', async () => {
    const result = await call('bedrock', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain('not supported')
  })

  test('vertex gives clear error', async () => {
    const result = await call('vertex', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain('not supported')
  })

  test('foundry gives clear error', async () => {
    const result = await call('foundry', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain('not supported')
  })

  test('invalid provider gives error', async () => {
    const result = await call('invalid', {} as never)
    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain('Invalid provider')
  })
})
