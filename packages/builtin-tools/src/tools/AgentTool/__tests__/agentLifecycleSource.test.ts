import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const agentToolSource = readFileSync(
  fileURLToPath(new URL('../AgentTool.tsx', import.meta.url)),
  'utf8',
)

function section(startMarker: string, endMarker: string): string {
  const start = agentToolSource.indexOf(startMarker)
  const end = agentToolSource.indexOf(endMarker, start)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return agentToolSource.slice(start, end)
}

function occurrenceCount(source: string, text: string): number {
  return source.split(text).length - 1
}

describe('AgentTool lifecycle ownership wiring', () => {
  test('does not auto-background or advertise in-flight Agent handoff', () => {
    expect(agentToolSource).not.toContain('autoBackgroundMs:')
    expect(agentToolSource).not.toContain('getAutoBackgroundMs')
    expect(agentToolSource).not.toContain('<BackgroundHint')
    expect(agentToolSource).not.toContain('CLAUDE_AUTO_BACKGROUND_TASKS')
    expect(agentToolSource).not.toContain('registration.backgroundSignal.then')
  })

  test('detaches every foreground summary shutdown path', () => {
    const foregroundLifecycle = section(
      'const foregroundSummaryScope = new AgentSummaryScope();',
      '// The foreground task remains registered and stoppable through',
    )

    expect(foregroundLifecycle).toContain('registerDetachedAgentSummaryStop({')
    expect(foregroundLifecycle).toContain('scope: foregroundSummaryScope,')
    expect(foregroundLifecycle).toContain(
      'taskId: summaryTaskId ?? syncAgentId,',
    )
    // One call transfers ownership during foreground-to-background handoff;
    // the other covers foreground success, failure, and cancellation in its
    // iteration finally block.
    expect(
      occurrenceCount(foregroundLifecycle, 'detachForegroundSummaries();'),
    ).toBe(2)
    expect(agentToolSource).not.toContain('stopAgentSummaryScope')
  })

  test('detaches background continuation summaries on success, failure, and finally', () => {
    const backgroundLifecycle = section(
      'const backgroundSummaryScope = new AgentSummaryScope();',
      'clearDumpState(syncAgentId);',
    )

    expect(backgroundLifecycle).toContain('registerDetachedAgentSummaryStop({')
    expect(backgroundLifecycle).toContain('scope: backgroundSummaryScope,')
    expect(backgroundLifecycle).toContain('taskId: backgroundedTaskId,')
    expect(
      occurrenceCount(backgroundLifecycle, 'detachBackgroundSummaries();'),
    ).toBe(3)
    expect(backgroundLifecycle).not.toContain('stopBackgroundSummaries')
  })

  test('gives worktree cleanup an independent absolute finalizer signal', () => {
    const worktreeCleanup = section(
      'const cleanupWorktreeIfNeeded = async (',
      'if (shouldRunAsync) {',
    )

    expect(worktreeCleanup).toContain(
      'const finalizerParentSignal = abortSignal?.aborted ? undefined : abortSignal;',
    )
    expect(worktreeCleanup).toMatch(
      /createCombinedAbortSignal\(\s*finalizerParentSignal,\s*\{ timeoutMs: AGENT_WORKTREE_FINALIZER_TIMEOUT_MS \},/,
    )
    expect(worktreeCleanup).not.toMatch(
      /createCombinedAbortSignal\(abortSignal,/,
    )
    expect(occurrenceCount(worktreeCleanup, 'ownerSignal: abortSignal,')).toBe(
      2,
    )
    expect(worktreeCleanup).toContain(
      'hasWorktreeChanges(worktreePath, headCommit, finalizerSignal)',
    )
    expect(worktreeCleanup).toContain(
      'removeAgentWorktree(worktreePath, worktreeBranch, gitRoot, false, finalizerSignal)',
    )
  })
})
