import type { Command } from '../../types/command.js'
import { t } from '../../i18n/t.js'

const workflows = {
  type: 'local-jsx',
  name: 'workflows',
  get description() {
    return t('Workflow 监控面板：实时 run/phase/agent 进度，键盘控制')
  },
  // 延迟加载面板实现，避免启动时拉入 Ink/React 依赖。
  load: () => import('../../workflow/panel/panelCall.js'),
} satisfies Command

export default workflows
