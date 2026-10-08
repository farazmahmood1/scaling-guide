import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { MoveHistory } from '@/components/move-history';
import { ShopifyStockPanel } from '@/components/shopify-stock-panel';
import { StockCountSheet } from '@/components/stock-count-sheet';
import { StockExplainer } from '@/components/stock-explainer';
import { StockTable, StockTableSkeleton, StockTotals } from '@/components/stock-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { type Quant, type StockLocation, type VariantHit, apiGet, apiPost } from '@/lib/api';
import { pivotQuants } from '@/lib/stock';

// Counts (opening and later) are entered on the count sheet, as what was found; here, single differences.
const REASONS = [
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
 * A correction of one figure by a difference. Each line moves units between the adjustment
 * location and the chosen one; the backend writes the moves and the audit row, never a quantity.
 */
function AdjustmentForm({ locations, onDone }: { locations: StockLocation[]; onDone: () => void }) {
  const holding = locations.filter((l) => ['warehouse', 'partner', 'damaged'].includes(l.kind));
  const [chosenLocation, setLocationId] = useState('');
  // The first holding location until the user picks one; the list arrives after the first render.
  const locationId = chosenLocation || holding[0]?.id || '';
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('correction');
  const [note, setNote] = useState('');
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
        <CardTitle>Correction</CardTitle>
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

type InventoryTab = 'stock' | 'count' | 'shopify' | 'corrections';
const TABS: ReadonlyArray<{ value: InventoryTab; label: string }> = [
  { value: 'stock', label: 'Stock by product' },
  { value: 'count', label: 'Count the shelf' },
  { value: 'shopify', label: 'Shopify stock' },
  { value: 'corrections', label: 'Corrections' },
];
const isTab = (v: string | null): v is InventoryTab => TABS.some((t) => t.value === v);

/**
 * Current stock per product, with each place a unit can be shown apart: the shelf, with PostEx,
 * coming back, at partners, damaged. Opening a product shows every move behind its numbers. The
 * other tabs count the shelf, compare with Shopify, and correct a single figure.
 */
export function InventoryPage() {
  const { can } = useAuth();
  const { brand: store } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab: InventoryTab = isTab(params.get('tab')) ? (params.get('tab') as InventoryTab) : 'stock';
  const setTab = (next: string) =>
    setParams((p) => {
      if (next === 'stock') p.delete('tab');
      else p.set('tab', next);
      return p;
    });
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
          <p className="text-sm text-muted-foreground">Every unit is in exactly one place: on the shelf, with PostEx, coming back, at a partner, or damaged. Only the shelf can be sold.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={quants.reload} disabled={quants.loading}>
          <RefreshCw className={quants.loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <StockExplainer onCount={() => setTab('count')} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.filter((t) => (t.value === 'count' || t.value === 'corrections' ? can('stock.adjust') : true)).map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="stock" className="mt-3">
          <Card>
            <CardHeader className="space-y-3">
              <StockTotals rows={rows} />
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-full sm:w-64" placeholder="Search SKU or product" value={search} onChange={(e) => setSearch(e.target.value)} />
                <p className="text-xs text-muted-foreground">Choose a product to see every move behind its numbers.</p>
              </div>
            </CardHeader>
            <CardContent>
              {quants.loading && !quants.data && <StockTableSkeleton />}
              {quants.error && <p className="text-sm text-brand-coral">Could not load stock: {quants.error}</p>}
              {quants.data && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No stock recorded for this view.</p>}
              {rows.length > 0 && <StockTable rows={rows} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />}
              {open && <MoveHistory key={open.variantId} variantId={open.variantId} title={`${open.product} · ${open.variant}${open.sku ? ` (${open.sku})` : ''}`} />}
            </CardContent>
          </Card>
        </TabsContent>

        {can('stock.adjust') && (
          <TabsContent value="count" className="mt-3">
            <Card>
              <CardHeader>
                <CardTitle>Count the shelf</CardTitle>
                <CardDescription>Enter what is physically on the shelf. The first count for a brand is its opening count; after that, a count corrects the shelf to what is really there.</CardDescription>
              </CardHeader>
              <CardContent>
                <StockCountSheet onDone={quants.reload} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="shopify" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Shopify stock</CardTitle>
              <CardDescription>What Shopify says each product has, beside our own shelf.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShopifyStockPanel onDone={quants.reload} />
            </CardContent>
          </Card>
        </TabsContent>

        {can('stock.adjust') && (
          <TabsContent value="corrections" className="mt-3">
            <div className="grid gap-6 lg:grid-cols-2">
              <AdjustmentForm locations={locations.data?.locations ?? []} onDone={quants.reload} />
              <Card>
                <CardHeader>
                  <CardTitle>When to use a correction</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>For one or two products at a time, by a difference rather than a count: a unit broken on the shelf (Damage), a unit missing (Loss), a mistake in an earlier entry (Correction).</p>
                  <p>To count the whole shelf, use Count the shelf instead. Returns are checked in on the Returns page, and purchases received under Purchase; both move stock on their own.</p>
                  <p>Every correction is kept with your name and reason, and shows in the product's move history.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
