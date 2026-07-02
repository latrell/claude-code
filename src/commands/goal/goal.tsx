/**
 * `/goal` slash command — set, view, or control the persistent thread
 * goal that drives auto-continuation across turns.
 *
 * Subcommands
 * -----------
 * `/goal`              -> show current status
 * `/goal status`       -> alias of bare `/goal`
 * `/goal clear`        -> remove the active goal (persists tombstone)
 * `/goal pause`        -> pause auto-continuation
 * `/goal resume`       -> resume from paused state
 * `/goal continue`     -> reset turn counter after max-turns and continue
 * `/goal complete`     -> mark complete (manual override; tools usually do this)
 * `/goal <objective>`  -> set a new goal; if one is already active and not
 *                         complete, a confirmation dialog appears first.
 */
import * as React from 'react';

import type { LocalJSXCommandContext } from 'src/commands.js';
import {
  clearGoal,
  completeGoal,
  continueGoalFromMaxTurns,
  formatGoalElapsed,
  formatGoalStatusLabel,
  getGoal,
  incrementGoalTurns,
  MAX_GOAL_TURNS,
  pauseGoal,
  resumeGoal,
  setGoal,
} from 'src/services/goal/goalState.js';
import { persistCurrentGoal, persistGoalClear } from 'src/services/goal/goalStorage.js';
import type { LocalJSXCommandOnDone } from 'src/types/command.js';
import { removeByFilter } from 'src/utils/messageQueueManager.js';
import { t, tf } from 'src/i18n/t.js';
import { GoalReplaceConfirmDialog } from './GoalReplaceConfirmDialog.js';

const MAX_OBJECTIVE_CHARS = 4000;
const MAX_DISPLAY_CHARS = 80;

function truncateForDisplay(objective: string): string {
  const firstLine = objective.split('\n')[0] ?? objective;
  if (firstLine.length <= MAX_DISPLAY_CHARS) return firstLine;
  return firstLine.slice(0, MAX_DISPLAY_CHARS) + '…';
}

function drainGoalContinuationQueue(): void {
  removeByFilter(cmd => cmd.origin === 'goal-continuation' || cmd.origin === 'goal-budget-limit');
}

function formatGoalStatus(): string {
  const goal = getGoal();
  if (!goal) {
    return t('No active goal. Set one with `/goal <objective>`.');
  }
  const tokens = goal.tokenBudget !== null ? `${goal.tokensUsed} / ${goal.tokenBudget}` : `${goal.tokensUsed}`;
  const lines = [
    tf('Goal: {objective}', { objective: goal.objective }),
    tf('Status: {status}', { status: formatGoalStatusLabel(goal.status) }),
    tf('Time: {elapsed}', { elapsed: formatGoalElapsed(goal) }),
    tf('Tokens: {tokens}', { tokens }),
    tf('Continuation turns: {turns}', { turns: goal.turnsExecuted }),
  ];

  if (goal.status === 'max_turns') {
    lines.push(
      tf('Hint: Max continuation turns reached ({maxTurns}). Run `/goal continue` to reset and continue.', {
        maxTurns: MAX_GOAL_TURNS,
      }),
    );
  }

  return lines.join('\n');
}

function applySetGoal(objective: string): string {
  setGoal(objective);
  incrementGoalTurns();
  persistCurrentGoal();
  return t('Goal set.');
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const trimmed = args.trim();

  if (!trimmed || trimmed.toLowerCase() === 'status') {
    onDone(formatGoalStatus(), { display: 'system' });
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (lower === 'clear') {
    const cleared = clearGoal();
    if (cleared) {
      persistGoalClear();
      drainGoalContinuationQueue();
    }
    onDone(cleared ? t('Goal cleared.') : t('No active goal to clear.'), {
      display: 'system',
    });
    return null;
  }

  if (lower === 'pause') {
    const g = pauseGoal();
    if (g) {
      persistCurrentGoal();
      drainGoalContinuationQueue();
    }
    onDone(g ? t('Goal paused.') : t('No active goal to pause.'), {
      display: 'system',
    });
    return null;
  }

  if (lower === 'resume') {
    const current = getGoal();
    if (current?.status === 'max_turns') {
      onDone(
        tf(
          'Goal reached max continuation turns ({maxTurns}). Run `/goal continue` to reset turn counter and continue.',
          { maxTurns: MAX_GOAL_TURNS },
        ),
        { display: 'system' },
      );
      return null;
    }
    const g = resumeGoal();
    if (g) persistCurrentGoal();
    onDone(g ? t('Goal resumed.') : t('No paused goal to resume.'), {
      display: 'system',
      shouldQuery: Boolean(g),
    });
    return null;
  }

  if (lower === 'continue') {
    const g = continueGoalFromMaxTurns();
    if (g) persistCurrentGoal();
    onDone(
      g
        ? tf('Goal continuation counter reset (0/{maxTurns}). Continuing...', { maxTurns: MAX_GOAL_TURNS })
        : t('Current goal is not in max-turns state.'),
      {
        display: 'system',
        shouldQuery: Boolean(g),
      },
    );
    return null;
  }

  if (lower === 'complete') {
    const g = completeGoal();
    if (g) {
      persistCurrentGoal();
      drainGoalContinuationQueue();
    }
    onDone(g ? t('Goal marked complete.') : t('No active goal to complete.'), {
      display: 'system',
    });
    return null;
  }

  if (trimmed.length > MAX_OBJECTIVE_CHARS) {
    onDone(
      tf(
        'Goal objective is too long ({length} chars; limit {max}). Save the detailed instructions to a file and reference it from a shorter objective.',
        { length: trimmed.length, max: MAX_OBJECTIVE_CHARS },
      ),
      { display: 'system' },
    );
    return null;
  }

  const existing = getGoal();
  const needsConfirmation = existing && existing.status !== 'complete';

  if (!needsConfirmation) {
    const summary = applySetGoal(trimmed);
    onDone(summary, {
      display: 'system',
      shouldQuery: true,
      displayArgs: truncateForDisplay(trimmed),
      metaMessages: [`<goal-objective-updated>\n${trimmed}\n</goal-objective-updated>`],
    });
    return null;
  }

  return (
    <GoalReplaceConfirmDialog
      currentGoal={existing}
      newObjective={trimmed}
      onConfirm={() => {
        drainGoalContinuationQueue();
        const summary = applySetGoal(trimmed);
        onDone(summary, {
          display: 'system',
          shouldQuery: true,
          displayArgs: truncateForDisplay(trimmed),
          metaMessages: [`<goal-objective-updated>\n${trimmed}\n</goal-objective-updated>`],
        });
      }}
      onCancel={() => {
        onDone(t('Kept the current goal. New objective discarded.'), {
          display: 'system',
        });
      }}
    />
  );
}
