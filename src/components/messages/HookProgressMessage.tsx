import * as React from 'react';
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js';
import type { buildMessageLookups } from 'src/utils/messages.js';
import { Box, Text } from '@anthropic/ink';
import { MessageResponse } from '../MessageResponse.js';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';

type Props = {
  hookEvent: HookEvent;
  lookups: ReturnType<typeof buildMessageLookups>;
  toolUseID: string;
  verbose: boolean;
  isTranscriptMode?: boolean;
};

export function HookProgressMessage({ hookEvent, lookups, toolUseID, isTranscriptMode }: Props): React.ReactNode {
  const inProgressHookCount = lookups.inProgressHookCounts.get(toolUseID)?.get(hookEvent) ?? 0;
  const resolvedHookCount = lookups.resolvedHookCounts.get(toolUseID)?.get(hookEvent) ?? 0;
  if (inProgressHookCount === 0) {
    return null;
  }

  if (hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse') {
    // In transcript mode, show a static summary since messages never re-render
    // (so a transient "Running..." would get stuck).
    if (isTranscriptMode) {
      return (
        <MessageResponse>
          <Box flexDirection="row">
            <T dimColor>Running </T>
            <Text dimColor bold>
              {hookEvent}
            </Text>
            <Text dimColor>{inProgressHookCount === 1 ? <T> hook…</T> : <T> hooks…</T>}</Text>
          </Box>
        </MessageResponse>
      );
    }
    // Outside transcript mode, hide — completion info is shown via
    // async_hook_response attachments instead.
    return null;
  }

  if (resolvedHookCount === inProgressHookCount) {
    return null;
  }

  return (
    <MessageResponse>
      <Box flexDirection="row">
        <T dimColor>Running </T>
        <Text dimColor bold>
          {hookEvent}
        </Text>
        <T dimColor>{inProgressHookCount === 1 ? ' hook…' : ' hooks…'}</T>
      </Box>
    </MessageResponse>
  );
}
