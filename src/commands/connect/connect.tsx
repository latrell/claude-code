import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ConnectionsPanel } from '../../components/connections/ConnectionsPanel.js';
import { t } from '../../i18n/t.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { stripSignatureBlocks } from '../../utils/messages.js';

export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext): Promise<React.ReactNode> {
  return (
    <ConnectionsPanel
      onDone={message => {
        onDone(message ?? t('Connections closed'), { display: 'system' });
      }}
      onMainModelChange={model => {
        context.setAppState(prev => ({
          ...prev,
          mainLoopModel: model,
          mainLoopModelForSession: null,
        }));
      }}
      onAuthChanged={() => {
        // Credentials may have changed (OAuth slot switch, new API key):
        // re-verify auth and refresh auth-dependent hooks, mirroring /login.
        context.onChangeAPIKey();
        context.setMessages(stripSignatureBlocks);
        context.setAppState(prev => ({
          ...prev,
          authVersion: prev.authVersion + 1,
        }));
      }}
    />
  );
}
