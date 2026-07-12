import type { AutoUpdaterDisabledReason } from '../../utils/config.js'

export type AutoUpdaterDisabledDialogCopy = {
  message: string
  hint?: string
  envVar?: string
}

/** Copy shown when the auto-update setting cannot be changed in the dialog. */
export function getAutoUpdaterDisabledDialogCopy(
  reason: AutoUpdaterDisabledReason | null,
): AutoUpdaterDisabledDialogCopy | null {
  switch (reason?.type) {
    case 'development':
      return {
        message: 'Auto-updates are disabled in development builds.',
      }
    case 'env':
      if (reason.envVar === 'DISABLE_AUTOUPDATER') {
        return {
          message:
            'Auto-updates are controlled by an environment variable and cannot be changed here.',
          hint: 'Set DISABLE_AUTOUPDATER=0 to re-enable auto-updates.',
        }
      }
      return {
        message:
          'Auto-updates are controlled by an environment variable and cannot be changed here.',
        hint: 'Unset {envVar} to re-enable auto-updates.',
        envVar: reason.envVar,
      }
    case 'default':
      return {
        message: 'Auto-updates are disabled by default.',
        hint: 'Set DISABLE_AUTOUPDATER=0 or ENABLE_AUTOUPDATER=1 to re-enable auto-updates.',
      }
    case 'config':
    default:
      return null
  }
}
