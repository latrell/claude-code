import React from 'react';
import { Box, Text } from '@anthropic/ink';
import { formatDuration, formatTokens } from '../utils/format.js';
import { getResolvedLanguage, type ResolvedLanguage } from '../utils/language.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';

type IdleReturnAction = 'continue' | 'clear' | 'dismiss' | 'never';

type Props = {
  idleMinutes: number;
  totalInputTokens: number;
  onDone: (action: IdleReturnAction) => void;
};

export function IdleReturnDialog({ idleMinutes, totalInputTokens, onDone }: Props): React.ReactNode {
  const formattedIdle = formatIdleDuration(idleMinutes);
  const formattedTokens = formatTokens(totalInputTokens);

  return (
    <Dialog
      title={tf("You've been away {idle} and this conversation is {tokens} tokens.", {
        idle: formattedIdle,
        tokens: formattedTokens,
      })}
      onCancel={() => onDone('dismiss')}
    >
      <Box flexDirection="column">
        <T>If this is a new task, clearing context will save usage and be faster.</T>
      </Box>
      <Select
        options={[
          {
            value: 'continue' as const,
            label: t('Continue this conversation'),
          },
          {
            value: 'clear' as const,
            label: t('Send message as a new conversation'),
          },
          {
            value: 'never' as const,
            label: t("Don't ask me again"),
          },
        ]}
        onChange={(value: IdleReturnAction) => onDone(value)}
      />
    </Dialog>
  );
}

export function formatIdleDuration(minutes: number, language: ResolvedLanguage = getResolvedLanguage()): string {
  if (minutes < 1) {
    return `< ${formatDuration(60_000, {
      hideTrailingZeros: true,
      language,
    })}`;
  }
  return formatDuration(Math.floor(minutes) * 60_000, {
    hideTrailingZeros: true,
    language,
  });
}
