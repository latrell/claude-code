import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ConnectionPicker } from '../../components/connections/ConnectionPicker.js';
import { t } from '../../i18n/t.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { stripSignatureBlocks } from '../../utils/messages.js';
import { refreshProviderSlotDisplay } from './providerSlotRefresh.js';
import { runProviderCommand } from './runProvider.js';

function applyAuthChanged(context: LocalJSXCommandContext): void {
  // Credentials may have changed (OAuth slot switch, new API key):
  // re-verify auth and refresh auth-dependent hooks, mirroring /connect.
  context.onChangeAPIKey();
  context.setMessages(stripSignatureBlocks);
  context.setAppState(prev => ({
    ...prev,
    authVersion: prev.authVersion + 1,
  }));
}

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> => {
  const trimmed = args?.trim() ?? '';

  if (trimmed) {
    const outcome = await runProviderCommand(trimmed);
    if (outcome.success && outcome.mainLoopModel !== undefined) {
      const model = outcome.mainLoopModel;
      context.setAppState(prev => ({
        ...prev,
        mainLoopModel: model,
        mainLoopModelForSession: null,
      }));
    }
    if (outcome.authChanged) {
      applyAuthChanged(context);
      refreshProviderSlotDisplay(context);
    }
    onDone(outcome.message, { display: 'system' });
    return;
  }

  return (
    <ConnectionPicker
      slot="main"
      onDone={message => {
        onDone(message ?? t('Connection picker closed'), { display: 'system' });
      }}
      onMainModelChange={model => {
        context.setAppState(prev => ({
          ...prev,
          mainLoopModel: model,
          mainLoopModelForSession: null,
        }));
      }}
      onAuthChanged={() => {
        applyAuthChanged(context);
        refreshProviderSlotDisplay(context);
      }}
    />
  );
};
