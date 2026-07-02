import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  get description() {
    return t('Show QR code to download the Claude mobile app')
  },
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile
