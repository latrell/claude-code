import React, { useEffect, useState } from 'react';
import { formatCost } from '../cost-tracker.js';
import { Box, Text } from '@anthropic/ink';
import { formatTokens } from '../utils/format.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { t } from '../i18n/t.js';
import { getResolvedLanguage } from '../utils/language.js';
import type { ProviderUsageBucket } from '../services/providerUsage/types.js';

type RateLimitBucket = {
  utilization: number;
  resets_at: number;
};

type BuiltinStatusLineProps = {
  modelName: string;
  contextUsedPct: number;
  usedTokens: number;
  contextWindowSize: number;
  totalCostUsd: number;
  rateLimits: {
    five_hour?: RateLimitBucket;
    seven_day?: RateLimitBucket;
  };
  /** Non-Anthropic provider usage buckets (e.g. OpenAI RPM/TPM). */
  providerBuckets?: ProviderUsageBucket[];
};

/**
 * Format a countdown from now until the given epoch time (in seconds).
 * Returns a compact human-readable string like "3h12m", "5d20h", "45m", or "now".
 */
export function formatCountdown(epochSeconds: number): string {
  const diff = epochSeconds - Date.now() / 1000;
  if (diff <= 0) return t('now');

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (getResolvedLanguage() === 'zh') {
    if (days >= 1) return `${days}天${hours}时`;
    if (hours >= 1) return `${hours}时${minutes}分`;
    return `${minutes}分`;
  }

  if (days >= 1) return `${days}d${hours}h`;
  if (hours >= 1) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

const CHATGPT_BASE_LIMIT_LABELS = new Set(['Primary rate limit', 'Secondary rate limit']);

export function formatProviderBucketLabel(label: string, kind?: ProviderUsageBucket['kind']): string {
  if (CHATGPT_BASE_LIMIT_LABELS.has(label)) {
    if (kind === 'session') return t('Session ').trim();
    if (kind === 'weekly') return t('Weekly ').trim();
  }

  if (getResolvedLanguage() === 'zh') {
    if (label === 'Primary rate limit') return '主限';
    if (label === 'Secondary rate limit') return '副限';
    if (label === 'Included usage') return '额度';
    if (label === 'Included API usage') return 'API 额度';
    if (label === 'Included Auto usage') return 'Auto 额度';
    if (label === 'On-demand usage') return '按量';
  }
  // Compact status-line labels for the Cursor buckets.
  if (label === 'Included usage') return 'Usage';
  if (label === 'Included API usage') return 'API';
  if (label === 'Included Auto usage') return 'Auto';
  if (label === 'On-demand usage') return 'On-demand';
  return t(label);
}

/** Compact dollar rendering for the status line: $16.25, $400, $3000. */
export function formatCentsCompact(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

/** Preserve the complete model alias unless the terminal is genuinely narrow. */
export function statusLineModelName(modelName: string, narrow: boolean): string {
  if (!narrow) return modelName;
  const modelParts = modelName.split(' ');
  return modelParts.length >= 2 ? `${modelParts[0]} ${modelParts[1]}` : modelName;
}

function Separator() {
  return <Text dimColor>{' \u2502 '}</Text>;
}

function ProviderBucketItem({ bucket, narrow }: { bucket: ProviderUsageBucket; narrow: boolean }): React.ReactNode {
  const pct = Math.round(bucket.utilization * 100);
  // Escalating color as a quota approaches/exceeds its limit so a critical
  // bucket stands out (>=100% keeps showing the real overage percentage).
  const pctColor = bucket.utilization >= 1 ? 'error' : bucket.utilization >= 0.8 ? 'warning' : undefined;
  const isDollarBucket = bucket.usedCents !== undefined;
  return (
    <>
      <Separator />
      <Text dimColor>{formatProviderBucketLabel(bucket.label, bucket.kind)} </Text>
      {isDollarBucket ? (
        <Text color={pctColor}>
          {formatCentsCompact(bucket.usedCents ?? 0)}
          {bucket.limitCents !== undefined && bucket.limitCents > 0 && (
            <Text dimColor>/{formatCentsCompact(bucket.limitCents)}</Text>
          )}
        </Text>
      ) : (
        <Text color={pctColor}>{pct}%</Text>
      )}
      {!narrow && bucket.resetsAt !== undefined && bucket.resetsAt > 0 && (
        <Text dimColor> {formatCountdown(bucket.resetsAt)}</Text>
      )}
    </>
  );
}

function BuiltinStatusLineInner({
  modelName,
  contextUsedPct,
  usedTokens,
  contextWindowSize,
  totalCostUsd,
  rateLimits,
  providerBuckets,
}: BuiltinStatusLineProps) {
  const { columns } = useTerminalSize();

  const hasFiveHour = rateLimits.five_hour != null;
  const hasSevenDay = rateLimits.seven_day != null;
  const hasProviderBuckets = providerBuckets !== undefined && providerBuckets.length > 0;

  // Collect resets_at values for the 60s tick: Anthropic rate limits first,
  // then fall back to provider bucket reset times.
  const tickResetValues = (rateLimits.five_hour?.resets_at ? [rateLimits.five_hour.resets_at] : [])
    .concat(rateLimits.seven_day?.resets_at ? [rateLimits.seven_day.resets_at] : [])
    .concat(hasProviderBuckets ? providerBuckets!.map(b => b.resetsAt ?? 0).filter(t => t > 0) : []);

  // Force re-render every 60s so countdowns stay current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tickResetValues.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tickResetValues)]);

  // Suppress unused-variable lint for tick (it exists only to trigger re-renders)
  void tick;

  const narrow = columns < 60;
  const displayModel = statusLineModelName(modelName, narrow);

  const fiveHourPct = hasFiveHour ? Math.round(rateLimits.five_hour!.utilization * 100) : 0;
  const sevenDayPct = hasSevenDay ? Math.round(rateLimits.seven_day!.utilization * 100) : 0;

  // Token display: "50k/1M"
  const tokenDisplay = `${formatTokens(usedTokens)}/${formatTokens(contextWindowSize)}`;

  return (
    <Box>
      {/* Model name */}
      <Text>{displayModel}</Text>

      {/* Context usage with token counts */}
      <Separator />
      <Text dimColor>{t('Context ')}</Text>
      <Text>{contextUsedPct}%</Text>
      {!narrow && <Text dimColor> ({tokenDisplay})</Text>}

      {/* 5-hour session rate limit */}
      {hasFiveHour && (
        <>
          <Separator />
          <Text dimColor>{t('Session ')}</Text>
          <Text>{fiveHourPct}%</Text>
          {!narrow && rateLimits.five_hour!.resets_at > 0 && (
            <Text dimColor> {formatCountdown(rateLimits.five_hour!.resets_at)}</Text>
          )}
        </>
      )}

      {/* 7-day weekly rate limit */}
      {hasSevenDay && (
        <>
          <Separator />
          <Text dimColor>{t('Weekly ')}</Text>
          <Text>{sevenDayPct}%</Text>
          {!narrow && rateLimits.seven_day!.resets_at > 0 && (
            <Text dimColor> {formatCountdown(rateLimits.seven_day!.resets_at)}</Text>
          )}
        </>
      )}

      {/* Non-Anthropic provider usage buckets (fallback when no Anthropic rate limits) */}
      {!hasFiveHour &&
        !hasSevenDay &&
        hasProviderBuckets &&
        providerBuckets!.map((bucket, i) => (
          <ProviderBucketItem key={`${bucket.kind}-${i}`} bucket={bucket} narrow={narrow} />
        ))}

      {/* Cost */}
      {totalCostUsd > 0 && (
        <>
          <Separator />
          <Text>{formatCost(totalCostUsd)}</Text>
        </>
      )}
    </Box>
  );
}

export const BuiltinStatusLine = React.memo(BuiltinStatusLineInner);
