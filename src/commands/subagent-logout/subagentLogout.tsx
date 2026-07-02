import type * as React from 'react';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { removeChatGPTAuth } from '../../services/api/openai/chatgptAuth.js';
import { SUBAGENT_CREDENTIAL_SCOPE } from '../../utils/model/subagentProvider.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  const { error } = updateSettingsForSource('userSettings', {
    subagentProvider: undefined,
  } as unknown as Parameters<typeof updateSettingsForSource>[1]);

  if (error) {
    onDone(`Failed to clear subagent login: ${error.message}`, { display: 'system' });
    return null;
  }

  await removeChatGPTAuth(SUBAGENT_CREDENTIAL_SCOPE);

  onDone('Subagent login cleared. Agent sub-sessions will inherit the main login.', { display: 'system' });
  return null;
}
