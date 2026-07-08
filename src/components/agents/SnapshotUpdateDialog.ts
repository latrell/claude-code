import React from 'react'
import { Dialog, Text } from '@anthropic/ink'
import { t, tf } from '../../i18n/t.js'
import type { AgentMemoryScope } from '@claude-code-best/builtin-tools/tools/AgentTool/agentMemory.js'
import { Select } from '../CustomSelect/index.js'

interface SnapshotUpdateDialogProps {
  agentType: string
  scope: AgentMemoryScope
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

// Ink uses React.createElement instead of JSX here so the real implementation
// can live in a .ts file (bun's `.js` import resolver picks up .ts before
// .tsx in this repo's layout, so co-locating both extensions would shadow
// this module with an empty stub).
export function SnapshotUpdateDialog({
  agentType,
  scope,
  snapshotTimestamp,
  onComplete,
  onCancel,
}: SnapshotUpdateDialogProps): React.ReactElement {
  const children = [
    React.createElement(
      Text,
      { dimColor: true, key: 'timestamp' },
      tf('Snapshot timestamp: {timestamp}', { timestamp: snapshotTimestamp }),
    ),
    React.createElement(Select, {
      key: 'select',
      defaultFocusValue: 'merge',
      options: [
        {
          label: t('Merge snapshot into current memory'),
          value: 'merge',
          description: t(
            'Keep current memory and ask Claude to merge in the snapshot changes.',
          ),
        },
        {
          label: t('Keep current memory'),
          value: 'keep',
          description: t(
            'Ignore this snapshot update and continue with current memory.',
          ),
        },
        {
          label: t('Replace with snapshot'),
          value: 'replace',
          description: t(
            'Overwrite current memory files with the snapshot contents.',
          ),
        },
      ],
      onChange: onComplete as (value: unknown) => void,
    }),
  ]
  return React.createElement(Dialog, {
    title: t('Agent memory snapshot update'),
    subtitle: tf(
      'A newer {scope} memory snapshot is available for {agentType}.',
      { scope, agentType },
    ),
    onCancel,
    color: 'warning' as const,
    children,
  })
}

export function buildMergePrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  return tf(
    'A newer {scope} persistent memory snapshot is available for the "{agentType}" agent.\n\nPlease merge the snapshot update into the current {scope} agent memory before continuing:\n- Preserve useful current memory entries.\n- Incorporate newer or more accurate information from the snapshot.\n- Resolve duplicates or conflicts in favor of the most current, specific information.\n- Keep the memory concise and relevant to future runs of this agent.\n\nAfter merging, continue with the user\'s request.',
    { scope, agentType },
  )
}
