/**
 * Argument-path logic for /sonnet-provider, shared by the interactive
 * (local-jsx) and headless (local) command variants.
 *
 * `<connection> [global]` — resolve the connection reference and activate it
 * for the sonnet slot. `unset` — clear all overrides so internal SONNET-tier
 * calls inherit the main agent's provider again.
 */

import { t } from '../../i18n/t.js'
import { clearSonnetDefault } from '../../services/connections/activate.js'
import {
  parseConnectionSwitchArgs,
  switchSlotByRef,
} from '../../services/connections/slotSwitch.js'
import { setSonnetProviderCliOverride } from '../../utils/model/sonnetProvider.js'

export type SonnetProviderOutcome = {
  success: boolean
  message: string
}

function unsetSonnetProvider(): SonnetProviderOutcome {
  // Clears the config override, the registry default assignment, the session
  // assignment and settings.sonnetProvider.
  const { error } = clearSonnetDefault()
  // Force "inherit main" for this process even when SONNET_* env vars or a
  // startup --sonnet-provider flag staged a sonnet provider.
  setSonnetProviderCliOverride('unset')
  if (error) {
    return { success: false, message: error.message }
  }
  return {
    success: true,
    message: t(
      'Sonnet provider cleared. Internal SONNET-tier calls will now inherit the main provider.',
    ),
  }
}

/** Handle the /sonnet-provider argument path. `args` must be non-empty. */
export async function runSonnetProviderCommand(
  args: string,
): Promise<SonnetProviderOutcome> {
  const trimmed = args.trim()
  if (trimmed.toLowerCase() === 'unset') {
    return unsetSonnetProvider()
  }
  const { ref, scope } = parseConnectionSwitchArgs(trimmed)
  const result = await switchSlotByRef(ref, 'sonnet', scope)
  if (!result.success) {
    return { success: false, message: result.error }
  }
  return { success: true, message: result.message }
}
