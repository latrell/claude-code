import { getResolvedLanguage } from 'src/utils/language.js'
import zh from './translations/zh.js'

/**
 * Translate a UI string to the user's preferred language.
 *
 * - When language is 'zh', returns the Chinese translation for the key.
 * - When language is 'en' or the key is not found, returns the key as-is.
 * - Falls back to the key if no translation exists.
 *
 * Only UI/user-visible strings should be passed to this function.
 * AI prompts, tool schemas, protocol/config keys must not be translated.
 */
export function t(key: string): string {
  if (getResolvedLanguage() !== 'zh') return key
  return zh[key] ?? key
}

/**
 * Translate a template string with {placeholder} variable substitutions.
 *
 * Used for UI strings that contain dynamic values (e.g., file paths, counts).
 * The template is translated first via `t()`, then placeholders are replaced.
 *
 * @param template - The English template string (serves as both the key and default).
 * @param vars - Object mapping placeholder names to values.
 *
 * Example:
 *   tf('You have {count} {noun}', { count: 3, noun: 'files' })
 *   // Chinese: "您有 3 个文件"
 */
export function tf(
  template: string,
  vars: Record<string, string | number | boolean | null | undefined>,
): string {
  const translated = t(template)
  return translated.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = vars[name]
    if (value === null || value === undefined) return `{${name}}`
    return String(value)
  })
}
