import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { MoveHistory } from '@/components/move-history';
import { StockTable, StockTotals } from '@/components/stock-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type Quant, type StockComparisonRow, type StockLocation, type VariantHit, apiGet, apiPost } from '@/lib/api';
import { pivotQuants } from '@/lib/stock';

const REASONS = [
  { value: 'opening_stock', label: 'Opening stock' },
  { value: 'count', label: 'Stock count' },
  { value: 'correction', label: 'Correction' },
  { value: 'damage', label: 'Damage' },
  { value: 'loss', label: 'Loss' },
] as const;

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

interface Line {
  variant: VariantHit;
  delta: string;
}

/**
 * A count or correction. Each line moves units between the adjustment location and the chosen
 * one; the backend writes the moves and the audit row, never a quantity.
 */
function AdjustmentForm({ locations, onDone }: { locations: StockLocation[]; onDone: () => void }) {
  const holding = locations.filter((l) => ['warehouse', 'partner', 'damaged'].includes(l.kind));
  const [chosenLocation, setLocationId] = useState('');
  // The first holding location until the user picks one; the list arrives after the first render.
  const locationId = chosenLocation || holding[0]?.id || '';
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('count');
  const [note, setNote] = useState('');
  const [asAt, setAsAt] = useState('');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<{ variants: VariantHit[] }>(`/api/v1/stock/variants?search=${encodeURIComponent(term)}`, controller.signal)
        .then((r) => setHits(r.variants))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // Short searches show nothing rather than the last long search's results.
  const visibleHits = search.trim().length >= 2 ? hits : [];
  const deltas = lines.map((l) => Number(l.delta));
  const valid = locationId && lines.length > 0 && deltas.every((d) => Number.isInteger(d) && d !== 0);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/stock/adjustments', {
        locationId,
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(reason === 'opening_stock' && asAt ? { asAt } : {}),
        lines: lines.map((l, i) => ({ variantId: l.variant.id, delta: deltas[i] })),
      });
      toast.success('Adjustment recorded');
      setLines([]);
      setNote('');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Count or correction</CardTitle>
        <CardDescription>Positive adds units at the location, negative removes them. Recorded with your name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
            {holding.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-label="Reason">
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {reason === 'opening_stock' && (
          <label className="block text-xs">
            Counted as at (the opening balances date)
            <Input type="date" className="mt-1 w-44" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
          </label>
        )}
        <div className="relative">
          <Input placeholder="Find a product by SKU or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          {visibleHits.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-background shadow">
              {visibleHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    if (!lines.some((l) => l.variant.id === hit.id)) setLines([...lines, { variant: hit, delta: '' }]);
                    setSearch('');
                    setHits([]);
                  }}
                >
                  <span className="truncate">
                    {hit.product} · {hit.variant}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{hit.sku ?? 'no SKU'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.map((line, index) => (
          <div key={line.variant.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {line.variant.product} · {line.variant.variant} <span className="text-xs text-muted-foreground">({line.variant.store})</span>
            </span>
            <Input
              className="w-24"
              inputMode="numeric"
              placeholder="±units"
              value={line.delta}
              aria-invalid={line.delta !== '' && !(Number.isInteger(Number(line.delta)) && Number(line.delta) !== 0)}
              onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, delta: e.target.value } : l)))}
            />
            <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={save} disabled={!valid || saving}>
          <Plus className="size-4" />
          Record adjustment
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Shopify's stock beside ours. Shopify's "on hand" still counts parcels that left, because orders
 * are not marked fulfilled there, so the shelf is estimated as available + committed to orders
 * not booked with PostEx yet. The opening count can be taken from that estimate once per store.
 */
function ShopifyStockCard({ onDone }: { onDone: () => void }) {
  const [store, setStore] = useState<'nur' | 'organics'>('nur');
  const [asAt, setAsAt] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data, error, loading, reload } = useApi<{ rows: StockComparisonRow[] }>(`/api/v1/stock/shopify-comparison?store=${store}`);
  const rows = data?.rows ?? [];
  const differing = rows.filter((r) => r.difference !== 0);

  const take = async () => {
    setSaving(true);
    try {
      const result = await apiPost<{ lines: number; units: number }>('/api/v1/stock/opening-from-shopify', { asAt, store });
      toast.success(result.lines ? `Opening count recorded: ${result.lines} products, ${result.units} units` : 'Nothing to record: our stock already matches');
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
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Shopify stock</CardTitle>
            <CardDescription>
              Shopify's on hand still includes parcels already sent with PostEx (they stay "committed" because orders are not marked fulfilled). The shelf is
              estimated as available + committed to orders not booked yet.
            </CardDescription>
          </div>
          <select className={selectClass} value={store} onChange={(e) => setStore(e.target.value as 'nur' | 'organics')} aria-label="Store">
            <option value="nur">NUR by Juggun</option>
            <option value="organics">Juggun's Organics</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data && <Skeleton className="h-24 w-full" />}
        {error && <p className="text-sm text-brand-coral">Could not load Shopify's stock: {error}</p>}
        {data && rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No stock read from Shopify yet: it arrives with the hourly catalogue sync.</p>}
        {rows.length > 0 && (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">…not booked</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Shelf estimate</TableHead>
                  <TableHead className="text-right">Our warehouse</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.variantId}>
                    <TableCell>
                      {r.title} <span className="font-mono text-xs text-muted-foreground">{r.sku ?? 'no SKU'}</span>
                    </TableCell>
                    <TableCell className="text-right">{r.onHand}</TableCell>
                    <TableCell className="text-right">{r.committed}</TableCell>
                    <TableCell className="text-right">{r.committedUnbooked}</TableCell>
                    <TableCell className="text-right">{r.available}</TableCell>
                    <TableCell className="text-right font-medium">{r.estimate}</TableCell>
                    <TableCell className="text-right">{r.warehouse}</TableCell>
                    <TableCell className={r.difference === 0 ? 'text-right text-muted-foreground' : 'text-right font-medium text-brand-coral'}>
                      {r.difference > 0 ? `+${r.difference}` : r.difference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {differing.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <label className="text-xs">
              Opening count as at (the cut-over date)
              <Input type="date" className="mt-1 w-44" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
            </label>
            {confirming ? (
              <>
                <Button size="sm" variant="destructive" disabled={saving} onClick={take}>
                  Record {differing.length} products as the opening count
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" disabled={!asAt} onClick={() => setConfirming(true)}>
                Use the shelf estimate as the opening count
              </Button>
            )}
            <p className="w-full text-xs text-muted-foreground">
              Sets our warehouse today to the estimate, dated at the cut-over day. Once per store; after that, enter differences as stock counts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Current stock per product, with each place a unit can be shown apart: the shelf, with PostEx,
 * coming back, at partners, damaged. Opening a product shows every move behind its numbers.
 */
export function InventoryPage() {
  const { can } = useAuth();
  const [store, setStore] = useState<'' | 'nur' | 'organics'>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({ ...(store ? { store } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
  const quants = useApi<{ quants: Quant[] }>(`/api/v1/stock/quants?${query.toString()}`);
  const locations = useApi<{ locations: StockLocation[] }>('/api/v1/stock/locations');
  const rows = useMemo(() => pivotQuants(quants.data?.quants ?? []), [quants.data]);
  const open = rows.find((r) => r.variantId === selected);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Every unit is in exactly one place. Units with PostEx or coming back are not on the shelf. Negative stock means the opening count has not been entered yet.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={quants.reload} disabled={quants.loading}>
          <RefreshCw className={quants.loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-3">
            <StockTotals rows={rows} />
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} value={store} onChange={(e) => setStore(e.target.value as typeof store)} aria-label="Store">
                <option value="">Both stores</option>
                <option value="nur">NUR by Juggun</option>
                <option value="organics">Juggun's Organics</option>
              </select>
              <Input className="w-full sm:w-64" placeholder="Search SKU or product" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {quants.loading && !quants.data && <Skeleton className="h-24 w-full" />}
            {quants.error && <p className="text-sm text-brand-coral">Could not load stock: {quants.error}</p>}
            {quants.data && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No stock recorded for this view.</p>}
            {rows.length > 0 && <StockTable rows={rows} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />}
            {open && <MoveHistory key={open.variantId} variantId={open.variantId} title={`${open.product} · ${open.variant}${open.sku ? ` (${open.sku})` : ''}`} />}
          </CardContent>
        </Card>

        {can('stock.adjust') && <AdjustmentForm locations={locations.data?.locations ?? []} onDone={quants.reload} />}
        <ShopifyStockCard onDone={quants.reload} />
      </div>
    </>
  );
}
