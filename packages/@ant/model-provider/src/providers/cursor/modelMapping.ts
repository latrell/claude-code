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
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-4-sonnet',
  'claude-sonnet-4-5-20250929': 'claude-4.5-sonnet',
  'claude-sonnet-4-6': 'claude-4.5-sonnet',
  'claude-opus-4-20250514': 'claude-4-opus',
  'claude-opus-4-1-20250805': 'claude-4.1-opus',
  'claude-opus-4-5-20251101': 'claude-4.5-sonnet',
  'claude-opus-4-6': 'claude-4.5-sonnet',
  'claude-haiku-4-5-20251001': 'claude-4.5-sonnet',
  'claude-3-5-haiku-20241022': 'claude-3.5-haiku',
  'claude-3-7-sonnet-20250219': 'claude-3.7-sonnet',
  'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
}

const DEFAULT_FAMILY_MAP: Record<string, string> = {
  opus: 'claude-4-opus',
  sonnet: 'claude-4.5-sonnet',
  haiku: 'claude-4.5-sonnet',
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
 * Resolve the Cursor model name for a given Anthropic model.
 */
export function resolveCursorModel(
  anthropicModel: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.CURSOR_MODEL) {
    return env.CURSOR_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')
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
