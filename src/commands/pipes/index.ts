import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const pipes = {
  type: 'local',
  name: 'pipes',
  get description() {
    return t('Inspect pipe registry state and toggle the pipe selector')
  },
  supportsNonInteractive: true,
  load: () => import('./pipes.js'),
} satisfies Command

export default pipes
