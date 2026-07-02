import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  aliases: ['cost', 'stats'],
  get description() {
    return t('Show session cost, plan usage, and activity stats')
  },
  load: () => import('./usage.js'),
} satisfies Command
