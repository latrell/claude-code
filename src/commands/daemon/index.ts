import type { Command } from '../../commands.js'
import { feature } from 'bun:bundle'
import { t } from '../../i18n/t.js'

const daemon = {
  type: 'local-jsx',
  name: 'daemon',
  get description() {
    return t('Manage background sessions and daemon')
  },
  argumentHint: '[status|start|stop|bg|attach|logs|kill]',
  isEnabled: () => {
    if (feature('DAEMON')) return true
    if (feature('BG_SESSIONS')) return true
    return false
  },
  load: () => import('./daemon.js'),
} satisfies Command

export default daemon
