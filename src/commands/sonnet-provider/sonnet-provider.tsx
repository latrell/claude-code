import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ConnectionPicker } from '../../components/connections/ConnectionPicker.js';
import { t } from '../../i18n/t.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { refreshProviderSlotDisplay } from '../provider/providerSlotRefresh.js';
import { runSonnetProviderCommand } from './runSonnetProvider.js';

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> => {
  const trimmed = args?.trim() ?? '';

  if (trimmed) {
    const outcome = await runSonnetProviderCommand(trimmed);
    if (outcome.success) {
      refreshProviderSlotDisplay(context);
    }
    onDone(outcome.message, { display: 'system' });
    return;
  }

  return (
    <ConnectionPicker
      slot="sonnet"
      onDone={message => {
        onDone(message ?? t('Connection picker closed'), { display: 'system' });
      }}
      onAuthChanged={() => refreshProviderSlotDisplay(context)}
    />
  );
};
