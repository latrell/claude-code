import type { LocalCommandCall } from '../../types/command.js'
import { tf } from '../../i18n/t.js'
import { getEffectiveFastProvider } from '../../utils/model/fastProvider.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { runFastProviderCommand } from './runFastProvider.js'

/**
 * Headless /fast-provider: no picker UI. No args shows the effective fast
 * provider; argument paths (`<connection> [global]`, `unset`) share
 * runFastProviderCommand with the interactive variant.
 */
const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (!trimmed) {
    const current = getEffectiveFastProvider()
    const settings = getSettings_DEPRECATED()
    const hasSettingsOverride = !!settings?.fastProvider?.modelType
    const source = hasSettingsOverride
      ? tf(' (from settings: {provider})', {
          provider: settings!.fastProvider!.modelType,
        })
      : ''
    return {
      type: 'text',
      value: tf('Current fast provider: {provider}{source}', {
        provider: current,
        source,
      }),
    }
  }

  const outcome = await runFastProviderCommand(trimmed)
  return { type: 'text', value: outcome.message }
}

export { call }
