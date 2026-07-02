import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const exportCommand = {
  type: 'local-jsx',
  name: 'export',
  get description() {
    return t('Export the current conversation to a file or clipboard')
  },
  argumentHint: '[filename]',
  load: () => import('./export.js'),
} satisfies Command

export default exportCommand
