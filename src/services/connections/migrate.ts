/**
 * One-way, idempotent import of legacy provider/credential storage into the
 * CCB connection registry. Never deletes or rewrites the legacy stores —
 * they remain the runtime source of truth for the activation "deploy" model.
 *
 * Sources scanned:
 * 1. ~/.claude/ccb-provider-auth.json  (openai / gemini / grok env slots)
 * 2. userSettings.env                  (ANTHROPIC_BASE_URL / AUTH_TOKEN)
 * 3. secure storage + globalConfig     (active claude.ai OAuth account)
 * 4. ~/.claude/openai-chatgpt-auth.json (ChatGPT subscription tokens)
 *
 * Dedupe: a connection is only added when no existing connection has the
 * same credential signature (kind + baseUrl + apiKey + credentialRef), so
 * repeated calls are no-ops.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { readCCBProviderAuthData } from '../../utils/ccbProviderAuth.js'
import { CHINA_LLM_PROVIDERS } from '../../utils/chinaLlmProviders.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
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

function signatureOf(
  c: Pick<Connection, 'kind' | 'baseUrl' | 'apiKey' | 'credentialRef'>,
): string {
  return [c.kind, c.baseUrl ?? '', c.apiKey ?? '', c.credentialRef ?? ''].join(
    '|',
  )
}

/** Human-friendly label for a known preset base URL, else the host name. */
function labelForBaseUrl(
  baseUrl: string | undefined,
  fallback: string,
): string {
  if (!baseUrl) return fallback
  const preset = CHINA_LLM_PROVIDERS.find(
    p =>
      p.baseURL === baseUrl ||
      p.codingPlan?.baseURL === baseUrl ||
      baseUrl.startsWith(p.baseURL),
  )
  if (preset) return preset.label
  try {
    return new URL(baseUrl).host || fallback
  } catch {
    return fallback
  }
}

function presetIdForBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  const preset = CHINA_LLM_PROVIDERS.find(
    p => p.baseURL === baseUrl || p.codingPlan?.baseURL === baseUrl,
  )
  return preset?.id
}

function tierModelsFromEnv(
  env: Record<string, string>,
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

function modelsFromTiers(
  tierModels: TierModels | undefined,
  extra?: string,
): string[] | undefined {
  const models = new Set<string>()
  if (extra) models.add(extra)
  for (const value of [
    tierModels?.opus,
    tierModels?.sonnet,
    tierModels?.haiku,
  ]) {
    if (value) models.add(value)
  }
  return models.size > 0 ? [...models] : undefined
}

function chatgptAuthFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'openai-chatgpt-auth.json')
}

/** Raw env block of ~/.claude/settings.json ({} on any failure). */
function readUserSettingsEnv(): Record<string, string> {
  try {
    const path = join(getClaudeConfigHomeDir(), 'settings.json')
    if (!existsSync(path)) return {}
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      env?: Record<string, unknown>
    }
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed.env ?? {})) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Build (but do not persist) connection candidates from legacy stores. */
function collectLegacyCandidates(): Omit<Connection, 'id'>[] {
  const candidates: Omit<Connection, 'id'>[] = []

  // 1. ccb-provider-auth.json slots
  const providerAuth = readCCBProviderAuthData()

  const openaiEnv = providerAuth.openai?.env
  if (openaiEnv && Object.keys(openaiEnv).length > 0) {
    if (openaiEnv.OPENAI_AUTH_MODE === 'chatgpt') {
      candidates.push({
        label: 'ChatGPT Subscription',
        kind: 'chatgpt-oauth',
        credentialRef: 'default',
      })
    } else if (openaiEnv.OPENAI_API_KEY || openaiEnv.OPENAI_BASE_URL) {
      const tierModels = tierModelsFromEnv(openaiEnv, 'OPENAI')
      candidates.push({
        label: labelForBaseUrl(openaiEnv.OPENAI_BASE_URL, 'OpenAI Compatible'),
        kind: 'openai-compat',
        baseUrl: openaiEnv.OPENAI_BASE_URL,
        apiKey: openaiEnv.OPENAI_API_KEY,
        tierModels,
        models: modelsFromTiers(tierModels, openaiEnv.OPENAI_MODEL),
        presetId: presetIdForBaseUrl(openaiEnv.OPENAI_BASE_URL),
      })
    }
  }

  const geminiEnv = providerAuth.gemini?.env
  if (geminiEnv?.GEMINI_API_KEY) {
    const tierModels = tierModelsFromEnv(geminiEnv, 'GEMINI')
    candidates.push({
      label: labelForBaseUrl(geminiEnv.GEMINI_BASE_URL, 'Gemini'),
      kind: 'gemini',
      baseUrl: geminiEnv.GEMINI_BASE_URL,
      apiKey: geminiEnv.GEMINI_API_KEY,
      tierModels,
      models: modelsFromTiers(tierModels, geminiEnv.GEMINI_MODEL),
    })
  }

  const grokEnv = providerAuth.grok?.env
  if (grokEnv?.GROK_API_KEY || grokEnv?.XAI_API_KEY) {
    const tierModels = tierModelsFromEnv(grokEnv, 'GROK')
    candidates.push({
      label: labelForBaseUrl(grokEnv.GROK_BASE_URL, 'Grok'),
      kind: 'grok',
      baseUrl: grokEnv.GROK_BASE_URL,
      apiKey: grokEnv.GROK_API_KEY ?? grokEnv.XAI_API_KEY,
      tierModels,
      models: modelsFromTiers(tierModels, grokEnv.GROK_MODEL),
    })
  }

  // 2. userSettings.env — Anthropic-compatible custom endpoint.
  // Read the file directly instead of going through settings.ts: other test
  // files stub the settings module process-globally, and for a one-shot
  // legacy import the raw user file is exactly what we want anyway.
  try {
    const settingsEnv = readUserSettingsEnv()
    if (settingsEnv.ANTHROPIC_AUTH_TOKEN || settingsEnv.ANTHROPIC_BASE_URL) {
      const tierModels = tierModelsFromEnv(settingsEnv, 'ANTHROPIC')
      candidates.push({
        label: labelForBaseUrl(
          settingsEnv.ANTHROPIC_BASE_URL,
          'Anthropic Compatible',
        ),
        kind: 'anthropic-api',
        baseUrl: settingsEnv.ANTHROPIC_BASE_URL,
        apiKey: settingsEnv.ANTHROPIC_AUTH_TOKEN,
        tierModels,
        models: modelsFromTiers(tierModels, settingsEnv.ANTHROPIC_MODEL),
      })
    }
  } catch (err) {
    logError(err)
  }

  // 3. Active claude.ai OAuth account → account slot + connection
  try {
    const account = getActiveOAuthAccount()
    if (account?.accountUuid) {
      // Snapshot the active credential into its slot; returns null when the
      // credential is missing or inference-only (nothing worth importing).
      const slotUuid = saveCurrentOAuthAccountToSlot()
      if (slotUuid) {
        candidates.push({
          label: account.emailAddress || 'Claude Account',
          kind: 'anthropic-oauth',
          credentialRef: slotUuid,
          accountEmail: account.emailAddress,
        })
      }
    }
  } catch (err) {
    logError(err)
  }

  // 4. ChatGPT default auth file (covers logins predating provider-auth env)
  try {
    if (existsSync(chatgptAuthFilePath())) {
      candidates.push({
        label: 'ChatGPT Subscription',
        kind: 'chatgpt-oauth',
        credentialRef: 'default',
      })
    }
  } catch (err) {
    logError(err)
  }

  return candidates
}

/**
 * Import legacy provider/credential config into the connection registry.
 * Idempotent — returns the number of newly added connections.
 */
export function importLegacyConnections(): { imported: number } {
  let imported = 0
  try {
    const existingSignatures = new Set(listConnections().map(signatureOf))
    for (const candidate of collectLegacyCandidates()) {
      const signature = signatureOf(candidate)
      if (existingSignatures.has(signature)) continue
      existingSignatures.add(signature)
      upsertConnection({
        ...candidate,
        id: generateConnectionId(candidate.label),
        createdAt: new Date().toISOString(),
      })
      imported++
    }
  } catch (err) {
    logError(err)
  }
  return { imported }
}
