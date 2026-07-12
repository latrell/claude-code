import type { APIProvider } from '../utils/model/providers.js'

export const SELECT_MEMORIES_TOOL = {
  type: 'custom' as const,
  name: 'select_relevant_memories',
  description: 'Select the memory files relevant to the current query.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selected_memories: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
    },
    required: ['selected_memories'],
    additionalProperties: false,
  },
}

const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. You will be given the user's query and a list of available memory files with their filenames and descriptions.

Call the select_relevant_memories tool exactly once with the filenames that will clearly be useful to Claude Code as it processes the user's query (up to 5). Do not answer with plain text. Only include memories that you are certain will be helpful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, feel free to return an empty list.
- If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools — active use is exactly when those matter.
`

const SELECT_MEMORIES_CURSOR_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. You will be given the user's query and a list of available memory files with their filenames and descriptions.

Return exactly one JSON object in this shape: {"selected_memories":["filename.md"]}. Do not use Markdown fences or include any text before or after the JSON. Include up to 5 filenames that will clearly be useful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, return {"selected_memories":[]}.
- If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools — active use is exactly when those matter.
`

export function getMemorySelectionRequestConfig(provider: APIProvider) {
  if (provider === 'cursor') {
    return {
      responseFormat: 'json_text' as const,
      sideQueryFields: {
        system: SELECT_MEMORIES_CURSOR_SYSTEM_PROMPT,
        thinking: false as const,
      },
    }
  }
  return {
    responseFormat: 'tool_use' as const,
    sideQueryFields: {
      system: SELECT_MEMORIES_SYSTEM_PROMPT,
      thinking: false as const,
      tools: [SELECT_MEMORIES_TOOL],
      tool_choice: {
        type: 'tool' as const,
        name: SELECT_MEMORIES_TOOL.name,
      },
    },
  }
}

type ContentBlockLike = {
  type?: unknown
  name?: unknown
  input?: unknown
  text?: unknown
}

function selectedMemoriesFromUnknown(
  selectedMemories: unknown,
  validFilenames: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(selectedMemories)) return []
  return selectedMemories.filter(
    (filename): filename is string =>
      typeof filename === 'string' && validFilenames.has(filename),
  )
}

/** Parse and validate the forced memory-selection tool result. */
export function selectedMemoriesFromToolResult(
  content: readonly unknown[],
  validFilenames: ReadonlySet<string>,
): string[] {
  const toolBlock = content.find(block => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return false
    }
    const candidate = block as ContentBlockLike
    return (
      candidate.type === 'tool_use' &&
      candidate.name === SELECT_MEMORIES_TOOL.name
    )
  }) as ContentBlockLike | undefined
  const input = toolBlock?.input
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const selectedMemories = (input as Record<string, unknown>)[
    'selected_memories'
  ]
  return selectedMemoriesFromUnknown(selectedMemories, validFilenames)
}

/**
 * Parse Cursor's strict JSON-text response. Cursor's agent-tuned models ignore
 * custom MCP tools, so this intentionally parses the complete text payload
 * rather than extracting a JSON-looking substring or accepting code fences.
 */
export function selectedMemoriesFromJsonTextResult(
  content: readonly unknown[],
  validFilenames: ReadonlySet<string>,
): string[] {
  const text = content
    .filter(block => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        return false
      }
      const candidate = block as ContentBlockLike
      return candidate.type === 'text' && typeof candidate.text === 'string'
    })
    .map(block => (block as ContentBlockLike).text as string)
    .join('')
    .trim()

  if (!text) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

  return selectedMemoriesFromUnknown(
    (parsed as Record<string, unknown>)['selected_memories'],
    validFilenames,
  )
}
