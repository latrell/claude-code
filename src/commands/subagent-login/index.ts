import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { t } from '../../i18n/t.js'

const subagentLogin = {
  type: 'local-jsx',
  name: 'subagent-login',
  get description() {
    return t('Configure the provider/account used by Agent sub-sessions')
  },
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_SUBAGENT_LOGIN_COMMAND),
  load: () => import('./subagentLogin.js'),
} satisfies Command

export default subagentLogin
