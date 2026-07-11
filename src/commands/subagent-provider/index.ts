import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

/**
 * /subagent-provider — switch subagents to a saved connection (from
 * /connect).
 *
 * Interactive: no args opens the ConnectionPicker (subagent slot);
 * `<connection>` activates for this session; `<connection> global` also
 * persists it as the global subagent default; `unset` clears the override so
 * subagents inherit the main agent again.
 */
const subagentProvider: Command = {
  type: 'local-jsx',
  name: 'subagent-provider',
  get description() {
    return t(
      'Switch subagents to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['subapi'],
  argumentHint: '[connection] [global] | unset',
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./subagent-provider.js'),
}

/** Headless (-p) variant: argument paths only, no picker UI. */
export const subagentProviderNonInteractive: Command = {
  type: 'local',
  name: 'subagent-provider',
  get description() {
    return t(
      'Switch subagents to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['subapi'],
  argumentHint: '[connection] [global] | unset',
  supportsNonInteractive: true,
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled: () => getIsNonInteractiveSession(),
  load: () => import('./nonInteractive.js'),
}

export default subagentProvider
