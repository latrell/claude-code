import { describe, expect, test } from 'bun:test'
import {
  SELECT_MEMORIES_TOOL,
  getMemorySelectionRequestConfig,
  selectedMemoriesFromJsonTextResult,
  selectedMemoriesFromToolResult,
} from '../memorySelection.js'

describe('getMemorySelectionRequestConfig', () => {
  test('uses strict JSON text without custom tools for Cursor', () => {
    const config = getMemorySelectionRequestConfig('cursor')

    expect(config.responseFormat).toBe('json_text')
    expect(config.sideQueryFields.thinking).toBe(false)
    expect(config.sideQueryFields).not.toHaveProperty('tools')
    expect(config.sideQueryFields).not.toHaveProperty('tool_choice')
    expect(config.sideQueryFields.system).toContain('exactly one JSON object')
  })

  test('uses a forced tool with thinking disabled for other providers', () => {
    const config = getMemorySelectionRequestConfig('openai')

    expect(config.responseFormat).toBe('tool_use')
    expect(config.sideQueryFields).toMatchObject({
      thinking: false,
      tools: [SELECT_MEMORIES_TOOL],
      tool_choice: {
        type: 'tool',
        name: SELECT_MEMORIES_TOOL.name,
      },
    })
  })
})

describe('selectedMemoriesFromToolResult', () => {
  const validFilenames = new Set(['project.md', 'warnings.md'])

  test('reads selected filenames from the forced tool result', () => {
    expect(
      selectedMemoriesFromToolResult(
        [
          {
            type: 'tool_use',
            name: SELECT_MEMORIES_TOOL.name,
            input: {
              selected_memories: ['project.md', 'missing.md', 'warnings.md'],
            },
          },
        ],
        validFilenames,
      ),
    ).toEqual(['project.md', 'warnings.md'])
  })

  test('rejects plain text and malformed tool input', () => {
    expect(
      selectedMemoriesFromToolResult(
        [{ type: 'text', text: '{"selected_memories":["project.md"]}' }],
        validFilenames,
      ),
    ).toEqual([])
    expect(
      selectedMemoriesFromToolResult(
        [
          {
            type: 'tool_use',
            name: SELECT_MEMORIES_TOOL.name,
            input: { selected_memories: 'project.md' },
          },
        ],
        validFilenames,
      ),
    ).toEqual([])
  })
})

describe('selectedMemoriesFromJsonTextResult', () => {
  const validFilenames = new Set(['project.md', 'warnings.md'])

  test('reads strict JSON text and filters filenames through the manifest whitelist', () => {
    expect(
      selectedMemoriesFromJsonTextResult(
        [
          {
            type: 'text',
            text: '{"selected_memories":["project.md","missing.md","warnings.md"]}',
          },
        ],
        validFilenames,
      ),
    ).toEqual(['project.md', 'warnings.md'])
  })

  test('rejects fenced, malformed, and non-array JSON responses', () => {
    expect(
      selectedMemoriesFromJsonTextResult(
        [
          {
            type: 'text',
            text: '```json\n{"selected_memories":["project.md"]}\n```',
          },
        ],
        validFilenames,
      ),
    ).toEqual([])
    expect(
      selectedMemoriesFromJsonTextResult(
        [{ type: 'text', text: '{"selected_memories":' }],
        validFilenames,
      ),
    ).toEqual([])
    expect(
      selectedMemoriesFromJsonTextResult(
        [
          {
            type: 'text',
            text: '{"selected_memories":"project.md"}',
          },
        ],
        validFilenames,
      ),
    ).toEqual([])
  })
})
