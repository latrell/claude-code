/**
 * Session-scoped provider env overlay.
 *
 * A session connection activation (`--provider <name>` at startup, or a
 * session-scope switch in /connect) deploys credentials by mutating
 * process.env. Several later startup steps re-apply configuration env on top
 * of process.env and would silently revert that deployment:
 *
 *   - applyConfigEnvironmentVariables() (trust dialog / print mode / settings
 *     change / /provider) does Object.assign with settings.env — an
 *     unconditional overwrite (e.g. a global ANTHROPIC_BASE_URL stomps a
 *     session anthropic-api activation)
 *   - injectCCBProviderAuthEnv() backfills the global provider auth file
 *     (e.g. OPENAI_AUTH_MODE=chatgpt from a ChatGPT global default) into any
 *     key the activation deleted rather than wrote
 *
 * The activation records its env delta here, and managedEnv re-applies it
 * after every config env application, so the session's connection always wins
 * for the keys it owns. Deletions (undefined values) are re-applied too.
 *
 * Cleared by /login (a new explicit global credential deployment) and logout.
 * Replaced wholesale by each new main-slot session activation.
 *
 * This module must stay dependency-free: it is imported by managedEnv.ts,
 * which loads very early in startup.
 */

let _overlay: Record<string, string | undefined> | null = null

/** Record (or clear, with null) the session activation's env delta. */
export function setSessionProviderEnvOverlay(
  env: Record<string, string | undefined> | null,
): void {
  _overlay = env ? { ...env } : null
}

/** Snapshot of the current overlay (null when no session activation). */
export function getSessionProviderEnvOverlay(): Record<
  string,
  string | undefined
> | null {
  return _overlay ? { ..._overlay } : null
}

/**
 * `claude ssh` remote: these keys are owned by the SSH tunnel launcher when
 * ANTHROPIC_UNIX_SOCKET is set and must not be touched (mirrors
 * withoutSSHTunnelVars in managedEnv.ts).
 */
const SSH_TUNNEL_VARS = new Set([
  'ANTHROPIC_UNIX_SOCKET',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
])

/**
 * Re-apply the session activation's env delta to `target` (process.env).
 * No-op when no session activation happened in this process.
 */
export function applySessionProviderEnvOverlay(
  target: NodeJS.ProcessEnv = process.env,
): void {
  if (!_overlay) return
  const sshTunnelActive = Boolean(target.ANTHROPIC_UNIX_SOCKET)
  for (const [key, value] of Object.entries(_overlay)) {
    if (sshTunnelActive && SSH_TUNNEL_VARS.has(key)) continue
    if (value === undefined) {
      delete target[key]
    } else {
      target[key] = value
    }
  }
}
