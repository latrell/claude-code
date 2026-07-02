import React, { useEffect, useState } from 'react';
import { formatCost } from '../cost-tracker.js';
import { Box, Text } from '@anthropic/ink';
import { formatTokens } from '../utils/format.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { t } from '../i18n/t.js';
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
  if (diff <= 0) return 'now';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days >= 1) return `${days}d${hours}h`;
  if (hours >= 1) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

function Separator() {
  return <Text dimColor>{' \u2502 '}</Text>;
}

function ProviderBucketItem({ bucket, narrow }: { bucket: ProviderUsageBucket; narrow: boolean }): React.ReactNode {
  const pct = Math.round(bucket.utilization * 100);
  return (
    <>
      <Separator />
      <Text dimColor>{bucket.label} </Text>
      <Text>{pct}%</Text>
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

  // Model display: use first two words (e.g. "Opus 4.6") instead of just first word
  const modelParts = modelName.split(' ');
  const shortModel = modelParts.length >= 2 ? `${modelParts[0]} ${modelParts[1]}` : modelName;

  const narrow = columns < 60;

  const fiveHourPct = hasFiveHour ? Math.round(rateLimits.five_hour!.utilization * 100) : 0;
  const sevenDayPct = hasSevenDay ? Math.round(rateLimits.seven_day!.utilization * 100) : 0;

  // Token display: "50k/1M"
  const tokenDisplay = `${formatTokens(usedTokens)}/${formatTokens(contextWindowSize)}`;

  return (
    <Box>
      {/* Model name */}
      <Text>{shortModel}</Text>

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
