/**
 * Argument-path logic for /fast-provider, shared by the interactive
 * (local-jsx) and headless (local) command variants.
 *
 * `<connection> [global]` — resolve the connection reference and activate it
 * for the fast slot. `unset` — clear all overrides so small/fast (HAIKU)
 * calls inherit the main agent's provider again.
 */

import { t } from '../../i18n/t.js'
import { clearFastDefault } from '../../services/connections/activate.js'
import {
  parseConnectionSwitchArgs,
  switchSlotByRef,
} from '../../services/connections/slotSwitch.js'
import { setFastProviderCliOverride } from '../../utils/model/fastProvider.js'

export type FastProviderOutcome = {
  success: boolean
  message: string
}

function unsetFastProvider(): FastProviderOutcome {
  // Clears the config override, the registry default assignment, the session
  // assignment and settings.fastProvider.
  const { error } = clearFastDefault()
  // Force "inherit main" for this process even when FAST_* env vars or a
  // startup --fast-provider flag staged a fast provider.
  setFastProviderCliOverride('unset')
  if (error) {
    return { success: false, message: error.message }
  }
  return {
    success: true,
    message: t(
      'Fast provider cleared. Small/fast (HAIKU) calls will now inherit the main provider.',
    ),
  }
}

/** Handle the /fast-provider argument path. `args` must be non-empty. */
export async function runFastProviderCommand(
  args: string,
): Promise<FastProviderOutcome> {
  const trimmed = args.trim()
  if (trimmed.toLowerCase() === 'unset') {
    return unsetFastProvider()
  }
  const { ref, scope } = parseConnectionSwitchArgs(trimmed)
  const result = await switchSlotByRef(ref, 'fast', scope)
  if (!result.success) {
    return { success: false, message: result.error }
  }
  return { success: true, message: result.message }
}
