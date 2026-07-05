import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
// Spread-real mock pattern (see CLAUDE.md cross-file mock pollution rules):
// real modules stay intact for later test files; overrides are gated on a
// flag that is reset in afterAll.
import * as realSecureStorage from '../../../utils/secureStorage/index.js'
import type { AccountInfo } from '../../../utils/config.js'

mock.module('src/utils/log.ts', logMock)

// ── In-memory secure storage, gated on _useMocks ─────────────────────────────

let _useMocks = false
let storageData: Record<string, unknown> | null = null

const memoryStorage = {
  name: 'memory',
  read: () => (storageData ? { ...storageData } : null),
  update: (data: Record<string, unknown>) => {
    storageData = { ...data }
    return { success: true }
  },
  delete: () => {
    storageData = null
    return true
  },
}

mock.module('src/utils/secureStorage/index.ts', () => ({
  ...realSecureStorage,
  getSecureStorage: () =>
    _useMocks ? memoryStorage : realSecureStorage.getSecureStorage(),
}))

const {
  _setOAuthConfigAccessForTest,
  activateOAuthAccountSlot,
  getActiveOAuthAccountUuid,
  listOAuthAccountSlots,
  removeOAuthAccountSlot,
  saveCurrentOAuthAccountToSlot,
} = await import('../oauthAccounts.js')

// config.ts is intentionally NOT mocked (mock.module for it deadlocks later
// dynamic imports of the command registry on this repo) — the oauthAccounts
// module exposes a test seam for the oauthAccount read/write path instead.
let oauthAccount: AccountInfo | undefined
_setOAuthConfigAccessForTest({
  getAccount: () => oauthAccount,
  setAccount: value => {
    oauthAccount = value
  },
})

afterAll(() => {
  _useMocks = false
  _setOAuthConfigAccessForTest(null)
})

function tokens(access: string) {
  return {
    accessToken: access,
    refreshToken: `refresh-${access}`,
    expiresAt: Date.now() + 3600_000,
    scopes: ['user:inference', 'user:profile'],
    subscriptionType: 'max',
    rateLimitTier: null,
  }
}

function account(uuid: string, email: string): AccountInfo {
  return { accountUuid: uuid, emailAddress: email }
}

function setOauthAccount(value: AccountInfo | undefined) {
  oauthAccount = value
}

beforeEach(() => {
  _useMocks = true
  storageData = null
  setOauthAccount(undefined)
})

describe('saveCurrentOAuthAccountToSlot', () => {
  test('returns null when no oauth account in global config', () => {
    storageData = { claudeAiOauth: tokens('a') }
    expect(saveCurrentOAuthAccountToSlot()).toBeNull()
  })

  test('returns null for inference-only tokens (no refreshToken)', () => {
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = {
      claudeAiOauth: { ...tokens('a'), refreshToken: null },
    }
    expect(saveCurrentOAuthAccountToSlot()).toBeNull()
  })

  test('snapshots the active credential into its accountUuid slot', () => {
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = { claudeAiOauth: tokens('a') }

    expect(saveCurrentOAuthAccountToSlot()).toBe('u1')

    const slots = listOAuthAccountSlots()
    expect(Object.keys(slots)).toEqual(['u1'])
    expect(slots['u1']?.tokens.accessToken).toBe('a')
    expect(slots['u1']?.account.emailAddress).toBe('a@x.com')
    // Active mirror untouched
    expect(
      (storageData as Record<string, { accessToken?: string }>)['claudeAiOauth']
        ?.accessToken,
    ).toBe('a')
  })
})

describe('activateOAuthAccountSlot', () => {
  test('fails for unknown slot', () => {
    const result = activateOAuthAccountSlot('missing')
    expect(result.success).toBe(false)
    expect(result.error).toContain('missing')
  })

  test('activates a slot and snapshots the outgoing account', () => {
    // Account u1 currently active; u2 stored as a slot
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = {
      claudeAiOauth: tokens('a-fresh'),
      claudeAiOauthAccounts: {
        u2: {
          tokens: tokens('b'),
          account: account('u2', 'b@x.com'),
          savedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }

    const result = activateOAuthAccountSlot('u2')
    expect(result.success).toBe(true)

    // Active mirror now holds u2's tokens; global config points at u2
    const data = storageData as Record<string, unknown>
    expect((data['claudeAiOauth'] as { accessToken: string }).accessToken).toBe(
      'b',
    )
    expect(getActiveOAuthAccountUuid()).toBe('u2')

    // Outgoing u1 credential was snapshotted into its own slot
    const slots = listOAuthAccountSlots()
    expect(slots['u1']?.tokens.accessToken).toBe('a-fresh')
    expect(slots['u2']?.tokens.accessToken).toBe('b')
  })

  test('re-activating the current account does not drop its slot', () => {
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = {
      claudeAiOauth: tokens('a'),
      claudeAiOauthAccounts: {
        u1: {
          tokens: tokens('a'),
          account: account('u1', 'a@x.com'),
          savedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }
    const result = activateOAuthAccountSlot('u1')
    expect(result.success).toBe(true)
    expect(listOAuthAccountSlots()['u1']).toBeDefined()
    expect(getActiveOAuthAccountUuid()).toBe('u1')
  })
})

describe('removeOAuthAccountSlot', () => {
  test('removes a non-active slot without touching the active mirror', () => {
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = {
      claudeAiOauth: tokens('a'),
      claudeAiOauthAccounts: {
        u1: {
          tokens: tokens('a'),
          account: account('u1', 'a@x.com'),
          savedAt: 'x',
        },
        u2: {
          tokens: tokens('b'),
          account: account('u2', 'b@x.com'),
          savedAt: 'x',
        },
      },
    }

    removeOAuthAccountSlot('u2')

    expect(listOAuthAccountSlots()['u2']).toBeUndefined()
    expect(listOAuthAccountSlots()['u1']).toBeDefined()
    expect(
      (storageData as Record<string, unknown>)['claudeAiOauth'],
    ).toBeDefined()
    expect(getActiveOAuthAccountUuid()).toBe('u1')
  })

  test('removing the active slot clears the active mirror and config', () => {
    setOauthAccount(account('u1', 'a@x.com'))
    storageData = {
      claudeAiOauth: tokens('a'),
      claudeAiOauthAccounts: {
        u1: {
          tokens: tokens('a'),
          account: account('u1', 'a@x.com'),
          savedAt: 'x',
        },
      },
    }

    removeOAuthAccountSlot('u1')

    expect(listOAuthAccountSlots()).toEqual({})
    expect(
      (storageData as Record<string, unknown>)['claudeAiOauth'],
    ).toBeUndefined()
    expect(getActiveOAuthAccountUuid()).toBeUndefined()
  })

  test('is idempotent for unknown slots', () => {
    storageData = { claudeAiOauth: tokens('a') }
    removeOAuthAccountSlot('nope')
    expect(
      (storageData as Record<string, unknown>)['claudeAiOauth'],
    ).toBeDefined()
  })
})

describe('listOAuthAccountSlots', () => {
  test('drops malformed slot entries', () => {
    storageData = {
      claudeAiOauthAccounts: {
        good: {
          tokens: tokens('a'),
          account: account('good', 'g@x.com'),
          savedAt: 'x',
        },
        bad1: { tokens: {} },
        bad2: 'not-an-object',
      },
    }
    const slots = listOAuthAccountSlots()
    expect(Object.keys(slots)).toEqual(['good'])
  })

  test('returns empty object when storage is empty', () => {
    storageData = null
    expect(listOAuthAccountSlots()).toEqual({})
  })
})
