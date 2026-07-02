import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const command = {
  name: 'vim',
  get description() {
    return t('Toggle between Vim and Normal editing modes')
  },
  supportsNonInteractive: false,
  type: 'local',
  load: () => import('./vim.js'),
} satisfies Command

export default command
