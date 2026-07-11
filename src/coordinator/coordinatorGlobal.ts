/**
 * Global (settings.json) persistence for coordinator mode.
 *
 * The runtime source of truth stays the CLAUDE_CODE_COORDINATOR_MODE env
 * var (read live by isCoordinatorMode() — matchSessionMode() relies on
 * flipping it). The `coordinatorMode` settings key only provides the
 * default for NEW sessions: applyGlobalCoordinatorDefault() deploys it to
 * the env var at startup when the var is not explicitly set.
 *
 * Kept separate from coordinatorMode.ts: that module sits low in the
 * dependency graph (filesystem -> permissions -> ... -> coordinatorMode)
 * and importing settings there risks cycles; this file only depends on
 * the settings module, mirroring commands/poor/poorMode.ts.
 */

import {
  getInitialSettings,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

export function getGlobalCoordinatorSetting(): boolean {
  return getInitialSettings().coordinatorMode === true
}

export function setGlobalCoordinatorSetting(enabled: boolean): void {
  updateSettingsForSource('userSettings', {
    coordinatorMode: enabled || undefined,
  })
}

/**
 * Deploy the settings default to the env var at startup. An explicitly set
 * env var always wins — truthy or falsy — so users can override the global
 * default per invocation (e.g. CLAUDE_CODE_COORDINATOR_MODE=0).
 */
export function applyGlobalCoordinatorDefault(): void {
  if (process.env.CLAUDE_CODE_COORDINATOR_MODE !== undefined) {
    return
  }
  if (getGlobalCoordinatorSetting()) {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
  }
}
