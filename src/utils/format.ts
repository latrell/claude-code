// Pure display formatters — leaf-safe (no Ink). Width-aware truncation lives in ./truncate.ts.

import { getRelativeTimeFormat, getTimeZone } from './intl.js'
import { getResolvedLanguage, type ResolvedLanguage } from './language.js'

type DurationUnitLabels = {
  day: string
  hour: string
  minute: string
  second: string
  millisecond: string
}

const DURATION_UNITS: Record<ResolvedLanguage, DurationUnitLabels> = {
  en: { day: 'd', hour: 'h', minute: 'm', second: 's', millisecond: 'ms' },
  zh: {
    day: '天',
    hour: '时',
    minute: '分',
    second: '秒',
    millisecond: '毫秒',
  },
}

type DurationLanguageOptions = {
  language?: ResolvedLanguage
}

/**
 * BCP-47 locale for date/time display, following the app's resolved UI
 * language. Keeps reset-time labels ("Aug 5" vs "8月5日") in sync with the
 * rest of the localized UI instead of always rendering US English.
 */
function getDisplayDateLocale(): string {
  return getResolvedLanguage() === 'zh' ? 'zh-CN' : 'en-US'
}

/**
 * Formats a byte count to a human-readable string (KB, MB, GB).
 * @example formatFileSize(1536) → "1.5KB"
 */
export function formatFileSize(sizeInBytes: number): string {
  const kb = sizeInBytes / 1024
  if (kb < 1) {
    return `${sizeInBytes} bytes`
  }
  if (kb < 1024) {
    return `${kb.toFixed(1).replace(/\.0$/, '')}KB`
  }
  const mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1).replace(/\.0$/, '')}MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`
}

/**
 * Formats milliseconds as seconds with 1 decimal place (e.g. `1234` → `"1.2s"`).
 * Unlike formatDuration, always keeps the decimal — use for sub-minute timings
 * where the fractional second is meaningful (TTFT, hook durations, etc.).
 */
export function formatSecondsShort(
  ms: number,
  options?: DurationLanguageOptions,
): string {
  const language = options?.language ?? getResolvedLanguage()
  const durationMs = Number.isFinite(ms) ? Math.max(0, ms) : 0
  return `${(durationMs / 1000).toFixed(1)}${DURATION_UNITS[language].second}`
}

/** Formats milliseconds with a localized compact unit. */
export function formatMillisecondsShort(
  ms: number,
  options?: DurationLanguageOptions,
): string {
  const language = options?.language ?? getResolvedLanguage()
  const durationMs = Number.isFinite(ms) ? Math.max(0, ms) : 0
  return `${Math.round(durationMs)}${DURATION_UNITS[language].millisecond}`
}

/** Format an HTTP Retry-After value, preserving non-numeric HTTP dates. */
export function formatRetryAfter(
  retryAfter: string,
  options?: DurationLanguageOptions,
): string {
  const seconds = Number(retryAfter)
  if (!Number.isFinite(seconds) || seconds < 0) return retryAfter
  return formatDuration(seconds * 1000, {
    hideTrailingZeros: true,
    language: options?.language,
  })
}

export function formatDuration(
  ms: number,
  options?: {
    hideTrailingZeros?: boolean
    mostSignificantOnly?: boolean
    /** Explicit override for logs/protocols; display calls follow the UI language. */
    language?: ResolvedLanguage
  },
): string {
  const language = options?.language ?? getResolvedLanguage()
  const units = DURATION_UNITS[language]
  const durationMs = Number.isFinite(ms) ? Math.max(0, ms) : 0

  if (durationMs < 60000) {
    // Special case for 0
    if (durationMs === 0) {
      return `0${units.second}`
    }
    // Avoid displaying very short durations as a misleading "0.0s".
    if (durationMs < 100) {
      return `${Math.round(durationMs)}${units.millisecond}`
    }
    // For durations < 1s, show 1 decimal place (e.g., 0.5s)
    if (durationMs < 1000) {
      const s = (durationMs / 1000).toFixed(1)
      return `${s}${units.second}`
    }
    const s = Math.floor(durationMs / 1000).toString()
    return `${s}${units.second}`
  }

  let days = Math.floor(durationMs / 86400000)
  let hours = Math.floor((durationMs % 86400000) / 3600000)
  let minutes = Math.floor((durationMs % 3600000) / 60000)
  let seconds = Math.round((durationMs % 60000) / 1000)

  // Handle rounding carry-over (e.g., 59.5s rounds to 60s)
  if (seconds === 60) {
    seconds = 0
    minutes++
  }
  if (minutes === 60) {
    minutes = 0
    hours++
  }
  if (hours === 24) {
    hours = 0
    days++
  }

  const hide = options?.hideTrailingZeros

  if (options?.mostSignificantOnly) {
    if (days > 0) return `${days}${units.day}`
    if (hours > 0) return `${hours}${units.hour}`
    if (minutes > 0) return `${minutes}${units.minute}`
    return `${seconds}${units.second}`
  }

  if (days > 0) {
    if (hide && hours === 0 && minutes === 0) return `${days}${units.day}`
    if (hide && minutes === 0)
      return `${days}${units.day} ${hours}${units.hour}`
    return `${days}${units.day} ${hours}${units.hour} ${minutes}${units.minute}`
  }
  if (hours > 0) {
    if (hide && minutes === 0 && seconds === 0) return `${hours}${units.hour}`
    if (hide && seconds === 0)
      return `${hours}${units.hour} ${minutes}${units.minute}`
    return `${hours}${units.hour} ${minutes}${units.minute} ${seconds}${units.second}`
  }
  if (minutes > 0) {
    if (hide && seconds === 0) return `${minutes}${units.minute}`
    return `${minutes}${units.minute} ${seconds}${units.second}`
  }
  return `${seconds}${units.second}`
}

// `new Intl.NumberFormat` is expensive, so cache formatters for reuse
let numberFormatterForConsistentDecimals: Intl.NumberFormat | null = null
let numberFormatterForInconsistentDecimals: Intl.NumberFormat | null = null
let unabridgedTokenFormatter: Intl.NumberFormat | null = null
const getNumberFormatter = (
  useConsistentDecimals: boolean,
): Intl.NumberFormat => {
  if (useConsistentDecimals) {
    if (!numberFormatterForConsistentDecimals) {
      numberFormatterForConsistentDecimals = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })
    }
    return numberFormatterForConsistentDecimals
  } else {
    if (!numberFormatterForInconsistentDecimals) {
      numberFormatterForInconsistentDecimals = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      })
    }
    return numberFormatterForInconsistentDecimals
  }
}

export function formatNumber(number: number): string {
  // Only use minimumFractionDigits for numbers that will be shown in compact notation
  const shouldUseConsistentDecimals = number >= 1000

  return getNumberFormatter(shouldUseConsistentDecimals)
    .format(number) // eg. "1321" => "1.3K", "900" => "900"
    .toLowerCase() // eg. "1.3K" => "1.3k", "1.0K" => "1.0k"
}

export function formatTokens(count: number): string {
  return formatNumber(count).replace('.0', '')
}

/**
 * Formats a token count without compact notation (for example, 1400 ->
 * "1,400"). This only controls display; it does not change how the count was
 * measured or estimated.
 */
export function formatUnabridgedTokens(count: number): string {
  if (!unabridgedTokenFormatter) {
    unabridgedTokenFormatter = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
      useGrouping: true,
    })
  }

  const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0
  return unabridgedTokenFormatter.format(safeCount)
}

type RelativeTimeStyle = 'long' | 'short' | 'narrow'

type RelativeTimeOptions = {
  style?: RelativeTimeStyle
  numeric?: 'always' | 'auto'
  language?: ResolvedLanguage
}

export function formatRelativeTime(
  date: Date,
  options: RelativeTimeOptions & { now?: Date } = {},
): string {
  const {
    style = 'narrow',
    numeric = 'always',
    language = getResolvedLanguage(),
    now = new Date(),
  } = options
  const diffInMs = date.getTime() - now.getTime()
  // Use Math.trunc to truncate towards zero for both positive and negative values
  const diffInSeconds = Math.trunc(diffInMs / 1000)

  // Define time intervals with custom short units
  const intervals = [
    { unit: 'year', seconds: 31536000, shortUnit: 'y', zhUnit: '年' },
    { unit: 'month', seconds: 2592000, shortUnit: 'mo', zhUnit: '月' },
    { unit: 'week', seconds: 604800, shortUnit: 'w', zhUnit: '周' },
    { unit: 'day', seconds: 86400, shortUnit: 'd', zhUnit: '天' },
    { unit: 'hour', seconds: 3600, shortUnit: 'h', zhUnit: '时' },
    { unit: 'minute', seconds: 60, shortUnit: 'm', zhUnit: '分' },
    { unit: 'second', seconds: 1, shortUnit: 's', zhUnit: '秒' },
  ] as const

  // Find the appropriate unit
  for (const {
    unit,
    seconds: intervalSeconds,
    shortUnit,
    zhUnit,
  } of intervals) {
    if (Math.abs(diffInSeconds) >= intervalSeconds) {
      const value = Math.trunc(diffInSeconds / intervalSeconds)
      // For short style, use custom format
      if (style === 'narrow') {
        if (language === 'zh') {
          return diffInSeconds < 0
            ? `${Math.abs(value)}${zhUnit}前`
            : `${value}${zhUnit}后`
        }
        return diffInSeconds < 0
          ? `${Math.abs(value)}${shortUnit} ago`
          : `in ${value}${shortUnit}`
      }
      // For days and longer, use long style regardless of the style parameter
      return getRelativeTimeFormat(
        language === 'zh' ? 'zh-CN' : 'en',
        'long',
        numeric,
      ).format(value, unit)
    }
  }

  // For values less than 1 second
  if (style === 'narrow') {
    if (language === 'zh') return diffInSeconds <= 0 ? '0秒前' : '0秒后'
    return diffInSeconds <= 0 ? '0s ago' : 'in 0s'
  }
  return getRelativeTimeFormat(
    language === 'zh' ? 'zh-CN' : 'en',
    style,
    numeric,
  ).format(0, 'second')
}

export function formatRelativeTimeAgo(
  date: Date,
  options: RelativeTimeOptions & { now?: Date } = {},
): string {
  const { now = new Date(), ...restOptions } = options
  if (date > now) {
    // For future dates, just return the relative time without "ago"
    return formatRelativeTime(date, { ...restOptions, now })
  }

  // For past dates, force numeric: 'always' to ensure we get "X units ago"
  return formatRelativeTime(date, { ...restOptions, numeric: 'always', now })
}

/**
 * Formats log metadata for display (time, size or message count, branch, tag, PR)
 */
export function formatLogMetadata(
  log: {
    modified: Date
    messageCount: number
    fileSize?: number
    gitBranch?: string
    tag?: string
    agentSetting?: string
    prNumber?: number
    prRepository?: string
  },
  language: ResolvedLanguage = getResolvedLanguage(),
): string {
  const sizeOrCount =
    log.fileSize !== undefined
      ? formatFileSize(log.fileSize)
      : `${log.messageCount} messages`
  const parts = [
    formatRelativeTimeAgo(log.modified, { style: 'short', language }),
    ...(log.gitBranch ? [log.gitBranch] : []),
    sizeOrCount,
  ]
  if (log.tag) {
    parts.push(`#${log.tag}`)
  }
  if (log.agentSetting) {
    parts.push(`@${log.agentSetting}`)
  }
  if (log.prNumber) {
    parts.push(
      log.prRepository
        ? `${log.prRepository}#${log.prNumber}`
        : `#${log.prNumber}`,
    )
  }
  return parts.join(' · ')
}

export function formatResetTime(
  timestampInSeconds: number | undefined,
  showTimezone: boolean = false,
  showTime: boolean = true,
  locale: string = getDisplayDateLocale(),
): string | undefined {
  if (!timestampInSeconds) return undefined

  const date = new Date(timestampInSeconds * 1000)
  const now = new Date()
  const minutes = date.getMinutes()

  // Calculate hours until reset
  const hoursUntilReset = (date.getTime() - now.getTime()) / (1000 * 60 * 60)

  // If reset is more than 24 hours away, show the date as well
  if (hoursUntilReset > 24) {
    // Show date and time for resets more than a day away
    const dateOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: showTime ? 'numeric' : undefined,
      minute: !showTime || minutes === 0 ? undefined : '2-digit',
      hour12: showTime ? true : undefined,
    }

    // Add year if it's not the current year
    if (date.getFullYear() !== now.getFullYear()) {
      dateOptions.year = 'numeric'
    }

    const dateString = date.toLocaleString(locale, dateOptions)

    // Remove the space before AM/PM and make it lowercase (English output only;
    // the regex is a no-op for locales like zh-CN that don't emit " AM"/" PM").
    return (
      dateString.replace(/ ([AP]M)/i, (_match, ampm) => ampm.toLowerCase()) +
      (showTimezone ? ` (${getTimeZone()})` : '')
    )
  }

  // For resets within 24 hours, show just the time (existing behavior)
  const timeString = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: minutes === 0 ? undefined : '2-digit',
    hour12: true,
  })

  // Remove the space before AM/PM and make it lowercase, then add timezone
  return (
    timeString.replace(/ ([AP]M)/i, (_match, ampm) => ampm.toLowerCase()) +
    (showTimezone ? ` (${getTimeZone()})` : '')
  )
}

export function formatResetText(
  resetsAt: string,
  showTimezone: boolean = false,
  showTime: boolean = true,
  locale?: string,
): string {
  const dt = new Date(resetsAt)
  return `${formatResetTime(Math.floor(dt.getTime() / 1000), showTimezone, showTime, locale)}`
}

// Back-compat: truncate helpers moved to ./truncate.ts (needs ink/stringWidth)
export {
  truncate,
  truncatePathMiddle,
  truncateStartToWidth,
  truncateToWidth,
  truncateToWidthNoEllipsis,
  wrapText,
} from './truncate.js'
