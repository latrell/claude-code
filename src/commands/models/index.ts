import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'models',
  get description() {
    return t(
      'Pick the model for the main agent or subagents across all connections',
    )
  },
  argumentHint: '[sub]',
  load: () => import('./models.js'),
} satisfies Command
