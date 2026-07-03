/**
 * Tests for /stats command — session API usage stats.
 *
 * /stats is an independent command that shows session-level API usage.
 * It is no longer an alias of /usage.
 */

import { mock, describe, test, expect } from 'bun:test'

// Must mock before importing anything that pulls in bootstrap/state
import { logMock } from '../../../../tests/mocks/log.js'
mock.module('src/utils/log.ts', logMock)

import { debugMock } from '../../../../tests/mocks/debug.js'
mock.module('src/utils/debug.ts', debugMock)

mock.module('bun:bundle', () => ({ feature: () => false }))

mock.module('src/utils/config.ts', () => ({
  getCurrentProjectConfig: () => ({}),
  saveCurrentProjectConfig: () => {},
  getGlobalConfig: () => ({}),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadStatsCommand() {
  const mod = await import('../index.js')
  return mod.default
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('stats command — metadata', () => {
  test('name is "stats"', async () => {
    const cmd = await loadStatsCommand()
    expect(cmd.name).toBe('stats')
  })

  test('type is local-jsx', async () => {
    const cmd = await loadStatsCommand()
    expect(cmd.type).toBe('local-jsx')
  })

  test('description mentions stats or usage', async () => {
    const cmd = await loadStatsCommand()
    const desc = cmd.description.toLowerCase()
    expect(desc.includes('stat') || desc.includes('usage')).toBe(true)
  })

  test('is NOT restricted to subscribers', async () => {
    const cmd = await loadStatsCommand()
    const avail = (cmd as { availability?: string[] }).availability
    expect(avail).toBeUndefined()
  })

  test('has no aliases', async () => {
    const cmd = await loadStatsCommand()
    expect((cmd as { aliases?: string[] }).aliases).toBeUndefined()
  })
})
