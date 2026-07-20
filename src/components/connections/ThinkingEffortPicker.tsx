import React from 'react';
import { Text } from '@anthropic/ink';
import { t, tf } from '../../i18n/t.js';
import {
  applyConnectionThinkingEffortSelection,
  getConnectionThinkingEffortSelection,
  isDeepSeekV4Connection,
  normalizeDeepSeekV4ReasoningEffort,
  resolveOpenAICompatibleReasoningEffort,
  type ThinkingEffortSelection,
} from '../../services/connections/effortTransport.js';
import type { Connection, ThinkingEffort } from '../../services/connections/types.js';
import type { EffortValue } from '../../utils/effort.js';
import { getEffortEnvOverride } from '../../utils/effort.js';
import type { OptionWithDescription } from '../CustomSelect/select.js';
import { ConnectionSelect } from './ConnectionSelect.js';

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
  const isDeepSeek = isDeepSeekV4Connection(connection);
  if (effort === undefined) {
    return isDeepSeek
      ? t('DeepSeek default: normal requests use High; complex agent requests may use Max')
      : t('Actual request: provider/model default');
  }
  if (effort === 'off') return t('Actual request: thinking disabled');

  if (connection.kind === 'openai-compat') {
    const actual = isDeepSeek
      ? selection === 'max-compatible'
        ? 'high'
        : normalizeDeepSeekV4ReasoningEffort(effort)
      : selection === 'max-compatible'
        ? 'high'
        : effort;
    const base = tf('Actual request: reasoning_effort={value}', { value: actual });
    return selection === 'max-passthrough' ? `${base} · ${t('endpoint must support this exact value')}` : base;
  }
  if (isDeepSeek) {
    return tf('Actual DeepSeek effort: {value}', { value: normalizeDeepSeekV4ReasoningEffort(effort) });
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
  const isDeepSeek = isDeepSeekV4Connection(connection);
  // The Codex catalog does not advertise a `none` reasoning effort. Offering
  // Off would therefore claim a wire behavior the ChatGPT backend cannot
  // honor; omit it while retaining low/medium/high/max compatibility.
  const standardEfforts =
    connection.kind === 'chatgpt-oauth' ? STANDARD_EFFORTS.filter(value => value !== 'off') : STANDARD_EFFORTS;
  const values: ThinkingEffortSelection[] = isDeepSeek
    ? ['default', 'off', 'high', connection.kind === 'openai-compat' ? 'max-passthrough' : 'max']
    : [
        'default',
        ...standardEfforts,
        ...(connection.kind === 'openai-compat'
          ? (['max-compatible', 'max-passthrough'] as const)
          : (['max'] as const)),
      ];
  const current = getConnectionThinkingEffortSelection(connection);

  return values.map(value => {
    const label =
      value === 'default'
        ? t('Default (not set)')
        : value === 'max-compatible'
          ? t('Max — compatible')
          : value === 'max-passthrough'
            ? isDeepSeek
              ? t('Max')
              : t('Max — exact')
            : value === 'max'
              ? t('Max')
              : effortLabel(value);
    let description = effortDescription(connection, value);
    if (value === current && isDeepSeek) {
      const saved = connection.thinkingEffort;
      const legacyCompatibleMax =
        connection.kind === 'openai-compat' && saved === 'max' && connection.thinkingEffortTransport !== 'passthrough';
      if (saved === 'low' || saved === 'medium' || legacyCompatibleMax) {
        const savedLabel = legacyCompatibleMax ? 'max (compatible)' : saved;
        description = `${description} · ${tf('saved {value} is treated as High', { value: savedLabel })}`;
      }
    }
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
    if (connection.kind !== 'openai-compat') {
      if (!isDeepSeekV4Connection(connection) || typeof value === 'number') return `effort=${value}`;
      return `effort=${normalizeDeepSeekV4ReasoningEffort(value)}`;
    }
    const actual = resolveOpenAICompatibleReasoningEffort(
      value,
      connection.thinkingEffortTransport,
      {},
      isDeepSeekV4Connection(connection) ? (connection.model ?? 'deepseek-chat') : connection.model,
    );
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
  return (
    <>
      {isDeepSeekV4Connection(connection) ? (
        <Text dimColor>{t('DeepSeek has two native effort levels: High and Max')}</Text>
      ) : null}
      <ThinkingEffortOverrideNotice connection={connection} appStateEffort={appStateEffort} />
      <ConnectionSelect
        options={buildThinkingEffortOptions(connection)}
        visibleOptionCount={8}
        defaultFocusValue={current}
        onBack={onCancel}
        onChange={value =>
          onChange(applyConnectionThinkingEffortSelection(connection, value as ThinkingEffortSelection))
        }
      />
    </>
  );
}
