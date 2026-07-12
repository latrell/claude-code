import { feature } from 'bun:bundle'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getSonnetModelAndRuntime } from '../utils/model/sonnetProvider.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { sideQuery } from '../utils/sideQuery.js'
import type { LangfuseSpan } from '../services/langfuse/index.js'
import {
  formatMemoryManifest,
  type MemoryHeader,
  scanMemoryFiles,
} from './memoryScan.js'
import {
  getMemorySelectionRequestConfig,
  selectedMemoriesFromJsonTextResult,
  selectedMemoriesFromToolResult,
} from './memorySelection.js'

export type RelevantMemory = {
  path: string
  mtimeMs: number
}

/**
 * Find memory files relevant to a query by scanning memory file headers
 * and asking Sonnet to select the most relevant ones.
 *
 * Returns absolute file paths + mtime of the most relevant memories
 * (up to 5). Excludes MEMORY.md (already loaded in system prompt).
 * mtime is threaded through so callers can surface freshness to the
 * main model without a second stat.
 *
 * `alreadySurfaced` filters paths shown in prior turns before the
 * Sonnet call, so the selector spends its 5-slot budget on fresh
 * candidates instead of re-picking files the caller will discard.
 */
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
  parentSpan?: LangfuseSpan | null,
): Promise<RelevantMemory[]> {
  const memories = (await scanMemoryFiles(memoryDir, signal)).filter(
    m => !alreadySurfaced.has(m.filePath),
  )
  if (memories.length === 0) {
    return []
  }

  const selectedFilenames = await selectRelevantMemories(
    query,
    memories,
    signal,
    recentTools,
    parentSpan,
  )
  const byFilename = new Map(memories.map(m => [m.filename, m]))
  const selected = selectedFilenames
    .map(filename => byFilename.get(filename))
    .filter((m): m is MemoryHeader => m !== undefined)

  // Fires even on empty selection: selection-rate needs the denominator,
  // and -1 ages distinguish "ran, picked nothing" from "never ran".
  if (feature('MEMORY_SHAPE_TELEMETRY')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { logMemoryRecallShape } =
      require('./memoryShapeTelemetry.js') as typeof import('./memoryShapeTelemetry.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    logMemoryRecallShape(memories, selected)
  }

  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }))
}

async function selectRelevantMemories(
  query: string,
  memories: MemoryHeader[],
  signal: AbortSignal,
  recentTools: readonly string[],
  parentSpan?: LangfuseSpan | null,
): Promise<string[]> {
  const validFilenames = new Set(memories.map(m => m.filename))

  const manifest = formatMemoryManifest(memories)

  // When Claude Code is actively using a tool (e.g. mcp__X__spawn),
  // surfacing that tool's reference docs is noise — the conversation
  // already contains working usage.  The selector otherwise matches
  // on keyword overlap ("spawn" in query + "spawn" in a memory
  // description → false positive).
  const toolsSection =
    recentTools.length > 0
      ? `\n\nRecently used tools: ${recentTools.join(', ')}`
      : ''

  try {
    // Route the memory selector through the sonnet slot (/sonnet-provider)
    // when configured; unconfigured = main provider's default Sonnet model
    // with no runtime override (current behaviour).
    const sonnet = getSonnetModelAndRuntime()
    const provider = sonnet.runtime?.provider ?? getAPIProvider()
    const requestConfig = getMemorySelectionRequestConfig(provider)
    const result = await sideQuery({
      model: sonnet.model,
      ...(sonnet.runtime && { providerRuntimeConfig: sonnet.runtime }),
      ...requestConfig.sideQueryFields,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\n\nAvailable memories:\n${manifest}${toolsSection}`,
        },
      ],
      max_tokens: 256,
      signal,
      querySource: 'memdir_relevance',
      optional: true,
      parentSpan,
    })

    return requestConfig.responseFormat === 'json_text'
      ? selectedMemoriesFromJsonTextResult(result.content, validFilenames)
      : selectedMemoriesFromToolResult(result.content, validFilenames)
  } catch (e) {
    if (signal.aborted) {
      return []
    }
    logForDebugging(
      `[memdir] selectRelevantMemories failed: ${errorMessage(e)}`,
      { level: 'warn' },
    )
    return []
  }
}
