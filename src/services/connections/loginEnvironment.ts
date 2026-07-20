import {
  fetchCodexUsage,
  invalidateCodexUsagePublication,
} from '../api/openai/codexUsage.js'
import { resetClaudeAiLimits } from '../claudeAiLimits.js'
import { resetProviderUsage } from '../providerUsage/store.js'
import { setSessionProviderEnvOverlay } from './sessionEnvOverlay.js'

type RefreshChatGPTUsage = () => void

function refreshActiveChatGPTUsage(): void {
  void fetchCodexUsage().catch(() => undefined)
}

/**
 * Apply a successful `/login` provider change to the active process.
 *
 * The invalidation happens synchronously before credentials change so an old
 * account's in-flight usage response cannot repopulate the status line. A new
 * ChatGPT subscription login then starts an immediate snapshot refresh.
 */
export function applyMainProviderLoginEnvironment(
  env: Record<string, string | undefined>,
  refreshChatGPTUsage: RefreshChatGPTUsage = refreshActiveChatGPTUsage,
): void {
  invalidateCodexUsagePublication()
  resetProviderUsage()
  resetClaudeAiLimits()
  setSessionProviderEnvOverlay(null)

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (env.OPENAI_AUTH_MODE?.trim().toLowerCase() === 'chatgpt') {
    try {
      refreshChatGPTUsage()
    } catch {
      // Usage refresh is best-effort and must not turn a valid login into an
      // error. The next response or periodic refresh can still populate it.
    }
  }
}
