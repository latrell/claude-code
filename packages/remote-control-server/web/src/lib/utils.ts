import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getResolvedLanguage, type ResolvedLanguage } from './i18n'

const DURATION_UNITS: Record<
  ResolvedLanguage,
  { hour: string; minute: string; second: string }
> = {
  en: { hour: 'h', minute: 'm', second: 's' },
  zh: { hour: '时', minute: '分', second: '秒' },
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function esc(str: string | null | undefined): string {
  if (!str) return ''
  const value = String(str)
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

/**
 * Format an elapsed duration measured in seconds using the Web UI language.
 * Keeps seconds visible while adding minute and hour components as needed.
 */
export function formatDurationSeconds(
  durationSeconds: number,
  language: ResolvedLanguage = getResolvedLanguage(),
): string {
  const totalSeconds = Number.isFinite(durationSeconds)
    ? Math.max(0, Math.floor(durationSeconds))
    : 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const units = DURATION_UNITS[language]

  if (hours > 0) {
    return `${hours}${units.hour} ${minutes}${units.minute} ${seconds}${units.second}`
  }
  if (minutes > 0) {
    return `${minutes}${units.minute} ${seconds}${units.second}`
  }
  return `${seconds}${units.second}`
}

export function statusClass(status: string | null | undefined): string {
  const map: Record<string, string> = {
    active: 'active',
    running: 'running',
    idle: 'idle',
    inactive: 'inactive',
    requires_action: 'requires_action',
    archived: 'archived',
    error: 'error',
  }
  return map[status || ''] || 'default'
}

export function isClosedSessionStatus(
  status: string | null | undefined,
): boolean {
  return status === 'archived' || status === 'inactive'
}

export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return ''
  const s = String(str)
  return s.length > max ? s.slice(0, max) + '...' : s
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

export function generateMessageUuid(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error(
      'crypto.getRandomValues is required to generate message UUIDs',
    )
  }
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  return formatUuidV4(bytes)
}

export function extractEventText(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.content === 'string') return payload.content
  const msg = payload.message as Record<string, unknown> | undefined
  if (msg && typeof msg === 'object' && Array.isArray(msg.content)) {
    const texts = msg.content
      .filter(
        (b: Record<string, unknown>) =>
          b && b.type === 'text' && typeof b.text === 'string',
      )
      .map((b: Record<string, unknown>) => b.text as string)
    if (texts.length > 0) return texts.join('\n')
  }
  return ''
}

export function isConversationClearedStatus(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload || typeof payload !== 'object') return false
  if (payload.status === 'conversation_cleared') return true
  const raw = payload.raw as Record<string, unknown> | undefined
  return (
    !!raw && typeof raw === 'object' && raw.status === 'conversation_cleared'
  )
}
