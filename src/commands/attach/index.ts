import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const attach = {
  type: 'local',
  name: 'attach',
  get description() {
    return t('Attach to a sub Claude CLI instance via named pipe')
  },
  supportsNonInteractive: false,
  load: () => import('./attach.js'),
} satisfies Command

export default attach
