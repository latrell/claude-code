import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const fork = {
  type: 'local-jsx',
  name: 'fork',
  get description() {
    return t('Fork the current session into a new sub-agent')
  },
  argumentHint: '<prompt>',
  load: () => import('./fork.js'),
} satisfies Command

export default fork
