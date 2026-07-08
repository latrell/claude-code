import React from 'react';
import { t } from 'src/i18n/t.js';
import { jsonParse } from 'src/utils/slowOperations.js';
import type { Output } from './TeamDeleteTool.js';

export function renderToolUseMessage(_input: Record<string, unknown>): React.ReactNode {
  return t('cleanup team: current');
}

export function renderToolResultMessage(
  content: Output | string,
  _progressMessages: unknown,
  { verbose: _verbose }: { verbose: boolean },
): React.ReactNode {
  const result: Output = typeof content === 'string' ? jsonParse(content) : content;

  // Suppress cleanup result - the batched shutdown message covers this
  if ('success' in result && 'team_name' in result && 'message' in result) {
    return null;
  }

  return null;
}
