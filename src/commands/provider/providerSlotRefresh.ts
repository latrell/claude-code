import type { LocalJSXCommandContext } from '../../commands.js'

export function refreshProviderSlotDisplay(
  context: LocalJSXCommandContext,
): void {
  context.setAppState(prev => ({
    ...prev,
    providerSlotsVersion: prev.providerSlotsVersion + 1,
  }))
}
