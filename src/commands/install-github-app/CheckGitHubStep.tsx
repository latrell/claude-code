import { t } from '../../i18n/t.js';
import { Text } from '@anthropic/ink';

export function CheckGitHubStep() {
  return <Text>{t('Checking GitHub CLI installation…')}</Text>;
}
