import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { BLACK_CIRCLE } from '../../constants/figures.js';
import { Box, Text, type TextProps } from '@anthropic/ink';
import { extractTag } from '../../utils/messages.js';
import { t } from '../../i18n/t.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
};

function getStatusColor(status: string | null): TextProps['color'] {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'killed':
      return 'warning';
    default:
      return 'text';
  }
}

/**
 * Translate known agent task notification summary patterns at the display layer.
 * The original summary strings are embedded in protocol XML and sent to the model;
 * this function translates only the user-visible rendered text.
 */
function translateAgentSummary(summary: string): string {
  // Pattern: Agent "DESCRIPTION" completed
  const completedMatch = summary.match(/^Agent "(.*)" completed$/);
  if (completedMatch) {
    return t('Agent "{description}" completed').replace('{description}', completedMatch[1]!);
  }
  // Pattern: Agent "DESCRIPTION" failed: ERROR
  const failedMatch = summary.match(/^Agent "(.*)" failed: (.*)$/);
  if (failedMatch) {
    return t('Agent "{description}" failed: {error}')
      .replace('{description}', failedMatch[1]!)
      .replace('{error}', failedMatch[2]!);
  }
  // Pattern: Agent "DESCRIPTION" was stopped
  const stoppedMatch = summary.match(/^Agent "(.*)" was stopped$/);
  if (stoppedMatch) {
    return t('Agent "{description}" was stopped').replace('{description}', stoppedMatch[1]!);
  }
  return summary;
}

export function UserAgentNotificationMessage({ addMargin, param: { text } }: Props): React.ReactNode {
  const summary = extractTag(text, 'summary');
  if (!summary) return null;

  const status = extractTag(text, 'status');
  const color = getStatusColor(status);
  const displaySummary = translateAgentSummary(summary);

  return (
    <Box marginTop={addMargin ? 1 : 0}>
      <Text>
        <Text color={color}>{BLACK_CIRCLE}</Text> {displaySummary}
      </Text>
    </Box>
  );
}
