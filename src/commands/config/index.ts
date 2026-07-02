import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const config = {
  aliases: ['settings'],
  type: 'local-jsx',
  name: 'config',
  get description() {
    return t('Open config panel')
  },
  load: () => import('./config.js'),
} satisfies Command

export default config
