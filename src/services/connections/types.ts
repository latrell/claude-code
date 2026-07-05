import { z } from 'zod'

/**
 * Connection kinds supported by the CCB connection registry.
 *
 * - anthropic-oauth: claude.ai subscription account (tokens live in secure
 *   storage multi-account slots, referenced by `credentialRef` = accountUuid)
 * - anthropic-api:   Anthropic-compatible endpoint using base URL + auth token
 * - chatgpt-oauth:   ChatGPT subscription via Codex OAuth device flow
 *   (tokens live in openai-chatgpt-auth.<credentialRef>.json files)
 * - openai-compat:   any OpenAI Chat Completions endpoint (DeepSeek, Ollama…)
 * - gemini:          Google Gemini Generate Content API
 * - grok:            xAI Grok API (OpenAI-compatible)
 */
export const ConnectionKindSchema = z.enum([
  'anthropic-oauth',
  'anthropic-api',
  'chatgpt-oauth',
  'openai-compat',
  'gemini',
  'grok',
])
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>

/**
 * Per-tier model mapping. Written to *_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL env
 * vars on activation so haiku/sonnet/opus aliases resolve per connection.
 */
export const TierModelsSchema = z.object({
  haiku: z.string().optional(),
  sonnet: z.string().optional(),
  opus: z.string().optional(),
})
export type TierModels = z.infer<typeof TierModelsSchema>

/**
 * A "connection" = provider kind + endpoint + one account's credentials +
 * model catalog. Multiple connections may share the same kind (multi-account).
 */
export const ConnectionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
  label: z.string().min(1),
  kind: ConnectionKindSchema,
  /** Endpoint base URL (openai-compat / anthropic-api / gemini / grok). */
  baseUrl: z.string().optional(),
  /** API key / auth token for key-based kinds. */
  apiKey: z.string().optional(),
  /**
   * Credential slot reference for OAuth kinds:
   * - anthropic-oauth: accountUuid of the secure-storage account slot
   * - chatgpt-oauth: scope suffix of openai-chatgpt-auth.<scope>.json
   *   ('default' refers to the unsuffixed default file)
   */
  credentialRef: z.string().optional(),
  /** Models selectable for this connection (ids as sent to the API). */
  models: z.array(z.string()).optional(),
  /** haiku/sonnet/opus tier mapping applied on activation. */
  tierModels: TierModelsSchema.optional(),
  /** Preset this connection was created from (e.g. 'deepseek', 'zhipu'). */
  presetId: z.string().optional(),
  /** Display-only account identifier (email / key suffix). */
  accountEmail: z.string().optional(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
})
export type Connection = z.infer<typeof ConnectionSchema>

/** Assignment of a connection (+ optional model) to an agent slot. */
export const SlotAssignmentSchema = z.object({
  connectionId: z.string().min(1),
  /** Model id within the connection; undefined = connection default. */
  model: z.string().optional(),
})
export type SlotAssignment = z.infer<typeof SlotAssignmentSchema>

export const ConnectionDefaultsSchema = z.object({
  main: SlotAssignmentSchema.optional(),
  subagent: SlotAssignmentSchema.optional(),
})
export type ConnectionDefaults = z.infer<typeof ConnectionDefaultsSchema>

/** Top-level shape of ~/.claude/ccb-connections.json. */
export const ConnectionsFileSchema = z.object({
  version: z.number().optional(),
  connections: z.array(ConnectionSchema).default([]),
  defaults: ConnectionDefaultsSchema.optional(),
})
export type ConnectionsFile = z.infer<typeof ConnectionsFileSchema>

export type AgentSlot = 'main' | 'subagent'

export const CONNECTIONS_FILE_VERSION = 1

/** Kinds whose credentials are API keys stored inline in the registry. */
export function isKeyBasedKind(kind: ConnectionKind): boolean {
  return (
    kind === 'anthropic-api' ||
    kind === 'openai-compat' ||
    kind === 'gemini' ||
    kind === 'grok'
  )
}

/** Maps a connection kind to the settings.json modelType it activates. */
export function kindToModelType(
  kind: ConnectionKind,
): 'anthropic' | 'openai' | 'gemini' | 'grok' {
  switch (kind) {
    case 'anthropic-oauth':
    case 'anthropic-api':
      return 'anthropic'
    case 'chatgpt-oauth':
    case 'openai-compat':
      return 'openai'
    case 'gemini':
      return 'gemini'
    case 'grok':
      return 'grok'
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return 'anthropic'
    }
  }
}
