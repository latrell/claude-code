import React from 'react';
import { Text } from '@anthropic/ink';
import { t, tf } from '../../i18n/t.js';
import {
  applyConnectionThinkingEffortSelection,
  getConnectionThinkingEffortSelection,
  resolveOpenAICompatibleReasoningEffort,
  type ThinkingEffortSelection,
} from '../../services/connections/effortTransport.js';
import type { Connection, ThinkingEffort } from '../../services/connections/types.js';
import type { EffortValue } from '../../utils/effort.js';
import { getEffortEnvOverride } from '../../utils/effort.js';
import { Select, type OptionWithDescription } from '../CustomSelect/select.js';

type Props = {
  connection: Connection;
  appStateEffort: EffortValue | undefined;
  onChange: (connection: Connection) => void;
  onCancel: () => void;
};

const STANDARD_EFFORTS: Exclude<ThinkingEffort, 'max'>[] = ['off', 'low', 'medium', 'high'];

function effortLabel(effort: Exclude<ThinkingEffort, 'max'>): string {
  switch (effort) {
    case 'off':
      return t('Off — disable thinking');
    case 'low':
      return t('Low');
    case 'medium':
      return t('Medium');
    case 'high':
      return t('High');
    default: {
      const _exhaustive: never = effort;
      void _exhaustive;
      return String(effort);
    }
  }
}

function selectionEffort(selection: ThinkingEffortSelection): ThinkingEffort | undefined {
  if (selection === 'default') return undefined;
  if (selection === 'max-compatible' || selection === 'max-passthrough') return 'max';
  return selection;
}

function effortDescription(connection: Connection, selection: ThinkingEffortSelection): string {
  const effort = selectionEffort(selection);
  if (effort === undefined) return t('Actual request: provider/model default');
  if (effort === 'off') return t('Actual request: thinking disabled');

  if (connection.kind === 'openai-compat') {
    const actual = selection === 'max-compatible' ? 'high' : effort;
    const base = tf('Actual request: reasoning_effort={value}', { value: actual });
    return selection === 'max-passthrough' ? `${base} · ${t('endpoint must support this exact value')}` : base;
  }
  if (connection.kind === 'grok') {
    return tf('Actual request: reasoning_effort={value}', {
      value: effort === 'low' ? 'low' : 'high',
    });
  }
  if (connection.kind === 'gemini') {
    const budget = effort === 'low' ? 4096 : effort === 'medium' ? 16384 : effort === 'high' ? 24576 : 32768;
    return tf('Actual request: thinkingBudget={value}', { value: budget });
  }
  if (connection.kind === 'chatgpt-oauth' && effort === 'max') {
    return t('Actual request: highest value supported by the selected ChatGPT model');
  }
  return tf('Requested provider effort: {value}', { value: effort });
}

export function buildThinkingEffortOptions(connection: Connection): OptionWithDescription<string>[] {
  const values: ThinkingEffortSelection[] = [
    'default',
    ...STANDARD_EFFORTS,
    ...(connection.kind === 'openai-compat' ? (['max-compatible', 'max-passthrough'] as const) : (['max'] as const)),
  ];
  const current = getConnectionThinkingEffortSelection(connection);

  return values.map(value => {
    const label =
      value === 'default'
        ? t('Default (not set)')
        : value === 'max-compatible'
          ? t('Max — compatible')
          : value === 'max-passthrough'
            ? t('Max — exact')
            : value === 'max'
              ? t('Max')
              : effortLabel(value);
    const description = effortDescription(connection, value);
    return {
      label,
      value,
      description: value === current ? `${description} · ${t('current')}` : description,
    };
  });
}

export function ThinkingEffortOverrideNotice({
  connection,
  appStateEffort,
}: {
  connection: Connection;
  appStateEffort: EffortValue | undefined;
}): React.ReactNode {
  const actualValue = (value: EffortValue): string => {
    if (connection.kind !== 'openai-compat') return `effort=${value}`;
    const actual = resolveOpenAICompatibleReasoningEffort(value, connection.thinkingEffortTransport, {});
    return actual === undefined ? t('effort field omitted') : `reasoning_effort=${actual}`;
  };
  const envOverride = getEffortEnvOverride();
  if (envOverride === null) {
    return (
      <Text color="warning">
        {tf('CLAUDE_CODE_EFFORT_LEVEL={value} currently overrides this profile and omits the effort field', {
          value: process.env.CLAUDE_CODE_EFFORT_LEVEL,
        })}
      </Text>
    );
  }
  if (envOverride !== undefined) {
    return (
      <Text color="warning">
        {tf('Current override: CLAUDE_CODE_EFFORT_LEVEL={value} → {actual}; connection profile value is not active', {
          value: envOverride,
          actual: actualValue(envOverride),
        })}
      </Text>
    );
  }
  if (appStateEffort !== undefined) {
    return (
      <Text color="warning">
        {tf('Current override: /effort {value} → {actual}; use /effort auto to apply the connection profile', {
          value: appStateEffort,
          actual: actualValue(appStateEffort),
        })}
      </Text>
    );
  }
  return null;
}

export function ThinkingEffortPicker({ connection, appStateEffort, onChange, onCancel }: Props): React.ReactNode {
  const current = getConnectionThinkingEffortSelection(connection);
  const options = [
    ...buildThinkingEffortOptions(connection),
    { label: t('Back'), value: '__back__', description: undefined },
  ];
  return (
    <>
      <ThinkingEffortOverrideNotice connection={connection} appStateEffort={appStateEffort} />
      <Select
        options={options}
        visibleOptionCount={8}
        defaultFocusValue={current}
        onCancel={onCancel}
        onChange={value => {
          if (value === '__back__') {
            onCancel();
            return;
          }
          onChange(applyConnectionThinkingEffortSelection(connection, value as ThinkingEffortSelection));
        }}
      />
    </>
  );
}
