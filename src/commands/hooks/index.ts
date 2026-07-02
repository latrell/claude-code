import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const hooks = {
  type: 'local-jsx',
  name: 'hooks',
  get description() {
    return t('View hook configurations for tool events')
  },
  immediate: true,
  load: () => import('./hooks.js'),
} satisfies Command

export default hooks
