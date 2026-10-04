import { TableSkeleton, num } from '@/components/skeletons';
import { CircleAlert, PackageX, Store, Truck, Undo2, Warehouse } from 'lucide-react';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import { BUCKETS, type BucketKey, type StockRow, totalsOf } from '@/lib/stock';
import { cn } from '@/lib/utils';

/**
 * One look per place, used for the totals, the column heads, the cells and the move history, so a
 * place is recognised by the same icon and tint everywhere. The shelf is plain; "With PostEx" and
 * "Coming back" are tinted and carry their own icon, because those units are not on the shelf. The
 * label is always written out: colour alone never says where a unit is.
 */
const BUCKET_LOOK: Record<BucketKey, { icon: ComponentType<{ className?: string }>; tint: string; text: string; border: string }> = {
  warehouse: { icon: Warehouse, tint: '', text: 'text-foreground', border: 'border-foreground/30' },
  in_transit: { icon: Truck, tint: 'bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-500/50' },
  returning: { icon: Undo2, tint: 'bg-amber-500/15', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-500/60' },
  partner: { icon: Store, tint: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-500/40' },
  damaged: { icon: PackageX, tint: 'bg-brand-coral/10', text: 'text-brand-coral', border: 'border-brand-coral/50' },
};

/** A place's name with its icon and tint, as a small pill. */
export function PlaceChip({ bucket, label }: { bucket: BucketKey | null; label: string }) {
  if (!bucket) return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{label}</span>;
  const look = BUCKET_LOOK[bucket];
  const Icon = look.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', look.tint, look.text, look.border)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

/** The five totals across the current view, each in its own look. */
export function StockTotals({ rows }: { rows: readonly StockRow[] }) {
  const totals = totalsOf(rows);
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {BUCKETS.map((b) => {
        const look = BUCKET_LOOK[b.key];
        const Icon = look.icon;
        return (
          <div key={b.key} className={cn('rounded-lg border border-l-4 p-3', look.tint, look.border)} title={b.hint}>
            <dt className={cn('flex items-center gap-1.5 text-xs font-medium', look.text)}>
              <Icon className="size-3.5" />
              {b.label}
            </dt>
            <dd className={cn('mt-1 text-xl font-semibold tabular-nums', totals[b.key] < 0 && 'text-brand-coral')}>{totals[b.key]}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The stock table while it loads: the product column and one column per place. */
export function StockTableSkeleton() {
  return <TableSkeleton rows={8} label="Loading stock" columns={[{ header: 'Product', sub: true }, ...BUCKETS.map((b) => num(b.label))]} />;
}

/**
 * Stock by product, with every place a unit can be as its own column. Negative stock is flagged:
 * it means the opening count has not been entered yet. A row opens that product's move history.
 */
export function StockTable({ rows, selected, onSelect }: { rows: readonly StockRow[]; selected: string | null; onSelect: (variantId: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Stock by product and place</caption>
        <thead className="bg-muted/40">
          <tr>
            <th scope="col" className="h-10 px-3 text-left font-medium text-muted-foreground">
              Product
            </th>
            {BUCKETS.map((b) => {
              const look = BUCKET_LOOK[b.key];
              const Icon = look.icon;
              return (
                <th key={b.key} scope="col" title={b.hint} className={cn('h-10 border-b-2 px-3 text-right font-medium whitespace-nowrap', look.border, look.text)}>
                  <span className="inline-flex items-center justify-end gap-1">
                    <Icon className="size-3.5" />
                    {b.label}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.variantId} className={cn('border-t', selected === row.variantId && 'bg-muted/50')}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <Button variant="link" className="h-auto p-0 text-left whitespace-normal" onClick={() => onSelect(row.variantId)} aria-pressed={selected === row.variantId} aria-label={`Move history of ${row.product} ${row.variant}`}>
                  {row.product} <span className="text-muted-foreground">· {row.variant}</span>
                </Button>
                <div className="font-mono text-xs text-muted-foreground">
                  {row.sku ?? 'no SKU'} · {row.store}
                </div>
              </th>
              {BUCKETS.map((b) => {
                const look = BUCKET_LOOK[b.key];
                const qty = row.units[b.key];
                return (
                  <td key={b.key} className={cn('px-3 py-2 text-right tabular-nums', qty !== 0 && look.tint, qty === 0 && 'text-muted-foreground/50')}>
                    <span className={cn(qty !== 0 && 'font-medium', qty !== 0 && look.text, qty < 0 && 'inline-flex items-center gap-1 text-brand-coral')}>
                      {qty < 0 && <CircleAlert className="size-3.5" aria-label="negative stock" />}
                      {qty}
                    </span>
                    {b.key === 'partner' && row.partners.length > 0 && <div className="text-xs font-normal text-muted-foreground">{row.partners.map((p) => `${p.name} ${p.qty}`).join(' · ')}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
