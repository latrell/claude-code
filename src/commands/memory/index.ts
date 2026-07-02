import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  get description() {
    return t('Edit Claude memory files')
  },
  load: () => import('./memory.js'),
}

export default memory
