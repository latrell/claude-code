import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'connect',
  get description() {
    return t('Manage provider connections and accounts (add, switch, remove)')
  },
  aliases: ['connections'],
  load: () => import('./connect.js'),
} satisfies Command
