import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  get description() {
    return t('Show subscription plan usage and rate limits')
  },
  load: () => import('./usage.js'),
} satisfies Command
