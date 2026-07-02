import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const send = {
  type: 'local',
  name: 'send',
  get description() {
    return t('Send a message to a connected sub CLI')
  },
  supportsNonInteractive: false,
  load: () => import('./send.js'),
} satisfies Command

export default send
