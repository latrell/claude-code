import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const files = {
  type: 'local',
  name: 'files',
  get description() {
    return t('List all files currently in context')
  },
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => import('./files.js'),
} satisfies Command

export default files
