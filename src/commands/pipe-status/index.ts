import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const pipeStatus = {
  type: 'local',
  name: 'pipe-status',
  get description() {
    return t('Show current pipe connection status')
  },
  supportsNonInteractive: true,
  load: () => import('./pipe-status.js'),
} satisfies Command

export default pipeStatus
