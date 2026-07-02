import { getGlobalConfig } from './config.js'
import { getSystemLocaleLanguage } from './intl.js'

export type PreferredLanguage = 'auto' | 'en' | 'zh'
export type ResolvedLanguage = 'en' | 'zh'

/**
 * Resolve the effective display language.
 * Priority: GlobalConfig.preferredLanguage → system locale → default 'en'.
 *
 * Safe to call before config reading is allowed (e.g., during Commander setup
 * before init()).  When config is not yet available the function falls back to
 * system locale detection and returns 'en' for non-Chinese locales.
 */
export function getResolvedLanguage(): ResolvedLanguage {
  try {
    const pref = getGlobalConfig().preferredLanguage ?? 'auto'
    if (pref === 'en' || pref === 'zh') return pref
  } catch (e) {
    // Config accessed before allowed — Commander descriptions and other early
    // bootstrap strings are evaluated before init() calls enableConfigs().
    // Fall through to system locale detection instead of crashing.
    if (
      !(e instanceof Error) ||
      e.message !== 'Config accessed before allowed.'
    ) {
      throw e
    }
  }
  const sysLang = getSystemLocaleLanguage()
  return sysLang === 'zh' ? 'zh' : 'en'
}

const DISPLAY_NAMES: Record<string, string> = {
  auto: 'Auto (follow system)',
  en: 'English',
  zh: '中文',
}

export function getLanguageDisplayName(lang: string): string {
  return DISPLAY_NAMES[lang] ?? lang
}
