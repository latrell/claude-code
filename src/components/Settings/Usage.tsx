import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { extraUsage as extraUsageCommand } from 'src/commands/extra-usage/index.js';
import { formatCost } from 'src/cost-tracker.js';
import { getSubscriptionType } from 'src/utils/auth.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { type ExtraUsage, fetchUtilization, type RateLimit, type Utilization } from '../../services/api/usage.js';
import type { ProviderUsageBucket } from '../../services/providerUsage/types.js';
import {
  fetchCodexUsage,
  type CodexRateLimitBucket,
  type CodexUsageSnapshot,
} from '../../services/api/openai/codexUsage.js';
import { formatResetText } from '../../utils/format.js';
import { logError } from '../../utils/log.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Byline, ProgressBar } from '@anthropic/ink';
import { isEligibleForOverageCreditGrant, OverageCreditUpsell } from '../LogoV2/OverageCreditUpsell.js';
import { t, tf } from '../../i18n/t.js';

type LimitBarProps = {
  title: string;
  limit: RateLimit;
  maxWidth: number;
  showTimeInReset?: boolean;
  extraSubtext?: string;
};

function LimitBar({ title, limit, maxWidth, showTimeInReset = true, extraSubtext }: LimitBarProps): React.ReactNode {
  const { utilization, resets_at } = limit;
  if (utilization === null) {
    return null;
  }

  // Calculate usage percentage
  const usedText = tf('{pct}% used', { pct: Math.floor(utilization) });

  let subtext: string | undefined;
  if (resets_at) {
    subtext = tf('Resets {time}', { time: formatResetText(resets_at, true, showTimeInReset) });
  }

  if (extraSubtext) {
    if (subtext) {
      subtext = `${extraSubtext} · ${subtext}`;
    } else {
      subtext = extraSubtext;
    }
  }

  const maxBarWidth = 50;
  const usedLabelSpace = 12;
  if (maxWidth >= maxBarWidth + usedLabelSpace) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Box flexDirection="row" gap={1}>
          <ProgressBar
            ratio={utilization / 100}
            width={maxBarWidth}
            fillColor="rate_limit_fill"
            emptyColor="rate_limit_empty"
          />
          <Text>{usedText}</Text>
        </Box>
        {subtext && <Text dimColor>{subtext}</Text>}
      </Box>
    );
  } else {
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{title}</Text>
          {subtext && (
            <>
              <Text> </Text>
              <Text dimColor>· {subtext}</Text>
            </>
          )}
        </Text>
        <ProgressBar
          ratio={utilization / 100}
          width={maxWidth}
          fillColor="rate_limit_fill"
          emptyColor="rate_limit_empty"
        />
        <Text>{usedText}</Text>
      </Box>
    );
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI / ChatGPT',
  anthropic: 'Anthropic',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
  gemini: 'Google Gemini',
  grok: 'xAI Grok',
};

export function providerDisplayName(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

export function bucketToLimitBar(bucket: ProviderUsageBucket): { limit: RateLimit; label: string } {
  return {
    label: bucket.label,
    limit: {
      utilization: Math.round(bucket.utilization * 100),
      resets_at: bucket.resetsAt ? new Date(bucket.resetsAt * 1000).toISOString() : null,
    },
  };
}

export function codexBucketToLimitBar(bucket: CodexRateLimitBucket): { title: string; limit: RateLimit } {
  return {
    title: bucket.label,
    limit: {
      utilization: bucket.limit > 0 ? Math.round((bucket.used / bucket.limit) * 100) : null,
      resets_at: bucket.resetsAtSeconds > 0 ? new Date(bucket.resetsAtSeconds * 1000).toISOString() : null,
    },
  };
}

function CodexUsageSection({
  codexUsage,
  maxWidth,
}: {
  codexUsage: CodexUsageSnapshot;
  maxWidth: number;
}): React.ReactNode {
  const { account, rateLimits, tokenUsage } = codexUsage;

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text bold>
        {t('ChatGPT Usage')}
        {account?.subscriptionPlan ? ` (${account.subscriptionPlan})` : ''}
      </Text>

      {rateLimits && rateLimits.length > 0 ? (
        rateLimits.map(bucket => {
          const { title, limit } = codexBucketToLimitBar(bucket);
          if (limit.utilization === null) return null;
          return (
            <Box key={title} flexDirection="column">
              <Text bold>{title}</Text>
              <Box flexDirection="row" gap={1}>
                <ProgressBar
                  ratio={limit.utilization / 100}
                  width={Math.min(50, maxWidth - 14)}
                  fillColor="rate_limit_fill"
                  emptyColor="rate_limit_empty"
                />
                <Text>
                  {tf('{pct}% used', { pct: Math.round(bucket.used) })}
                  {limit.resets_at ? (
                    <> ({tf('Resets {time}', { time: formatResetText(limit.resets_at, true, true) })})</>
                  ) : (
                    ''
                  )}
                </Text>
              </Box>
            </Box>
          );
        })
      ) : (
        <Text dimColor>{t('No rate limit data available.')}</Text>
      )}

      {tokenUsage && (
        <Box flexDirection="column">
          <Text bold>{t('Daily tokens')}</Text>
          <Text>
            {tf('{tokens} tokens used on {date}', {
              tokens: tokenUsage.tokensUsed.toLocaleString(),
              date: tokenUsage.date,
            })}
          </Text>
        </Box>
      )}

      <Text dimColor>
        <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description={t('cancel')} />
      </Text>
    </Box>
  );
}

export function Usage(): React.ReactNode {
  const [utilization, setUtilization] = useState<Utilization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [codexUsage, setCodexUsage] = useState<CodexUsageSnapshot | null>(null);
  const { columns } = useTerminalSize();

  const availableWidth = columns - 2; // 2 for screen padding
  const maxWidth = Math.min(availableWidth, 80);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [anthroData, codexData] = await Promise.all([
        fetchUtilization().catch(() => null),
        fetchCodexUsage().catch(() => null),
      ]);
      setUtilization(anthroData);
      if (codexData) setCodexUsage(codexData);
    } catch {
      // Individual errors are caught inside fetchUtilization / fetchCodexUsage;
      // this outer catch protects against unexpected synchronous exceptions.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useKeybinding(
    'settings:retry',
    () => {
      void loadData();
    },
    { context: 'Settings', isActive: !!error && !isLoading },
  );

  if (error) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error">{tf('Error: {error}', { error })}</Text>
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="settings:retry"
              context="Settings"
              fallback="r"
              description={t('retry')}
            />
            <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description={t('cancel')} />
          </Byline>
        </Text>
      </Box>
    );
  }

  if (!utilization) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{t('Loading usage data\u2026')}</Text>
        <Text dimColor>
          <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description={t('cancel')} />
        </Text>
      </Box>
    );
  }

  // Only Max and Team plans have a Sonnet limit that differs from the weekly
  // limit (see rateLimitMessages.ts). For other plans the bar is redundant.
  // Show for null (unknown plan) to stay consistent with rateLimitMessages.ts,
  // which labels it "Sonnet limit" in that case.
  const subscriptionType = getSubscriptionType();
  const showSonnetBar = subscriptionType === 'max' || subscriptionType === 'team' || subscriptionType === null;

  const limits = [
    {
      title: t('Current session'),
      limit: utilization.five_hour,
    },
    {
      title: t('Current week (all models)'),
      limit: utilization.seven_day,
    },
    ...(showSonnetBar
      ? [
          {
            title: t('Current week (Sonnet only)'),
            limit: utilization.seven_day_sonnet,
          },
        ]
      : []),
  ];

  const hasAnthropicLimits = limits.some(({ limit }) => limit);

  // When Anthropic utilization is empty (non-subscriber or third-party
  // provider), try ChatGPT Codex app-server JSON-RPC usage data.
  // If that is unavailable, keep the existing behaviour — do NOT add a
  // provider-usage header fallback in the UI.
  if (!hasAnthropicLimits) {
    if (codexUsage) {
      return <CodexUsageSection codexUsage={codexUsage} maxWidth={maxWidth} />;
    }

    return (
      <Box flexDirection="column" gap={1} width="100%">
        <Text dimColor>{t('/usage is only available for subscription plans.')}</Text>
        <Text dimColor>
          <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description={t('cancel')} />
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} width="100%">
      {limits.map(
        ({ title, limit }) => limit && <LimitBar key={title} title={title} limit={limit} maxWidth={maxWidth} />,
      )}

      {utilization.extra_usage && <ExtraUsageSection extraUsage={utilization.extra_usage} maxWidth={maxWidth} />}

      {isEligibleForOverageCreditGrant() && <OverageCreditUpsell maxWidth={maxWidth} />}

      <Text dimColor>
        <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description={t('cancel')} />
      </Text>
    </Box>
  );
}

type ExtraUsageSectionProps = {
  extraUsage: ExtraUsage;
  maxWidth: number;
};

function ExtraUsageSection({ extraUsage, maxWidth }: ExtraUsageSectionProps): React.ReactNode {
  const subscriptionType = getSubscriptionType();
  const isProOrMax = subscriptionType === 'pro' || subscriptionType === 'max';
  if (!isProOrMax) {
    // Only show to Pro and Max, consistent with claude.ai non-admin usage settings
    return false;
  }

  const extraUsageTitle = t('Extra usage');

  if (!extraUsage.is_enabled) {
    if (extraUsageCommand.isEnabled()) {
      return (
        <Box flexDirection="column">
          <Text bold>{extraUsageTitle}</Text>
          <Text dimColor>{t('Extra usage not enabled \u00b7 /extra-usage to enable')}</Text>
        </Box>
      );
    }

    return null;
  }

  if (extraUsage.monthly_limit === null) {
    return (
      <Box flexDirection="column">
        <Text bold>{extraUsageTitle}</Text>
        <Text dimColor>{t('Unlimited')}</Text>
      </Box>
    );
  }

  if (typeof extraUsage.used_credits !== 'number' || typeof extraUsage.utilization !== 'number') {
    return null;
  }

  const formattedUsedCredits = formatCost(extraUsage.used_credits / 100, 2);
  const formattedMonthlyLimit = formatCost(extraUsage.monthly_limit / 100, 2);
  const now = new Date();
  const oneMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <LimitBar
      title={extraUsageTitle}
      limit={{
        utilization: extraUsage.utilization,
        // Not applicable for enterprises, but for now we don't render this for them
        resets_at: oneMonthReset.toISOString(),
      }}
      showTimeInReset={false}
      extraSubtext={tf('{used} / {limit} spent', {
        used: formattedUsedCredits,
        limit: formattedMonthlyLimit,
      })}
      maxWidth={maxWidth}
    />
  );
}
