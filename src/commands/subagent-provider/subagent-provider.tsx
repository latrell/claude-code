import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ConnectionPicker } from '../../components/connections/ConnectionPicker.js';
import { t } from '../../i18n/t.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { runSubagentProviderCommand } from './runSubagentProvider.js';

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> => {
  const trimmed = args?.trim() ?? '';

  if (trimmed) {
    const outcome = await runSubagentProviderCommand(trimmed);
    onDone(outcome.message, { display: 'system' });
    return;
  }

  return (
    <ConnectionPicker
      slot="subagent"
      onDone={message => {
        onDone(message ?? t('Connection picker closed'), { display: 'system' });
      }}
    />
  );
};
