import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

/**
 * /sonnet-provider — switch internal SONNET-tier calls (memory retrieval,
 * poor-mode classifier) to a saved connection (from /connect).
 *
 * Interactive: no args opens the ConnectionPicker (sonnet slot);
 * `<connection>` activates for this session; `<connection> global` also
 * persists it as the global sonnet default; `unset` clears the override so
 * SONNET-tier calls inherit the main agent again.
 */
const sonnetProvider: Command = {
  type: 'local-jsx',
  name: 'sonnet-provider',
  get description() {
    return t(
      'Switch internal SONNET-tier calls to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['sonnetapi'],
  argumentHint: '[connection] [global] | unset',
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./sonnet-provider.js'),
}

/** Headless (-p) variant: argument paths only, no picker UI. */
export const sonnetProviderNonInteractive: Command = {
  type: 'local',
  name: 'sonnet-provider',
  get description() {
    return t(
      'Switch internal SONNET-tier calls to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['sonnetapi'],
  argumentHint: '[connection] [global] | unset',
  supportsNonInteractive: true,
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled: () => getIsNonInteractiveSession(),
  load: () => import('./nonInteractive.js'),
}

export default sonnetProvider
