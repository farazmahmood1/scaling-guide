import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type SyncRunResponse, type SyncStatus, apiGet, apiPost } from '@/lib/api';
import { ASK_EVERY_MS, dataVersion } from '@/lib/live-sync';
import { queryClient } from '@/lib/query-client';

const TURN_KEY = 'nur.live-sync.asked-at';

/**
 * One tab asks for the syncs at a time: the others see it asked a moment ago and only read the
 * status. Storage can refuse (a private window); then every tab asks, which the server's job locks
 * make harmless.
 */
const claimTurn = (): boolean => {
  try {
    const last = Number(localStorage.getItem(TURN_KEY) ?? 0);
    if (Date.now() - last < ASK_EVERY_MS * 0.9) return false;
    localStorage.setItem(TURN_KEY, String(Date.now()));
  } catch {
    // No storage: ask anyway.
  }
  return true;
};

/**
 * Keeps the open app current with Shopify and PostEx. Every minute while the tab is visible it
 * asks the server for the syncs that are due (where no worker runs, this is what runs them), and
 * whenever a sync has finished since the last look, everything on screen is read again: the
 * figures change without a reload, and only when there is something new. `syncNow` asks for the
 * Shopify and PostEx syncs at once, whatever their schedule.
 */
export function useLiveSync() {
  const [status, setStatus] = useState<SyncStatus>();
  const [syncing, setSyncing] = useState(false);
  const version = useRef<string | null>(null);
  const asking = useRef(false);

  const absorb = useCallback((next: SyncStatus) => {
    setStatus(next);
    const seen = dataVersion(next);
    if (version.current !== null && seen !== version.current) void queryClient.invalidateQueries();
    version.current = seen;
  }, []);

  const ask = useCallback(
    async (now: boolean): Promise<SyncRunResponse | null> => {
      if (asking.current) return null;
      asking.current = true;
      if (now) setSyncing(true);
      try {
        const result = await apiPost<SyncRunResponse>('/api/v1/sync/run', now ? { now: true } : {});
        absorb(result.status);
        return result;
      } catch {
        // The status stays as it was; the next tick tries again.
        return null;
      } finally {
        asking.current = false;
        if (now) setSyncing(false);
      }
    },
    [absorb],
  );

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (claimTurn()) void ask(false);
      else void apiGet<SyncStatus>('/api/v1/sync/status').then(absorb, () => {});
    };
    tick();
    const timer = window.setInterval(tick, ASK_EVERY_MS);
    // Coming back to the tab after a while: catch up straight away rather than at the next tick.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ask, absorb]);

  const syncNow = useCallback(async () => {
    if (asking.current) {
      toast.info('A sync is already running; the figures will refresh when it finishes.');
      return;
    }
    const result = await ask(true);
    if (!result) {
      toast.error('Could not reach the server to sync.');
      return;
    }
    const failed = result.ran.filter((r) => r.status === 'failed');
    if (failed.length > 0) toast.warning(`Synced, but ${failed.map((r) => r.job).join(', ')} failed`, { description: failed[0]?.error });
    else if (result.ran.length === 0) toast.success('Already up to date', { description: 'A sync finished moments ago.' });
    else toast.success('Synced with Shopify and PostEx');
    void queryClient.invalidateQueries();
  }, [ask]);

  return { status, syncing, syncNow };
}
