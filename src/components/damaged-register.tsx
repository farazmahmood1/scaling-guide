import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, PackageX } from 'lucide-react';
import { Link } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import type { DamagedRegister as Register, DamagedRow } from '@/lib/api';
import { formatKarachiFull, formatKarachiTime, formatPaisa } from '@/lib/format';
import { storeLabel } from '@/lib/parcels';
import { cn } from '@/lib/utils';

const REASON_TEXT: Record<string, string> = {
  RFD: 'Refused by the customer',
  CNA: 'Customer not available',
  ICA: 'Incomplete address',
  OPN: 'Customer wanted to open it',
};

/** One dated step on the parcel's way back, or a dash when it never happened. */
function Step({ label, at, children }: { label: string; at: string | null; children?: React.ReactNode }) {
  return (
    <li className="relative pl-5">
      <span className={cn('absolute top-1.5 left-0 size-2.5 rounded-full border-2', at ? 'border-brand-coral bg-brand-coral/30' : 'border-muted-foreground/30')} aria-hidden />
      <p className="text-xs font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{formatKarachiFull(at)}</p>
      {children}
    </li>
  );
}

function Details({ row }: { row: DamagedRow }) {
  const { can } = useAuth();
  return (
    <div className="grid gap-6 bg-muted/30 p-4 md:grid-cols-3">
      <section aria-label="What was inside">
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">What was inside</h4>
        {row.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products could be identified (the parcel has no order, or its lines are not mapped to products).</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {row.items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3">
                <span>
                  {i.title} <span className="font-mono text-xs text-muted-foreground">{i.sku ?? 'no SKU'}</span>
                </span>
                <span className="font-medium tabular-nums">× {i.qty}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Written off: {row.writtenOffPaisa ? <span className="font-medium text-foreground">{formatPaisa(row.writtenOffPaisa)}</span> : 'not yet (the products have no cost price)'}
        </p>
      </section>

      <section aria-label="Sent to">
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sent to</h4>
        <dl className="space-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Customer</dt>
            <dd>{row.customerName ?? '—'}</dd>
          </div>
          {can('pii.phone') && (
            <div>
              <dt className="text-xs text-muted-foreground">Phone</dt>
              <dd className="font-mono text-xs">{row.phone ?? '—'}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">City</dt>
            <dd>{row.city ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Order and parcel</dt>
            <dd className="flex flex-wrap gap-x-3">
              {row.orderId ? (
                <Link className="underline-offset-4 hover:underline" to={`/orders/${row.orderId}`}>
                  {row.orderNumber}
                </Link>
              ) : (
                <span className="text-muted-foreground">no Shopify order</span>
              )}
              <Link className="font-mono text-xs underline-offset-4 hover:underline" to={`/parcels/${row.shipmentId}`}>
                {row.trackingNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cash on delivery</dt>
            <dd>{formatPaisa(row.codPaisa)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Its way back">
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Its way back</h4>
        <ol className="space-y-3 border-l border-dashed pl-0">
          <Step label="Sent with PostEx" at={row.bookedAt} />
          <Step label="Not delivered" at={row.refusedAt}>
            {row.failureReason && <p className="text-xs">{REASON_TEXT[row.failureReason] ?? row.failureReason}</p>}
          </Step>
          <Step label="Back at the warehouse (PostEx)" at={row.returnedAt} />
          <Step label={`Found damaged by ${row.damagedBy}`} at={row.damagedAt}>
            {row.note && <p className="text-xs italic">“{row.note}”</p>}
          </Step>
        </ol>
      </section>
    </div>
  );
}

/**
 * Every return someone checked in as damaged: what was inside, who it was sent to, each date on
 * its way back and the cost written off. A damaged unit never returns to the shelf; it is kept out
 * of stock under "Damaged" and its cost is an expense.
 */
export function DamagedRegister() {
  const { brand } = useBrand();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ ...(brand ? { store: brand } : {}), ...(search.trim() ? { q: search.trim() } : {}) });
  const { data, error, loading } = useApi<Register>(`/api/v1/stock/damaged?${params.toString()}`);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: 'Damaged returns', value: data ? String(rows.length) : '—' },
          { label: 'Damaged units', value: data ? String(data.units) : '—' },
          { label: 'Cost written off', value: data ? formatPaisa(data.writtenOffPaisa) : '—' },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border border-l-4 border-brand-coral/50 bg-brand-coral/5 p-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-brand-coral">
              <PackageX className="size-3.5" />
              {t.label}
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>
      <Input className="w-full sm:w-80" placeholder="Tracking number, order or customer" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search damaged returns" />
      {loading && !data && <TableSkeleton rows={4} label="Loading damaged returns" columns={['Damaged on', 'Parcel', 'Order', 'Customer', num('Units'), num('Written off')]} />}
      {error && <p className="text-sm text-brand-coral">Could not load the damaged returns: {error}</p>}
      {data && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <p className="font-medium">No damaged returns</p>
          <p className="max-w-sm text-sm text-muted-foreground">When a returned parcel is checked in as Damaged, it appears here with everything about it.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Damaged returns, newest first</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="w-8 px-2 py-2" />
                <th scope="col" className="px-3 py-2 font-medium">Damaged on</th>
                <th scope="col" className="px-3 py-2 font-medium">Parcel</th>
                <th scope="col" className="px-3 py-2 font-medium">Order</th>
                <th scope="col" className="px-3 py-2 font-medium">Customer</th>
                <th scope="col" className="px-3 py-2 font-medium">Products</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Units</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Written off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expanded = open === r.checkInId;
                return (
                  <Fragment key={r.checkInId}>
                    <tr className={cn('cursor-pointer border-t hover:bg-muted/40', expanded && 'bg-muted/40')} onClick={() => setOpen(expanded ? null : r.checkInId)}>
                      <td className="px-2 py-2">
                        <button type="button" aria-expanded={expanded} aria-label={`Details of ${r.trackingNumber}`} className="rounded p-0.5 hover:bg-muted">
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatKarachiTime(r.damagedAt)}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{r.trackingNumber}</span>
                        <div className="text-xs text-muted-foreground">{storeLabel(r.store)}</div>
                      </td>
                      <td className="px-3 py-2">{r.orderNumber ?? <Badge variant="outline">No order</Badge>}</td>
                      <td className="px-3 py-2">
                        {r.customerName ?? '—'}
                        <div className="text-xs text-muted-foreground">{r.city ?? ''}</div>
                      </td>
                      <td className="max-w-64 truncate px-3 py-2" title={r.items.map((i) => `${i.qty} × ${i.title}`).join(', ')}>
                        {r.items.length === 0 ? <span className="text-muted-foreground">—</span> : r.items.map((i) => `${i.qty} × ${i.title}`).join(', ')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.units}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.writtenOffPaisa ? formatPaisa(r.writtenOffPaisa) : <span className="text-muted-foreground">no cost</span>}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-t">
                        <td colSpan={8} className="p-0">
                          <Details row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
