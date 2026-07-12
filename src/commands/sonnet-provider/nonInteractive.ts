import type { LocalCommandCall } from '../../types/command.js'
import { tf } from '../../i18n/t.js'
import { getEffectiveSonnetProvider } from '../../utils/model/sonnetProvider.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { runSonnetProviderCommand } from './runSonnetProvider.js'

/**
 * Headless /sonnet-provider: no picker UI. No args shows the effective
 * sonnet provider; argument paths (`<connection> [global]`, `unset`) share
 * runSonnetProviderCommand with the interactive variant.
 */
const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (!trimmed) {
    const current = getEffectiveSonnetProvider()
    const settings = getSettings_DEPRECATED()
    const hasSettingsOverride = !!settings?.sonnetProvider?.modelType
    const source = hasSettingsOverride
      ? tf(' (from settings: {provider})', {
          provider: settings!.sonnetProvider!.modelType,
        })
      : ''
    return {
      type: 'text',
      value: tf('Current sonnet provider: {provider}{source}', {
        provider: current,
        source,
      }),
    }
  }

  const outcome = await runSonnetProviderCommand(trimmed)
  return { type: 'text', value: outcome.message }
}

export { call }
