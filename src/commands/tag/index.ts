import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const tag = {
  type: 'local-jsx',
  name: 'tag',
  get description() {
    return t('Toggle a searchable tag on the current session')
  },
  isEnabled: () => process.env.USER_TYPE === 'ant',
  argumentHint: '<tag-name>',
  load: () => import('./tag.js'),
} satisfies Command

export default tag
