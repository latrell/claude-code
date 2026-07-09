import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)

import {
  _invalidateConnectionsCache,
  setDefaultAssignment,
  upsertConnection,
} from '../store.js'
import type { Connection } from '../types.js'
import {
  formatConnectionsList,
  modelForCliActivation,
  resolveConnectionRef,
} from '../cliResolve.js'

let tmpDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccb-cli-resolve-test-'))
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
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    models: ['deepseek-chat'],
    presetId: 'deepseek',
    ...overrides,
  }
}

describe('resolveConnectionRef', () => {
  test('resolves by exact id', () => {
    upsertConnection(sampleConnection())
    const result = resolveConnectionRef('deepseek')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.connection.id).toBe('deepseek')
  })

  test('resolves by case-insensitive label', () => {
    upsertConnection(
      sampleConnection({ id: 'deepseek-personal', label: 'DeepSeek Personal' }),
    )
    const result = resolveConnectionRef('deepseek personal')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.connection.id).toBe('deepseek-personal')
  })

  test('resolves by presetId', () => {
    upsertConnection(
      sampleConnection({
        id: 'deepseek-coding',
        label: 'DeepSeek Coding',
        presetId: 'deepseek',
      }),
    )
    const result = resolveConnectionRef('deepseek')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.connection.id).toBe('deepseek-coding')
  })

  test('prefers exact id over presetId', () => {
    upsertConnection(
      sampleConnection({
        id: 'deepseek',
        label: 'DeepSeek A',
        presetId: 'other',
      }),
    )
    upsertConnection(
      sampleConnection({
        id: 'deepseek-b',
        label: 'DeepSeek B',
        presetId: 'deepseek',
        apiKey: 'sk-other',
      }),
    )
    const result = resolveConnectionRef('deepseek')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.connection.id).toBe('deepseek')
  })

  test('errors on ambiguous label', () => {
    upsertConnection(
      sampleConnection({
        id: 'deepseek-a',
        label: 'DeepSeek',
        apiKey: 'sk-a',
      }),
    )
    upsertConnection(
      sampleConnection({
        id: 'deepseek-b',
        label: 'DeepSeek',
        apiKey: 'sk-b',
        presetId: undefined,
      }),
    )
    const result = resolveConnectionRef('DeepSeek')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ambiguous')
      expect(result.error).toContain('Ambiguous')
      expect(result.error).toContain('deepseek-a')
      expect(result.error).toContain('deepseek-b')
    }
  })

  test('errors when empty registry and unknown ref', () => {
    const result = resolveConnectionRef('missing')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('empty')
      expect(result.error).toContain('No connections')
    }
  })

  test('errors when unknown ref with non-empty registry', () => {
    upsertConnection(sampleConnection())
    const result = resolveConnectionRef('missing')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Unknown connection')
  })
})

describe('formatConnectionsList', () => {
  test('prints empty message when no connections', () => {
    expect(formatConnectionsList()).toContain('No connections configured')
  })

  test('prints id, label, kind, and default flags', () => {
    upsertConnection(sampleConnection())
    setDefaultAssignment('main', { connectionId: 'deepseek' })
    const out = formatConnectionsList()
    expect(out).toContain('deepseek')
    expect(out).toContain('DeepSeek')
    expect(out).toContain('openai-compat')
    expect(out).toContain('main-default')
  })
})

describe('modelForCliActivation', () => {
  test('prefers explicit model', () => {
    const conn = sampleConnection()
    upsertConnection(conn)
    setDefaultAssignment('main', {
      connectionId: 'deepseek',
      model: 'deepseek-chat',
    })
    expect(modelForCliActivation(conn, 'main', 'custom-model')).toBe(
      'custom-model',
    )
  })

  test('uses registry default model when no explicit model', () => {
    const conn = sampleConnection()
    upsertConnection(conn)
    setDefaultAssignment('main', {
      connectionId: 'deepseek',
      model: 'deepseek-reasoner',
    })
    expect(modelForCliActivation(conn, 'main')).toBe('deepseek-reasoner')
  })

  test('falls back to connection catalog when no registry default', () => {
    const conn = sampleConnection({
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      tierModels: { sonnet: 'deepseek-v4-pro' },
    })
    upsertConnection(conn)
    expect(modelForCliActivation(conn, 'main')).toBe('deepseek-v4-pro')
  })

  test('returns undefined when connection has no catalog model', () => {
    const conn = sampleConnection({
      models: undefined,
      tierModels: undefined,
    })
    upsertConnection(conn)
    setDefaultAssignment('main', {
      connectionId: 'other',
      model: 'x',
    })
    expect(modelForCliActivation(conn, 'main')).toBeUndefined()
  })
})
