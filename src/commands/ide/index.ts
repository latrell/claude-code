import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const ide = {
  type: 'local-jsx',
  name: 'ide',
  get description() {
    return t('Manage IDE integrations and show status')
  },
  argumentHint: '[open]',
  load: () => import('./ide.js'),
} satisfies Command

export default ide
