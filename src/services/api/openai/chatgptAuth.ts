import { chmod, mkdir, open, readFile, rename, unlink } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { logForDebugging } from 'src/utils/debug.js'
import { SUBAGENT_CREDENTIAL_SCOPE } from 'src/utils/model/subagentProvider.js'

const ISSUER = 'https://auth.openai.com'
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_FILE = 'openai-chatgpt-auth.json'
const SUBAGENT_AUTH_FILE = 'openai-chatgpt-auth.subagent.json'
const REFRESH_SKEW_MS = 5 * 60 * 1000
const OPAQUE_TOKEN_REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000

export type ChatGPTDeviceCode = {
  verificationUrl: string
  userCode: string
  deviceAuthId: string
  intervalSeconds: number
}

export type ChatGPTAuthTokens = {
  idToken: string
  accessToken: string
  refreshToken: string
  accountId?: string
  isFedRAMP?: boolean
  lastRefresh?: string
}

export type ChatGPTAuth = {
  accessToken: string
  accountId?: string
  isFedRAMP?: boolean
  /**
   * Non-secret identity of the refresh credential that produced this access
   * token. Used only to reject stale 401 refreshes when opaque tokens do not
   * carry an account claim.
   */
  credentialId?: string
}

type StoredAuthFile = {
  auth_mode?: string
  tokens?: {
    id_token?: string
    access_token?: string
    refresh_token?: string
    account_id?: string
  }
  last_refresh?: string
}

function authFilePath(scope?: string): string {
  if (!scope || scope === 'default') {
    return join(getClaudeConfigHomeDirLocal(), AUTH_FILE)
  }
  if (scope === SUBAGENT_CREDENTIAL_SCOPE) {
    return join(getClaudeConfigHomeDirLocal(), SUBAGENT_AUTH_FILE)
  }
  // Arbitrary connection-scoped credential files (CCB connection registry):
  // openai-chatgpt-auth.<scope>.json. Scope is sanitized for filename safety.
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '-')
  return join(
    getClaudeConfigHomeDirLocal(),
    `openai-chatgpt-auth.${safeScope}.json`,
  )
}

/**
 * Resolve the authoritative on-disk ChatGPT credential file for a scope.
 * Exposed for the connection registry so activations can retain the original
 * account reference without copying rotating OAuth credentials.
 */
export function getChatGPTAuthFilePath(scope?: string): string {
  return authFilePath(scope)
}

function getClaudeConfigHomeDirLocal(): string {
  return (
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  ).normalize('NFC')
}

export function getCodexChatGPTAuthFilePath(): string {
  const configuredHome = process.env.CODEX_HOME?.trim()
  return join(configuredHome || join(homedir(), '.codex'), 'auth.json')
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseJSONRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.')
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return parseJSONRecord(json)
  } catch {
    return null
  }
}

function getOpenAIAuthClaims(token: string): Record<string, unknown> {
  const payload = decodeJwtPayload(token)
  const nested = payload?.['https://api.openai.com/auth']
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>
  }
  return payload ?? {}
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

function shouldRefreshTokens(tokens: ChatGPTAuthTokens): boolean {
  const expiresAt = getTokenExpiryMs(tokens.accessToken)
  if (expiresAt !== null) return expiresAt <= Date.now() + REFRESH_SKEW_MS
  if (!tokens.lastRefresh) return false
  const lastRefresh = Date.parse(tokens.lastRefresh)
  return (
    Number.isFinite(lastRefresh) &&
    lastRefresh < Date.now() - OPAQUE_TOKEN_REFRESH_INTERVAL_MS
  )
}

function extractAccountId(tokens: {
  idToken?: string
  accessToken?: string
  accountId?: string
}): string | undefined {
  if (tokens.accountId) return tokens.accountId
  for (const token of [tokens.idToken, tokens.accessToken]) {
    if (!token) continue
    const claims = getOpenAIAuthClaims(token)
    const accountId =
      asString(claims.chatgpt_account_id) ??
      asString(claims.chatgpt_account_user_id) ??
      asString(claims.account_id)
    if (accountId) return accountId
  }
  return undefined
}

function extractFedRAMP(tokens: {
  idToken?: string
  accessToken?: string
  isFedRAMP?: boolean
}): boolean | undefined {
  if (tokens.isFedRAMP !== undefined) return tokens.isFedRAMP
  for (const token of [tokens.idToken, tokens.accessToken]) {
    if (!token) continue
    const value = getOpenAIAuthClaims(token).chatgpt_account_is_fedramp
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
  }
  return undefined
}

async function readStoredAuth(path: string): Promise<ChatGPTAuthTokens | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as StoredAuthFile
    const tokens = parsed.tokens
    const idToken = tokens?.id_token
    const accessToken = tokens?.access_token
    const refreshToken = tokens?.refresh_token
    if (!idToken || !accessToken || !refreshToken) return null
    return {
      idToken,
      accessToken,
      refreshToken,
      accountId: extractAccountId({
        idToken,
        accessToken,
        accountId: tokens.account_id,
      }),
      isFedRAMP: extractFedRAMP({ idToken, accessToken }),
      lastRefresh: parsed.last_refresh,
    }
  } catch {
    return null
  }
}

const authFileWriteTails = new Map<string, Promise<void>>()

/** Serialize every in-process write to one credential path. */
async function withAuthFileWriteLock<T>(
  path: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = authFileWriteTails.get(path) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => gate)
  authFileWriteTails.set(path, tail)
  await previous.catch(() => undefined)
  try {
    return await action()
  } finally {
    release()
    if (authFileWriteTails.get(path) === tail) {
      authFileWriteTails.delete(path)
    }
  }
}

async function saveStoredAuth(
  tokens: ChatGPTAuthTokens,
  scope?: string,
): Promise<void> {
  const path = authFilePath(scope)
  await saveStoredAuthAtPath(tokens, path)
}

async function saveStoredAuthAtPath(
  tokens: ChatGPTAuthTokens,
  path: string,
): Promise<void> {
  await withAuthFileWriteLock(path, () =>
    saveStoredAuthAtPathWithoutLock(tokens, path),
  )
}

async function saveStoredAuthAtPathWithoutLock(
  tokens: ChatGPTAuthTokens,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  let existing: Record<string, unknown> = {}
  try {
    existing = parseJSONRecord(await readFile(path, 'utf8')) ?? {}
  } catch {
    // A new credential file has no existing fields to preserve.
  }
  const existingTokens =
    existing.tokens && typeof existing.tokens === 'object'
      ? (existing.tokens as Record<string, unknown>)
      : {}
  const body: Record<string, unknown> = {
    ...existing,
    auth_mode: 'chatgpt',
    tokens: {
      ...existingTokens,
      id_token: tokens.idToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      account_id: extractAccountId(tokens),
    },
    last_refresh: new Date().toISOString(),
  }
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(body, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await chmod(temporaryPath, 0o600).catch(() => undefined)
    await rename(temporaryPath, path)
    await chmod(path, 0o600).catch(() => undefined)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function postJSON<T>(
  url: string,
  body: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`ChatGPT auth request failed (${res.status})`)
  }
  return (await res.json()) as T
}

async function postForm<T>(url: string, body: URLSearchParams): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `ChatGPT token request failed (${res.status})${text ? `: ${text}` : ''}`,
    )
  }
  return (await res.json()) as T
}

export async function requestChatGPTDeviceCode(): Promise<ChatGPTDeviceCode> {
  type UserCodeResponse = {
    device_auth_id: string
    user_code?: string
    usercode?: string
    interval?: string | number
  }
  const data = await postJSON<UserCodeResponse>(
    `${ISSUER}/api/accounts/deviceauth/usercode`,
    { client_id: CLIENT_ID },
  )
  const userCode = data.user_code ?? data.usercode
  if (!data.device_auth_id || !userCode) {
    throw new Error('ChatGPT auth response did not include a device code')
  }
  const interval =
    typeof data.interval === 'number'
      ? data.interval
      : Number.parseInt(data.interval ?? '5', 10)
  return {
    verificationUrl: `${ISSUER}/codex/device`,
    userCode,
    deviceAuthId: data.device_auth_id,
    intervalSeconds: Number.isFinite(interval) && interval > 0 ? interval : 5,
  }
}

async function pollForAuthorizationCode(
  deviceCode: ChatGPTDeviceCode,
  signal?: AbortSignal,
): Promise<{ authorizationCode: string; codeVerifier: string }> {
  type TokenPollResponse = {
    authorization_code: string
    code_verifier: string
  }
  const started = Date.now()
  while (Date.now() - started < 15 * 60 * 1000) {
    if (signal?.aborted) throw new Error('ChatGPT login cancelled')
    const res = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_auth_id: deviceCode.deviceAuthId,
        user_code: deviceCode.userCode,
      }),
      signal,
    })
    if (res.ok) {
      const data = (await res.json()) as TokenPollResponse
      return {
        authorizationCode: data.authorization_code,
        codeVerifier: data.code_verifier,
      }
    }
    if (res.status !== 403 && res.status !== 404) {
      throw new Error(`ChatGPT device auth failed (${res.status})`)
    }
    await new Promise(resolve =>
      setTimeout(resolve, deviceCode.intervalSeconds * 1000),
    )
  }
  throw new Error('ChatGPT device auth timed out after 15 minutes')
}

async function exchangeAuthorizationCode(params: {
  authorizationCode: string
  codeVerifier: string
}): Promise<ChatGPTAuthTokens> {
  type TokenResponse = {
    id_token: string
    access_token: string
    refresh_token: string
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.authorizationCode,
    redirect_uri: `${ISSUER}/deviceauth/callback`,
    client_id: CLIENT_ID,
    code_verifier: params.codeVerifier,
  })
  const data = await postForm<TokenResponse>(`${ISSUER}/oauth/token`, body)
  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId: extractAccountId({
      idToken: data.id_token,
      accessToken: data.access_token,
    }),
    isFedRAMP: extractFedRAMP({
      idToken: data.id_token,
      accessToken: data.access_token,
    }),
  }
}

async function refreshTokens(
  tokens: ChatGPTAuthTokens,
): Promise<ChatGPTAuthTokens> {
  type TokenResponse = {
    id_token?: string
    access_token?: string
    refresh_token?: string
  }
  const data = await postJSON<TokenResponse>(`${ISSUER}/oauth/token`, {
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
  })
  const idToken = data.id_token ?? tokens.idToken
  const accessToken = data.access_token ?? tokens.accessToken
  const refreshedAccountId = extractAccountId({
    idToken: data.id_token,
    accessToken: data.access_token,
  })
  if (
    tokens.accountId &&
    refreshedAccountId &&
    tokens.accountId !== refreshedAccountId
  ) {
    throw new Error('ChatGPT token refresh returned a different account')
  }
  return {
    idToken,
    accessToken,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    accountId: refreshedAccountId ?? tokens.accountId,
    isFedRAMP:
      extractFedRAMP({
        idToken: data.id_token,
        accessToken: data.access_token,
      }) ?? tokens.isFedRAMP,
  }
}

export async function completeChatGPTDeviceLogin(
  deviceCode: ChatGPTDeviceCode,
  signal?: AbortSignal,
  scope?: string,
): Promise<ChatGPTAuthTokens> {
  const code = await pollForAuthorizationCode(deviceCode, signal)
  const tokens = await exchangeAuthorizationCode(code)
  await saveStoredAuth(tokens, scope)
  return tokens
}

export function isChatGPTAuthEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.OPENAI_AUTH_MODE === 'chatgpt'
}

export async function removeChatGPTAuth(scope?: string): Promise<void> {
  const path = authFilePath(scope)
  await withAuthFileWriteLock(path, () =>
    unlink(path).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }),
  )
}

/** The Codex CLI auth.json fallback only applies to the default scope. */
function isDefaultScope(scope?: string): boolean {
  return !scope || scope === 'default'
}

type StoredAuthSource = {
  path: string
  tokens: ChatGPTAuthTokens
}

const pendingTokenRefreshes = new Map<string, Promise<ChatGPTAuthTokens>>()

function storedAccountId(tokens: ChatGPTAuthTokens): string | undefined {
  return tokens.accountId ?? extractAccountId(tokens)
}

function storedCredentialId(tokens: ChatGPTAuthTokens): string {
  return createHash('sha256').update(tokens.refreshToken).digest('hex')
}

function assertExpectedCredential(
  tokens: ChatGPTAuthTokens,
  expectedAccountId: string | undefined,
  expectedCredentialId: string | undefined,
): void {
  if (expectedAccountId) {
    const actualAccountId = storedAccountId(tokens)
    if (actualAccountId !== expectedAccountId) {
      throw new Error(
        'ChatGPT credentials changed to a different account during token refresh',
      )
    }
    return
  }
  if (
    expectedCredentialId &&
    storedCredentialId(tokens) !== expectedCredentialId
  ) {
    throw new Error(
      'ChatGPT credentials changed during token refresh while account identity was unavailable',
    )
  }
}

function sameStoredCredential(
  left: ChatGPTAuthTokens,
  right: ChatGPTAuthTokens,
): boolean {
  return (
    left.idToken === right.idToken &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken &&
    storedAccountId(left) === storedAccountId(right)
  )
}

async function resolveStoredAuthSource(
  scope?: string,
): Promise<StoredAuthSource | null> {
  const scopedPath = authFilePath(scope)
  const scopedTokens = await readStoredAuth(scopedPath)
  if (scopedTokens) return { path: scopedPath, tokens: scopedTokens }

  if (isDefaultScope(scope)) {
    const codexPath = getCodexChatGPTAuthFilePath()
    const codexTokens = await readStoredAuth(codexPath)
    if (codexTokens) {
      logForDebugging('[OpenAI] Using ChatGPT auth from Codex auth.json')
      return { path: codexPath, tokens: codexTokens }
    }
  }
  return null
}

function toChatGPTAuth(tokens: ChatGPTAuthTokens): ChatGPTAuth {
  return {
    accessToken: tokens.accessToken,
    accountId: tokens.accountId ?? extractAccountId(tokens),
    isFedRAMP: extractFedRAMP(tokens),
    credentialId: storedCredentialId(tokens),
  }
}

async function refreshStoredAuthSource(
  source: StoredAuthSource,
  rejectedAccessToken?: string,
  expectedAccountId = storedAccountId(source.tokens),
  expectedCredentialId = expectedAccountId
    ? undefined
    : storedCredentialId(source.tokens),
): Promise<ChatGPTAuthTokens> {
  assertExpectedCredential(
    source.tokens,
    expectedAccountId,
    expectedCredentialId,
  )
  const refreshIdentity =
    expectedAccountId ?? `credential:${expectedCredentialId}`
  const rejectedIdentity = rejectedAccessToken ?? source.tokens.accessToken
  const rejectedTokenHash = createHash('sha256')
    .update(rejectedIdentity)
    .digest('hex')
  const pendingKey = `${source.path}\0${refreshIdentity}\0${rejectedTokenHash}`
  const existing = pendingTokenRefreshes.get(pendingKey)
  if (existing) return existing

  const pending = (async () => {
    const latest = (await readStoredAuth(source.path)) ?? source.tokens
    assertExpectedCredential(latest, expectedAccountId, expectedCredentialId)
    if (
      rejectedAccessToken !== undefined &&
      latest.accessToken !== rejectedAccessToken
    ) {
      return latest
    }
    if (rejectedAccessToken === undefined) {
      if (!shouldRefreshTokens(latest)) {
        return latest
      }
    }
    const refreshed = await refreshTokens(latest)
    // A refresh token may rotate legitimately, so only the stable account
    // claim can be checked on the newly returned credential. The pre-refresh
    // credential identity is checked again under the file lock below.
    if (expectedAccountId) {
      assertExpectedCredential(refreshed, expectedAccountId, undefined)
    }

    // The refresh request happens without holding the file lock. Re-check the
    // authoritative credential only after acquiring it: a login/account switch
    // that completed while the network request was in flight must win and must
    // never be overwritten by the stale refresh response.
    return withAuthFileWriteLock(source.path, async () => {
      const current = await readStoredAuth(source.path)
      if (!current) {
        throw new Error(
          'ChatGPT credentials were removed during token refresh; refusing to recreate them',
        )
      }
      if (!sameStoredCredential(current, latest)) {
        assertExpectedCredential(
          current,
          expectedAccountId,
          expectedCredentialId,
        )
        return current
      }
      await saveStoredAuthAtPathWithoutLock(refreshed, source.path)
      return refreshed
    })
  })().finally(() => {
    if (pendingTokenRefreshes.get(pendingKey) === pending) {
      pendingTokenRefreshes.delete(pendingKey)
    }
  })
  pendingTokenRefreshes.set(pendingKey, pending)
  return pending
}

/**
 * Whether a parseable ChatGPT credential exists for the scope, mirroring
 * getValidChatGPTAuth's resolution (including the Codex CLI fallback for the
 * default scope) without refreshing or throwing. Used by the connection
 * registry to reject activating a connection whose credential file has been
 * deleted (e.g. by a later /login into an API-key OpenAI endpoint).
 */
export async function hasStoredChatGPTAuth(scope?: string): Promise<boolean> {
  return (await resolveStoredAuthSource(scope)) !== null
}

export async function getValidChatGPTAuth(
  scope?: string,
): Promise<ChatGPTAuth> {
  const source = await resolveStoredAuthSource(scope)
  if (!source) {
    throw new Error(
      'ChatGPT account is not logged in. Run /login and select ChatGPT account with subscription.',
    )
  }
  let tokens = source.tokens
  if (shouldRefreshTokens(tokens)) {
    tokens = await refreshStoredAuthSource(source)
  }
  return toChatGPTAuth(tokens)
}

/**
 * Refresh a credential after the Codex backend rejects its access token.
 * A changed on-disk token wins, and concurrent callers share one refresh.
 */
export async function forceRefreshChatGPTAuth(
  scope?: string,
  rejectedAccessToken?: string,
  expectedAccountId?: string,
  expectedCredentialId?: string,
): Promise<ChatGPTAuth> {
  const source = await resolveStoredAuthSource(scope)
  if (!source) {
    throw new Error(
      'ChatGPT account is not logged in. Run /login and select ChatGPT account with subscription.',
    )
  }
  assertExpectedCredential(
    source.tokens,
    expectedAccountId,
    expectedCredentialId,
  )
  const rejected = rejectedAccessToken ?? source.tokens.accessToken
  return toChatGPTAuth(
    await refreshStoredAuthSource(
      source,
      rejected,
      expectedAccountId,
      expectedCredentialId,
    ),
  )
}
