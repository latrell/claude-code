import React from 'react';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { Text } from '@anthropic/ink';
import { jsonStringify } from 'src/utils/slowOperations.js';
import type { Input, Output } from './ConfigTool.js';
import { tf } from 'src/i18n/t.js';
import { T } from 'src/i18n/TText.js';

export function renderToolUseMessage(input: Partial<Input>): React.ReactNode {
  if (!input.setting) return null;
  if (input.value === undefined) {
    return <Text dimColor>{tf('Getting {setting}', { setting: input.setting })}</Text>;
  }
  return (
    <Text dimColor>
      Setting {input.setting} to {jsonStringify(input.value)}
    </Text>
  );
}

export function renderToolResultMessage(content: Output): React.ReactNode {
  if (!content.success) {
    return (
      <MessageResponse>
        <Text color="error">{tf('Failed: {error}', { error: content.error })}</Text>
      </MessageResponse>
    );
  }
  if (content.operation === 'get') {
    return (
      <MessageResponse>
        <Text>
          <Text bold>{content.setting}</Text> = {jsonStringify(content.value)}
        </Text>
      </MessageResponse>
    );
  }
  return (
    <MessageResponse>
      <Text>
        Set <Text bold>{content.setting}</Text> to <Text bold>{jsonStringify(content.newValue)}</Text>
      </Text>
    </MessageResponse>
  );
}

export function renderToolUseRejectedMessage(): React.ReactNode {
  return <T color="warning">Config change rejected</T>;
}
