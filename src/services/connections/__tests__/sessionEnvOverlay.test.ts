import { afterEach, describe, expect, test } from 'bun:test'
import {
  applySessionProviderEnvOverlay,
  getSessionProviderEnvOverlay,
  setSessionProviderEnvOverlay,
} from '../sessionEnvOverlay.js'

afterEach(() => {
  setSessionProviderEnvOverlay(null)
})

describe('setSessionProviderEnvOverlay / getSessionProviderEnvOverlay', () => {
  test('stores a copy of the delta and returns copies', () => {
    const delta: Record<string, string | undefined> = {
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_MODEL: undefined,
    }
    setSessionProviderEnvOverlay(delta)
    delta.OPENAI_BASE_URL = 'mutated'

    const stored = getSessionProviderEnvOverlay()
    expect(stored?.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(stored).toHaveProperty('OPENAI_MODEL', undefined)

    if (stored) stored.OPENAI_BASE_URL = 'mutated-again'
    expect(getSessionProviderEnvOverlay()?.OPENAI_BASE_URL).toBe(
      'https://api.deepseek.com',
    )
  })

  test('null clears the overlay', () => {
    setSessionProviderEnvOverlay({ OPENAI_API_KEY: 'sk-x' })
    setSessionProviderEnvOverlay(null)
    expect(getSessionProviderEnvOverlay()).toBeNull()
  })
})

describe('applySessionProviderEnvOverlay', () => {
  test('no-op when no overlay is recorded', () => {
    const target = { OPENAI_AUTH_MODE: 'chatgpt' } as NodeJS.ProcessEnv
    applySessionProviderEnvOverlay(target)
    expect(target.OPENAI_AUTH_MODE).toBe('chatgpt')
  })

  test('re-applies sets and deletions over a stomped env', () => {
    setSessionProviderEnvOverlay({
      OPENAI_AUTH_MODE: '',
      OPENAI_BASE_URL: 'https://api.deepseek.com',
      OPENAI_API_KEY: 'sk-deepseek',
      OPENAI_MODEL: undefined,
      OPENAI_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
    })

    // Simulate applyConfigEnvironmentVariables restoring a ChatGPT global
    // default: injectCCBProviderAuthEnv backfilled OPENAI_AUTH_MODE and a
    // settings.env Object.assign overwrote the endpoint.
    const target = {
      OPENAI_AUTH_MODE: 'chatgpt',
      OPENAI_BASE_URL: 'https://global.example.com',
      OPENAI_API_KEY: 'sk-global',
      OPENAI_MODEL: 'gpt-5.5',
      OPENAI_DEFAULT_SONNET_MODEL: 'gpt-5.5',
    } as NodeJS.ProcessEnv

    applySessionProviderEnvOverlay(target)

    expect(target.OPENAI_AUTH_MODE).toBe('')
    expect(target.OPENAI_BASE_URL).toBe('https://api.deepseek.com')
    expect(target.OPENAI_API_KEY).toBe('sk-deepseek')
    expect('OPENAI_MODEL' in target).toBe(false)
    expect(target.OPENAI_DEFAULT_SONNET_MODEL).toBe('deepseek-v4-pro')
  })

  test('leaves SSH tunnel vars alone when ANTHROPIC_UNIX_SOCKET is set', () => {
    setSessionProviderEnvOverlay({
      ANTHROPIC_BASE_URL: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-fable-5',
    })

    const target = {
      ANTHROPIC_UNIX_SOCKET: '/tmp/tunnel.sock',
      ANTHROPIC_BASE_URL: 'http://localhost:1',
      ANTHROPIC_AUTH_TOKEN: 'tunnel-token',
    } as NodeJS.ProcessEnv

    applySessionProviderEnvOverlay(target)

    expect(target.ANTHROPIC_BASE_URL).toBe('http://localhost:1')
    expect(target.ANTHROPIC_AUTH_TOKEN).toBe('tunnel-token')
    // Non-tunnel keys still apply
    expect(target.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-fable-5')
  })
})
