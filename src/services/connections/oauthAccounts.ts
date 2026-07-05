/**
 * Multi-account slots for Anthropic (claude.ai) OAuth credentials.
 *
 * Official Claude Code stores exactly one OAuth credential under the
 * `claudeAiOauth` key in secure storage (Keychain on macOS, plaintext
 * ~/.claude/.credentials.json elsewhere). To support switching between
 * several claude.ai accounts we add a sibling `claudeAiOauthAccounts` map
 * keyed by accountUuid. `claudeAiOauth` stays the single "active account"
 * mirror so the official read paths keep working unchanged.
 *
 * Activation = copy a slot's tokens into `claudeAiOauth` and restore the
 * slot's account info into globalConfig.oauthAccount. Callers must clear
 * OAuth caches afterwards (clearOAuthTokenCache in src/utils/auth.ts) —
 * this module intentionally does storage only.
 */

import {
  getGlobalConfig,
  saveGlobalConfig,
  type AccountInfo,
} from '../../utils/config.js'
import { logError } from '../../utils/log.js'
import { getSecureStorage } from '../../utils/secureStorage/index.js'

/**
 * Test seam for the oauthAccount read/write path. The test suite cannot
 * mock.module config.ts here (process-global mock registration for it
 * deadlocks unrelated dynamic imports), and other test files' config stubs
 * would otherwise leak in. Production code never sets this.
 */
type OAuthConfigAccess = {
  getAccount: () => AccountInfo | undefined
  setAccount: (value: AccountInfo | undefined) => void
}

let _configAccessOverride: OAuthConfigAccess | null = null

export function _setOAuthConfigAccessForTest(
  access: OAuthConfigAccess | null,
): void {
  _configAccessOverride = access
}

function getAccountFromConfig(): AccountInfo | undefined {
  if (_configAccessOverride) return _configAccessOverride.getAccount()
  return getGlobalConfig().oauthAccount
}

function setAccountInConfig(value: AccountInfo | undefined): void {
  if (_configAccessOverride) {
    _configAccessOverride.setAccount(value)
    return
  }
  saveGlobalConfig(current => ({ ...current, oauthAccount: value }))
}

/** Account info of the currently active OAuth account. */
export function getActiveOAuthAccount(): AccountInfo | undefined {
  return getAccountFromConfig()
}

export type StoredOAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  subscriptionType?: string | null
  rateLimitTier?: string | null
}

export type OAuthAccountSlot = {
  tokens: StoredOAuthTokens
  account: AccountInfo
  savedAt: string
}

const ACCOUNTS_KEY = 'claudeAiOauthAccounts'
const ACTIVE_KEY = 'claudeAiOauth'

type StorageShape = Record<string, unknown> & {
  [ACTIVE_KEY]?: StoredOAuthTokens
  [ACCOUNTS_KEY]?: Record<string, OAuthAccountSlot>
}

function readStorage(): StorageShape {
  try {
    return (getSecureStorage().read() as StorageShape | null) ?? {}
  } catch (err) {
    logError(err)
    return {}
  }
}

function writeStorage(data: StorageShape): boolean {
  try {
    const result = getSecureStorage().update(data) as { success: boolean }
    return result.success
  } catch (err) {
    logError(err)
    return false
  }
}

function isValidSlot(value: unknown): value is OAuthAccountSlot {
  if (!value || typeof value !== 'object') return false
  const slot = value as Partial<OAuthAccountSlot>
  return (
    typeof slot.tokens?.accessToken === 'string' &&
    typeof slot.account?.accountUuid === 'string'
  )
}

/** All stored account slots, keyed by accountUuid. Invalid entries dropped. */
export function listOAuthAccountSlots(): Record<string, OAuthAccountSlot> {
  const raw = readStorage()[ACCOUNTS_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, OAuthAccountSlot> = {}
  for (const [uuid, slot] of Object.entries(raw)) {
    if (isValidSlot(slot)) out[uuid] = slot
  }
  return out
}

export function getOAuthAccountSlot(
  accountUuid: string,
): OAuthAccountSlot | undefined {
  return listOAuthAccountSlots()[accountUuid]
}

/** accountUuid of the currently active OAuth account (from global config). */
export function getActiveOAuthAccountUuid(): string | undefined {
  return getAccountFromConfig()?.accountUuid
}

/**
 * Snapshot the currently active OAuth credential + account info into its
 * accountUuid slot. Returns the accountUuid, or null when there is no
 * complete active credential to snapshot.
 */
export function saveCurrentOAuthAccountToSlot(): string | null {
  const account = getAccountFromConfig()
  if (!account?.accountUuid) return null

  const storage = readStorage()
  const active = storage[ACTIVE_KEY]
  if (!active?.accessToken || !active.refreshToken) return null

  const accounts: Record<string, OAuthAccountSlot> = {
    ...(storage[ACCOUNTS_KEY] ?? {}),
  }
  accounts[account.accountUuid] = {
    tokens: active,
    account,
    savedAt: new Date().toISOString(),
  }
  storage[ACCOUNTS_KEY] = accounts
  return writeStorage(storage) ? account.accountUuid : null
}

/**
 * Activate an account slot: copy its tokens to the official `claudeAiOauth`
 * key and restore its account info into globalConfig.oauthAccount.
 *
 * Does NOT clear in-memory OAuth caches — callers must invoke
 * clearOAuthTokenCache() (src/utils/auth.ts) after a successful switch.
 */
export function activateOAuthAccountSlot(accountUuid: string): {
  success: boolean
  error?: string
} {
  const storage = readStorage()
  const slot = storage[ACCOUNTS_KEY]?.[accountUuid]
  if (!isValidSlot(slot)) {
    return { success: false, error: `No stored account slot: ${accountUuid}` }
  }

  // Snapshot the outgoing active credential into its own slot first so
  // switching away never loses a fresh token.
  const outgoingUuid = getActiveOAuthAccountUuid()
  const outgoingTokens = storage[ACTIVE_KEY]
  const outgoingAccount = getAccountFromConfig()
  if (
    outgoingUuid &&
    outgoingUuid !== accountUuid &&
    outgoingTokens?.accessToken &&
    outgoingTokens.refreshToken &&
    outgoingAccount
  ) {
    const accounts: Record<string, OAuthAccountSlot> = {
      ...(storage[ACCOUNTS_KEY] ?? {}),
    }
    accounts[outgoingUuid] = {
      tokens: outgoingTokens,
      account: outgoingAccount,
      savedAt: new Date().toISOString(),
    }
    storage[ACCOUNTS_KEY] = accounts
  }

  storage[ACTIVE_KEY] = slot.tokens
  if (!writeStorage(storage)) {
    return { success: false, error: 'Failed to write secure storage' }
  }

  setAccountInConfig(slot.account)
  return { success: true }
}

/** Remove a stored account slot. The active `claudeAiOauth` mirror is only
 * cleared when it belongs to the removed account. */
export function removeOAuthAccountSlot(accountUuid: string): void {
  const storage = readStorage()
  const accounts = { ...(storage[ACCOUNTS_KEY] ?? {}) }
  if (!(accountUuid in accounts)) return
  delete accounts[accountUuid]
  storage[ACCOUNTS_KEY] = accounts

  if (getActiveOAuthAccountUuid() === accountUuid) {
    delete storage[ACTIVE_KEY]
    setAccountInConfig(undefined)
  }
  writeStorage(storage)
}
