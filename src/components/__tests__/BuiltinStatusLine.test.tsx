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
import { formatCountdown } from '../BuiltinStatusLine.js';

// ---------------------------------------------------------------------------
// Pure helper: maps ProviderUsageBucket[] to a simplified display shape for
// testing the fallback path. This mirrors the logic in ProviderBucketItem.
// ---------------------------------------------------------------------------

interface BucketDisplay {
  label: string;
  utilizationPct: number;
  hasResetsAt: boolean;
}

function mapBucketsForDisplay(buckets: ProviderUsageBucket[]): BucketDisplay[] {
  return buckets.map(b => ({
    label: b.label,
    utilizationPct: Math.round(b.utilization * 100),
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
    expect(display[0]!.utilizationPct).toBe(75);
    expect(display[0]!.hasResetsAt).toBe(true);
  });

  test('maps TPM bucket correctly', () => {
    const buckets: ProviderUsageBucket[] = [{ kind: 'tokens', label: 'TPM', utilization: 0.25 }];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(1);
    expect(display[0]!.label).toBe('TPM');
    expect(display[0]!.utilizationPct).toBe(25);
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
    expect(mapBucketsForDisplay(buckets)[0]!.utilizationPct).toBe(34);
  });

  test('maps session-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [
      { kind: 'session', label: 'Primary rate limit', utilization: 0.42, resetsAt: 1800000000 },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display).toHaveLength(1);
    expect(display[0]!.label).toBe('Primary rate limit');
    expect(display[0]!.utilizationPct).toBe(42);
    expect(display[0]!.hasResetsAt).toBe(true);
  });

  test('maps weekly-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [{ kind: 'weekly', label: 'Daily limit', utilization: 0.75 }];
    const display = mapBucketsForDisplay(buckets);
    expect(display[0]!.label).toBe('Daily limit');
    expect(display[0]!.utilizationPct).toBe(75);
    expect(display[0]!.hasResetsAt).toBe(false);
  });

  test('maps custom-kind (Codex style) bucket', () => {
    const buckets: ProviderUsageBucket[] = [
      { kind: 'custom', label: 'gpt-4.1', utilization: 0.3, resetsAt: 1800100000 },
    ];
    const display = mapBucketsForDisplay(buckets);
    expect(display[0]!.label).toBe('gpt-4.1');
    expect(display[0]!.utilizationPct).toBe(30);
    expect(display[0]!.hasResetsAt).toBe(true);
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
