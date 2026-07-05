import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ModelsPicker } from '../../components/connections/ModelsPicker.js';
import { t } from '../../i18n/t.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { stripSignatureBlocks } from '../../utils/messages.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const initialSlot = args?.trim() === 'sub' ? 'subagent' : 'main';
  return (
    <ModelsPicker
      initialSlot={initialSlot}
      onDone={message => {
        onDone(message ?? t('Model picker closed'), { display: 'system' });
      }}
      onMainModelChange={model => {
        context.setAppState(prev => ({
          ...prev,
          mainLoopModel: model,
          mainLoopModelForSession: null,
        }));
      }}
      onAuthChanged={() => {
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
