import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLiveSync } from '@/hooks/use-live-sync';
import { fromNow } from '@/lib/format';
import { freshness, freshnessText, sourceText } from '@/lib/live-sync';

const DOT = { fresh: 'bg-emerald-500', stale: 'bg-amber-500', unknown: 'bg-muted-foreground' } as const;

/**
 * How fresh the data on screen is, in the header, with the details and a Sync now button behind
 * it. Mounting it is what keeps the app current: see `useLiveSync`.
 */
export function SyncIndicator() {
  const { status, syncing, syncNow } = useLiveSync();
  const level = freshness(status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-white/80 hover:bg-white/10 hover:text-white lg:text-muted-foreground lg:hover:bg-muted lg:hover:text-foreground"
          aria-label={`Data freshness: ${freshnessText(status, now)}`}
        >
          <span aria-hidden className={`size-2 rounded-full ${DOT[level]} ${syncing ? 'animate-pulse' : ''}`} />
          <span className="hidden text-xs sm:inline">{syncing ? 'Syncing…' : freshnessText(status, now)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <p className="font-medium">Data from Shopify and PostEx</p>
          <p className="text-xs text-muted-foreground">Read every 2 minutes, and refreshed on screen as soon as something new arrives. No need to reload the page.</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Shopify orders</dt>
          <dd>{status ? sourceText(status.shopify, now) : '…'}</dd>
          <dt className="text-muted-foreground">PostEx parcels</dt>
          <dd>{status ? sourceText(status.postex, now) : '…'}</dd>
          <dt className="text-muted-foreground">Shopify webhooks</dt>
          <dd>{status ? (status.lastWebhookAt ? `last ${fromNow(status.lastWebhookAt, now)}` : 'none received') : '…'}</dd>
        </dl>
        {level === 'stale' && (
          <p className="rounded-md bg-amber-500/10 p-2 text-xs">
            The syncs have not finished for a while. They run while this app is open and on the server's own schedule; press Sync now to run them straight away. If this stays, check the Connections card on the Overview.
          </p>
        )}
        <Button size="sm" className="w-full" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
