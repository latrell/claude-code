import type { Command } from '../../commands.js'
import { feature } from 'bun:bundle'
import { t } from '../../i18n/t.js'

const job = {
  type: 'local-jsx',
  name: 'job',
  get description() {
    return t('Manage template jobs')
  },
  argumentHint: '[list|new|reply|status]',
  isEnabled: () => {
    if (feature('TEMPLATES')) return true
    return false
  },
  load: () => import('./job.js'),
} satisfies Command

export default job
