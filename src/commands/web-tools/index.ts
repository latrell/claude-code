import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const webTools = {
  type: 'local-jsx',
  name: 'web-tools',
  get description() {
    return t('Configure web search and web fetch backends')
  },
  load: () => import('./web-tools.js'),
} satisfies Command

export default webTools
