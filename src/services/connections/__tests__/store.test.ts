import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logMock } from '../../../../tests/mocks/log'

// Must mock log before any import that transitively loads log.ts
mock.module('src/utils/log.ts', logMock)

import {
  _invalidateConnectionsCache,
  deriveConnectionProfile,
  findConnection,
  generateConnectionId,
  getConnectionsFilePath,
  getDefaultAssignment,
  listConnections,
  loadConnectionsFile,
  removeConnection,
  renameConnection,
  setDefaultAssignment,
  updateConnectionModel,
  upsertConnection,
} from '../store.js'
import type { Connection } from '../types.js'

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-connections-test-'))
  previousConfigDir = process.env['CLAUDE_CONFIG_DIR']
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  _invalidateConnectionsCache()
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env['CLAUDE_CONFIG_DIR']
  } else {
    process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir
  }
  _invalidateConnectionsCache()
  rmSync(tmpDir, { recursive: true, force: true })
})

function sampleConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'deepseek-personal',
    label: 'DeepSeek Personal',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    ...overrides,
  }
}

describe('loadConnectionsFile', () => {
  test('returns empty registry when file does not exist', () => {
    const file = loadConnectionsFile()
    expect(file.connections).toEqual([])
    expect(file.defaults).toBeUndefined()
  })

  test('returns empty registry for corrupt JSON', () => {
    writeFileSync(getConnectionsFilePath(), '{not json')
    const file = loadConnectionsFile()
    expect(file.connections).toEqual([])
  })

  test('returns empty registry when schema validation fails', () => {
    writeFileSync(
      getConnectionsFilePath(),
      JSON.stringify({ connections: [{ id: 'BAD ID', kind: 'nope' }] }),
    )
    const file = loadConnectionsFile()
    expect(file.connections).toEqual([])
  })

  test('parses a valid registry and caches it', () => {
    writeFileSync(
      getConnectionsFilePath(),
      JSON.stringify({
        version: 1,
        connections: [sampleConnection()],
        defaults: { main: { connectionId: 'deepseek-personal' } },
      }),
    )
    const file = loadConnectionsFile()
    expect(file.connections).toHaveLength(1)
    expect(file.defaults?.main?.connectionId).toBe('deepseek-personal')

    // Cached: mutating the file on disk without invalidation is not observed
    writeFileSync(getConnectionsFilePath(), JSON.stringify({ connections: [] }))
    expect(loadConnectionsFile().connections).toHaveLength(1)

    _invalidateConnectionsCache()
    expect(loadConnectionsFile().connections).toHaveLength(0)
  })
})

describe('upsertConnection / findConnection / removeConnection', () => {
  test('inserts a new connection and persists it to disk', () => {
    upsertConnection(sampleConnection())
    expect(findConnection('deepseek-personal')?.label).toBe('DeepSeek Personal')
    expect(existsSync(getConnectionsFilePath())).toBe(true)

    // Fresh read from disk (bypass cache) sees the same data
    _invalidateConnectionsCache()
    expect(findConnection('deepseek-personal')?.apiKey).toBe('sk-test')
  })

  test('replaces an existing connection by id', () => {
    upsertConnection(sampleConnection())
    upsertConnection(sampleConnection({ label: 'Renamed', apiKey: 'sk-2' }))
    expect(listConnections()).toHaveLength(1)
    expect(findConnection('deepseek-personal')?.label).toBe('Renamed')
    expect(findConnection('deepseek-personal')?.apiKey).toBe('sk-2')
  })

  test('removeConnection deletes the entry and clears dangling defaults', () => {
    upsertConnection(sampleConnection())
    upsertConnection(sampleConnection({ id: 'other', label: 'Other' }))
    setDefaultAssignment('main', {
      connectionId: 'deepseek-personal',
      model: 'deepseek-chat',
    })
    setDefaultAssignment('subagent', { connectionId: 'other' })

    removeConnection('deepseek-personal')

    expect(findConnection('deepseek-personal')).toBeUndefined()
    expect(getDefaultAssignment('main')).toBeUndefined()
    // Unrelated default untouched
    expect(getDefaultAssignment('subagent')?.connectionId).toBe('other')
  })

  test('removeConnection clears dangling fast and sonnet defaults', () => {
    // Regression: the dangling-defaults cleanup used to only cover
    // main/subagent — deleting a connection left stale fast/sonnet defaults
    // pointing at the removed id.
    upsertConnection(sampleConnection())
    setDefaultAssignment('fast', { connectionId: 'deepseek-personal' })
    setDefaultAssignment('sonnet', { connectionId: 'deepseek-personal' })

    removeConnection('deepseek-personal')

    expect(getDefaultAssignment('fast')).toBeUndefined()
    expect(getDefaultAssignment('sonnet')).toBeUndefined()
  })

  test('renameConnection only changes the label', () => {
    upsertConnection(sampleConnection())
    renameConnection('deepseek-personal', 'Work Account')
    const conn = findConnection('deepseek-personal')
    expect(conn?.label).toBe('Work Account')
    expect(conn?.apiKey).toBe('sk-test')
  })

  test('renameConnection is a no-op for unknown ids', () => {
    renameConnection('missing', 'X')
    expect(listConnections()).toHaveLength(0)
  })
})

describe('setDefaultAssignment / getDefaultAssignment', () => {
  test('sets and clears slot assignments independently', () => {
    upsertConnection(sampleConnection())
    setDefaultAssignment('main', {
      connectionId: 'deepseek-personal',
      model: 'deepseek-chat',
    })
    expect(getDefaultAssignment('main')?.model).toBe('deepseek-chat')
    expect(getDefaultAssignment('subagent')).toBeUndefined()

    setDefaultAssignment('subagent', { connectionId: 'deepseek-personal' })
    expect(getDefaultAssignment('subagent')?.connectionId).toBe(
      'deepseek-personal',
    )

    setDefaultAssignment('main', undefined)
    expect(getDefaultAssignment('main')).toBeUndefined()
    expect(getDefaultAssignment('subagent')).toBeDefined()

    // Clearing the last assignment drops the defaults object entirely
    setDefaultAssignment('subagent', undefined)
    _invalidateConnectionsCache()
    const raw = JSON.parse(readFileSync(getConnectionsFilePath(), 'utf8'))
    expect(raw.defaults).toBeUndefined()
  })

  test('fast and sonnet slots persist independently and round-trip', () => {
    upsertConnection(sampleConnection())
    setDefaultAssignment('fast', { connectionId: 'deepseek-personal' })
    setDefaultAssignment('sonnet', {
      connectionId: 'deepseek-personal',
      model: 'deepseek-reasoner',
    })

    // sonnet must NOT fall through into the fast slot (explicit-branch guard)
    expect(getDefaultAssignment('fast')?.model).toBeUndefined()
    expect(getDefaultAssignment('sonnet')?.model).toBe('deepseek-reasoner')

    _invalidateConnectionsCache()
    expect(getDefaultAssignment('sonnet')?.model).toBe('deepseek-reasoner')

    setDefaultAssignment('fast', undefined)
    expect(getDefaultAssignment('fast')).toBeUndefined()
    expect(getDefaultAssignment('sonnet')).toBeDefined()

    setDefaultAssignment('sonnet', undefined)
    _invalidateConnectionsCache()
    const raw = JSON.parse(readFileSync(getConnectionsFilePath(), 'utf8'))
    expect(raw.defaults).toBeUndefined()
  })
})

describe('generateConnectionId', () => {
  test('slugifies labels', () => {
    expect(generateConnectionId('DeepSeek 个人账号!')).toBe('deepseek')
    expect(generateConnectionId('My Work (US) #2')).toBe('my-work-us-2')
  })

  test('falls back to "connection" for unusable labels', () => {
    expect(generateConnectionId('账号')).toBe('connection')
  })

  test('dedupes against existing ids', () => {
    upsertConnection(sampleConnection({ id: 'deepseek', label: 'DeepSeek' }))
    expect(generateConnectionId('DeepSeek')).toBe('deepseek-2')
    upsertConnection(sampleConnection({ id: 'deepseek-2', label: 'DeepSeek' }))
    expect(generateConnectionId('DeepSeek')).toBe('deepseek-3')
  })
})

describe('profile fields (model / thinkingEffort / contextWindow)', () => {
  test('round-trip through disk', () => {
    upsertConnection(
      sampleConnection({
        model: 'deepseek-reasoner',
        thinkingEffort: 'high',
        contextWindow: 131_072,
      }),
    )
    _invalidateConnectionsCache()
    const conn = findConnection('deepseek-personal')
    expect(conn?.model).toBe('deepseek-reasoner')
    expect(conn?.thinkingEffort).toBe('high')
    expect(conn?.contextWindow).toBe(131_072)
  })

  test('schema rejects invalid thinkingEffort and contextWindow', () => {
    writeFileSync(
      getConnectionsFilePath(),
      JSON.stringify({
        connections: [
          { ...sampleConnection(), thinkingEffort: 'ultra' },
          { ...sampleConnection({ id: 'other' }), contextWindow: -1 },
        ],
      }),
    )
    // Invalid values fail validation → degrade to empty registry
    expect(loadConnectionsFile().connections).toEqual([])
  })
})

describe('lazy migration of legacy connections', () => {
  function writeLegacyFile(file: Record<string, unknown>): void {
    writeFileSync(getConnectionsFilePath(), JSON.stringify(file))
    _invalidateConnectionsCache()
  }

  test('derives model from the main default assignment first', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        sampleConnection({
          tierModels: { sonnet: 'deepseek-chat' },
          models: ['deepseek-reasoner', 'deepseek-chat'],
        }),
      ],
      defaults: {
        main: {
          connectionId: 'deepseek-personal',
          model: 'deepseek-reasoner',
        },
      },
    })
    expect(findConnection('deepseek-personal')?.model).toBe('deepseek-reasoner')
  })

  test('derives model from the subagent default when not the main default', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        sampleConnection({ models: ['deepseek-chat', 'deepseek-reasoner'] }),
      ],
      defaults: {
        main: { connectionId: 'someone-else', model: 'other-model' },
        subagent: {
          connectionId: 'deepseek-personal',
          model: 'deepseek-reasoner',
        },
      },
    })
    expect(findConnection('deepseek-personal')?.model).toBe('deepseek-reasoner')
  })

  test('falls back to tierModels.sonnet, then models[0]', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        sampleConnection({
          id: 'with-tier',
          tierModels: { sonnet: 'tier-sonnet' },
          models: ['catalog-first'],
        }),
        sampleConnection({ id: 'catalog-only', models: ['catalog-first'] }),
      ],
    })
    expect(findConnection('with-tier')?.model).toBe('tier-sonnet')
    expect(findConnection('catalog-only')?.model).toBe('catalog-first')
  })

  test('copies contextWindow from modelContextWindows for the derived model', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        sampleConnection({
          models: ['deepseek-chat'],
          modelContextWindows: {
            'deepseek-chat': { tokens: 131_072, source: 'auto' },
            'deepseek-reasoner': { tokens: 65_536, source: 'auto' },
          },
        }),
      ],
    })
    const conn = findConnection('deepseek-personal')
    expect(conn?.model).toBe('deepseek-chat')
    expect(conn?.contextWindow).toBe(131_072)
  })

  test('leaves connections without any model source untouched', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        {
          id: 'claude-sub',
          label: 'Claude Subscription',
          kind: 'anthropic-oauth',
          credentialRef: 'account-uuid',
        },
      ],
    })
    const conn = findConnection('claude-sub')
    expect(conn?.model).toBeUndefined()
    expect(conn?.contextWindow).toBeUndefined()
    // No rewrite happened: raw file is byte-identical to what we wrote
    const raw = JSON.parse(readFileSync(getConnectionsFilePath(), 'utf8'))
    expect(raw.connections[0].model).toBeUndefined()
  })

  test('persists the migration to disk exactly once (idempotent)', () => {
    writeLegacyFile({
      version: 1,
      connections: [sampleConnection({ models: ['deepseek-chat'] })],
    })
    loadConnectionsFile()

    // The migrated shape was written back
    const afterFirst = readFileSync(getConnectionsFilePath(), 'utf8')
    expect(JSON.parse(afterFirst).connections[0].model).toBe('deepseek-chat')

    // A second cold load leaves the file byte-identical
    _invalidateConnectionsCache()
    loadConnectionsFile()
    expect(readFileSync(getConnectionsFilePath(), 'utf8')).toBe(afterFirst)
  })

  test('does not overwrite an existing pinned model', () => {
    writeLegacyFile({
      version: 1,
      connections: [
        sampleConnection({
          model: 'pinned-model',
          tierModels: { sonnet: 'tier-sonnet' },
          models: ['catalog-first'],
        }),
      ],
    })
    expect(findConnection('deepseek-personal')?.model).toBe('pinned-model')
  })
})

describe('updateConnectionModel', () => {
  test('updates the pinned model and syncs contextWindow from the window map', () => {
    upsertConnection(
      sampleConnection({
        model: 'deepseek-chat',
        contextWindow: 131_072,
        modelContextWindows: {
          'deepseek-chat': { tokens: 131_072, source: 'auto' },
          'deepseek-reasoner': { tokens: 65_536, source: 'manual' },
        },
      }),
    )
    updateConnectionModel('deepseek-personal', 'deepseek-reasoner')
    const conn = findConnection('deepseek-personal')
    expect(conn?.model).toBe('deepseek-reasoner')
    expect(conn?.contextWindow).toBe(65_536)

    // Persisted to disk (cache was invalidated by the update)
    const raw = JSON.parse(readFileSync(getConnectionsFilePath(), 'utf8'))
    expect(raw.connections[0].model).toBe('deepseek-reasoner')
    expect(raw.connections[0].contextWindow).toBe(65_536)
  })

  test('clears contextWindow when the new model has no known window', () => {
    upsertConnection(
      sampleConnection({
        model: 'deepseek-chat',
        contextWindow: 131_072,
        modelContextWindows: {
          'deepseek-chat': { tokens: 131_072, source: 'auto' },
        },
      }),
    )
    updateConnectionModel('deepseek-personal', 'brand-new-model')
    const conn = findConnection('deepseek-personal')
    expect(conn?.model).toBe('brand-new-model')
    expect(conn?.contextWindow).toBeUndefined()
  })

  test('is a no-op for unknown connection ids', () => {
    expect(() => updateConnectionModel('missing', 'some-model')).not.toThrow()
    expect(listConnections()).toHaveLength(0)
  })
})

describe('deriveConnectionProfile', () => {
  test('returns the same reference when model is already pinned', () => {
    const c = sampleConnection({ model: 'pinned' })
    expect(deriveConnectionProfile(c)).toBe(c)
  })

  test('preferredModel wins over tierModels.sonnet and models[0]', () => {
    const c = sampleConnection({
      tierModels: { sonnet: 'tier-sonnet' },
      models: ['catalog-first'],
    })
    expect(deriveConnectionProfile(c, 'preferred').model).toBe('preferred')
    expect(deriveConnectionProfile(c).model).toBe('tier-sonnet')
    expect(
      deriveConnectionProfile(sampleConnection({ models: ['catalog-first'] }))
        .model,
    ).toBe('catalog-first')
  })

  test('syncs contextWindow from the per-model window map', () => {
    const c = sampleConnection({
      models: ['deepseek-chat'],
      modelContextWindows: {
        'deepseek-chat': { tokens: 131_072, source: 'auto' },
      },
    })
    const derived = deriveConnectionProfile(c)
    expect(derived.model).toBe('deepseek-chat')
    expect(derived.contextWindow).toBe(131_072)
  })

  test('returns the same reference when nothing can be derived', () => {
    const c = sampleConnection({ models: undefined })
    expect(deriveConnectionProfile(c)).toBe(c)
    expect(deriveConnectionProfile(c).model).toBeUndefined()
  })
})
