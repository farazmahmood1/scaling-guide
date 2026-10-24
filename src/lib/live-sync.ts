import type { SyncStatus } from '@/lib/api';
import { fromNow } from '@/lib/format';

/**
 * Keeping the screen current with Shopify and PostEx, apart from how it draws. The server runs the
 * syncs (its worker, a cron, or the open dashboard asking); the screen only needs to know how fresh
 * the data is, and when new data has landed, so it re-reads what is on screen then and not before.
 */

/** How often an open app asks the server for the syncs that are due. The server says no quickly when none are. */
export const ASK_EVERY_MS = 60_000;

/** The jobs whose finishing means figures on screen may have changed. */
const DATA_JOBS = ['shopify:orders', 'shopify:catchup', 'postex:sync', 'reconciliation:scan'];

/** A mark that moves whenever one of those jobs finishes successfully: compare two to know whether to re-read. */
export const dataVersion = (status: SyncStatus): string =>
  status.jobs
    .filter((j) => DATA_JOBS.includes(j.name))
    .map((j) => j.lastSucceededAt ?? '')
    .sort()
    .at(-1) ?? '';

export type Freshness = 'fresh' | 'stale' | 'unknown';

/** The older of the two sources decides: a figure joins both, so it is only as fresh as the staler one. */
export const freshness = (status: SyncStatus | undefined): Freshness => {
  if (!status) return 'unknown';
  if (!status.shopify.lastSyncedAt || !status.postex.lastSyncedAt) return 'stale';
  return status.shopify.stale || status.postex.stale ? 'stale' : 'fresh';
};

/** `Updated 2 min ago`: the older of Shopify's and PostEx's last full read. */
export const freshnessText = (status: SyncStatus | undefined, now: number = Date.now()): string => {
  if (!status) return 'Checking…';
  const times = [status.shopify.lastSyncedAt, status.postex.lastSyncedAt];
  if (times.some((t) => !t)) return 'Not synced yet';
  const oldest = times.sort()[0]!;
  return `Updated ${fromNow(oldest, now)}`;
};

/** One source's line in the details: when it was last read, and whether that is too long ago. */
export const sourceText = (source: SyncStatus['shopify'], now: number = Date.now()): string =>
  source.lastSyncedAt ? `${fromNow(source.lastSyncedAt, now)}${source.stale ? ' — late' : ''}` : 'never';
