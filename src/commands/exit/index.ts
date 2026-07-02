import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  aliases: ['quit'],
  get description() {
    return t('Exit the REPL')
  },
  immediate: true,
  load: () => import('./exit.js'),
} satisfies Command

export default exit
