import { describe, expect, test } from 'bun:test'
import { resolveClassifierXmlMode } from '../classifierRouting.js'

describe('resolveClassifierXmlMode', () => {
  test('always routes Cursor through XML while preserving explicit modes', () => {
    expect(resolveClassifierXmlMode('cursor', undefined)).toBe('both')
    expect(resolveClassifierXmlMode('cursor', false)).toBe('both')
    expect(resolveClassifierXmlMode('cursor', 'fast')).toBe('fast')
    expect(resolveClassifierXmlMode('cursor', 'thinking')).toBe('thinking')
  })

  test('preserves configured rollout modes for other providers', () => {
    expect(resolveClassifierXmlMode('firstParty', undefined)).toBeUndefined()
    expect(resolveClassifierXmlMode('openai', false)).toBeUndefined()
    expect(resolveClassifierXmlMode('gemini', true)).toBe('both')
    expect(resolveClassifierXmlMode('grok', 'fast')).toBe('fast')
    expect(resolveClassifierXmlMode('bedrock', 'thinking')).toBe('thinking')
  })
})
