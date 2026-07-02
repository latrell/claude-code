import type { Command } from '../../commands.js';
import { t } from '../../i18n/t.js';

const plugin = {
  type: 'local-jsx',
  name: 'plugin',
  aliases: ['plugins', 'marketplace'],
  get description() {
    return t('Manage Claude Code plugins');
  },
  immediate: true,
  load: () => import('./plugin.js'),
} satisfies Command;

export default plugin;
