import zh from './translations/zh'

export type ResolvedLanguage = 'en' | 'zh'

/**
 * Detect language from browser or stored preference.
 * 'zh' when navigator.language starts with 'zh', otherwise 'en'.
 */
export function getResolvedLanguage(): ResolvedLanguage {
  try {
    const stored = localStorage.getItem('rcs_lang')
    if (stored === 'zh') return 'zh'
    if (stored === 'en') return 'en'
  } catch {
    // ignore
  }
  if (
    typeof navigator !== 'undefined' &&
    navigator.language?.startsWith('zh')
  ) {
    return 'zh'
  }
  return 'en'
}

/**
 * Translate a UI string to the user's preferred language.
 * When language is 'zh', returns the Chinese translation for the key.
 * When language is 'en' or the key is not found, returns the key as-is.
 */
export function t(key: string): string {
  if (getResolvedLanguage() !== 'zh') return key
  return zh[key] ?? key
}

/**
 * Translate a template string with {placeholder} variable substitutions.
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
