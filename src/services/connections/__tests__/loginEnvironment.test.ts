import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  beginProviderUsagePublication,
  getProviderUsage,
  publishProviderBuckets,
  resetProviderUsage,
  updateProviderBuckets,
} from '../../providerUsage/store.js'
import {
  getChatGPTSubscriptionPlan,
  setChatGPTSubscriptionPlan,
} from '../../../bootstrap/state.js'
import { currentLimits, emitStatusChange } from '../../claudeAiLimits.js'
import { applyMainProviderLoginEnvironment } from '../loginEnvironment.js'

describe('applyMainProviderLoginEnvironment', () => {
  const originalOpenAIAuthMode = process.env.OPENAI_AUTH_MODE
  const originalOpenAIAPIKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    resetProviderUsage()
    setChatGPTSubscriptionPlan(null)
  })

  afterEach(() => {
    if (originalOpenAIAuthMode === undefined) {
      delete process.env.OPENAI_AUTH_MODE
    } else {
      process.env.OPENAI_AUTH_MODE = originalOpenAIAuthMode
    }
    if (originalOpenAIAPIKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIAPIKey
    }
    resetProviderUsage()
    setChatGPTSubscriptionPlan(null)
  })

  test('clears old usage and rejects its delayed publication on provider login', () => {
    const oldPublication = beginProviderUsagePublication()
    updateProviderBuckets('openai', [
      { kind: 'session', label: 'Old account', utilization: 0.8 },
    ])
    setChatGPTSubscriptionPlan('pro')
    emitStatusChange({
      status: 'rejected',
      unifiedRateLimitFallbackAvailable: false,
      isUsingOverage: false,
    })
    const refresh = mock(() => {})

    applyMainProviderLoginEnvironment(
      {
        OPENAI_AUTH_MODE: undefined,
        OPENAI_API_KEY: 'new-api-key',
      },
      refresh,
    )

    expect(getProviderUsage()).toEqual({ providerId: 'unknown', buckets: [] })
    expect(getChatGPTSubscriptionPlan()).toBeNull()
    expect(currentLimits.status).toBe('allowed')
    expect(process.env.OPENAI_AUTH_MODE).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBe('new-api-key')
    expect(refresh).not.toHaveBeenCalled()
    expect(
      publishProviderBuckets(oldPublication, 'openai', [
        { kind: 'session', label: 'Stale account', utilization: 0.9 },
      ]),
    ).toBe(false)
  })

  test('starts an immediate usage refresh for the new ChatGPT login', () => {
    const refresh = mock(() => {})

    applyMainProviderLoginEnvironment(
      {
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_API_KEY: undefined,
      },
      refresh,
    )

    expect(process.env.OPENAI_AUTH_MODE).toBe('chatgpt')
    expect(process.env.OPENAI_API_KEY).toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
