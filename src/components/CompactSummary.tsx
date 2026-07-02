import * as React from 'react';
import { BLACK_CIRCLE } from '../constants/figures.js';
import { Box, Text } from '@anthropic/ink';
import type { Screen } from '../screens/REPL.js';
import type { NormalizedUserMessage } from '../types/message.js';
import { getUserMessageText } from '../utils/messages.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { MessageResponse } from './MessageResponse.js';
import { t, tf } from '../i18n/t.js';

type Props = {
  message: NormalizedUserMessage;
  screen: Screen;
};

export function CompactSummary({ message, screen }: Props): React.ReactNode {
  const isTranscriptMode = screen === 'transcript';
  const textContent = getUserMessageText(message) || '';
  const metadata = message.summarizeMetadata as
    | {
        messagesSummarized?: number;
        direction?: string;
        userContext?: string;
      }
    | undefined;

  // "Summarize from here" with metadata
  if (metadata) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Box minWidth={2}>
            <Text color="text">{BLACK_CIRCLE}</Text>
          </Box>
          <Box flexDirection="column">
            <Text bold>{t('Summarized conversation')}</Text>
            {!isTranscriptMode && (
              <MessageResponse>
                <Box flexDirection="column">
                  <Text dimColor>
                    {tf('Summarized {count} messages {direction}', {
                      count: metadata.messagesSummarized,
                      direction: metadata.direction === 'up_to' ? t('up to this point') : t('from this point'),
                    })}
                  </Text>
                  {metadata.userContext && (
                    <Text dimColor>
                      {tf('Context: \u201c{context}\u201d', {
                        context: metadata.userContext,
                      })}
                    </Text>
                  )}
                  <Text dimColor>
                    <ConfigurableShortcutHint
                      action="app:toggleTranscript"
                      context="Global"
                      fallback="ctrl+o"
                      description="expand history"
                      parens
                    />
                  </Text>
                </Box>
              </MessageResponse>
            )}
            {isTranscriptMode && (
              <MessageResponse>
                <Text>{textContent}</Text>
              </MessageResponse>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Default compact summary (auto-compact)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text color="text">{BLACK_CIRCLE}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>
            {t('Conversation summarized to free up context')}
            {!isTranscriptMode && (
              <Text dimColor>
                {' '}
                <ConfigurableShortcutHint
                  action="app:toggleTranscript"
                  context="Global"
                  fallback="ctrl+o"
                  description="view summary"
                  parens
                />
              </Text>
            )}
          </Text>
        </Box>
      </Box>
      {isTranscriptMode && (
        <MessageResponse>
          <Text>{textContent}</Text>
        </MessageResponse>
      )}
    </Box>
  );
}
