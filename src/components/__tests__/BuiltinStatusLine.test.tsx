import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import type { ProviderUsageBucket } from '../../services/providerUsage/types.js';

// ---------------------------------------------------------------------------
// Language mock — mutable so en tests use the default (undefined) and zh
// tests set to '简体中文' before dynamic import. Bun hoists mock.module to
// the top of the file; the static formatCountdown import below resolves
// while mockLanguage is still undefined (en mode).
// ---------------------------------------------------------------------------

let mockLanguage: string | undefined;

mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ language: mockLanguage }),
}));

// Static import — resolves in en mode (mockLanguage === undefined)
import {
  formatCentsCompact,
  formatCountdown,
  formatProviderBucketLabel,
  formatProviderBucketPercentage,
  statusLineModelName,
} from '../BuiltinStatusLine.js';

describe('statusLineModelName', () => {
  test('keeps the complete model alias on normal-width terminals', () => {
    expect(statusLineModelName('GPT 5.6 Sol', false)).toBe('GPT 5.6 Sol');
  });

  test('uses the compact family name only on narrow terminals', () => {
    expect(statusLineModelName('GPT 5.6 Sol', true)).toBe('GPT 5.6');
  });
});

// ---------------------------------------------------------------------------
// Pure helper: maps ProviderUsageBucket[] to a simplified display shape for
// testing the fallback path. This mirrors the logic in ProviderBucketItem.
// ---------------------------------------------------------------------------

interface BucketDisplay {
  label: string;
  percentage: string;
  hasResetsAt: boolean;
}

function mapBucketsForDisplay(buckets: ProviderUsageBucket[]): BucketDisplay[] {
  return buckets.map(b => ({
    label: b.label,
    percentage: formatProviderBucketPercentage(b),
    hasResetsAt: (b.resetsAt ?? 0) > 0,
  }));
}

// ---------------------------------------------------------------------------
// formatCountdown — re-exported from BuiltinStatusLine.tsx
// FormatCountdown uses Date.now() internally, so tests account for ~1s drift.
// ---------------------------------------------------------------------------

describe('formatCountdown', () => {
  test('returns "now" for zero seconds', () => {
    expect(formatCountdown(Math.floor(Date.now() / 1000))).toBe('now');
  });

  test('returns "now" for past timestamp', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(formatCountdown(past)).toBe('now');
  });

  test('returns minutes only for sub-hour', () => {
    const future = Math.floor(Date.now() / 1000) + 45 * 60 + 2; // +2s guard
    const result = formatCountdown(future);
    // Allow minor drift (1s elapsed between future calculation and formatCountdown call)
    expect(result).toMatch(/^4[4-5]m$/);
  });

  test('returns hours and minutes for ~1h30m', () => {
    const future = Math.floor(Date.now() / 1000) + 90 * 60 + 2;
    const result = formatCountdown(future);
    expect(result).toMatch(/^1h(?:29|30)m$/);
  });

  test('returns days and hours for ~2d4h', () => {
    const future = Math.floor(Date.now() / 1000) + 2 * 86400 + 4 * 3600 + 2;
    const result = formatCountdown(future);
    expect(result).toMatch(/^2d(?:3|4)h$/);
  });
});

// ---------------------------------------------------------------------------
// mapBucketsForDisplay — provider bucket display mapping
// ---------------------------------------------------------------------------

describe('mapBucketsForDisplay', () => {
  test('maps RPM bucket correctly', () => {
    const buckets: ProviderUsageBucket[] = [
      { kind: 'requests', label: 'RPM', utilization: 0.75, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(1);
    expect(display[0]!.label).toBe('RPM');
    expect(display[0]!.percentage).toBe('75%');
    expect(display[0]!.hasResetsAt).toBe(true);
  });

  test('maps TPM bucket correctly', () => {
    const buckets: ProviderUsageBucket[] = [{ kind: 'tokens', label: 'TPM', utilization: 0.25 }];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(1);
    expect(display[0]!.label).toBe('TPM');
    expect(display[0]!.percentage).toBe('25%');
    expect(display[0]!.hasResetsAt).toBe(false);
  });

  test('handles multiple buckets', () => {
    const buckets: ProviderUsageBucket[] = [
      { kind: 'requests', label: 'RPM', utilization: 0.5 },
      { kind: 'tokens', label: 'TPM', utilization: 0.33 },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(2);
    expect(display[0]!.label).toBe('RPM');
    expect(display[1]!.label).toBe('TPM');
  });

  test('handles empty buckets array', () => {
    expect(mapBucketsForDisplay([])).toEqual([]);
  });

  test('rounds utilization to integer percentage', () => {
    const buckets: ProviderUsageBucket[] = [{ kind: 'tokens', label: 'TPM', utilization: 0.337 }];
    expect(mapBucketsForDisplay(buckets)[0]!.percentage).toBe('34%');
  });

  test('maps session-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [
      {
        kind: 'session',
        label: 'Primary rate limit',
        utilization: 0.42,
        resetsAt: 1800000000,
        windowMinutes: 300,
      },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(1);
    expect(display[0]!.label).toBe('Primary rate limit');
    expect(display[0]!.percentage).toBe('42%');
    expect(display[0]!.hasResetsAt).toBe(true);
  });

  test('maps weekly-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [
      {
        kind: 'weekly',
        label: 'Daily limit',
        utilization: 0.75,
      },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display[0]!.label).toBe('Daily limit');
    expect(display[0]!.percentage).toBe('75%');
    expect(display[0]!.hasResetsAt).toBe(false);
  });

  test('maps custom-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [
      {
        kind: 'custom',
        label: 'gpt-4.1',
        utilization: 0.3,
        resetsAt: 1800100000,
      },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display[0]!.label).toBe('gpt-4.1');
    expect(display[0]!.percentage).toBe('30%');
    expect(display[0]!.hasResetsAt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cursor status-line label compaction + dollar rendering (en mode)
// ---------------------------------------------------------------------------

describe('formatProviderBucketLabel (en)', () => {
  test('uses role-based fallbacks when ChatGPT window duration is absent', () => {
    expect(formatProviderBucketLabel('Primary rate limit', 'weekly')).toBe('usage');
    expect(formatProviderBucketLabel('Secondary rate limit', 'weekly')).toBe('secondary usage');
    expect(formatProviderBucketLabel('Primary rate limit', 'session')).toBe('usage');
  });

  test('preserves additional limit labels regardless of window kind', () => {
    expect(formatProviderBucketLabel('GPT-5.3-Codex-Spark', 'weekly')).toBe('GPT-5.3-Codex-Spark');
  });

  test('uses Codex duration labels for subscription limits', () => {
    expect(formatProviderBucketLabel('Primary rate limit', 'session', 300)).toBe('5h');
    expect(formatProviderBucketLabel('Secondary rate limit', 'custom', 1440)).toBe('daily');
    expect(formatProviderBucketLabel('Primary rate limit', 'weekly', 10080)).toBe('weekly');
    expect(formatProviderBucketLabel('Primary rate limit', 'custom', 43200)).toBe('monthly');
    expect(formatProviderBucketLabel('Secondary rate limit', 'custom', 120)).toBe('secondary usage');
  });

  test('compacts Cursor bucket labels for the status line', () => {
    expect(formatProviderBucketLabel('Included usage')).toBe('Usage');
    expect(formatProviderBucketLabel('Included API usage')).toBe('API');
    expect(formatProviderBucketLabel('Included Auto usage')).toBe('Auto');
    expect(formatProviderBucketLabel('On-demand usage')).toBe('On-demand');
  });
});

describe('formatProviderBucketPercentage', () => {
  test('shows ChatGPT subscription utilization as used percentage', () => {
    expect(
      formatProviderBucketPercentage({
        kind: 'session',
        label: 'Primary rate limit',
        utilization: 0.4,
      }),
    ).toBe('40%');
    expect(
      formatProviderBucketPercentage({
        kind: 'weekly',
        label: 'Secondary rate limit',
        utilization: 0.94,
      }),
    ).toBe('94%');
  });

  test('preserves overage and generic provider utilization semantics', () => {
    expect(
      formatProviderBucketPercentage({
        kind: 'custom',
        label: 'Over limit',
        utilization: 1.2,
      }),
    ).toBe('120%');
    expect(
      formatProviderBucketPercentage({
        kind: 'custom',
        label: 'Negative provider bug',
        utilization: -0.2,
      }),
    ).toBe('-20%');
    expect(formatProviderBucketPercentage({ kind: 'requests', label: 'RPM', utilization: 0.4 })).toBe('40%');
  });
});

describe('formatCentsCompact', () => {
  test('renders dollars with cents when non-zero', () => {
    expect(formatCentsCompact(1625)).toBe('$16.25');
  });

  test('drops trailing .00 for whole-dollar amounts', () => {
    expect(formatCentsCompact(300000)).toBe('$3000');
    expect(formatCentsCompact(40000)).toBe('$400');
  });

  test('renders zero as $0', () => {
    expect(formatCentsCompact(0)).toBe('$0');
  });
});

// ---------------------------------------------------------------------------
// Chinese locale: formatCountdown + label translations.
// Uses dynamic import() after setting mockLanguage to '简体中文' so
// getResolvedLanguage() returns 'zh' and t() returns Chinese translations.
// ---------------------------------------------------------------------------

describe('Chinese locale', () => {
  beforeAll(() => {
    mockLanguage = '简体中文';
  });

  afterAll(() => {
    mockLanguage = undefined;
  });

  test('formatCountdown returns 现在 for past timestamp', async () => {
    const { formatCountdown: zhFormatCountdown } = await import('../BuiltinStatusLine.js');
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(zhFormatCountdown(past)).toBe('现在');
  });

  test('formatCountdown returns 现在 for current timestamp', async () => {
    const { formatCountdown: zhFormatCountdown } = await import('../BuiltinStatusLine.js');
    const now = Math.floor(Date.now() / 1000);
    expect(zhFormatCountdown(now)).toBe('现在');
  });

  test('formatCountdown localizes minutes, hours, and days', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatCountdown(now + 10 * 60 + 2)).toMatch(/^10分$/);
    expect(formatCountdown(now + 3 * 3600 + 12 * 60 + 2)).toMatch(/^3时12分$/);
    expect(formatCountdown(now + 2 * 86400 + 17 * 3600 + 2)).toMatch(/^2天17时$/);
  });

  test('formatProviderBucketLabel uses short Chinese status-line labels', () => {
    expect(formatProviderBucketLabel('Primary rate limit')).toBe('用量');
    expect(formatProviderBucketLabel('Secondary rate limit')).toBe('次级用量');
    expect(formatProviderBucketLabel('Primary rate limit', 'weekly')).toBe('用量');
    expect(formatProviderBucketLabel('Primary rate limit', 'session')).toBe('用量');
    expect(formatProviderBucketLabel('RPM')).toBe('请求/分钟');
  });

  test('localizes Codex duration labels and keeps used percentage', () => {
    expect(formatProviderBucketLabel('Primary rate limit', 'session', 300)).toBe('5 小时');
    expect(formatProviderBucketLabel('Secondary rate limit', 'weekly', 10080)).toBe('每周');
    expect(
      formatProviderBucketPercentage({
        kind: 'session',
        label: 'Primary rate limit',
        utilization: 0.4,
      }),
    ).toBe('40%');
  });

  test('formatProviderBucketLabel uses short Chinese Cursor labels', () => {
    expect(formatProviderBucketLabel('Included usage')).toBe('额度');
    expect(formatProviderBucketLabel('Included API usage')).toBe('API 额度');
    expect(formatProviderBucketLabel('Included Auto usage')).toBe('Auto 额度');
    expect(formatProviderBucketLabel('On-demand usage')).toBe('按量');
  });

  test('t() translates Primary rate limit to 主要速率限制', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('Primary rate limit')).toBe('主要速率限制');
  });

  test('t() translates Secondary rate limit to 次要速率限制', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('Secondary rate limit')).toBe('次要速率限制');
  });

  test('t() translates RPM to 请求/分钟', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('RPM')).toBe('请求/分钟');
  });

  test('t() translates TPM to 词元/分钟', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('TPM')).toBe('词元/分钟');
  });

  test('t() keeps model name unchanged when no translation key exists', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('GPT-5.3-Codex-Spark')).toBe('GPT-5.3-Codex-Spark');
  });

  test('t() keeps unknown label unchanged (fallback to key)', async () => {
    const { t } = await import('../../i18n/t.js');
    expect(t('gpt-4.1')).toBe('gpt-4.1');
  });
});
