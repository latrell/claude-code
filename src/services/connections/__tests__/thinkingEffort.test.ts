import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logMock } from '../../../../tests/mocks/log'

// Must mock log before any import that transitively loads log.ts
mock.module('src/utils/log.ts', logMock)

const {
  asThinkingEffort,
  getConnectionThinkingEffort,
  getConnectionThinkingEffortTransport,
  mapThinkingEffortToEffortValue,
  resolveQueryThinkingEffort,
  resolveQueryThinkingEffortTransport,
} = await import('../thinkingEffort.js')
const { setSessionAssignment } = await import('../sessionAssignments.js')
const { _invalidateConnectionsCache, setDefaultAssignment, upsertConnection } =
  await import('../store.js')
import type { Connection } from '../types.js'

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-thinking-effort-test-'))
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
    model: 'model-a',
    ...overrides,
  }
}

describe('getConnectionThinkingEffort', () => {
  test('returns undefined when no assignment exists', () => {
    upsertConnection(conn({ thinkingEffort: 'high' }))
    expect(getConnectionThinkingEffort('main')).toBeUndefined()
  })

  test('resolves the session assignment connection', () => {
    upsertConnection(conn({ thinkingEffort: 'low' }))
    setSessionAssignment('main', { connectionId: 'remote-a' })
    expect(getConnectionThinkingEffort('main')).toBe('low')
  })

  test('falls back to the global default assignment', () => {
    upsertConnection(conn({ thinkingEffort: 'max' }))
    setDefaultAssignment('main', { connectionId: 'remote-a' })
    expect(getConnectionThinkingEffort('main')).toBe('max')
  })

  test('session assignment wins over the global default', () => {
    upsertConnection(conn({ id: 'session-conn', thinkingEffort: 'off' }))
    upsertConnection(conn({ id: 'default-conn', thinkingEffort: 'high' }))
    setDefaultAssignment('main', { connectionId: 'default-conn' })
    setSessionAssignment('main', { connectionId: 'session-conn' })
    expect(getConnectionThinkingEffort('main')).toBe('off')
  })

  test('slots resolve independently', () => {
    upsertConnection(conn({ id: 'main-conn', thinkingEffort: 'high' }))
    upsertConnection(conn({ id: 'sub-conn', thinkingEffort: 'low' }))
    setSessionAssignment('main', { connectionId: 'main-conn' })
    setSessionAssignment('subagent', { connectionId: 'sub-conn' })
    expect(getConnectionThinkingEffort('main')).toBe('high')
    expect(getConnectionThinkingEffort('subagent')).toBe('low')
  })

  test('returns undefined when the connection pins no effort', () => {
    upsertConnection(conn())
    setSessionAssignment('main', { connectionId: 'remote-a' })
    expect(getConnectionThinkingEffort('main')).toBeUndefined()
  })

  test('returns undefined when the assigned connection is missing', () => {
    setSessionAssignment('main', { connectionId: 'gone' })
    expect(getConnectionThinkingEffort('main')).toBeUndefined()
  })
})

describe('getConnectionThinkingEffortTransport', () => {
  test('resolves transport independently for each slot', () => {
    upsertConnection(
      conn({
        id: 'main-conn',
        thinkingEffortTransport: 'compatible',
      }),
    )
    upsertConnection(
      conn({
        id: 'sub-conn',
        thinkingEffortTransport: 'passthrough',
      }),
    )
    setSessionAssignment('main', { connectionId: 'main-conn' })
    setSessionAssignment('subagent', { connectionId: 'sub-conn' })
    expect(getConnectionThinkingEffortTransport('main')).toBe('compatible')
    expect(getConnectionThinkingEffortTransport('subagent')).toBe('passthrough')
  })
})

describe('resolveQueryThinkingEffort', () => {
  test('subagent query with runtime config uses its pinned effort, not the main slot', () => {
    // Main slot pinned 'off' must NOT leak into a subagent whose own
    // connection pins 'max'.
    upsertConnection(conn({ id: 'main-off', thinkingEffort: 'off' }))
    setSessionAssignment('main', { connectionId: 'main-off' })
    expect(resolveQueryThinkingEffort({ thinkingEffort: 'max' })).toBe('max')
  })

  test('subagent runtime config without pinned effort returns undefined (no main-slot inheritance)', () => {
    upsertConnection(conn({ id: 'main-high', thinkingEffort: 'high' }))
    setSessionAssignment('main', { connectionId: 'main-high' })
    expect(resolveQueryThinkingEffort({})).toBeUndefined()
  })

  test('subagent off is honored regardless of the main slot', () => {
    upsertConnection(conn({ id: 'main-high', thinkingEffort: 'high' }))
    setSessionAssignment('main', { connectionId: 'main-high' })
    expect(resolveQueryThinkingEffort({ thinkingEffort: 'off' })).toBe('off')
  })

  test('main-agent query (no runtime config) resolves the main slot', () => {
    upsertConnection(conn({ id: 'main-med', thinkingEffort: 'medium' }))
    setSessionAssignment('main', { connectionId: 'main-med' })
    expect(resolveQueryThinkingEffort(undefined)).toBe('medium')
  })

  test('subagent off does not affect the main-agent resolution', () => {
    // Subagent slot pinned 'off', main slot pinned 'high': the main agent's
    // query (no runtime config) must still see 'high'.
    upsertConnection(conn({ id: 'main-high', thinkingEffort: 'high' }))
    upsertConnection(conn({ id: 'sub-off', thinkingEffort: 'off' }))
    setSessionAssignment('main', { connectionId: 'main-high' })
    setSessionAssignment('subagent', { connectionId: 'sub-off' })
    expect(resolveQueryThinkingEffort(undefined)).toBe('high')
  })

  test('no assignments anywhere resolves to undefined', () => {
    expect(resolveQueryThinkingEffort(undefined)).toBeUndefined()
  })
})

describe('resolveQueryThinkingEffortTransport', () => {
  test('scoped runtime never inherits the main transport', () => {
    upsertConnection(
      conn({
        id: 'main-exact',
        thinkingEffortTransport: 'passthrough',
      }),
    )
    setSessionAssignment('main', { connectionId: 'main-exact' })
    expect(resolveQueryThinkingEffortTransport({})).toBeUndefined()
    expect(
      resolveQueryThinkingEffortTransport({
        thinkingEffortTransport: 'compatible',
      }),
    ).toBe('compatible')
    expect(resolveQueryThinkingEffortTransport(undefined)).toBe('passthrough')
  })
})

describe('mapThinkingEffortToEffortValue', () => {
  test('maps low/medium/high/max to the same effort level', () => {
    expect(mapThinkingEffortToEffortValue('low')).toBe('low')
    expect(mapThinkingEffortToEffortValue('medium')).toBe('medium')
    expect(mapThinkingEffortToEffortValue('high')).toBe('high')
    expect(mapThinkingEffortToEffortValue('max')).toBe('max')
  })

  test('off and undefined map to undefined (no effort param)', () => {
    expect(mapThinkingEffortToEffortValue('off')).toBeUndefined()
    expect(mapThinkingEffortToEffortValue(undefined)).toBeUndefined()
  })

  test('never produces xhigh', () => {
    for (const effort of ['off', 'low', 'medium', 'high', 'max'] as const) {
      expect(mapThinkingEffortToEffortValue(effort)).not.toBe('xhigh')
    }
  })
})

describe('asThinkingEffort', () => {
  test('accepts the five known levels', () => {
    for (const effort of ['off', 'low', 'medium', 'high', 'max']) {
      expect(asThinkingEffort(effort)).toBe(
        effort as ReturnType<typeof asThinkingEffort>,
      )
    }
  })

  test('rejects unknown values', () => {
    expect(asThinkingEffort('xhigh')).toBeUndefined()
    expect(asThinkingEffort('')).toBeUndefined()
    expect(asThinkingEffort(42)).toBeUndefined()
    expect(asThinkingEffort(null)).toBeUndefined()
    expect(asThinkingEffort(undefined)).toBeUndefined()
  })
})
