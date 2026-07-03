import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'cost',
  get description() {
    return t('Show session API cost and usage stats')
  },
  load: () => import('./cost.js'),
} satisfies Command
