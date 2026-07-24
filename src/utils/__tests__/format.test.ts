import { describe, expect, test } from 'bun:test'
import {
  formatFileSize,
  formatDuration,
  formatMillisecondsShort,
  formatNumber,
  formatRetryAfter,
  formatSecondsShort,
  formatRelativeTime,
  formatRelativeTimeAgo,
  formatLogMetadata,
  formatResetText,
  formatResetTime,
  formatTokens,
} from '../format'
import { getResolvedLanguage } from '../language.js'

describe('formatFileSize', () => {
  test('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 bytes')
  })

  test('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5KB')
  })

  test('formats megabytes', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5MB')
  })

  test('formats gigabytes', () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2GB')
  })

  test('removes trailing .0', () => {
    expect(formatFileSize(1024)).toBe('1KB')
  })
})

describe('formatSecondsShort', () => {
  test('formats milliseconds to seconds', () => {
    expect(formatSecondsShort(1234, { language: 'en' })).toBe('1.2s')
  })

  test('formats zero', () => {
    expect(formatSecondsShort(0, { language: 'en' })).toBe('0.0s')
  })

  test('formats sub-second', () => {
    expect(formatSecondsShort(500, { language: 'en' })).toBe('0.5s')
  })

  test('formats seconds with Chinese units', () => {
    expect(formatSecondsShort(1234, { language: 'zh' })).toBe('1.2秒')
  })
})

describe('formatMillisecondsShort', () => {
  test('formats milliseconds with English and Chinese units', () => {
    expect(formatMillisecondsShort(499.6, { language: 'en' })).toBe('500ms')
    expect(formatMillisecondsShort(499.6, { language: 'zh' })).toBe('500毫秒')
  })
})

describe('formatRetryAfter', () => {
  test('formats numeric seconds and preserves HTTP dates', () => {
    expect(formatRetryAfter('3661', { language: 'en' })).toBe('1h 1m 1s')
    expect(formatRetryAfter('3661', { language: 'zh' })).toBe('1时 1分 1秒')
    expect(formatRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT')).toBe(
      'Wed, 21 Oct 2015 07:28:00 GMT',
    )
  })
})

describe('formatDuration', () => {
  test('formats 0 as 0s', () => {
    expect(formatDuration(0, { language: 'en' })).toBe('0s')
  })

  test('formats seconds', () => {
    expect(formatDuration(5000, { language: 'en' })).toBe('5s')
  })

  test('formats sub-second durations and normalizes invalid values', () => {
    expect(formatDuration(1, { language: 'en' })).toBe('1ms')
    expect(formatDuration(1, { language: 'zh' })).toBe('1毫秒')
    expect(formatDuration(500, { language: 'en' })).toBe('0.5s')
    expect(formatDuration(500, { language: 'zh' })).toBe('0.5秒')
    expect(formatDuration(-1, { language: 'en' })).toBe('0s')
    expect(formatDuration(Number.NaN, { language: 'zh' })).toBe('0秒')
  })

  test('formats minutes and seconds', () => {
    expect(formatDuration(125000, { language: 'en' })).toBe('2m 5s')
  })

  test('formats minutes and seconds with Chinese units', () => {
    expect(formatDuration(21 * 60_000 + 42_000, { language: 'zh' })).toBe(
      '21分 42秒',
    )
  })

  test('formats all duration components with Chinese units', () => {
    expect(formatDuration(0, { language: 'zh' })).toBe('0秒')
    expect(formatDuration(3661000, { language: 'zh' })).toBe('1时 1分 1秒')
    expect(formatDuration(90000000, { language: 'zh' })).toBe('1天 1时 0分')
  })

  test('formats hours', () => {
    expect(formatDuration(3661000, { language: 'en' })).toBe('1h 1m 1s')
  })

  test('formats days', () => {
    expect(formatDuration(90000000, { language: 'en' })).toBe('1d 1h 0m')
  })

  test('hideTrailingZeros removes zero components', () => {
    expect(
      formatDuration(3600000, {
        hideTrailingZeros: true,
        language: 'en',
      }),
    ).toBe('1h')
    expect(
      formatDuration(60000, {
        hideTrailingZeros: true,
        language: 'en',
      }),
    ).toBe('1m')
    expect(
      formatDuration(3600000, {
        hideTrailingZeros: true,
        language: 'zh',
      }),
    ).toBe('1时')
  })

  test('mostSignificantOnly returns largest unit', () => {
    expect(
      formatDuration(90000000, {
        mostSignificantOnly: true,
        language: 'en',
      }),
    ).toBe('1d')
    expect(
      formatDuration(3661000, {
        mostSignificantOnly: true,
        language: 'en',
      }),
    ).toBe('1h')
    expect(
      formatDuration(3661000, {
        mostSignificantOnly: true,
        language: 'zh',
      }),
    ).toBe('1时')
  })

  test('uses the resolved UI language by default', () => {
    expect(formatDuration(21 * 60_000 + 42_000)).toBe(
      getResolvedLanguage() === 'zh' ? '21分 42秒' : '21m 42s',
    )
  })
})

describe('formatNumber', () => {
  test('formats small numbers as-is', () => {
    expect(formatNumber(900)).toBe('900')
  })

  test('formats thousands with k suffix', () => {
    expect(formatNumber(1321)).toBe('1.3k')
  })

  test('formats millions', () => {
    expect(formatNumber(1500000)).toBe('1.5m')
  })

  test('formats 0 as-is', () => {
    expect(formatNumber(0)).toBe('0')
  })

  test('formats billions', () => {
    expect(formatNumber(1500000000)).toBe('1.5b')
  })
})

describe('formatTokens', () => {
  test('removes .0 from formatted number', () => {
    expect(formatTokens(1000)).toBe('1k')
  })

  test('formats small numbers', () => {
    expect(formatTokens(500)).toBe('500')
  })

  test('formats 1000 without .0', () => {
    expect(formatTokens(1000)).toBe('1k')
  })

  test('formats 1500 as 1.5k', () => {
    expect(formatTokens(1500)).toBe('1.5k')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-01-15T12:00:00Z')

  test('formats seconds ago', () => {
    const date = new Date('2026-01-15T11:59:30Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('30s ago')
  })

  test('formats minutes ago', () => {
    const date = new Date('2026-01-15T11:55:00Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('5m ago')
  })

  test('formats future time', () => {
    const date = new Date('2026-01-15T13:00:00Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('in 1h')
  })

  test('handles zero difference', () => {
    expect(formatRelativeTime(now, { now, language: 'en' })).toBe('0s ago')
  })

  test('formats hours ago', () => {
    const date = new Date('2026-01-15T09:00:00Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('3h ago')
  })

  test('formats days ago', () => {
    const date = new Date('2026-01-13T12:00:00Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('2d ago')
  })

  test('formats weeks ago', () => {
    const date = new Date('2026-01-01T12:00:00Z')
    expect(formatRelativeTime(date, { now, language: 'en' })).toBe('2w ago')
  })

  test('formats compact Chinese past and future units', () => {
    expect(
      formatRelativeTime(new Date('2026-01-15T09:00:00Z'), {
        now,
        language: 'zh',
      }),
    ).toBe('3时前')
    expect(
      formatRelativeTime(new Date('2026-01-15T12:05:00Z'), {
        now,
        language: 'zh',
      }),
    ).toBe('5分后')
  })
})

describe('formatRelativeTimeAgo', () => {
  const now = new Date('2026-01-15T12:00:00Z')

  test("formats past date with 'ago' suffix", () => {
    const date = new Date('2026-01-15T11:59:30Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toBe('30s ago')
  })

  test("formats future date without 'ago' suffix", () => {
    const date = new Date('2026-01-15T13:00:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toBe('in 1h')
  })

  test('formats minutes ago', () => {
    const date = new Date('2026-01-15T11:55:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toBe('5m ago')
  })

  test('formats hours ago', () => {
    const date = new Date('2026-01-15T09:00:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toBe('3h ago')
  })

  test('formats days ago', () => {
    const date = new Date('2026-01-13T12:00:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toBe('2d ago')
  })

  test('handles date equal to now as past', () => {
    // date === now, treated as past (not future)
    const result = formatRelativeTimeAgo(now, { now, language: 'en' })
    expect(result).toBe('0s ago')
  })

  test('uses numeric always for past dates', () => {
    // Should always use numeric format for past dates
    const date = new Date('2026-01-15T11:59:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).toContain('ago')
  })

  test("future date does not contain 'ago'", () => {
    const date = new Date('2026-01-15T14:00:00Z')
    const result = formatRelativeTimeAgo(date, { now, language: 'en' })
    expect(result).not.toContain('ago')
  })
})

describe('formatLogMetadata', () => {
  // Use a date very recently in the past so it always shows "Xs ago" or similar
  const modified = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago

  test('includes relative time and message count', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 10,
      },
      'en',
    )
    expect(result).toContain('ago')
    expect(result).toContain('10 messages')
  })

  test('uses fileSize instead of messageCount when provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 5,
        fileSize: 1536,
      },
      'en',
    )
    expect(result).toContain('1.5KB')
    expect(result).not.toContain('messages')
  })

  test('includes gitBranch when provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
        gitBranch: 'main',
      },
      'en',
    )
    expect(result).toContain('main')
  })

  test('omits gitBranch when not provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
      },
      'en',
    )
    // Should not have a dangling separator from missing branch
    expect(result).not.toMatch(/^ · | · $/)
  })

  test('includes tag when provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
        tag: 'my-tag',
      },
      'en',
    )
    expect(result).toContain('#my-tag')
  })

  test('includes agentSetting when provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
        agentSetting: 'custom-agent',
      },
      'en',
    )
    expect(result).toContain('@custom-agent')
  })

  test('includes prNumber when provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
        prNumber: 42,
      },
      'en',
    )
    expect(result).toContain('#42')
  })

  test('includes prRepository with prNumber when both provided', () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 3,
        prNumber: 99,
        prRepository: 'owner/repo',
      },
      'en',
    )
    expect(result).toContain('owner/repo#99')
  })

  test("parts are joined with ' · ' separator", () => {
    const result = formatLogMetadata(
      {
        modified,
        messageCount: 5,
        gitBranch: 'feat/x',
      },
      'en',
    )
    expect(result).toContain(' · ')
  })
})

describe('formatResetTime / formatResetText locale', () => {
  // A reset comfortably more than 24h out so the date branch is exercised
  // regardless of when the test runs.
  const farFuture = Math.floor((Date.now() + 60 * 86_400_000) / 1000)
  const farFutureIso = new Date(farFuture * 1000).toISOString()

  test('renders the reset date in Chinese when locale is zh-CN', () => {
    const zh = formatResetTime(farFuture, false, false, 'zh-CN')
    expect(zh).toContain('月')
    expect(zh).toContain('日')
  })

  test('renders the reset date in English when locale is en-US', () => {
    const en = formatResetTime(farFuture, false, false, 'en-US')
    // e.g. "Aug 5" — a 3-letter month abbreviation followed by a day number.
    expect(en).toMatch(/^[A-Z][a-z]{2}\s+\d+/)
  })

  test('appends the timezone in parentheses when requested', () => {
    const withTz = formatResetTime(farFuture, true, false, 'en-US')
    expect(withTz).toMatch(/\(.+\)$/)
  })

  test('formatResetText threads the locale through to the date format', () => {
    expect(formatResetText(farFutureIso, false, false, 'zh-CN')).toContain('月')
    expect(formatResetText(farFutureIso, false, false, 'en-US')).toMatch(
      /^[A-Z][a-z]{2}\s+\d+/,
    )
  })
})
