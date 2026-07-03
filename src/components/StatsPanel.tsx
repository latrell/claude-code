// biome-ignore-all assist/source/organizeImports: keep imports readable
import * as React from 'react';
import { useCallback } from 'react';
import { Box, Text } from '@anthropic/ink';
import {
  getTotalCostUSD,
  getTotalInputTokens,
  getTotalOutputTokens,
  getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens,
  getTotalWebSearchRequests,
  getTotalAPIDuration,
  getTotalDuration,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getModelUsage,
} from '../bootstrap/state.js';
import { formatCost } from '../cost-tracker.js';
import { formatDuration, formatNumber } from '../utils/format.js';
import { getCanonicalName } from '../utils/model/model.js';
import type { ModelUsage } from '../entrypoints/sdk/coreTypes.generated.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { t, tf } from '../i18n/t.js';

type Props = {
  onClose: () => void;
};

type AggregatedModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
};

/**
 * Aggregates per-model-version usage into canonical short-name buckets
 * (e.g. claude-sonnet-20250601 + claude-sonnet-20250219 → claude-sonnet).
 * Exported for testing.
 */
export function aggregateModelUsage(
  modelUsage: { [modelName: string]: ModelUsage },
  resolveName: (model: string) => string = getCanonicalName,
): Map<string, AggregatedModelUsage> {
  const byShortName = new Map<string, AggregatedModelUsage>();
  for (const [model, usage] of Object.entries(modelUsage)) {
    const shortName = resolveName(model);
    const entry = byShortName.get(shortName);
    if (entry) {
      entry.inputTokens += usage.inputTokens;
      entry.outputTokens += usage.outputTokens;
      entry.cacheReadInputTokens += usage.cacheReadInputTokens;
      entry.cacheCreationInputTokens += usage.cacheCreationInputTokens;
      entry.webSearchRequests += usage.webSearchRequests;
      entry.costUSD += usage.costUSD;
    } else {
      byShortName.set(shortName, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        webSearchRequests: usage.webSearchRequests,
        costUSD: usage.costUSD,
      });
    }
  }
  return byShortName;
}

const LABEL_WIDTH = 18;

function StatRow({ label, value, dimColor }: { label: string; value: string; dimColor?: boolean }): React.ReactNode {
  const padded = label.padEnd(LABEL_WIDTH);
  return (
    <Text dimColor={dimColor ?? false}>
      {padded}
      {value}
    </Text>
  );
}

export function StatsPanel({ onClose }: Props): React.ReactNode {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useKeybinding('confirm:no', handleClose, { context: 'Confirmation' });

  const cost = getTotalCostUSD();
  const inputTokens = getTotalInputTokens();
  const outputTokens = getTotalOutputTokens();
  const cacheReadTokens = getTotalCacheReadInputTokens();
  const cacheCreationTokens = getTotalCacheCreationInputTokens();
  const webSearchRequests = getTotalWebSearchRequests();
  const apiDuration = getTotalAPIDuration();
  const wallDuration = getTotalDuration();
  const linesAdded = getTotalLinesAdded();
  const linesRemoved = getTotalLinesRemoved();
  const modelUsage = getModelUsage();
  const aggregatedModels = aggregateModelUsage(modelUsage);

  const hasTokens = inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheCreationTokens > 0;

  const SEP = '\u2500'.repeat(40);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{t('Session Usage Stats')}</Text>

      <Text dimColor>{SEP}</Text>

      <StatRow label={t('Total cost:')} value={formatCost(cost)} />

      {hasTokens && (
        <>
          <Text dimColor>{SEP}</Text>
          <Text bold>{t('Tokens')}</Text>
          {inputTokens > 0 && <StatRow label={t('  Input:')} value={formatNumber(inputTokens)} dimColor />}
          {outputTokens > 0 && <StatRow label={t('  Output:')} value={formatNumber(outputTokens)} dimColor />}
          {cacheReadTokens > 0 && <StatRow label={t('  Cache read:')} value={formatNumber(cacheReadTokens)} dimColor />}
          {cacheCreationTokens > 0 && (
            <StatRow label={t('  Cache write:')} value={formatNumber(cacheCreationTokens)} dimColor />
          )}
        </>
      )}

      {webSearchRequests > 0 && (
        <>
          <Text dimColor>{SEP}</Text>
          <StatRow label={t('Web search reqs:')} value={String(webSearchRequests)} />
        </>
      )}

      <Text dimColor>{SEP}</Text>
      <Text bold>{t('Duration')}</Text>
      <StatRow label={t('  API:')} value={formatDuration(apiDuration)} dimColor />
      <StatRow label={t('  Wall:')} value={formatDuration(wallDuration)} dimColor />

      <Text dimColor>{SEP}</Text>
      <Text bold>{t('Code Changes')}</Text>
      <StatRow label={t('  Lines added:')} value={String(linesAdded)} dimColor />
      <StatRow label={t('  Lines removed:')} value={String(linesRemoved)} dimColor />

      {aggregatedModels.size > 0 && (
        <>
          <Text dimColor>{SEP}</Text>
          <Text bold>{t('Model Usage')}</Text>
          {[...aggregatedModels.entries()].map(([model, usage]) => (
            <Box key={model} flexDirection="column">
              <Text>{model}</Text>
              <StatRow
                label={t('    Tokens:')}
                value={tf('{input} in / {output} out', {
                  input: formatNumber(usage.inputTokens),
                  output: formatNumber(usage.outputTokens),
                })}
                dimColor
              />
              <StatRow label={t('    Cost:')} value={formatCost(usage.costUSD)} dimColor />
            </Box>
          ))}
        </>
      )}

      <Text dimColor>{SEP}</Text>

      <Text dimColor>
        {t('Press')} <Text bold>Esc</Text>
        {` ${t('to close')}`}
      </Text>
    </Box>
  );
}
