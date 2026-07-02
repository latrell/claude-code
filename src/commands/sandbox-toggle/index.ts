import figures from 'figures'
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'

const command = {
  name: 'sandbox',
  get description() {
    const currentlyEnabled = SandboxManager.isSandboxingEnabled()
    const autoAllow = SandboxManager.isAutoAllowBashIfSandboxedEnabled()
    const allowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed()
    const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy()
    const hasDeps = SandboxManager.checkDependencies().errors.length === 0

    // Show warning icon if dependencies missing, otherwise enabled/disabled status
    let icon: string
    if (!hasDeps) {
      icon = figures.warning
    } else {
      icon = currentlyEnabled ? figures.tick : figures.circle
    }

    let statusText = t('sandbox disabled')
    if (currentlyEnabled) {
      statusText = autoAllow
        ? t('sandbox enabled (auto-allow)')
        : t('sandbox enabled')

      // Add unsandboxed fallback status
      if (allowUnsandboxed) {
        statusText += t(', fallback allowed')
      }
    }

    if (isLocked) {
      statusText += t(' (managed)')
    }

    return `${icon} ${statusText} ${t('(⏎ to configure)')}`
  },
  argumentHint: 'exclude "command pattern"',
  get isHidden() {
    return (
      !SandboxManager.isSupportedPlatform() ||
      !SandboxManager.isPlatformInEnabledList()
    )
  },
  immediate: true,
  type: 'local-jsx',
  load: () => import('./sandbox-toggle.js'),
} satisfies Command

export default command
