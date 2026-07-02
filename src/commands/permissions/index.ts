import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  aliases: ['allowed-tools'],
  get description() {
    return t('Manage allow & deny tool permission rules')
  },
  load: () => import('./permissions.js'),
} satisfies Command

export default permissions
