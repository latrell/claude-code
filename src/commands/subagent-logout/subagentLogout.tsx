import * as React from 'react';
import { Text } from '@anthropic/ink';
import { removeChatGPTAuth } from '../../services/api/openai/chatgptAuth.js';
import { SUBAGENT_CREDENTIAL_SCOPE } from '../../utils/model/subagentProvider.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

export async function call(): Promise<React.ReactNode> {
  const { error } = updateSettingsForSource('userSettings', {
    subagentProvider: undefined,
  } as unknown as Parameters<typeof updateSettingsForSource>[1]);

  if (error) {
    return <Text color="error">Failed to clear subagent login: {error.message}</Text>;
  }

  await removeChatGPTAuth(SUBAGENT_CREDENTIAL_SCOPE);

  return <Text>Subagent login cleared. Agent sub-sessions will inherit the main login.</Text>;
}
