import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { t } from '../../i18n/t.js'

const subagentLogout = {
  type: 'local-jsx',
  name: 'subagent-logout',
  get description() {
    return t('Clear the Agent sub-session provider/account override')
  },
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_SUBAGENT_LOGOUT_COMMAND),
  load: () => import('./subagentLogout.js'),
} satisfies Command

export default subagentLogout
