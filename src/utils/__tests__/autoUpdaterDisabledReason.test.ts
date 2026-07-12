import { describe, expect, test } from 'bun:test'
import { resolveAutoUpdaterDisabledReason } from '../autoUpdaterDisabledReason.js'

function resolve(
  overrides: {
    nodeEnv?: string
    disableAutoUpdater?: string
    enableAutoUpdater?: string
    essentialTrafficReason?: string | null
    configDisabled?: boolean
  } = {},
) {
  return resolveAutoUpdaterDisabledReason({
    nodeEnv: overrides.nodeEnv ?? 'test',
    disableAutoUpdater: overrides.disableAutoUpdater,
    enableAutoUpdater: overrides.enableAutoUpdater,
    getEssentialTrafficReason: () => overrides.essentialTrafficReason ?? null,
    isConfigDisabled: () => overrides.configDisabled ?? false,
  })
}

describe('resolveAutoUpdaterDisabledReason', () => {
  test('truthy DISABLE_AUTOUPDATER wins over ENABLE_AUTOUPDATER', () => {
    expect(
      resolve({ disableAutoUpdater: '1', enableAutoUpdater: '1' }),
    ).toEqual({
      type: 'env',
      envVar: 'DISABLE_AUTOUPDATER',
    })
  })

  test('essential-traffic wins over the default fallback', () => {
    expect(
      resolve({
        essentialTrafficReason: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      }),
    ).toEqual({
      type: 'env',
      envVar: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    })
  })

  test('default policy is cleared before a config blocker is actionable', () => {
    expect(resolve({ configDisabled: true })).toEqual({ type: 'default' })
    expect(resolve({ configDisabled: true, enableAutoUpdater: '1' })).toEqual({
      type: 'config',
    })
    expect(resolve({ configDisabled: true, disableAutoUpdater: '0' })).toEqual({
      type: 'config',
    })
  })

  test('uses the default fallback when no concrete blocker is present', () => {
    expect(resolve()).toEqual({ type: 'default' })
  })

  test('explicit enable values bypass only the default fallback', () => {
    expect(resolve({ disableAutoUpdater: '0' })).toBeNull()
    expect(resolve({ enableAutoUpdater: '1' })).toBeNull()
  })
})
