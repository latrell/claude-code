import type { APIProvider } from '../model/providers.js'

export type ClassifierXmlMode = 'both' | 'fast' | 'thinking'

export type ClassifierXmlSetting =
  | boolean
  | Exclude<ClassifierXmlMode, 'both'>
  | undefined

/**
 * Cursor's agent-tuned models ignore custom MCP tools, so its classifier must
 * always use the XML text path. Explicit fast/thinking modes still select the
 * requested stage; an otherwise-disabled rollout defaults Cursor to both.
 */
export function resolveClassifierXmlMode(
  provider: APIProvider,
  setting: ClassifierXmlSetting,
): ClassifierXmlMode | undefined {
  if (provider === 'cursor') {
    return setting === 'fast' || setting === 'thinking' ? setting : 'both'
  }
  if (setting === true) return 'both'
  if (setting === 'fast' || setting === 'thinking') return setting
  return undefined
}
