import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, ChevronDown, ChevronUp, Store } from 'lucide-react';
import { toast } from 'sonner';

import { useBrand } from '@/brand/brand-context';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { type StockComparisonRow, type StoreKey, apiPost } from '@/lib/api';
import { formatKarachiFull } from '@/lib/format';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

type Filter = 'all' | 'negative' | 'differs';
type Health = 'negative' | 'matches' | 'more' | 'less';

/** How Shopify's figure for a product compares with our shelf, in a word a person can act on. */
const healthOf = (r: StockComparisonRow): Health => (r.onHand < 0 || r.available < 0 ? 'negative' : r.difference === 0 ? 'matches' : r.difference > 0 ? 'more' : 'less');

const HEALTH: Record<Health, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  negative: { label: 'Below zero in Shopify', variant: 'destructive' },
  matches: { label: 'Matches our shelf', variant: 'secondary' },
  more: { label: 'Shopify shows more', variant: 'outline' },
  less: { label: 'Shopify shows less', variant: 'outline' },
};

function Tile({ label, value, hint, alarm }: { label: string; value: string; hint: string; alarm?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', alarm && 'border-brand-coral/50 bg-brand-coral/5')} title={hint}>
      <dt className={cn('text-xs font-medium text-muted-foreground', alarm && 'text-brand-coral')}>{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * What Shopify says each product has, beside our own shelf: the store's stock as Shopify keeps
 * it (the website sells from "available"), read with the hourly catalogue sync. Shopify's figures
 * are only as good as the team keeps them; this view shows where they cannot be trusted.
 */
export function ShopifyStockPanel({ onDone }: { onDone: () => void }) {
  const { brand } = useBrand();
  const [chosen, setChosen] = useState<StoreKey>('nur');
  const store: StoreKey = brand ?? chosen;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [byDifference, setByDifference] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [asAt, setAsAt] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data, error, loading, reload } = useApi<{ rows: StockComparisonRow[] }>(`/api/v1/stock/shopify-comparison?store=${store}`);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const totals = useMemo(
    () => ({
      products: rows.length,
      onHand: rows.reduce((n, r) => n + r.onHand, 0),
      committed: rows.reduce((n, r) => n + r.committed, 0),
      available: rows.reduce((n, r) => n + r.available, 0),
      negative: rows.filter((r) => healthOf(r) === 'negative').length,
      differs: rows.filter((r) => r.difference !== 0).length,
      readAt: rows.map((r) => r.readAt).sort().at(-1) ?? null,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter(
      (r) => (filter === 'all' || (filter === 'negative' ? healthOf(r) === 'negative' : r.difference !== 0)) && (!term || `${r.title} ${r.sku ?? ''}`.toLowerCase().includes(term)),
    );
    return byDifference ? [...list].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)) : list;
  }, [rows, filter, search, byDifference]);

  const take = async () => {
    setSaving(true);
    try {
      const result = await apiPost<{ lines: number; units: number }>('/api/v1/stock/opening-from-shopify', { asAt, store });
      toast.success(result.lines ? `Opening count recorded from Shopify: ${result.lines} products, ${result.units} units` : 'Nothing to record: our stock already matches');
      setConfirming(false);
      reload();
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the opening count');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl text-sm text-muted-foreground">
          <p>
            This is the stock Shopify keeps for the online store: the website sells from <span className="font-medium text-foreground">Available</span>. It is shown here
            to compare, not to count from. Our own shelf figure comes from parcels, returns and counts, and does not change when Shopify does.
          </p>
          {totals.readAt && <p className="mt-1 text-xs">Read from Shopify {formatKarachiFull(totals.readAt)}.</p>}
        </div>
        {!brand && (
          <select className={selectClass} value={store} onChange={(e) => setChosen(e.target.value as StoreKey)} aria-label="Store">
            <option value="nur">NUR by Juggun</option>
            <option value="organics">Juggun's Organics</option>
          </select>
        )}
      </div>

      {data && rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Tile label="Products" value={String(totals.products)} hint="Variants Shopify keeps stock for" />
          <Tile label="On hand" value={String(totals.onHand)} hint="All units Shopify thinks are at the location" alarm={totals.onHand < 0} />
          <Tile label="Committed" value={String(totals.committed)} hint="Held for orders not marked fulfilled or cancelled" />
          <Tile label="Available" value={String(totals.available)} hint="What the website can still sell" alarm={totals.available < 0} />
          <Tile label="Below zero" value={String(totals.negative)} hint="Products Shopify cannot be right about" alarm={totals.negative > 0} />
        </dl>
      )}

      {totals.negative > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-medium">Shopify's stock is not being kept up to date</p>
            <p className="text-muted-foreground">
              {totals.negative} {totals.negative === 1 ? 'product is' : 'products are'} below zero in Shopify, and {totals.committed} units are held for orders that were never marked fulfilled or cancelled. That happens
              when new stock is not added in Shopify, orders are not fulfilled there, and returned parcels are not cancelled or restocked there. Count the shelf on the "Count the
              shelf" tab instead; checking returns in now also corrects Shopify for each one.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Which products" className="flex gap-1 rounded-lg border p-0.5 text-sm">
          {(
            [
              ['all', `All (${totals.products})`],
              ['negative', `Below zero (${totals.negative})`],
              ['differs', `Differs from our shelf (${totals.differs})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="rounded-md px-3 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        <Input className="w-full sm:w-64" placeholder="Find a product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a product" />
        <Button variant="ghost" size="sm" aria-pressed={byDifference} onClick={() => setByDifference(!byDifference)}>
          <ArrowDownUp className="size-4" />
          {byDifference ? 'Biggest difference first' : 'By name'}
        </Button>
      </div>

      {loading && !data && (
        <TableSkeleton variant="ui" rows={6} label="Loading Shopify's stock" columns={['Product', num('On hand'), num('Committed'), num('Available'), num('Our shelf'), num('Difference'), 'Status']} />
      )}
      {error && <p className="text-sm text-brand-coral">Could not load Shopify's stock: {error}</p>}
      {data && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <Store className="size-8 text-muted-foreground" />
          <p className="font-medium">No stock read from Shopify yet</p>
          <p className="text-sm text-muted-foreground">It arrives with the hourly catalogue sync.</p>
        </div>
      )}
      {visible.length > 0 && (
        <div className="max-h-[32rem] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Shopify stock beside our shelf</caption>
            <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Product</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Everything Shopify thinks is at the location">On hand</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Held for orders not yet marked fulfilled or cancelled">Committed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="What the website can sell">Available</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Our shelf, from parcels, returns and counts">Our shelf</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Shopify's shelf estimate minus our shelf">Difference</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const health = healthOf(r);
                return (
                  <tr key={r.variantId} className={cn('border-t', health === 'negative' && 'bg-brand-coral/5')}>
                    <td className="px-3 py-2">
                      {r.title.replace(' · Default Title', '')}
                      <div className="font-mono text-xs text-muted-foreground">{r.sku ?? 'no SKU'}</div>
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.onHand < 0 && 'font-medium text-brand-coral')}>{r.onHand}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{r.committed}</td>
                    <td className={cn('px-3 py-2 text-right font-medium tabular-nums', r.available < 0 && 'text-brand-coral')}>{r.available}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.warehouse < 0 && 'text-brand-coral')}>{r.warehouse}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.difference === 0 ? 'text-muted-foreground' : 'font-medium')}>{r.difference > 0 ? `+${r.difference}` : r.difference}</td>
                    <td className="px-3 py-2">
                      <Badge variant={HEALTH[health].variant}>{HEALTH[health].label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && rows.length > 0 && visible.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No products match.</p>}

      {rows.length > 0 && (
        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
            Advanced: take the opening count from Shopify
            {advanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
          {advanced && (
            <div className="mt-2 space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
              <p className="text-muted-foreground">
                Only if Shopify's figures are right for this brand. It sets our shelf to Shopify's available plus what is committed to orders not yet booked, dated on the day
                below. {totals.negative > 0 ? `Not recommended now: ${totals.negative} products are below zero in Shopify.` : ''} Once per brand.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  As at
                  <Input type="date" className="mt-1 w-44" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
                </label>
                {confirming ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={saving} onClick={() => void take()}>
                      Yes, record {totals.differs} products from Shopify
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled={!asAt || totals.differs === 0} onClick={() => setConfirming(true)}>
                    Use Shopify's figures as the opening count
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
