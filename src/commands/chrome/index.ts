import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const command: Command = {
  name: 'chrome',
  get description() {
    return t('Claude in Chrome (Beta) settings')
  },
  availability: [],
  isEnabled: () => !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./chrome.js'),
}

export default command
