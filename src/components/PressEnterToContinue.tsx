import * as React from 'react';
import { Text } from '@anthropic/ink';
import { t } from '../i18n/t.js';

export function PressEnterToContinue(): React.ReactNode {
  return <Text color="permission">{t('Press Enter to continue\u2026')}</Text>;
}
