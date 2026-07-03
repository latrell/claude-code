/**
 * Tests for ccbProviderAuth.ts — isolated provider credential storage.
 *
 * Uses a temp dir via CLAUDE_CONFIG_DIR so tests never touch the real
 * ~/.claude/ccb-provider-auth.json.
 */
import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Type-safe process.env access (strict TS)
// ---------------------------------------------------------------------------

type EnvLike = Record<string, string | undefined>

function _env(): EnvLike {
  return process.env as unknown as EnvLike
}

function envGet(key: string): string | undefined {
  return _env()[key]
}

function envSet(key: string, value: string): void {
  _env()[key] = value
}

function envDelete(key: string): void {
  delete _env()[key]
}

function envSnapshot(): EnvLike {
  return { ..._env() }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string

function setTempConfigDir(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'ccb-provider-auth-test-'))
  envSet('CLAUDE_CONFIG_DIR', tempDir)
}

function cleanupTempConfigDir(): void {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
  envDelete('CLAUDE_CONFIG_DIR')
}

// ---------------------------------------------------------------------------
// Mock side-effect modules before any imports of the module under test.
// ---------------------------------------------------------------------------
import { logMock } from '../../../tests/mocks/log'
mock.module('src/utils/log.ts', logMock)
import { debugMock } from '../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// ---------------------------------------------------------------------------
// Static import of the subject — must happen after mock.module registrations.
// ---------------------------------------------------------------------------
import {
  readCCBProviderAuthData,
  readCCBProviderAuthEnv,
  writeCCBProviderAuthEnv,
  injectCCBProviderAuthEnv,
} from '../ccbProviderAuth.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ccbProviderAuth storage', () => {
  beforeEach(() => {
    setTempConfigDir()
  })

  afterEach(() => {
    cleanupTempConfigDir()
  })

  describe('writeCCBProviderAuthEnv / readCCBProviderAuthEnv', () => {
    test('returns empty object for provider that was never written', () => {
      const env = readCCBProviderAuthEnv('openai')
      expect(env).toEqual({})
    })

    test('round-trips env vars for openai', () => {
      writeCCBProviderAuthEnv('openai', {
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      })
      const env = readCCBProviderAuthEnv('openai')
      expect(env).toEqual({
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      })
    })

    test('round-trips env vars for gemini', () => {
      writeCCBProviderAuthEnv('gemini', {
        GEMINI_API_KEY: 'AIza-test-gemini-key',
        GEMINI_BASE_URL: 'https://custom-gemini.example.com',
      })
      const env = readCCBProviderAuthEnv('gemini')
      expect(env).toEqual({
        GEMINI_API_KEY: 'AIza-test-gemini-key',
        GEMINI_BASE_URL: 'https://custom-gemini.example.com',
      })
    })

    test('round-trips env vars for grok', () => {
      writeCCBProviderAuthEnv('grok', {
        GROK_API_KEY: 'xai-test-key',
      })
      const env = readCCBProviderAuthEnv('grok')
      expect(env).toEqual({
        GROK_API_KEY: 'xai-test-key',
      })
    })

    test('filters out undefined and empty string values', () => {
      writeCCBProviderAuthEnv('openai', {
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: undefined,
        OPENAI_MODEL: 'gpt-4o',
      })
      const env = readCCBProviderAuthEnv('openai')
      expect(env).toEqual({ OPENAI_MODEL: 'gpt-4o' })
    })

    test('deletes provider entry when writing empty env', () => {
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-test' })
      expect(readCCBProviderAuthEnv('openai')).not.toEqual({})

      writeCCBProviderAuthEnv('openai', {})
      expect(readCCBProviderAuthEnv('openai')).toEqual({})
    })

    test('provider entries are independent', () => {
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-openai' })
      writeCCBProviderAuthEnv('gemini', { GEMINI_API_KEY: 'gem-key' })

      expect(readCCBProviderAuthEnv('openai')).toEqual({
        OPENAI_API_KEY: 'sk-openai',
      })
      expect(readCCBProviderAuthEnv('gemini')).toEqual({
        GEMINI_API_KEY: 'gem-key',
      })
      expect(readCCBProviderAuthEnv('grok')).toEqual({})
    })

    test('successive writes replace previous entries for same provider', () => {
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-first' })
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-second' })
      expect(readCCBProviderAuthEnv('openai')).toEqual({
        OPENAI_API_KEY: 'sk-second',
      })
    })
  })

  describe('readCCBProviderAuthData', () => {
    test('returns empty object when file does not exist', () => {
      const data = readCCBProviderAuthData()
      expect(data).toEqual({})
    })

    test('returns full data structure after writes', () => {
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-test' })
      writeCCBProviderAuthEnv('gemini', { GEMINI_API_KEY: 'gem-test' })

      const data = readCCBProviderAuthData()
      expect(data.openai?.env).toEqual({ OPENAI_API_KEY: 'sk-test' })
      expect(data.gemini?.env).toEqual({ GEMINI_API_KEY: 'gem-test' })
      expect(data.grok).toBeUndefined()
    })
  })

  describe('injectCCBProviderAuthEnv', () => {
    const origEnv = { ..._env() }

    beforeEach(() => {
      // Clean any provider-specific env vars
      for (const key of Object.keys(_env())) {
        if (
          key.startsWith('OPENAI_') ||
          key.startsWith('GEMINI_') ||
          key.startsWith('GROK_')
        ) {
          envDelete(key)
        }
      }
    })

    afterEach(() => {
      for (const key of Object.keys(_env())) {
        if (!(key in origEnv)) {
          envDelete(key)
        }
      }
      for (const [k, v] of Object.entries(origEnv)) {
        if (v !== undefined) {
          envSet(k, v)
        }
      }
    })

    test('does nothing when settingsModelType is undefined', () => {
      const before = envSnapshot()
      injectCCBProviderAuthEnv(undefined)
      expect(_env()).toEqual(before)
    })

    test('does nothing when settingsModelType is "anthropic" (first-party)', () => {
      const before = envSnapshot()
      injectCCBProviderAuthEnv('anthropic')
      expect(_env()).toEqual(before)
    })

    test('injects openai env when settingsModelType is "openai" and vars are not already set', () => {
      writeCCBProviderAuthEnv('openai', {
        OPENAI_API_KEY: 'sk-from-ccb',
        OPENAI_BASE_URL: 'https://from-ccb.example.com',
      })
      envDelete('OPENAI_API_KEY')
      envDelete('OPENAI_BASE_URL')

      injectCCBProviderAuthEnv('openai')

      expect(envGet('OPENAI_API_KEY')).toBe('sk-from-ccb')
      expect(envGet('OPENAI_BASE_URL')).toBe('https://from-ccb.example.com')
    })

    test('does NOT override existing process.env vars', () => {
      writeCCBProviderAuthEnv('openai', { OPENAI_API_KEY: 'sk-from-ccb' })
      envSet('OPENAI_API_KEY', 'sk-from-env')

      injectCCBProviderAuthEnv('openai')

      // process.env takes priority
      expect(envGet('OPENAI_API_KEY')).toBe('sk-from-env')
    })

    test('injects gemini env when settingsModelType is "gemini"', () => {
      writeCCBProviderAuthEnv('gemini', { GEMINI_API_KEY: 'gemini-from-ccb' })
      envDelete('GEMINI_API_KEY')

      injectCCBProviderAuthEnv('gemini')

      expect(envGet('GEMINI_API_KEY')).toBe('gemini-from-ccb')
    })

    test('injects grok env when settingsModelType is "grok"', () => {
      writeCCBProviderAuthEnv('grok', { GROK_API_KEY: 'grok-from-ccb' })
      envDelete('GROK_API_KEY')

      injectCCBProviderAuthEnv('grok')

      expect(envGet('GROK_API_KEY')).toBe('grok-from-ccb')
    })
  })
})
