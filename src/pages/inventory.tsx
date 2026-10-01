import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type Quant, type StockLocation, type VariantHit, apiGet, apiPost } from '@/lib/api';

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

/** Current stock per product and location, straight from the ledger's quants. */
export function InventoryPage() {
  const [location, setLocation] = useState('warehouse');
  const [search, setSearch] = useState('');
  const query = new URLSearchParams({ ...(location ? { location } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
  const quants = useApi<{ quants: Quant[] }>(`/api/v1/stock/quants?${query.toString()}`);
  const locations = useApi<{ locations: StockLocation[] }>('/api/v1/stock/locations');

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Every unit is in exactly one place. Negative stock means the opening count has not been entered yet.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={quants.reload} disabled={quants.loading}>
          <RefreshCw className={quants.loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
                <option value="">All locations</option>
                {(locations.data?.locations ?? [])
                  .filter((l) => l.key)
                  .map((l) => (
                    <option key={l.id} value={l.key ?? ''}>
                      {l.label}
                    </option>
                  ))}
              </select>
              <Input className="w-full sm:w-64" placeholder="Search SKU or product" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {quants.loading && !quants.data && <Skeleton className="h-24 w-full" />}
            {quants.error && <p className="text-sm text-brand-coral">Could not load stock: {quants.error}</p>}
            {quants.data && quants.data.quants.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No stock recorded here.</p>}
            {quants.data && quants.data.quants.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quants.data.quants.map((q) => (
                      <TableRow key={`${q.variant_id}:${q.location_id}`}>
                        <TableCell>
                          {q.product} <span className="text-muted-foreground">· {q.variant}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{q.sku ?? '—'}</TableCell>
                        <TableCell>{q.store}</TableCell>
                        <TableCell>{q.location.replaceAll('_', ' ')}</TableCell>
                        <TableCell className={q.qty < 0 ? 'text-right font-medium text-brand-coral' : 'text-right font-medium'}>{q.qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AdjustmentForm locations={locations.data?.locations ?? []} onDone={quants.reload} />
      </div>
    </>
  );
}
