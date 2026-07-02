import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const installSlackApp = {
  type: 'local',
  name: 'install-slack-app',
  get description() {
    return t('Install the Claude Slack app')
  },
  availability: ['claude-ai'],
  supportsNonInteractive: false,
  load: () => import('./install-slack-app.js'),
} satisfies Command

export default installSlackApp
