import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

/**
 * /fast-provider — switch small/fast (HAIKU) internal calls (session titles,
 * notification summaries, side queries…) to a saved connection (from
 * /connect).
 *
 * Interactive: no args opens the ConnectionPicker (fast slot);
 * `<connection>` activates for this session; `<connection> global` also
 * persists it as the global fast default; `unset` clears the override so
 * fast calls inherit the main agent again.
 */
const fastProvider: Command = {
  type: 'local-jsx',
  name: 'fast-provider',
  get description() {
    return t(
      'Switch small/fast (HAIKU) calls to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['fastapi'],
  argumentHint: '[connection] [global] | unset',
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./fast-provider.js'),
}

/** Headless (-p) variant: argument paths only, no picker UI. */
export const fastProviderNonInteractive: Command = {
  type: 'local',
  name: 'fast-provider',
  get description() {
    return t(
      'Switch small/fast (HAIKU) calls to a saved connection (from /connect), or unset to inherit the main agent',
    )
  },
  aliases: ['fastapi'],
  argumentHint: '[connection] [global] | unset',
  supportsNonInteractive: true,
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled: () => getIsNonInteractiveSession(),
  load: () => import('./nonInteractive.js'),
}

export default fastProvider
