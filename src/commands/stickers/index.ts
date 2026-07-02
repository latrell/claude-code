import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const stickers = {
  type: 'local',
  name: 'stickers',
  get description() {
    return t('Order Claude Code stickers')
  },
  supportsNonInteractive: false,
  load: () => import('./stickers.js'),
} satisfies Command

export default stickers
