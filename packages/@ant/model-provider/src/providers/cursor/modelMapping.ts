/**
 * Default mapping from Anthropic model names to Cursor model names.
 *
 * Cursor exposes its own model catalog (e.g. `claude-4.5-sonnet`, `gpt-5`,
 * `auto`). We map Anthropic model families to sensible Cursor equivalents.
 *
 * Users can override per-family via CURSOR_DEFAULT_{FAMILY}_MODEL env vars,
 * override the entire mapping via CURSOR_MODEL_MAP (JSON string), or force a
 * single model for every request via CURSOR_MODEL.
 */
// Targets are Cursor serverModelName values that currently exist in Cursor's
// AvailableModels catalog (verified live). Cursor drops old model ids over
// time, so map retired Anthropic ids to the nearest current Cursor equivalent
// rather than a name Cursor no longer accepts.
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-4-sonnet',
  'claude-sonnet-4-5-20250929': 'claude-4.5-sonnet',
  'claude-sonnet-4-6': 'claude-4.5-sonnet',
  'claude-opus-4-20250514': 'claude-4.5-opus-high',
  'claude-opus-4-1-20250805': 'claude-4.5-opus-high',
  'claude-opus-4-5-20251101': 'claude-4.5-opus-high',
  'claude-opus-4-6': 'claude-4.6-opus-high',
  'claude-haiku-4-5-20251001': 'claude-4.5-haiku',
  'claude-3-5-haiku-20241022': 'claude-4.5-haiku',
  'claude-3-7-sonnet-20250219': 'claude-4.5-sonnet',
  'claude-3-5-sonnet-20241022': 'claude-4.5-sonnet',
}

const DEFAULT_FAMILY_MAP: Record<string, string> = {
  opus: 'claude-opus-4-8-thinking-high',
  sonnet: 'claude-4.5-sonnet',
  haiku: 'claude-4.5-haiku',
}

// Cursor catalog alias ids (AvailableModels `idAliases` / `legacySlugs`) that
// the chat endpoint itself rejects with "AI Model Not Found". The Cursor IDE
// resolves these ids client-side before sending; we do the same as the last
// step of resolution so pickers/config/env can keep using the friendly alias
// (most importantly `auto`). Verified live against api2.cursor.sh (2026-07).
// Aliases that collide with a real current serverModelName (e.g. composer-2.5)
// are intentionally omitted.
const CURSOR_ID_ALIASES: Record<string, string> = {
  auto: 'default',
  'claude-fable-5': 'claude-fable-5-thinking-high',
  'claude-sonnet-5': 'claude-sonnet-5-thinking-high',
  'claude-opus-4-8': 'claude-opus-4-8-thinking-high',
  'claude-opus-4-7': 'claude-opus-4-7-thinking-xhigh',
  'gpt-5.5': 'gpt-5.5-medium',
  'gpt-5.4': 'gpt-5.4-medium',
  'gpt-5.4-mini': 'gpt-5.4-mini-medium',
  'gpt-5.4-nano': 'gpt-5.4-nano-medium',
  'gpt-5.1-codex-max': 'gpt-5.1-codex-max-medium',
  'glm-5.2': 'glm-5.2-high',
}

/**
 * Map a Cursor alias id (idAliases/legacySlugs) to the serverModelName the
 * chat endpoint accepts. Non-alias ids pass through unchanged.
 */
function normalizeCursorAlias(model: string): string {
  return CURSOR_ID_ALIASES[model] ?? model
}

// Effort/variant suffixes Cursor appends to its Claude serverModelNames
// (claude-sonnet-5-thinking-high, claude-fable-5-max, claude-opus-4-7-low-fast).
// Anthropic model ids never end in these tokens (they end in a version, a
// -YYYYMMDD date, or -latest).
const CURSOR_EFFORT_SUFFIX_RE =
  /-(thinking|low|medium|high|xhigh|max|fast|none)$/

/**
 * Whether a model id is a Cursor-native Claude serverModelName rather than an
 * Anthropic model reference. These come from the /model picker, the live
 * AvailableModels catalog, or custom input — they are exact ids and must NOT
 * be remapped through the family slots (that would silently substitute e.g.
 * claude-4.5-sonnet for a picked claude-sonnet-5-thinking-high).
 *
 * Shapes that only Cursor uses:
 *  - dotted version-first: claude-4.5-sonnet, claude-4.6-opus-high-thinking
 *    (Anthropic never puts a dotted version segment in model ids)
 *  - the un-dotted 4-line: claude-4-sonnet(-thinking)
 *  - effort-suffixed: claude-sonnet-5-thinking-high, claude-fable-5-max
 */
function isCursorNativeClaudeId(model: string): boolean {
  if (!model.startsWith('claude-')) return false
  if (/^claude-\d+\.\d+-/.test(model)) return true
  if (/^claude-4-(sonnet|opus|haiku)(-thinking)?$/.test(model)) return true
  return CURSOR_EFFORT_SUFFIX_RE.test(model)
}

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  // Fable is the flagship default tier that replaced Sonnet — map it to the
  // sonnet slot so *_DEFAULT_SONNET_MODEL overrides apply instead of sending
  // the Anthropic model id verbatim to Cursor.
  if (/fable/i.test(model)) return 'sonnet'
  return null
}

function getUserModelMap(
  env: Record<string, string | undefined>,
): Record<string, string> | null {
  const raw = env.CURSOR_MODEL_MAP
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      return Object.fromEntries(entries)
    }
  } catch {
    // ignore invalid JSON
  }
  return null
}

/**
 * Resolve the Cursor model name for a given Anthropic model. The result is
 * always alias-normalized: whatever source wins (env override, user map,
 * default map, or pass-through), catalog aliases like `auto` are converted to
 * the serverModelName the chat endpoint actually accepts (`default`).
 */
export function resolveCursorModel(
  anthropicModel: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return normalizeCursorAlias(resolveCursorModelRaw(anthropicModel, env))
}

function resolveCursorModelRaw(
  anthropicModel: string,
  env: Record<string, string | undefined>,
): string {
  if (env.CURSOR_MODEL) {
    return env.CURSOR_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')

  // Exact Cursor serverModelNames picked in /model or /models must be sent
  // verbatim. Without this, the family regexes below would remap e.g. a picked
  // claude-sonnet-5-thinking-high to the sonnet slot (claude-4.5-sonnet),
  // silently calling a different model than the one selected.
  if (isCursorNativeClaudeId(cleanModel)) {
    return cleanModel
  }

  const family = getModelFamily(cleanModel)

  const userMap = getUserModelMap(env)
  if (userMap && family && userMap[family]) {
    return userMap[family]
  }

  if (family) {
    const cursorEnvVar = `CURSOR_DEFAULT_${family.toUpperCase()}_MODEL`
    const cursorOverride = env[cursorEnvVar]
    if (cursorOverride) return cursorOverride

    const anthropicEnvVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
    const anthropicOverride = env[anthropicEnvVar]
    if (anthropicOverride) return anthropicOverride
  }

  if (DEFAULT_MODEL_MAP[cleanModel]) {
    return DEFAULT_MODEL_MAP[cleanModel]
  }

  if (family && DEFAULT_FAMILY_MAP[family]) {
    return DEFAULT_FAMILY_MAP[family]
  }

  return cleanModel
}
