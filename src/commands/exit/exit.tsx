import { feature } from 'bun:bundle';
import { spawnSync } from 'child_process';
import * as React from 'react';
import { ExitFlow } from '../../components/ExitFlow.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { isBgSession } from '../../utils/concurrentSessions.js';
import { gracefulShutdown } from '../../utils/gracefulShutdown.js';
import { getCurrentWorktreeSession } from '../../utils/worktree.js';

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  // Inside a `claude --bg` tmux session: detach instead of kill. The REPL
  // keeps running; `claude attach` can reconnect. Covers /exit, /quit,
  // ctrl+c, ctrl+d — all funnel through here via REPL's handleExit.
  if (feature('BG_SESSIONS') && isBgSession()) {
    onDone();
    spawnSync('tmux', ['detach-client'], { stdio: 'ignore' });
    return null;
  }

  const showWorktree = getCurrentWorktreeSession() !== null;

  if (showWorktree) {
    return <ExitFlow showWorktree={showWorktree} onDone={onDone} onCancel={() => onDone()} />;
  }

  // Non-worktree, non-bg: exit directly. Skip onDone because it sets
  // shouldHidePromptInput: false (in handlePromptSubmit's onDone closure),
  // which would cause Ink to re-render the PromptInput/footer right before
  // process.exit, leaving command suggestions as terminal residual.
  await gracefulShutdown(0, 'prompt_input_exit');
  return null;
}
