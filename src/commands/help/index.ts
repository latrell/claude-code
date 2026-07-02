import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const help = {
  type: 'local-jsx',
  name: 'help',
  get description() {
    return t('Show help and available commands')
  },
  load: () => import('./help.js'),
} satisfies Command

export default help
