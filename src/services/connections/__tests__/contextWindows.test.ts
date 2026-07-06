import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logMock } from '../../../../tests/mocks/log'

// Must mock log before any import that transitively loads log.ts
mock.module('src/utils/log.ts', logMock)

const {
  formatContextWindow,
  getConnectionContextWindow,
  getModelContextWindowForConnection,
  parseContextWindowInput,
  recordAutoDetectedContextWindows,
  setManualContextWindow,
} = await import('../contextWindows.js')
const { setSessionAssignment } = await import('../sessionAssignments.js')
const {
  _invalidateConnectionsCache,
  findConnection,
  setDefaultAssignment,
  upsertConnection,
} = await import('../store.js')
import type { Connection } from '../types.js'

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-ctx-windows-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
  setSessionAssignment('main', undefined)
  setSessionAssignment('subagent', undefined)
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  setSessionAssignment('main', undefined)
  setSessionAssignment('subagent', undefined)
  rmSync(tmpDir, { recursive: true, force: true })
})

function conn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'remote-a',
    label: 'Remote A',
    kind: 'openai-compat',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-a',
    ...overrides,
  }
}

describe('parseContextWindowInput', () => {
  test('parses plain token counts', () => {
    expect(parseContextWindowInput('200000')).toBe(200_000)
    expect(parseContextWindowInput(' 131072 ')).toBe(131_072)
    expect(parseContextWindowInput('1,048,576')).toBe(1_048_576)
  })

  test('parses K/M shorthand case-insensitively', () => {
    expect(parseContextWindowInput('128K')).toBe(128_000)
    expect(parseContextWindowInput('128k')).toBe(128_000)
    expect(parseContextWindowInput('1M')).toBe(1_000_000)
    expect(parseContextWindowInput('1.5m')).toBe(1_500_000)
    expect(parseContextWindowInput('203K')).toBe(203_000)
  })

  test('rejects invalid or out-of-range input', () => {
    expect(parseContextWindowInput('')).toBeUndefined()
    expect(parseContextWindowInput('abc')).toBeUndefined()
    expect(parseContextWindowInput('-5000')).toBeUndefined()
    expect(parseContextWindowInput('12x')).toBeUndefined()
    expect(parseContextWindowInput('42')).toBeUndefined() // below 1k floor
    expect(parseContextWindowInput('999999M')).toBeUndefined() // above cap
  })
})

describe('formatContextWindow', () => {
  test('formats K and M values compactly', () => {
    expect(formatContextWindow(200_000)).toBe('200K')
    expect(formatContextWindow(131_072)).toBe('131K')
    expect(formatContextWindow(1_000_000)).toBe('1M')
    expect(formatContextWindow(1_048_576)).toBe('1M')
    expect(formatContextWindow(1_500_000)).toBe('1.5M')
    expect(formatContextWindow(10_000_000)).toBe('10M')
  })
})

describe('getModelContextWindowForConnection', () => {
  test('reads explicit entries with their source', () => {
    const c = conn({
      modelContextWindows: {
        'model-a': { tokens: 1_000_000, source: 'auto' },
        'model-b': { tokens: 131_072, source: 'manual' },
      },
    })
    expect(getModelContextWindowForConnection(c, 'model-a')).toEqual({
      tokens: 1_000_000,
      source: 'auto',
    })
    expect(getModelContextWindowForConnection(c, 'model-b')).toEqual({
      tokens: 131_072,
      source: 'manual',
    })
    expect(getModelContextWindowForConnection(c, 'model-c')).toBeUndefined()
  })

  test('falls back to the preset catalog context string', () => {
    const c = conn({ presetId: 'deepseek' })
    const resolved = getModelContextWindowForConnection(c, 'deepseek-v4-pro')
    expect(resolved).toEqual({ tokens: 1_000_000, source: 'preset' })
  })

  test('explicit entry wins over the preset string', () => {
    const c = conn({
      presetId: 'deepseek',
      modelContextWindows: {
        'deepseek-v4-pro': { tokens: 131_072, source: 'manual' },
      },
    })
    expect(
      getModelContextWindowForConnection(c, 'deepseek-v4-pro')?.tokens,
    ).toBe(131_072)
  })
})

describe('getConnectionContextWindow', () => {
  test('returns undefined when no connection knows the model', () => {
    upsertConnection(conn())
    expect(getConnectionContextWindow('unknown-model')).toBeUndefined()
    expect(getConnectionContextWindow('')).toBeUndefined()
  })

  test('finds the model anywhere in the registry', () => {
    upsertConnection(
      conn({
        modelContextWindows: { 'model-a': { tokens: 256_000 } },
      }),
    )
    expect(getConnectionContextWindow('model-a')).toBe(256_000)
  })

  test('matches model ids case-insensitively as a fallback', () => {
    upsertConnection(
      conn({
        modelContextWindows: { 'Model-A': { tokens: 256_000 } },
      }),
    )
    expect(getConnectionContextWindow('model-a')).toBe(256_000)
  })

  test('session assignment wins over other connections', () => {
    upsertConnection(
      conn({
        id: 'other',
        modelContextWindows: { shared: { tokens: 100_000 } },
      }),
    )
    upsertConnection(
      conn({
        id: 'active',
        modelContextWindows: { shared: { tokens: 500_000 } },
      }),
    )
    setSessionAssignment('main', { connectionId: 'active', model: 'shared' })
    expect(getConnectionContextWindow('shared')).toBe(500_000)
  })

  test('global default assignment is used when no session assignment exists', () => {
    upsertConnection(
      conn({
        id: 'other',
        modelContextWindows: { shared: { tokens: 100_000 } },
      }),
    )
    upsertConnection(
      conn({
        id: 'default-conn',
        modelContextWindows: { shared: { tokens: 800_000 } },
      }),
    )
    setDefaultAssignment('main', { connectionId: 'default-conn' })
    expect(getConnectionContextWindow('shared')).toBe(800_000)
  })

  test('preset window applies through the runtime lookup', () => {
    upsertConnection(conn({ presetId: 'deepseek' }))
    setSessionAssignment('main', {
      connectionId: 'remote-a',
      model: 'deepseek-v4-pro',
    })
    expect(getConnectionContextWindow('deepseek-v4-pro')).toBe(1_000_000)
  })
})

describe('setManualContextWindow', () => {
  test('persists a manual entry', () => {
    upsertConnection(conn())
    setManualContextWindow('remote-a', 'model-a', 131_072)
    expect(findConnection('remote-a')?.modelContextWindows).toEqual({
      'model-a': { tokens: 131_072, source: 'manual' },
    })
  })

  test('clearing removes the entry and empties the map', () => {
    upsertConnection(
      conn({
        modelContextWindows: {
          'model-a': { tokens: 131_072, source: 'manual' },
        },
      }),
    )
    setManualContextWindow('remote-a', 'model-a', undefined)
    expect(findConnection('remote-a')?.modelContextWindows).toBeUndefined()
  })

  test('ignores unknown connections', () => {
    expect(() =>
      setManualContextWindow('missing', 'model-a', 131_072),
    ).not.toThrow()
  })
})

describe('recordAutoDetectedContextWindows', () => {
  test('records detected windows with source auto', () => {
    upsertConnection(conn())
    recordAutoDetectedContextWindows('remote-a', [
      { id: 'model-a', contextLength: 1_048_576 },
      { id: 'model-b' },
      { id: 'model-c', contextLength: 42 }, // implausible → ignored
    ])
    expect(findConnection('remote-a')?.modelContextWindows).toEqual({
      'model-a': { tokens: 1_048_576, source: 'auto' },
    })
  })

  test('never overwrites manual entries', () => {
    upsertConnection(
      conn({
        modelContextWindows: {
          'model-a': { tokens: 131_072, source: 'manual' },
        },
      }),
    )
    recordAutoDetectedContextWindows('remote-a', [
      { id: 'model-a', contextLength: 1_048_576 },
    ])
    expect(
      findConnection('remote-a')?.modelContextWindows?.['model-a'],
    ).toEqual({ tokens: 131_072, source: 'manual' })
  })

  test('updates auto entries when the detected value changes', () => {
    upsertConnection(
      conn({
        modelContextWindows: {
          'model-a': { tokens: 128_000, source: 'auto' },
        },
      }),
    )
    recordAutoDetectedContextWindows('remote-a', [
      { id: 'model-a', contextLength: 1_048_576 },
    ])
    expect(
      findConnection('remote-a')?.modelContextWindows?.['model-a']?.tokens,
    ).toBe(1_048_576)
  })

  test('no write when nothing changed', () => {
    upsertConnection(
      conn({
        modelContextWindows: {
          'model-a': { tokens: 1_048_576, source: 'auto' },
        },
      }),
    )
    const before = findConnection('remote-a')
    recordAutoDetectedContextWindows('remote-a', [
      { id: 'model-a', contextLength: 1_048_576 },
    ])
    // Same object identity → the registry was not rewritten
    expect(findConnection('remote-a')).toBe(before as Connection)
  })
})
