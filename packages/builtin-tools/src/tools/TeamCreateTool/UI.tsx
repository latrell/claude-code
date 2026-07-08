import React from 'react';
import { t } from 'src/i18n/t.js';
import type { Input } from './TeamCreateTool.js';

export function renderToolUseMessage(input: Partial<Input>): React.ReactNode {
  return `${t('create team: ')}${input.team_name}`;
}
