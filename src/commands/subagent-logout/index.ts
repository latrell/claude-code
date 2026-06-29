import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const subagentLogout = {
  type: 'local-jsx',
  name: 'subagent-logout',
  description: 'Clear the Agent sub-session provider/account override',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_SUBAGENT_LOGOUT_COMMAND),
  load: () => import('./subagentLogout.js'),
} satisfies Command

export default subagentLogout
