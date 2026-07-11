import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// MACRO is a build-time define injected by `bun --define` (see
// scripts/dev.ts → -d flags). getUserAgent() reads MACRO.VERSION at runtime;
// set it on globalThis so the bare identifier resolves in tests.
;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

const { getAnthropicClient } = await import('../client.js')

const ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]

let savedEnv: Record<string, string | undefined> = {}
let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-client-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

type ClientCredentials = {
  apiKey: string | null
  authToken: string | null
  baseURL: string
}

function credentialsOf(client: unknown): ClientCredentials {
  const c = client as {
    apiKey: string | null
    authToken: string | null
    baseURL: string
  }
  return { apiKey: c.apiKey, authToken: c.authToken, baseURL: c.baseURL }
}

describe('getAnthropicClient envOverride credential isolation', () => {
  test('credential-bearing override pins authToken/baseURL — main env never leaks', async () => {
    // Main session: an anthropic-api relay deployed into process.env.
    process.env.ANTHROPIC_AUTH_TOKEN = 'MAIN-RELAY-SECRET'
    process.env.ANTHROPIC_BASE_URL = 'https://main-relay.example.com'

    const client = await getAnthropicClient({
      maxRetries: 0,
      envOverride: {
        ANTHROPIC_AUTH_TOKEN: 'FAST-TOKEN',
        ANTHROPIC_BASE_URL: 'https://fast-endpoint.example.com',
      },
    })

    const creds = credentialsOf(client)
    expect(creds.authToken).toBe('FAST-TOKEN')
    expect(creds.baseURL).toBe('https://fast-endpoint.example.com')
    expect(creds.apiKey).toBeNull()
  })

  test('api-key-only override never carries the main bearer token', async () => {
    // Regression: the Anthropic SDK constructor falls back to
    // process.env.ANTHROPIC_AUTH_TOKEN when authToken is not passed
    // explicitly — the main relay secret must not be sent to the fast
    // connection's third-party endpoint.
    process.env.ANTHROPIC_AUTH_TOKEN = 'MAIN-RELAY-SECRET'
    process.env.ANTHROPIC_BASE_URL = 'https://main-relay.example.com'

    const client = await getAnthropicClient({
      maxRetries: 0,
      envOverride: {
        ANTHROPIC_API_KEY: 'FAST-API-KEY',
        ANTHROPIC_BASE_URL: 'https://fast-endpoint.example.com',
      },
    })

    const creds = credentialsOf(client)
    expect(creds.apiKey).toBe('FAST-API-KEY')
    expect(creds.authToken).toBeNull()
    expect(creds.baseURL).toBe('https://fast-endpoint.example.com')
  })

  test('override without a base URL pins the official endpoint (no env fallback)', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://main-relay.example.com'

    const client = await getAnthropicClient({
      maxRetries: 0,
      envOverride: { ANTHROPIC_AUTH_TOKEN: 'FAST-TOKEN' },
    })

    expect(credentialsOf(client).baseURL).toBe('https://api.anthropic.com')
  })

  test('model-only override (no credential keys) shares main-session credentials', async () => {
    // An anthropic-oauth fast/subagent profile only carries the model
    // routing variable — it must NOT trigger the credential takeover, so
    // HAIKU calls keep using the main session's credentials.
    process.env.ANTHROPIC_API_KEY = 'MAIN-API-KEY'
    process.env.ANTHROPIC_BASE_URL = 'https://main-relay.example.com'

    const client = await getAnthropicClient({
      maxRetries: 0,
      envOverride: { CLAUDE_CODE_FAST_MODEL: 'claude-haiku-4-5' },
    })

    const creds = credentialsOf(client)
    // Plain main path: the main API key resolves via getAnthropicApiKey()
    // and the base URL via the SDK env fallback — intentionally shared.
    expect(creds.apiKey).toBe('MAIN-API-KEY')
    expect(creds.baseURL).toBe('https://main-relay.example.com')
  })

  test('credential-bearing override drops main-session custom headers', async () => {
    process.env.ANTHROPIC_CUSTOM_HEADERS = 'Authorization: Bearer MAIN-CUSTOM'

    const client = await getAnthropicClient({
      maxRetries: 0,
      envOverride: {
        ANTHROPIC_AUTH_TOKEN: 'FAST-TOKEN',
        ANTHROPIC_BASE_URL: 'https://fast-endpoint.example.com',
      },
    })

    const options = (
      client as unknown as {
        _options?: { defaultHeaders?: Record<string, string> }
      }
    )._options
    const headerEntries = Object.entries(options?.defaultHeaders ?? {})
    const authorizationValues = headerEntries
      .filter(([key]) => key.toLowerCase() === 'authorization')
      .map(([, value]) => value)
    expect(authorizationValues).not.toContain('Bearer MAIN-CUSTOM')
  })
})
