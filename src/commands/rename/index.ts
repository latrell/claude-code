import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const rename = {
  type: 'local-jsx',
  name: 'rename',
  get description() {
    return t('Rename the current conversation')
  },
  immediate: true,
  argumentHint: '[name]',
  load: () => import('./rename.js'),
} satisfies Command

export default rename
