/**
 * Color command - minimal metadata only.
 * Implementation is lazy-loaded from color.ts to reduce startup time.
 */
import type { Command } from '../../commands.js'
import { t } from '../../i18n/t.js'

const color = {
  type: 'local-jsx',
  name: 'color',
  get description() {
    return t('Set the prompt bar color for this session')
  },
  immediate: true,
  argumentHint: '<color|default>',
  load: () => import('./color.js'),
} satisfies Command

export default color
