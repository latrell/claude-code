import { normalizeLanguageForSTT } from '../../hooks/useVoice.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import { isVoiceAvailable } from '../../voice/voiceModeEnabled.js'
import { t, tf } from '../../i18n/t.js'

const LANG_HINT_MAX_SHOWS = 2

export const call: LocalCommandCall = async args => {
  // Check kill-switch before allowing voice mode
  if (!isVoiceAvailable()) {
    return {
      type: 'text' as const,
      value: t('Voice mode is not available.'),
    }
  }

  const currentSettings = getInitialSettings()
  const isCurrentlyEnabled = currentSettings.voiceEnabled === true
  const providerArg = args?.trim().toLowerCase()

  // Handle provider argument when already enabled — switch backend only
  if (isCurrentlyEnabled && providerArg === 'doubao') {
    const result = updateSettingsForSource('userSettings', {
      voiceProvider: 'doubao',
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value: t(
          'Failed to update settings. Check your settings file for syntax errors.',
        ),
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    return {
      type: 'text' as const,
      value: tf('Voice mode switched to Doubao ASR. Hold {key} to record.', {
        key,
      }),
    }
  }

  // Handle provider argument when already enabled — switch to anthropic
  if (isCurrentlyEnabled && providerArg === 'anthropic') {
    const result = updateSettingsForSource('userSettings', {
      voiceProvider: 'anthropic',
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value: t(
          'Failed to update settings. Check your settings file for syntax errors.',
        ),
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    return {
      type: 'text' as const,
      value: tf('Voice mode switched to Anthropic STT. Hold {key} to record.', {
        key,
      }),
    }
  }

  // Toggle OFF — no checks needed
  if (isCurrentlyEnabled) {
    const result = updateSettingsForSource('userSettings', {
      voiceEnabled: false,
    })
    if (result.error) {
      return {
        type: 'text' as const,
        value: t(
          'Failed to update settings. Check your settings file for syntax errors.',
        ),
      }
    }
    settingsChangeDetector.notifyChange('userSettings')
    logEvent('tengu_voice_toggled', { enabled: false })
    return {
      type: 'text' as const,
      value: t('Voice mode disabled.'),
    }
  }

  // Toggle ON — determine provider from argument or default
  const provider = providerArg === 'doubao' ? 'doubao' : 'anthropic'

  // Run pre-flight checks
  const { isVoiceStreamAvailable } = await import(
    '../../services/voiceStreamSTT.js'
  )
  const { checkRecordingAvailability } = await import('../../services/voice.js')

  // Check recording availability (microphone access)
  const recording = await checkRecordingAvailability()
  if (!recording.available) {
    return {
      type: 'text' as const,
      value:
        recording.reason ??
        t('Voice mode is not available in this environment.'),
    }
  }

  // Check for API key (only for Anthropic backend — Doubao uses its own credentials)
  if (provider !== 'doubao' && !isVoiceStreamAvailable()) {
    return {
      type: 'text' as const,
      value: t(
        'Voice mode requires a Claude.ai account. Please run /login to sign in.',
      ),
    }
  }

  // Check for recording tools
  const { checkVoiceDependencies, requestMicrophonePermission } = await import(
    '../../services/voice.js'
  )
  const deps = await checkVoiceDependencies()
  if (!deps.available) {
    const hint = deps.installCommand
      ? tf('\nInstall audio recording tools? Run: {cmd}', {
          cmd: deps.installCommand,
        })
      : `\n${t('Install SoX manually for audio recording.')}`
    return {
      type: 'text' as const,
      value: t('No audio recording tool found.') + hint,
    }
  }

  // Probe mic access so the OS permission dialog fires now rather than
  // on the user's first hold-to-talk activation.
  if (!(await requestMicrophonePermission())) {
    let guidance: string
    if (process.platform === 'win32') {
      guidance = 'Settings \u2192 Privacy \u2192 Microphone'
    } else if (process.platform === 'linux') {
      guidance = "your system's audio settings"
    } else {
      guidance = 'System Settings \u2192 Privacy & Security \u2192 Microphone'
    }
    return {
      type: 'text' as const,
      value: tf(
        'Microphone access is denied. To enable it, go to {guidance}, then run /voice again.',
        { guidance },
      ),
    }
  }

  // All checks passed — enable voice with provider
  const result = updateSettingsForSource('userSettings', {
    voiceEnabled: true,
    ...(provider === 'doubao' ? { voiceProvider: 'doubao' } : {}),
  })
  if (result.error) {
    return {
      type: 'text' as const,
      value: t(
        'Failed to update settings. Check your settings file for syntax errors.',
      ),
    }
  }
  settingsChangeDetector.notifyChange('userSettings')
  logEvent('tengu_voice_toggled', { enabled: true })
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  let langNote = ''
  const providerLabel = provider === 'doubao' ? 'Doubao ASR' : 'Anthropic'
  // Doubao backend handles all languages natively — skip language hints
  if (provider !== 'doubao') {
    const stt = normalizeLanguageForSTT(currentSettings.language)
    const cfg = getGlobalConfig()
    const langChanged = cfg.voiceLangHintLastLanguage !== stt.code
    const priorCount = langChanged ? 0 : (cfg.voiceLangHintShownCount ?? 0)
    const showHint = !stt.fellBackFrom && priorCount < LANG_HINT_MAX_SHOWS
    if (stt.fellBackFrom) {
      langNote = ` ${tf('Note: "{from}" is not a supported dictation language; using English. Change it via /config.', { from: stt.fellBackFrom })}`
    } else if (showHint) {
      langNote = ` ${tf('Dictation language: {lang} (/config to change).', { lang: stt.code })}`
    }
    if (langChanged || showHint) {
      saveGlobalConfig(prev => ({
        ...prev,
        voiceLangHintShownCount: priorCount + (showHint ? 1 : 0),
        voiceLangHintLastLanguage: stt.code,
      }))
    }
  }
  return {
    type: 'text' as const,
    value:
      tf('Voice mode enabled ({provider}). Hold {key} to record.', {
        provider: providerLabel,
        key,
      }) + langNote,
  }
}
