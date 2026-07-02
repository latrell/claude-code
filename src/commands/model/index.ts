import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'
import { getMainLoopModel, renderModelName } from '../../utils/model/model.js'
import { tf } from '../../i18n/t.js'

export default {
  type: 'local-jsx',
  name: 'model',
  get description() {
    return tf('Set the AI model for Claude Code (currently {model})', {
      model: renderModelName(getMainLoopModel()),
    })
  },
  argumentHint: '[model]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./model.js'),
} satisfies Command
