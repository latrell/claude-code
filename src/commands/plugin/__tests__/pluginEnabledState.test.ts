import { describe, expect, test } from 'bun:test'
import type { LoadedPlugin } from '../../../types/plugin.js'
import { resolvePluginEnabled } from '../pluginEnabledState.js'

function plugin(enabled?: boolean): Pick<LoadedPlugin, 'enabled'> {
  return enabled === undefined ? {} : { enabled }
}

describe('resolvePluginEnabled', () => {
  test('preserves a disabled plugin default when no setting exists', () => {
    expect(resolvePluginEnabled(plugin(false), undefined)).toBe(false)
  })

  test('lets explicit boolean settings override the plugin default', () => {
    expect(resolvePluginEnabled(plugin(false), true)).toBe(true)
    expect(resolvePluginEnabled(plugin(true), false)).toBe(false)
  })

  test('matches plugin loader behavior for extended array settings', () => {
    expect(resolvePluginEnabled(plugin(true), ['1.0.0'])).toBe(false)
  })

  test('keeps the legacy enabled fallback when no state is available', () => {
    expect(resolvePluginEnabled(plugin(), undefined)).toBe(true)
  })
})
