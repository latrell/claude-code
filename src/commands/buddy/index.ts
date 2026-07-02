import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'
import { t } from '../../i18n/t.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  get description() {
    return t('Hatch a coding companion · pet, off')
  },
  argumentHint: '[pet|off]',
  immediate: true,
  get isHidden() {
    return !isBuddyLive()
  },
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
