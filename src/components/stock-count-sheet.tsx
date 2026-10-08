import { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useBrand } from '@/brand/brand-context';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { type CountResult, type CountSheetRow, type StockHealth, type StoreKey, apiPost } from '@/lib/api';
import { downloadText, parseCsv, toCsv } from '@/lib/csv';
import { today, wholeUnits } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const HEADER = ['variant_id', 'store', 'product', 'variant', 'sku', 'on_shelf_now', 'counted'];

/**
 * The shelf count, entered as what was found: one box per product, the difference to the ledger
 * shown as it is typed. The first count for a brand is its opening count, dated on the day it was
 * true; later ones are stock counts. The sheet can be downloaded to count on paper or in Excel and
 * uploaded back with the "counted" column filled.
 */
export function StockCountSheet({ onDone }: { onDone: () => void }) {
  const { brand } = useBrand();
  const [chosen, setChosen] = useState<StoreKey>('nur');
  const store: StoreKey = brand ?? chosen;
  const sheet = useApi<{ rows: CountSheetRow[] }>(`/api/v1/stock/count-sheet?store=${store}`);
  const health = useApi<{ stores: StockHealth[] }>('/api/v1/stock/health');
  const openingTaken = health.data?.stores.find((s) => s.store === store)?.openingCountAt ?? null;
  const reason: 'opening_stock' | 'count' = openingTaken ? 'count' : 'opening_stock';
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [asAt, setAsAt] = useState(today());
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => sheet.data?.rows ?? [], [sheet.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? rows.filter((r) => `${r.product} ${r.variant} ${r.sku ?? ''}`.toLowerCase().includes(term)) : rows;
  }, [rows, search]);
  const entered = rows.filter((r) => (counted[r.variantId] ?? '').trim() !== '');
  const parsed = entered.map((r) => ({ row: r, value: wholeUnits(counted[r.variantId] ?? '') }));
  const invalid = parsed.filter((p) => p.value === null).length;
  const changes = parsed.filter((p) => p.value !== null && p.value !== p.row.warehouse);
  const net = changes.reduce((n, p) => n + (p.value! - p.row.warehouse), 0);

  const download = () => {
    const csv = toCsv(HEADER, rows.map((r) => [r.variantId, r.store, r.product, r.variant, r.sku ?? '', String(r.warehouse), counted[r.variantId] ?? '']));
    downloadText(`stock-count-${store}-${today()}.csv`, csv);
  };

  const upload = async (picked: File) => {
    try {
      const lines = parseCsv(await picked.text());
      const head = lines[0]?.cells.map((c) => c.trim().toLowerCase()) ?? [];
      const idAt = head.indexOf('variant_id');
      const skuAt = head.indexOf('sku');
      const countAt = head.indexOf('counted');
      if (countAt < 0 || (idAt < 0 && skuAt < 0)) throw new Error('The file needs a "counted" column and a "variant_id" or "sku" column (download the sheet to get the layout)');
      const byId = new Map(rows.map((r) => [r.variantId, r]));
      const bySku = new Map(rows.filter((r) => r.sku).map((r) => [r.sku!.toLowerCase(), r]));
      const next: Record<string, string> = { ...counted };
      let filled = 0;
      let unknown = 0;
      for (const line of lines.slice(1)) {
        const value = line.cells[countAt]?.trim() ?? '';
        if (!value) continue;
        const row = (idAt >= 0 ? byId.get(line.cells[idAt]?.trim() ?? '') : undefined) ?? (skuAt >= 0 ? bySku.get((line.cells[skuAt] ?? '').trim().toLowerCase()) : undefined);
        if (!row) {
          unknown++;
          continue;
        }
        next[row.variantId] = value;
        filled++;
      }
      setCounted(next);
      toast.success(`${filled} counts read from ${picked.name}${unknown ? `; ${unknown} rows matched no product of this brand` : ''}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not read the file');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await apiPost<CountResult>('/api/v1/stock/counts', {
        reason,
        ...(reason === 'opening_stock' ? { asAt } : {}),
        note: reason === 'opening_stock' ? 'Opening count from the physical shelf count' : 'Shelf count',
        lines: parsed.map((p) => ({ variantId: p.row.variantId, counted: p.value })),
      });
      toast.success(result.adjustmentId ? `Count saved: ${result.lines} products changed, ${result.units > 0 ? '+' : ''}${result.units} units in all` : 'Every product already matched the count; nothing changed');
      setCounted({});
      setConfirming(false);
      sheet.reload();
      health.reload();
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save the count');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{reason === 'opening_stock' ? 'Opening count: the starting point of the shelf' : 'Stock count: correct the shelf to what is really there'}</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>Check in every returned parcel that is already back (Returns page) first, so they are not counted twice.</li>
          <li>Count what is physically on the shelf. Do not count parcels that are with PostEx or on their way back.</li>
          <li>Type each count in the "Counted" box, or download the sheet, fill the "counted" column in Excel and upload it.</li>
          <li>Save. The platform works out the difference for each product; nothing else changes.</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {!brand && (
          <label className="text-xs">
            Brand
            <select className={cn(selectClass, 'mt-1 block')} value={store} onChange={(e) => setChosen(e.target.value as StoreKey)}>
              <option value="nur">NUR by Juggun</option>
              <option value="organics">Juggun's Organics</option>
            </select>
          </label>
        )}
        {reason === 'opening_stock' && (
          <label className="text-xs">
            Counted on
            <Input type="date" className="mt-1 w-44" value={asAt} max={today()} onChange={(e) => setAsAt(e.target.value)} />
          </label>
        )}
        <Input className="w-full sm:w-64" placeholder="Find a product" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a product" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
            <Download className="size-4" />
            Download sheet
          </Button>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()} disabled={rows.length === 0}>
            <Upload className="size-4" />
            Upload counts
          </Button>
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void upload(picked);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {sheet.loading && !sheet.data && (
        <TableSkeleton rows={8} label="Loading the count sheet" columns={['Product', num('On the shelf now'), num('With PostEx'), num('Coming back'), num('Shopify available'), num('Counted'), num('Difference')]} />
      )}
      {sheet.error && <p className="text-sm text-brand-coral">Could not load the sheet: {sheet.error}</p>}
      {rows.length > 0 && (
        <div className="max-h-[32rem] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Count sheet</caption>
            <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Product</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="What the platform thinks is on the shelf">On the shelf now</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">With PostEx</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Coming back</th>
                <th scope="col" className="px-3 py-2 text-right font-medium" title="For reference only: Shopify's own figure">Shopify available</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Counted</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const text = counted[r.variantId] ?? '';
                const value = text.trim() === '' ? null : wholeUnits(text);
                const diff = value === null ? null : value - r.warehouse;
                return (
                  <tr key={r.variantId} className="border-t">
                    <td className="px-3 py-1.5">
                      {r.product} {r.variant !== 'Default Title' && <span className="text-muted-foreground">· {r.variant}</span>}
                      <div className="font-mono text-xs text-muted-foreground">{r.sku ?? 'no SKU'}</div>
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', r.warehouse < 0 && 'font-medium text-brand-coral')}>{r.warehouse}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{r.inTransit || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{r.returning || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{r.shopifyAvailable ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Input
                        className="ml-auto h-8 w-24 text-right"
                        inputMode="numeric"
                        placeholder="—"
                        aria-label={`Counted ${r.product} ${r.variant}`}
                        aria-invalid={text.trim() !== '' && value === null}
                        value={text}
                        onChange={(e) => setCounted({ ...counted, [r.variantId]: e.target.value })}
                      />
                    </td>
                    <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', diff === null || diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-primary' : 'text-brand-coral')}>
                      {diff === null ? '' : diff === 0 ? 'matches' : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
        <span>
          <span className="font-medium">{entered.length}</span> of {rows.length} products counted · <span className="font-medium">{changes.length}</span> differ · net{' '}
          <span className="font-medium tabular-nums">{net > 0 ? `+${net}` : net}</span> units
        </span>
        {invalid > 0 && <Badge variant="destructive">{invalid} counts are not whole numbers</Badge>}
        <div className="ml-auto flex gap-2">
          {confirming ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                <ClipboardCheck className="size-4" />
                Save {reason === 'opening_stock' ? 'opening count' : 'count'} for {entered.length} products
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={entered.length === 0 || invalid > 0 || (reason === 'opening_stock' && !asAt)} onClick={() => setConfirming(true)}>
              Review and save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
