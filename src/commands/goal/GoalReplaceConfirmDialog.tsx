/**
 * Confirmation dialog shown when the user runs `/goal <objective>`
 * while a non-complete goal is already active.
 */
import * as React from 'react';

import { Box, Text } from '@anthropic/ink';

import type { GoalState } from 'src/types/logs.js';
import { Select } from 'src/components/CustomSelect/index.js';
import { PermissionDialog } from 'src/components/permissions/PermissionDialog.js';
import { formatGoalElapsed, formatGoalStatusLabel } from 'src/services/goal/goalState.js';
import { t } from 'src/i18n/t.js';
import { T } from 'src/i18n/TText.js';

type Props = {
  currentGoal: GoalState;
  newObjective: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GoalReplaceConfirmDialog({ currentGoal, newObjective, onConfirm, onCancel }: Props): React.ReactNode {
  function handleResponse(value: 'yes' | 'no'): void {
    if (value === 'yes') onConfirm();
    else onCancel();
  }

  const tokensDisplay =
    currentGoal.tokenBudget !== null
      ? `${currentGoal.tokensUsed} / ${currentGoal.tokenBudget}`
      : `${currentGoal.tokensUsed}`;

  return (
    <PermissionDialog color="warning" title={t('Replace active goal?')}>
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <T>A goal is already in progress. Replacing it will reset all progress and counters.</T>

        <Box marginTop={1} flexDirection="column">
          <T dimColor>Current goal:</T>
          <Text>
            <T dimColor>· Objective: </T>
            {currentGoal.objective}
          </Text>
          <Text>
            <T dimColor>· Status: </T>
            {formatGoalStatusLabel(currentGoal.status)}
          </Text>
          <Text>
            <T dimColor>· Time: </T>
            {formatGoalElapsed(currentGoal)}
          </Text>
          <Text>
            <T dimColor>· Tokens: </T>
            {tokensDisplay}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <T dimColor>New objective:</T>
          <Text>{newObjective}</Text>
        </Box>

        <Box marginTop={1}>
          <Select
            options={[
              { label: t('Yes, replace the goal'), value: 'yes' as const },
              { label: t('No, keep the current goal'), value: 'no' as const },
            ]}
            onChange={handleResponse}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  );
}
