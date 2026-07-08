/**
 * Auto-registration hooks: existing login flows (/login, /subagent-login's
 * global sibling) call these after persisting credentials so every
 * successful login also appears in the connection registry without the
 * user having to re-enter anything in /connect.
 *
 * All entry points are best-effort and swallow errors — the registry is a
 * convenience layer and must never break a login.
 */

import { t } from '../../i18n/t.js'
import { logError } from '../../utils/log.js'
import {
  getActiveOAuthAccount,
  saveCurrentOAuthAccountToSlot,
} from './oauthAccounts.js'
import {
  generateConnectionId,
  listConnections,
  upsertConnection,
} from './store.js'
import type { Connection, TierModels } from './types.js'

/**
 * Normalize a base URL for signature comparison: the same endpoint is often
 * entered with cosmetic variations (trailing slash, explicit `/v1` suffix
 * that SDK clients append themselves). Treating those as distinct made
 * re-logins duplicate the connection instead of updating it.
 */
function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return ''
  return baseUrl.trim().toLowerCase().replace(/\/+$/, '').replace(/\/v1$/, '')
}

function findBySignature(
  candidate: Pick<Connection, 'kind' | 'baseUrl' | 'apiKey' | 'credentialRef'>,
): Connection | undefined {
  return listConnections().find(
    c =>
      c.kind === candidate.kind &&
      normalizeBaseUrl(c.baseUrl) === normalizeBaseUrl(candidate.baseUrl) &&
      (c.apiKey ?? '') === (candidate.apiKey ?? '') &&
      (c.credentialRef ?? '') === (candidate.credentialRef ?? ''),
  )
}

function upsertCandidate(candidate: Omit<Connection, 'id'>): void {
  const existing = findBySignature(candidate)
  if (existing) {
    upsertConnection({ ...existing, ...candidate, id: existing.id })
    return
  }
  upsertConnection({
    ...candidate,
    id: generateConnectionId(candidate.label),
    createdAt: new Date().toISOString(),
  })
}

function tiersFromEnv(
  env: Record<string, string | undefined>,
  prefix: 'OPENAI' | 'GEMINI' | 'GROK' | 'ANTHROPIC',
): TierModels | undefined {
  const tiers: TierModels = {}
  const haiku = env[`${prefix}_DEFAULT_HAIKU_MODEL`]
  const sonnet = env[`${prefix}_DEFAULT_SONNET_MODEL`]
  const opus = env[`${prefix}_DEFAULT_OPUS_MODEL`]
  if (haiku) tiers.haiku = haiku
  if (sonnet) tiers.sonnet = sonnet
  if (opus) tiers.opus = opus
  return Object.keys(tiers).length > 0 ? tiers : undefined
}

function hostLabel(baseUrl: string | undefined, fallback: string): string {
  if (!baseUrl) return fallback
  try {
    return new URL(baseUrl).host || fallback
  } catch {
    return fallback
  }
}

/**
 * Register the connection corresponding to a provider login that persisted
 * env-style credentials (ConsoleOAuthFlow saveProviderConfig, global scope).
 */
export function registerConnectionFromProviderLogin(
  modelType: 'anthropic' | 'openai' | 'gemini' | 'grok',
  env: Record<string, string | undefined> | undefined,
): void {
  try {
    if (!env) return
    if (modelType === 'openai') {
      if (env.OPENAI_AUTH_MODE === 'chatgpt') {
        upsertCandidate({
          label: t('ChatGPT Subscription'),
          kind: 'chatgpt-oauth',
          credentialRef: 'default',
        })
        return
      }
      if (!env.OPENAI_API_KEY && !env.OPENAI_BASE_URL) return
      const tierModels = tiersFromEnv(env, 'OPENAI')
      upsertCandidate({
        label: hostLabel(env.OPENAI_BASE_URL, t('OpenAI Compatible')),
        kind: 'openai-compat',
        baseUrl: env.OPENAI_BASE_URL,
        apiKey: env.OPENAI_API_KEY,
        ...(tierModels && { tierModels }),
      })
      return
    }
    if (modelType === 'gemini') {
      if (!env.GEMINI_API_KEY) return
      const tierModels = tiersFromEnv(env, 'GEMINI')
      upsertCandidate({
        label: hostLabel(env.GEMINI_BASE_URL, t('Gemini')),
        kind: 'gemini',
        baseUrl: env.GEMINI_BASE_URL,
        apiKey: env.GEMINI_API_KEY,
        ...(tierModels && { tierModels }),
      })
      return
    }
    if (modelType === 'grok') {
      const apiKey = env.GROK_API_KEY ?? env.XAI_API_KEY
      if (!apiKey) return
      const tierModels = tiersFromEnv(env, 'GROK')
      upsertCandidate({
        label: hostLabel(env.GROK_BASE_URL, t('Grok')),
        kind: 'grok',
        baseUrl: env.GROK_BASE_URL,
        apiKey,
        ...(tierModels && { tierModels }),
      })
      return
    }
    // anthropic: custom endpoint login (ANTHROPIC_BASE_URL / AUTH_TOKEN)
    if (!env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_BASE_URL) return
    const tierModels = tiersFromEnv(env, 'ANTHROPIC')
    upsertCandidate({
      label: hostLabel(env.ANTHROPIC_BASE_URL, t('Anthropic Compatible')),
      kind: 'anthropic-api',
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiKey: env.ANTHROPIC_AUTH_TOKEN,
      ...(tierModels && { tierModels }),
    })
  } catch (err) {
    logError(err)
  }
}

/**
 * Register the active claude.ai OAuth account as a connection (called after
 * installOAuthTokens finishes). No-op for console/API-key logins or
 * inference-only tokens.
 */
export function registerConnectionFromOAuthLogin(): void {
  try {
    const account = getActiveOAuthAccount()
    if (!account?.accountUuid) return
    const slotUuid = saveCurrentOAuthAccountToSlot()
    if (!slotUuid) return
    upsertCandidate({
      label: account.emailAddress || t('Claude Account'),
      kind: 'anthropic-oauth',
      credentialRef: slotUuid,
      accountEmail: account.emailAddress,
    })
  } catch (err) {
    logError(err)
  }
}
