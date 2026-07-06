import { describe, expect, test } from 'bun:test'
import {
  buildCursorConnectHeaders,
  generateCursorChecksum,
  getCursorClientVersion,
  normalizeCursorAccessToken,
} from '../clientPolicy.js'

describe('normalizeCursorAccessToken', () => {
  test('strips the userId prefix before ::', () => {
    expect(normalizeCursorAccessToken('user_123::jwt-token')).toBe('jwt-token')
  })

  test('returns the token unchanged when no delimiter', () => {
    expect(normalizeCursorAccessToken('jwt-token')).toBe('jwt-token')
  })
})

describe('generateCursorChecksum', () => {
  test('is deterministic for the same machine id and time', () => {
    const a = generateCursorChecksum('machine-abc', 1_700_000_000_000)
    const b = generateCursorChecksum('machine-abc', 1_700_000_000_000)
    expect(a).toBe(b)
  })

  test('ends with the machine id', () => {
    const checksum = generateCursorChecksum('machine-abc', 1_700_000_000_000)
    expect(checksum.endsWith('machine-abc')).toBe(true)
  })

  test('changes with time', () => {
    const a = generateCursorChecksum('m', 1_700_000_000_000)
    const b = generateCursorChecksum('m', 1_800_000_000_000)
    expect(a).not.toBe(b)
  })

  test('throws without a machine id', () => {
    expect(() => generateCursorChecksum('')).toThrow()
  })
})

describe('getCursorClientVersion', () => {
  test('honours CURSOR_CLIENT_VERSION override', () => {
    expect(getCursorClientVersion({ CURSOR_CLIENT_VERSION: '9.9.9' })).toBe(
      '9.9.9',
    )
  })

  test('falls back to a default', () => {
    expect(getCursorClientVersion({})).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('buildCursorConnectHeaders', () => {
  test('builds ConnectRPC identity headers from credentials', () => {
    const headers = buildCursorConnectHeaders(
      { accessToken: 'user::secret-jwt', machineId: 'mach-1' },
      { CURSOR_CLIENT_VERSION: '2.6.22' },
    )
    expect(headers.authorization).toBe('Bearer secret-jwt')
    expect(headers['x-cursor-client-version']).toBe('2.6.22')
    expect(headers['content-type']).toBe('application/connect+proto')
    expect(headers['connect-protocol-version']).toBe('1')
    expect(headers['x-cursor-checksum'].endsWith('mach-1')).toBe(true)
    expect(headers['x-cursor-client-type']).toBe('ide')
  })

  test('throws when access token is empty', () => {
    expect(() =>
      buildCursorConnectHeaders({ accessToken: '', machineId: 'm' }),
    ).toThrow()
  })
})
