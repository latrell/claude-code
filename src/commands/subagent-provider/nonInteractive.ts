import type { LocalCommandCall } from '../../types/command.js'
import { tf } from '../../i18n/t.js'
import { getEffectiveSubagentProvider } from '../../utils/model/subagentProvider.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { runSubagentProviderCommand } from './runSubagentProvider.js'

/**
 * Headless /subagent-provider: no picker UI. No args shows the effective
 * subagent provider; argument paths (`<connection> [global]`, `unset`) share
 * runSubagentProviderCommand with the interactive variant.
 */
const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (!trimmed) {
    const current = getEffectiveSubagentProvider()
    const settings = getSettings_DEPRECATED()
    const hasSettingsOverride = !!settings?.subagentProvider?.modelType
    const source = hasSettingsOverride
      ? tf(' (from settings: {provider})', {
          provider: settings!.subagentProvider!.modelType,
        })
      : ''
    return {
      type: 'text',
      value: tf('Current subagent provider: {provider}{source}', {
        provider: current,
        source,
      }),
    }
  }

  const outcome = await runSubagentProviderCommand(trimmed)
  return { type: 'text', value: outcome.message }
}

export { call }
