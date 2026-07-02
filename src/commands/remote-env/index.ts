import type { Command } from '../../commands.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'remote-env',
  get description() {
    return t('Configure the default remote environment for teleport sessions')
  },
  isEnabled: () =>
    isClaudeAISubscriber() && isPolicyAllowed('allow_remote_sessions'),
  get isHidden() {
    return !isClaudeAISubscriber() || !isPolicyAllowed('allow_remote_sessions')
  },
  load: () => import('./remote-env.js'),
} satisfies Command
