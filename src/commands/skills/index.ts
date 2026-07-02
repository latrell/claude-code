import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const skills = {
  type: 'local-jsx',
  name: 'skills',
  get description() {
    return t('List available skills')
  },
  load: () => import('./skills.js'),
} satisfies Command

export default skills
