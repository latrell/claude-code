import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { t } from '../../i18n/t.js'

const doctor: Command = {
  name: 'doctor',
  get description() {
    return t('Diagnose and verify your Claude Code installation and settings')
  },
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_DOCTOR_COMMAND),
  type: 'local-jsx',
  load: () => import('./doctor.js'),
}

export default doctor
