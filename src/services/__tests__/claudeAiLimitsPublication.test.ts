import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  beginClaudeAiLimitsPublication,
  currentLimits,
  emitStatusChange,
  extractQuotaStatusFromHeaders,
  resetClaudeAiLimits,
} from '../claudeAiLimits.js'

describe('Claude AI limit publication generation', () => {
  beforeEach(() => {
    resetClaudeAiLimits()
  })

  afterEach(() => {
    resetClaudeAiLimits()
  })

  test('rejects quota headers captured before a connection reset', () => {
    const stalePublication = beginClaudeAiLimitsPublication()
    resetClaudeAiLimits()
    emitStatusChange({
      status: 'rejected',
      unifiedRateLimitFallbackAvailable: false,
      isUsingOverage: false,
    })

    extractQuotaStatusFromHeaders(
      new Headers({
        'anthropic-ratelimit-unified-5h-utilization': '0.9',
        'anthropic-ratelimit-unified-5h-reset': '1800000000',
      }),
      stalePublication,
    )

    expect(currentLimits.status).toBe('rejected')
  })
})
