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
  findConnection,
  generateConnectionId,
  getConnectionsFilePath,
  getDefaultAssignment,
  listConnections,
  loadConnectionsFile,
  removeConnection,
  renameConnection,
  setDefaultAssignment,
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
