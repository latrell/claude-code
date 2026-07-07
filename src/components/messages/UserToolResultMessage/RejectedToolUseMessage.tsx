import * as React from 'react';
import { Text } from '@anthropic/ink';
import { t } from '../../../i18n/t.js';
import { T } from '../../../i18n/TText.js';
import { MessageResponse } from '../../MessageResponse.js';

export function RejectedToolUseMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <T dimColor>Tool use rejected</T>
    </MessageResponse>
  );
}
