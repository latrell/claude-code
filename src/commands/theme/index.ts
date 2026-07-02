import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const theme = {
  type: 'local-jsx',
  name: 'theme',
  get description() {
    return t('Change the theme')
  },
  load: () => import('./theme.js'),
} satisfies Command

export default theme
