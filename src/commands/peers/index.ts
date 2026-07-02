import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const peers = {
  type: 'local',
  name: 'peers',
  aliases: ['who'],
  get description() {
    return t('List connected Claude Code peers')
  },
  supportsNonInteractive: true,
  load: () => import('./peers.js'),
} satisfies Command

export default peers
