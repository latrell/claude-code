import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import {
  type PreferredLanguage,
  getLanguageDisplayName,
  getResolvedLanguage,
} from '../../utils/language.js'
import { tf } from '../../i18n/t.js'

const VALID_LANGS: readonly PreferredLanguage[] = ['en', 'zh', 'auto']

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const arg = args.trim().toLowerCase()

  if (!arg) {
    const pref = getGlobalConfig().preferredLanguage ?? 'auto'
    const resolved = getResolvedLanguage()
    const label =
      pref === 'auto'
        ? `${getLanguageDisplayName(pref)} → ${getLanguageDisplayName(resolved)}`
        : getLanguageDisplayName(pref)
    onDone(tf('Language: {lang}', { lang: label }), {
      display: 'system',
    })
    return null
  }

  if (!VALID_LANGS.includes(arg as PreferredLanguage)) {
    onDone(
      tf('Invalid language "{lang}". Use: en, zh, or auto', { lang: arg }),
      {
        display: 'system',
      },
    )
    return null
  }

  const lang = arg as PreferredLanguage
  saveGlobalConfig(current => ({ ...current, preferredLanguage: lang }))

  const resolved = getResolvedLanguage()
  const label =
    lang === 'auto'
      ? `${getLanguageDisplayName(lang)} → ${getLanguageDisplayName(resolved)}`
      : getLanguageDisplayName(lang)
  onDone(tf('Language set to {lang}', { lang: label }), {
    display: 'system',
  })
  return null
}
