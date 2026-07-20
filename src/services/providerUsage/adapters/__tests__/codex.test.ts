import { describe, expect, test } from 'bun:test'
import {
  getCodexWindowKind,
  getCodexWindowLabel,
  hasCodexBaseRateLimitHeaders,
  parseCodexRateLimitEvent,
  parseCodexRateLimitHeaders,
} from '../codex.js'

describe('Codex provider usage adapter', () => {
  test('uses Codex window labels with the official five-percent tolerance', () => {
    expect(getCodexWindowLabel(300, false)).toBe('5h')
    expect(getCodexWindowLabel(1440, false)).toBe('daily')
    expect(getCodexWindowLabel(10080, true)).toBe('weekly')
    expect(getCodexWindowLabel(43200, false)).toBe('monthly')
    expect(getCodexWindowLabel(525600, false)).toBe('annual')
    expect(getCodexWindowLabel(285, false)).toBe('5h')
    expect(getCodexWindowLabel(315, false)).toBe('5h')
  })

  test('falls back to usage labels for unknown window durations', () => {
    expect(getCodexWindowLabel(120, false)).toBe('usage')
    expect(getCodexWindowLabel(120, true)).toBe('secondary usage')
    expect(getCodexWindowLabel(undefined, false)).toBe('usage')
  })

  test('only classifies five-hour and weekly windows into shared kinds', () => {
    expect(getCodexWindowKind(300)).toBe('session')
    expect(getCodexWindowKind(10080)).toBe('weekly')
    expect(getCodexWindowKind(1440)).toBe('custom')
    expect(getCodexWindowKind(43200)).toBe('custom')
    expect(getCodexWindowKind(180)).toBe('custom')
  })

  test('parses primary and secondary x-codex header windows', () => {
    const headers = new Headers({
      'x-codex-primary-used-percent': '40',
      'x-codex-primary-window-minutes': '300',
      'x-codex-primary-reset-at': '1800000000',
      'x-codex-secondary-used-percent': '94',
      'x-codex-secondary-window-minutes': '10080',
      'x-codex-secondary-reset-at': '1800500000',
    })

    expect(parseCodexRateLimitHeaders(headers)).toEqual([
      {
        kind: 'session',
        label: 'Primary rate limit',
        utilization: 0.4,
        windowMinutes: 300,
        resetsAt: 1800000000,
      },
      {
        kind: 'weekly',
        label: 'Secondary rate limit',
        utilization: 0.94,
        windowMinutes: 10080,
        resetsAt: 1800500000,
      },
    ])
  })

  test('parses named additional Codex header families after the base limit', () => {
    const headers = new Headers({
      'x-codex-primary-used-percent': '5',
      'x-codex-primary-window-minutes': '300',
      'x-codex-spark-limit-name': 'GPT-5.3-Codex-Spark',
      'x-codex-spark-primary-used-percent': '80',
      'x-codex-spark-primary-window-minutes': '1440',
    })

    const buckets = parseCodexRateLimitHeaders(headers)
    expect(buckets).toHaveLength(2)
    expect(buckets?.[0]?.label).toBe('Primary rate limit')
    expect(buckets?.[1]).toMatchObject({
      kind: 'custom',
      label: 'GPT-5.3-Codex-Spark',
      utilization: 0.8,
      windowMinutes: 1440,
    })
    const baseOnly = parseCodexRateLimitHeaders(headers, { baseOnly: true })
    expect(baseOnly).toHaveLength(1)
    expect(baseOnly?.[0]).toEqual(buckets?.[0])
  })

  test('cannot confuse an additional limit name with the base quota', () => {
    const headers = new Headers({
      'x-codex-spark-limit-name': 'Primary rate limit',
      'x-codex-spark-primary-used-percent': '80',
      'x-codex-spark-primary-window-minutes': '1440',
    })

    expect(parseCodexRateLimitHeaders(headers, { baseOnly: true })).toEqual([])
  })

  test('distinguishes absent headers from an explicit empty Codex family', () => {
    const absent = new Headers()
    const explicitEmpty = new Headers({
      'x-codex-primary-used-percent': '0',
    })
    expect(parseCodexRateLimitHeaders(absent)).toBeNull()
    expect(hasCodexBaseRateLimitHeaders(absent)).toBe(false)
    expect(hasCodexBaseRateLimitHeaders(explicitEmpty)).toBe(true)
    expect(parseCodexRateLimitHeaders(explicitEmpty)).toEqual([])
  })

  test('parses in-stream codex.rate_limits updates', () => {
    const buckets = parseCodexRateLimitEvent({
      type: 'codex.rate_limits',
      plan_type: 'pro',
      rate_limits: {
        primary: {
          used_percent: 40,
          window_minutes: 300,
          reset_at: 1800000000,
        },
        secondary: {
          used_percent: 94,
          window_minutes: 10080,
          reset_at: 1800500000,
        },
      },
    })

    expect(buckets).toHaveLength(2)
    expect(buckets?.[0]).toMatchObject({
      label: 'Primary rate limit',
      utilization: 0.4,
    })
    expect(buckets?.[1]).toMatchObject({
      label: 'Secondary rate limit',
      utilization: 0.94,
    })
  })

  test('ignores unrelated stream events', () => {
    expect(
      parseCodexRateLimitEvent({ type: 'response.output_text.delta' }),
    ).toBeUndefined()
  })
})
