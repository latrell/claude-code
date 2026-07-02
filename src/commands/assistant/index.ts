import type { Command } from '../../commands.js'
import { isAssistantEnabled } from './gate.js'
import { t } from '../../i18n/t.js'

const assistant = {
  type: 'local-jsx',
  name: 'assistant',
  get description() {
    return t('Open the Kairos assistant panel')
  },
  isEnabled: isAssistantEnabled,
  get isHidden() {
    return !isAssistantEnabled()
  },
  immediate: true,
  load: () => import('./assistant.js'),
} satisfies Command

export default assistant
