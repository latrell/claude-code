import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'logout',
  get description() {
    return t('Sign out from your configured account')
  },
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGOUT_COMMAND),
  load: () => import('./logout.js'),
} satisfies Command
