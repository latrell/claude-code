import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { join } from 'path'

import { debugMock } from '../../../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

import {
  resolveCursorCredentials,
  clearCursorCredentialsCache,
  getCursorStateDbPath,
} from '../auth.js'

// A path that will never exist so the SQLite fallback is skipped and tests stay
// hermetic even on a machine with the Cursor IDE installed.
const NO_DB = join('/', 'definitely', 'no', 'cursor', 'state.vscdb')

describe('getCursorStateDbPath', () => {
  test('honours CURSOR_STATE_DB', () => {
    expect(getCursorStateDbPath({ CURSOR_STATE_DB: '/tmp/x.vscdb' })).toBe(
      '/tmp/x.vscdb',
    )
  })

  test('derives from CURSOR_CONFIG_DIR', () => {
    expect(getCursorStateDbPath({ CURSOR_CONFIG_DIR: '/cfg' })).toBe(
      join('/cfg', 'globalStorage', 'state.vscdb'),
    )
  })
})

describe('resolveCursorCredentials', () => {
  beforeEach(() => {
    clearCursorCredentialsCache()
  })

  test('reads token and machine id from env', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: {
        CURSOR_API_KEY: 'user::tok',
        CURSOR_MACHINE_ID: 'mach-1',
        CURSOR_STATE_DB: NO_DB,
      },
    })
    expect(creds.accessToken).toBe('user::tok')
    expect(creds.machineId).toBe('mach-1')
    expect(creds.ghostMode).toBe(true)
  })

  test('derives a machine id when none is provided', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: { CURSOR_ACCESS_TOKEN: 'tok2', CURSOR_STATE_DB: NO_DB },
    })
    expect(creds.accessToken).toBe('tok2')
    expect(creds.machineId).toMatch(/^[0-9a-f]{64}$/)
  })

  test('respects CURSOR_GHOST_MODE=false', async () => {
    const creds = await resolveCursorCredentials({
      envOverride: {
        CURSOR_API_KEY: 'tok',
        CURSOR_MACHINE_ID: 'm',
        CURSOR_GHOST_MODE: 'false',
        CURSOR_STATE_DB: NO_DB,
      },
    })
    expect(creds.ghostMode).toBe(false)
  })

  test('throws a descriptive error when no token is available', async () => {
    await expect(
      resolveCursorCredentials({ envOverride: { CURSOR_STATE_DB: NO_DB } }),
    ).rejects.toThrow(/No Cursor access token/)
  })
})
