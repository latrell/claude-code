import type { LoadedPlugin } from '../../types/plugin.js'

/** Resolve the effective state while preserving plugin-specific defaults. */
export function resolvePluginEnabled(
  plugin: Pick<LoadedPlugin, 'enabled'>,
  configuredState: boolean | string[] | undefined,
): boolean {
  return configuredState === undefined
    ? (plugin.enabled ?? true)
    : configuredState === true
}
