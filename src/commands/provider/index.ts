import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

/**
 * /provider — switch the main agent to a saved connection (from /connect).
 *
 * Interactive: no args opens the ConnectionPicker; `<connection>` activates
 * for this session; `<connection> global` also persists it as the global
 * default; `unset` clears the provider selection back to environment vars.
 */
const provider: Command = {
  type: 'local-jsx',
  name: 'provider',
  get description() {
    return t('Switch the main agent to a saved connection (from /connect)')
  },
  aliases: ['api'],
  argumentHint: '[connection] [global] | unset',
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./provider.js'),
}

/** Headless (-p) variant: argument paths only, no picker UI. */
export const providerNonInteractive: Command = {
  type: 'local',
  name: 'provider',
  get description() {
    return t('Switch the main agent to a saved connection (from /connect)')
  },
  aliases: ['api'],
  argumentHint: '[connection] [global] | unset',
  supportsNonInteractive: true,
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled: () => getIsNonInteractiveSession(),
  load: () => import('./nonInteractive.js'),
}

export default provider
