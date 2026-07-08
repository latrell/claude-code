import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { ToolProgressData } from 'src/Tool.js';
import type { ProgressMessage } from 'src/types/message.js';
import type { ThemeName } from 'src/utils/theme.js';
import type { Output } from './ExitWorktreeTool.js';
import { t, tf } from 'src/i18n/t.js';

export function renderToolUseMessage(): React.ReactNode {
  return t('Exiting worktree…');
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  _options: { theme: ThemeName },
): React.ReactNode {
  const actionLabel = output.action === 'keep' ? t('Kept worktree') : t('Removed worktree');
  return (
    <Box flexDirection="column">
      <Text>
        {actionLabel}
        {output.worktreeBranch ? (
          <>
            {' '}
            (branch <Text bold>{output.worktreeBranch}</Text>)
          </>
        ) : null}
      </Text>
      <Text dimColor>{tf('Returned to {cwd}', { cwd: output.originalCwd })}</Text>
    </Box>
  );
}
