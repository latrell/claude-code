/**
 * Tests for /usage command — subscription usage panel.
 *
 * /usage shows the Settings → Usage tab for subscription plan data.
 * /cost and /stats are now independent commands (no longer aliases of /usage).
 */

import { mock, describe, test, expect } from 'bun:test'

// Must mock before importing anything that pulls in bootstrap/state
import { logMock } from '../../../../tests/mocks/log.js'
mock.module('src/utils/log.ts', logMock)

import { debugMock } from '../../../../tests/mocks/debug.js'
mock.module('src/utils/debug.ts', debugMock)

mock.module('bun:bundle', () => ({ feature: () => false }))

mock.module('src/utils/auth.ts', () => ({
  isClaudeAISubscriber: () => false,
  getOAuthAccount: () => null,
}))

mock.module('src/services/claudeAiLimits.ts', () => ({
  currentLimits: { isUsingOverage: false },
}))

mock.module('src/cost-tracker.ts', () => ({
  formatTotalCost: () => 'Total cost: $0.0012',
}))

mock.module('src/utils/config.ts', () => ({
  getCurrentProjectConfig: () => ({}),
  saveCurrentProjectConfig: () => {},
  getGlobalConfig: () => ({}),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadUsageCommand() {
  const mod = await import('../index.js')
  return mod.default
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('usage command — metadata', () => {
  test('name is "usage"', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.name).toBe('usage')
  })

  test('has no aliases (cost and stats are now independent commands)', async () => {
    const cmd = await loadUsageCommand()
    expect((cmd as { aliases?: string[] }).aliases).toBeUndefined()
  })

  test('type is local-jsx', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.type).toBe('local-jsx')
  })

  test('description mentions usage or plan', async () => {
    const cmd = await loadUsageCommand()
    const desc = cmd.description.toLowerCase()
    expect(desc.includes('usage') || desc.includes('plan')).toBe(true)
  })

  test('is NOT restricted exclusively to claude-ai subscribers', async () => {
    const cmd = await loadUsageCommand()
    const avail = (cmd as { availability?: string[] }).availability
    const isExclusivelyClaudeAi =
      Array.isArray(avail) && avail.length === 1 && avail[0] === 'claude-ai'
    expect(isExclusivelyClaudeAi).toBe(false)
  })
})
