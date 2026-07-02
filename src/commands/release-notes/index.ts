import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const releaseNotes: Command = {
  get description() {
    return t('View release notes')
  },
  name: 'release-notes',
  type: 'local',
  supportsNonInteractive: true,
  load: () => import('./release-notes.js'),
}

export default releaseNotes
