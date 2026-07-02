import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const mcp = {
  type: 'local-jsx',
  name: 'mcp',
  get description() {
    return t('Manage MCP servers')
  },
  immediate: true,
  argumentHint: '[enable|disable [server-name]]',
  load: () => import('./mcp.js'),
} satisfies Command

export default mcp
