import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const tasks = {
  type: 'local-jsx',
  name: 'tasks',
  aliases: ['bashes'],
  get description() {
    return t('List and manage background tasks')
  },
  load: () => import('./tasks.js'),
} satisfies Command

export default tasks
