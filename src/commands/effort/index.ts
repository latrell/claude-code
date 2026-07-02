import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'
import { t } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'effort',
  get description() {
    return t('Set effort level for model usage')
  },
  argumentHint: '[low|medium|high|xhigh|max|auto]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./effort.js'),
} satisfies Command
