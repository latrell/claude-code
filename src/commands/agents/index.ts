import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const agents = {
  type: 'local-jsx',
  name: 'agents',
  get description() {
    return t('Manage agent configurations')
  },
  load: () => import('./agents.js'),
} satisfies Command

export default agents
