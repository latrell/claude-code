import type { Command } from '../../commands.js'
import { isConsumerSubscriber } from '../../utils/auth.js'
import { t } from '../../i18n/t.js'

const privacySettings = {
  type: 'local-jsx',
  name: 'privacy-settings',
  get description() {
    return t('View and update your privacy settings')
  },
  isEnabled: () => {
    return isConsumerSubscriber()
  },
  load: () => import('./privacy-settings.js'),
} satisfies Command

export default privacySettings
