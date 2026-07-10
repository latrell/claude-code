import type { TerminalNotification } from '@anthropic/ink'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { getGlobalConfig } from '../utils/config.js'
import { env } from '../utils/env.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { executeNotificationHooks } from '../utils/hooks.js'
import { logError } from '../utils/log.js'
import { isTeammate } from '../utils/teammate.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from './analytics/index.js'

export type NotificationOptions = {
  message: string
  title?: string
  notificationType: string
}

export async function sendNotification(
  notif: NotificationOptions,
  terminal: TerminalNotification,
): Promise<void> {
  // Notifications must only come from the top-level interactive session.
  // Worker processes (tmux/swarm teammates) and headless/SDK sessions stay
  // silent — their results are handled by the main agent, so pushing OS
  // notifications (or re-firing user Notification hooks) from them is
  // duplicate noise.
  if (isTeammate() || getIsNonInteractiveSession()) {
    return
  }

  const config = getGlobalConfig()
  const channel = config.preferredNotifChannel

  await executeNotificationHooks(notif)

  const methodUsed = await sendToChannel(channel, notif, terminal)

  logEvent('tengu_notification_method_used', {
    configured_channel:
      channel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    method_used:
      methodUsed as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    term: env.terminal as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

const DEFAULT_TITLE = 'Claude Code'

async function sendToChannel(
  channel: string,
  opts: NotificationOptions,
  terminal: TerminalNotification,
): Promise<string> {
  const title = opts.title || DEFAULT_TITLE

  try {
    switch (channel) {
      case 'auto':
        return sendAuto(opts, terminal)
      case 'iterm2':
        terminal.notifyITerm2(opts)
        return 'iterm2'
      case 'iterm2_with_bell':
        terminal.notifyITerm2(opts)
        terminal.notifyBell()
        return 'iterm2_with_bell'
      case 'kitty':
        terminal.notifyKitty({ ...opts, title, id: generateKittyId() })
        return 'kitty'
      case 'ghostty':
        terminal.notifyGhostty({ ...opts, title })
        return 'ghostty'
      case 'meow':
        return await sendMeow(opts, title)
      case 'terminal_bell':
        terminal.notifyBell()
        return 'terminal_bell'
      case 'notifications_disabled':
        return 'disabled'
      default:
        return 'none'
    }
  } catch {
    return 'error'
  }
}

async function sendAuto(
  opts: NotificationOptions,
  terminal: TerminalNotification,
): Promise<string> {
  const title = opts.title || DEFAULT_TITLE

  switch (env.terminal) {
    case 'Apple_Terminal': {
      const bellDisabled = await isAppleTerminalBellDisabled()
      if (bellDisabled) {
        terminal.notifyBell()
        return 'terminal_bell'
      }
      return 'no_method_available'
    }
    case 'iTerm.app':
      terminal.notifyITerm2(opts)
      return 'iterm2'
    case 'kitty':
      terminal.notifyKitty({ ...opts, title, id: generateKittyId() })
      return 'kitty'
    case 'ghostty':
      terminal.notifyGhostty({ ...opts, title })
      return 'ghostty'
    default:
      return 'no_method_available'
  }
}

function generateKittyId(): number {
  return Math.floor(Math.random() * 10000)
}

const MEOW_API_BASE = 'https://api.chuckfang.com'

/**
 * Push via the MeoW service (https://www.chuckfang.com/MeoW/). The nickname
 * identifies the recipient — there is no other credential.
 */
async function sendMeow(
  opts: NotificationOptions,
  title: string,
): Promise<string> {
  const nickname = getGlobalConfig().meowNotifNickname?.trim()
  if (!nickname) {
    return 'meow_no_nickname'
  }

  return (await sendMeowPush(title, opts.message)) ? 'meow' : 'error'
}

export function isMeowChannelConfigured(): boolean {
  const config = getGlobalConfig()
  return (
    config.preferredNotifChannel === 'meow' &&
    Boolean(config.meowNotifNickname?.trim())
  )
}

/**
 * Local wall-clock timestamp appended to every MeoW push body. Unlike OS
 * notifications, the MeoW app does not surface the event time prominently,
 * so include it in the message itself.
 */
export function formatNotificationTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export async function sendMeowPush(
  title: string,
  message: string,
): Promise<boolean> {
  const nickname = getGlobalConfig().meowNotifNickname?.trim()
  if (!nickname) {
    return false
  }

  const messageWithTimestamp = `${message.trimEnd()}\n\n${formatNotificationTimestamp()}`

  try {
    const res = await fetch(
      `${MEOW_API_BASE}/${encodeURIComponent(nickname)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, msg: messageWithTimestamp }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!res.ok) {
      return false
    }
    // MeoW returns HTTP 200 even for business failures (unknown nickname,
    // rate limit); success is only signalled by body `data === true`.
    const body = (await res.json().catch(() => null)) as {
      data?: unknown
    } | null
    return body?.data === true
  } catch {
    return false
  }
}

async function isAppleTerminalBellDisabled(): Promise<boolean> {
  try {
    if (env.terminal !== 'Apple_Terminal') {
      return false
    }

    const osascriptResult = await execFileNoThrow('osascript', [
      '-e',
      'tell application "Terminal" to name of current settings of front window',
    ])
    const currentProfile = osascriptResult.stdout.trim()

    if (!currentProfile) {
      return false
    }

    const defaultsOutput = await execFileNoThrow('defaults', [
      'export',
      'com.apple.Terminal',
      '-',
    ])

    if (defaultsOutput.code !== 0) {
      return false
    }

    // Lazy-load plist (~280KB with xmlbuilder+@xmldom) — only hit on
    // Apple_Terminal with auto-channel, which is a small fraction of users.
    const plist = await import('plist')
    const parsed: Record<string, unknown> = plist.parse(
      defaultsOutput.stdout,
    ) as any
    const windowSettings = parsed?.['Window Settings'] as
      | Record<string, unknown>
      | undefined
    const profileSettings = windowSettings?.[currentProfile] as
      | Record<string, unknown>
      | undefined

    if (!profileSettings) {
      return false
    }

    return profileSettings.Bell === false
  } catch (error) {
    logError(error)
    return false
  }
}
