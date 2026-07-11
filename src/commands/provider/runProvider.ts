/**
 * Argument-path logic for /provider, shared by the interactive (local-jsx)
 * and headless (local) command variants.
 *
 * `<connection> [global]` — resolve the connection reference against the
 * registry and activate it for the main slot. `unset` — clear the provider
 * selection so environment variables apply again.
 */

import { t } from '../../i18n/t.js'
import {
  parseConnectionSwitchArgs,
  switchSlotByRef,
} from '../../services/connections/slotSwitch.js'
import { setProviderCliOverride } from '../../utils/model/providers.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export type ProviderSwitchOutcome = {
  success: boolean
  message: string
  /**
   * Model to apply to AppState.mainLoopModel after a successful switch.
   * undefined = leave AppState untouched (unset / failure paths).
   */
  mainLoopModel?: string | null
  /** True when credentials/provider selection changed (re-verify auth). */
  authChanged: boolean
}

function unsetProvider(): ProviderSwitchOutcome {
  updateSettingsForSource('userSettings', { modelType: undefined })
  // Also drop any --provider / session-activation override so the cleared
  // settings actually take effect for this session
  setProviderCliOverride(undefined)
  // Also clear all provider-specific env vars to prevent conflicts
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_GROK
  delete process.env.CLAUDE_CODE_USE_CURSOR
  return {
    success: true,
    message: t('API provider cleared (will use environment variables).'),
    authChanged: true,
  }
}

/** Handle the /provider argument path. `args` must be non-empty (trimmed). */
export async function runProviderCommand(
  args: string,
): Promise<ProviderSwitchOutcome> {
  const trimmed = args.trim()
  if (trimmed.toLowerCase() === 'unset') {
    return unsetProvider()
  }
  const { ref, scope } = parseConnectionSwitchArgs(trimmed)
  const result = await switchSlotByRef(ref, 'main', scope)
  if (!result.success) {
    return { success: false, message: result.error, authChanged: false }
  }
  return {
    success: true,
    message: result.message,
    mainLoopModel: result.mainLoopModel ?? null,
    authChanged: true,
  }
}
