import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const heapDump = {
  type: 'local',
  name: 'heapdump',
  get description() {
    return t('Dump the JS heap to ~/Desktop')
  },
  isHidden: true,
  supportsNonInteractive: true,
  load: () => import('./heapdump.js'),
} satisfies Command

export default heapDump
