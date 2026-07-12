import { getInitialSettings } from './settings/settings.js'

export type ResolvedLanguage = 'en' | 'zh'

/**
 * Resolve the effective display language from settings.language.
 *
 * - settings.language === '简体中文' → returns 'zh'
 * - All other values (undefined, 'English', 'Japanese', arbitrary custom
 *   languages) → returns 'en'
 *
 * Safe to call before settings are available (e.g., during Commander setup
 * before init()): when settings read fails the function falls back to 'en'.
 */
export function getResolvedLanguage(): ResolvedLanguage {
  try {
    const settings = getInitialSettings()
    if (settings.language === '简体中文') return 'zh'
  } catch (_e) {
    // Settings read failed (e.g., before init()). Fallback to 'en'.
  }
  return 'en'
}

/**
 * Raw settings.language value ('简体中文', 'Japanese', any custom string),
 * or undefined when unset (English default) or before settings are
 * available. Use this instead of getResolvedLanguage() when the verbatim
 * language name matters — e.g., injecting it into a model prompt.
 */
export function getPreferredLanguage(): string | undefined {
  try {
    const language = getInitialSettings().language?.trim()
    return language || undefined
  } catch (_e) {
    return undefined
  }
}

const DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

export function getLanguageDisplayName(lang: string): string {
  return DISPLAY_NAMES[lang] ?? lang
}
