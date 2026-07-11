/**
 * Argument-path logic for /subagent-provider, shared by the interactive
 * (local-jsx) and headless (local) command variants.
 *
 * `<connection> [global]` — resolve the connection reference and activate it
 * for the subagent slot. `unset` — clear all overrides so subagents inherit
 * the main agent's provider again.
 */

import { t } from '../../i18n/t.js'
import { clearSubagentDefault } from '../../services/connections/activate.js'
import {
  parseConnectionSwitchArgs,
  switchSlotByRef,
} from '../../services/connections/slotSwitch.js'
import { setSubagentProviderCliOverride } from '../../utils/model/subagentProvider.js'

export type SubagentProviderOutcome = {
  success: boolean
  message: string
}

function unsetSubagentProvider(): SubagentProviderOutcome {
  // Clears the config override, the registry default assignment, the session
  // assignment and settings.subagentProvider.
  const { error } = clearSubagentDefault()
  // Force "inherit main" for this process even when SUBAGENT_* env vars or a
  // startup --subagent-provider flag staged a subagent provider.
  setSubagentProviderCliOverride('unset')
  if (error) {
    return { success: false, message: error.message }
  }
  return {
    success: true,
    message: t(
      'Subagent provider cleared. Subagents will now inherit the main provider.',
    ),
  }
}

/** Handle the /subagent-provider argument path. `args` must be non-empty. */
export async function runSubagentProviderCommand(
  args: string,
): Promise<SubagentProviderOutcome> {
  const trimmed = args.trim()
  if (trimmed.toLowerCase() === 'unset') {
    return unsetSubagentProvider()
  }
  const { ref, scope } = parseConnectionSwitchArgs(trimmed)
  const result = await switchSlotByRef(ref, 'subagent', scope)
  if (!result.success) {
    return { success: false, message: result.error }
  }
  return { success: true, message: result.message }
}
