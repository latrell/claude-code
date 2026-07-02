import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const resume: Command = {
  type: 'local-jsx',
  name: 'resume',
  get description() {
    return t('Resume a previous conversation')
  },
  aliases: ['continue'],
  argumentHint: '[conversation id or search term]',
  load: () => import('./resume.js'),
}

export default resume
