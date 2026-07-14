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
 * - cursor:          Cursor IDE backend API (ConnectRPC/protobuf). Credential
 *   is one of three sources, distinguished by which fields are set:
 *     * OAuth browser sign-in — `credentialRef` = scope suffix of
 *       cursor-auth.<scope>.json (tokens from the PKCE deep-link flow)
 *     * manual — `apiKey` session token (+ optional `machineId`)
 *     * IDE auto-read — none set; read from a signed-in Cursor IDE's state DB
 */
export const ConnectionKindSchema = z.enum([
  'anthropic-oauth',
  'anthropic-api',
  'chatgpt-oauth',
  'openai-compat',
  'gemini',
  'grok',
  'cursor',
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
 * A model's context window size. `source` records how the value was
 * obtained so automatic refreshes never clobber a manual setting:
 * - auto:   detected from the provider's model-list endpoint
 * - manual: entered by the user in /connect
 */
export const ModelContextWindowSchema = z.object({
  tokens: z.number().int().positive(),
  source: z.enum(['auto', 'manual']).optional(),
})
export type ModelContextWindow = z.infer<typeof ModelContextWindowSchema>

/**
 * Reasoning/thinking effort pinned to a connection profile. Applied when
 * the connection is activated (future batches wire this into activation).
 */
export const ThinkingEffortSchema = z.enum([
  'off',
  'low',
  'medium',
  'high',
  'max',
])
export type ThinkingEffort = z.infer<typeof ThinkingEffortSchema>

/**
 * How extended effort values are encoded for OpenAI-compatible Chat
 * Completions endpoints. `compatible` preserves the standard low/medium/high
 * wire values; `passthrough` sends extensions such as max unchanged.
 */
export const ThinkingEffortTransportSchema = z.enum([
  'compatible',
  'passthrough',
])
export type ThinkingEffortTransport = z.infer<
  typeof ThinkingEffortTransportSchema
>

/**
 * A "connection" = a named profile: provider kind + endpoint + one account's
 * credentials + a pinned model (+ thinking effort + context window).
 * Multiple connections may share the same kind (multi-account) or even the
 * same credentials with different pinned models.
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
  /** API key / auth token for key-based kinds (Cursor: session token). */
  apiKey: z.string().optional(),
  /**
   * Cursor machine id, paired with the `apiKey` session token. Empty for
   * Cursor connections that auto-read credentials from a signed-in Cursor IDE.
   */
  machineId: z.string().optional(),
  /**
   * Credential slot reference for OAuth kinds:
   * - anthropic-oauth: accountUuid of the secure-storage account slot
   * - chatgpt-oauth: scope suffix of openai-chatgpt-auth.<scope>.json
   *   ('default' refers to the unsuffixed default file)
   * - cursor (OAuth sign-in): scope suffix of cursor-auth.<scope>.json
   *   ('default' refers to the unsuffixed default file)
   */
  credentialRef: z.string().optional(),
  /** Models selectable for this connection (ids as sent to the API). Kept
   * only as the catalog for picker UIs; the pinned `model` below is the
   * single source of truth for what the connection actually uses. */
  models: z.array(z.string()).optional(),
  /**
   * The single model this connection profile is pinned to (source of
   * truth). Optional: OAuth kinds (anthropic-oauth / chatgpt-oauth) may
   * leave it unset and follow the provider's default model.
   */
  model: z.string().optional(),
  /** Thinking effort applied while this connection is active. */
  thinkingEffort: ThinkingEffortSchema.optional(),
  /**
   * OpenAI-compatible wire encoding for extended effort values. Missing is
   * intentionally equivalent to `compatible` so existing profiles keep their
   * previous max -> high behavior.
   */
  thinkingEffortTransport: ThinkingEffortTransportSchema.optional(),
  /**
   * Context window (tokens) for the pinned `model`. Synced by
   * updateConnectionModel() and the lazy migration in store.ts; read first
   * by getConnectionContextWindow().
   */
  contextWindow: z.number().int().positive().optional(),
  /**
   * @deprecated Legacy haiku/sonnet/opus tier mapping applied on
   * activation. Superseded by the pinned `model`; kept so old registry
   * files still parse.
   */
  tierModels: TierModelsSchema.optional(),
  /**
   * @deprecated Context window sizes keyed by model id, auto-detected from
   * the provider's model list or set manually in /connect. Superseded by
   * the connection-level `contextWindow`; kept as a fallback source and so
   * old registry files still parse.
   */
  modelContextWindows: z
    .record(z.string(), ModelContextWindowSchema)
    .optional(),
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
  /**
   * @deprecated Model id within the connection; undefined = connection
   * default. Superseded by the connection's pinned `model` field; kept so
   * old registry files still parse (and as migration input).
   */
  model: z.string().optional(),
})
export type SlotAssignment = z.infer<typeof SlotAssignmentSchema>

export const ConnectionDefaultsSchema = z.object({
  main: SlotAssignmentSchema.optional(),
  subagent: SlotAssignmentSchema.optional(),
  fast: SlotAssignmentSchema.optional(),
  sonnet: SlotAssignmentSchema.optional(),
})
export type ConnectionDefaults = z.infer<typeof ConnectionDefaultsSchema>

/** Top-level shape of ~/.claude/ccb-connections.json. */
export const ConnectionsFileSchema = z.object({
  version: z.number().optional(),
  connections: z.array(ConnectionSchema).default([]),
  defaults: ConnectionDefaultsSchema.optional(),
})
export type ConnectionsFile = z.infer<typeof ConnectionsFileSchema>

export type AgentSlot = 'main' | 'subagent' | 'fast' | 'sonnet'

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
): 'anthropic' | 'openai' | 'gemini' | 'grok' | 'cursor' {
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
    case 'cursor':
      return 'cursor'
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return 'anthropic'
    }
  }
}
