import type { LocalCommandCall } from '../../types/command.js'
import { tf } from '../../i18n/t.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { runProviderCommand } from './runProvider.js'

/**
 * Headless /provider: no picker UI. No args shows the current provider;
 * argument paths (`<connection> [global]`, `unset`) share runProviderCommand
 * with the interactive variant.
 */
const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  if (!trimmed) {
    return {
      type: 'text',
      value: tf('Current API provider: {provider}', {
        provider: getAPIProvider(),
      }),
    }
  }

  const outcome = await runProviderCommand(trimmed)
  return { type: 'text', value: outcome.message }
}

export { call }
