import { useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import type { ShopifyAccess } from '@/lib/api';
import { storeLabel } from '@/lib/parcels';

type Need = 'writeOrders' | 'writeInventory';

const SCOPE: Record<Need, string> = { writeOrders: 'write_orders', writeInventory: 'write_inventory' };

/**
 * Says up front when Shopify will refuse what this screen sends it, because the store's app has
 * not been given the write scope yet, and how the owner grants it. Read live from Shopify; shows
 * nothing once every store has what the screen needs, or when Shopify could not be asked.
 */
export function ShopifyAccessNotice({ needs, purpose }: { needs: readonly Need[]; purpose: string }) {
  const [fresh, setFresh] = useState(0);
  const [open, setOpen] = useState(false);
  const { data, loading } = useApi<{ stores: ShopifyAccess[] }>(`/api/v1/integrations/shopify-access${fresh ? `?refresh=true&n=${fresh}` : ''}`);
  const missing = (data?.stores ?? [])
    .map((s) => ({ store: s.store, scopes: needs.filter((n) => s[n] === false).map((n) => SCOPE[n]) }))
    .filter((s) => s.scopes.length > 0);
  if (missing.length === 0) return null;
  const allScopes = [...new Set(missing.flatMap((m) => m.scopes))];

  return (
    <div role="status" className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Shopify is not letting the platform {purpose} yet</p>
          <p className="text-muted-foreground">
            {missing.map((m) => `${storeLabel(m.store)} is missing ${m.scopes.join(' and ')}`).join('; ')}. Everything still works here and is saved; Shopify just
            refuses the change until the store owner grants the permission, then it can be retried.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="bg-background" onClick={() => setOpen(!open)} aria-expanded={open}>
            How to grant it
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => setFresh((n) => n + 1)} aria-label="Check again">
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
        </div>
      </div>
      {open && (
        <ol className="mt-3 ml-8 list-decimal space-y-1 text-muted-foreground">
          <li>
            Open <span className="font-medium text-foreground">dev.shopify.com</span>, sign in as the store owner, and open the app this platform uses (the one whose Client ID is in the server settings).
          </li>
          <li>
            Create a new version. Under <span className="font-medium text-foreground">Access scopes</span>, keep the existing ones and add <span className="font-mono text-foreground">{allScopes.join(', ')}</span>.
          </li>
          <li>Release the version, then open the store's admin and approve the updated permissions when Shopify asks.</li>
          <li>Come back here and press the refresh button: this notice disappears once Shopify reports the new scopes.</li>
        </ol>
      )}
    </div>
  );
}
