import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'stats',
  get description() {
    return t('Show session API usage and activity stats')
  },
  load: () => import('./stats.js'),
} satisfies Command
