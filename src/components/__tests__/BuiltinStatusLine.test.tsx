import { describe, expect, test } from 'bun:test';
import { formatCountdown } from '../BuiltinStatusLine.js';
import type { ProviderUsageBucket } from '../../services/providerUsage/types.js';

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
});
