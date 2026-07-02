import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const detach = {
  type: 'local',
  name: 'detach',
  get description() {
    return t('Detach from a sub CLI (or all connected subs)')
  },
  supportsNonInteractive: false,
  load: () => import('./detach.js'),
} satisfies Command

export default detach
