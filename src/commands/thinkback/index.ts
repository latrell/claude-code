import type { Command } from '../../commands.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { t } from '../../i18n/t.js'

const thinkback = {
  type: 'local-jsx',
  name: 'think-back',
  get description() {
    return t('Your 2025 Claude Code Year in Review')
  },
  isEnabled: () =>
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_thinkback'),
  load: () => import('./thinkback.js'),
} satisfies Command

export default thinkback
