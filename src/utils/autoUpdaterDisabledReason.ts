import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'

export type AutoUpdaterDisabledReason =
  | { type: 'development' }
  | { type: 'env'; envVar: string }
  | { type: 'config' }
  | { type: 'default' }

export type AutoUpdaterDisabledReasonInputs = {
  nodeEnv?: string
  disableAutoUpdater?: string
  enableAutoUpdater?: string
  getEssentialTrafficReason: () => string | null
  isConfigDisabled: () => boolean
}

/**
 * Resolve the first actionable auto-updater blocker in remediation order.
 * Callbacks keep the heavier config reads lazy when an environment blocker
 * already explains the disabled state.
 */
export function resolveAutoUpdaterDisabledReason({
  nodeEnv,
  disableAutoUpdater,
  enableAutoUpdater,
  getEssentialTrafficReason,
  isConfigDisabled,
}: AutoUpdaterDisabledReasonInputs): AutoUpdaterDisabledReason | null {
  if (nodeEnv === 'development') return { type: 'development' }
  if (isEnvTruthy(disableAutoUpdater)) {
    return { type: 'env', envVar: 'DISABLE_AUTOUPDATER' }
  }

  const essentialTrafficReason = getEssentialTrafficReason()
  if (essentialTrafficReason) {
    return { type: 'env', envVar: essentialTrafficReason }
  }

  if (
    !isEnvDefinedFalsy(disableAutoUpdater) &&
    !isEnvTruthy(enableAutoUpdater)
  ) {
    return { type: 'default' }
  }
  if (isConfigDisabled()) return { type: 'config' }
  return null
}
