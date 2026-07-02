import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'diff',
  get description() {
    return t('View uncommitted changes and per-turn diffs')
  },
  load: () => import('./diff.js'),
} satisfies Command
