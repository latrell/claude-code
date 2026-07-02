import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const history = {
  type: 'local',
  name: 'history',
  aliases: ['hist'],
  get description() {
    return t('View session history of a connected sub CLI')
  },
  supportsNonInteractive: false,
  load: () => import('./history.js'),
} satisfies Command

export default history
