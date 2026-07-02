import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const lang = {
  type: 'local-jsx',
  name: 'lang',
  get description() {
    return t('Set display language (en/zh/auto)')
  },
  immediate: true,
  argumentHint: '<en|zh|auto>',
  load: () => import('./lang.js'),
} satisfies Command

export default lang
