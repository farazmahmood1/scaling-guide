import { describe, expect, it } from 'vitest';

import type { SyncStatus } from '@/lib/api';
import { dataVersion, freshness, freshnessText, sourceText } from '@/lib/live-sync';

const NOW = Date.parse('2026-10-24T10:00:00Z');
const job = (name: string, lastSucceededAt: string | null) => ({ name, everyMs: 120_000, lastStartedAt: null, lastSucceededAt, lastStatus: null, lastError: null, running: false });
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  now: '2026-10-24T10:00:00Z',
  shopify: { lastSyncedAt: '2026-10-24T09:59:00Z', stale: false },
  postex: { lastSyncedAt: '2026-10-24T09:57:00Z', stale: false },
  lastWebhookAt: null,
  jobs: [job('shopify:orders', '2026-10-24T09:59:00Z'), job('postex:sync', '2026-10-24T09:57:00Z'), job('system.heartbeat', '2026-10-24T09:59:30Z')],
  ...over,
});

describe('dataVersion', () => {
  it('moves when a data sync finishes, and not for housekeeping', () => {
    expect(dataVersion(status())).toBe('2026-10-24T09:59:00Z');
    const later = status({ jobs: [job('shopify:orders', '2026-10-24T09:59:00Z'), job('postex:sync', '2026-10-24T10:01:00Z')] });
    expect(dataVersion(later)).not.toBe(dataVersion(status()));
    expect(dataVersion(status({ jobs: [job('system.heartbeat', '2026-10-24T10:05:00Z')] }))).toBe('');
  });
});

describe('freshness', () => {
  it('is as fresh as the staler source, and never fresh when a source has never synced', () => {
    expect(freshness(status())).toBe('fresh');
    expect(freshness(status({ postex: { lastSyncedAt: '2026-10-24T08:00:00Z', stale: true } }))).toBe('stale');
    expect(freshness(status({ shopify: { lastSyncedAt: null, stale: true } }))).toBe('stale');
    expect(freshness(undefined)).toBe('unknown');
  });

  it('says how old the older source is', () => {
    expect(freshnessText(status(), NOW)).toBe('Updated 3 min ago');
    expect(freshnessText(status({ shopify: { lastSyncedAt: null, stale: true } }), NOW)).toBe('Not synced yet');
    expect(sourceText({ lastSyncedAt: '2026-10-24T08:00:00Z', stale: true }, NOW)).toBe('2 h ago — late');
  });
});
