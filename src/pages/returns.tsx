import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, PackageCheck, PackageX, RotateCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { DamagedRegister } from '@/components/damaged-register';
import { type Column, DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { ReturnsAlert } from '@/components/returns-alert';
import { ShopifyAccessNotice } from '@/components/shopify-access-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useCheckIn } from '@/hooks/use-check-in';
import { useListQuery } from '@/hooks/use-list-query';
import { useParcelList } from '@/hooks/use-parcel-list';
import { type AwaitingReturn, type CheckInResponse, type ParcelRow, type ShopifySyncState, apiPost } from '@/lib/api';
import { type Outcome, stillWaiting, withPending } from '@/lib/check-in';
import { formatKarachiTime, formatPaisa, fromNow } from '@/lib/format';
import type { ListQuery, QuerySpec } from '@/lib/list-query';
import { codCsv, orderLabel, storeLabel } from '@/lib/parcels';

const SPEC: QuerySpec = {
  multi: { city: null },
  sortKeys: ['statusUpdatedAt', 'cod'],
  // Oldest first: the parcel that has waited longest is the one to check in next.
  defaultSort: { key: 'statusUpdatedAt', dir: 'asc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: ['tracking', 'order', 'store', 'city', 'cod', 'statusUpdatedAt', 'checkIn', 'shopify'],
  screen: 'returns',
};

type View = 'waiting' | 'done' | 'damaged' | 'all';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Checked in' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'all', label: 'All returns' },
];
const isView = (v: string | null): v is View => VIEWS.some((x) => x.value === v);

/** The register is the parcels API narrowed to parcels back at the warehouse, by the chosen view. */
const registerQuery = (query: ListQuery, view: View): ListQuery => ({
  ...query,
  multi: { ...query.multi, stage: ['returned'], ...(view === 'all' || view === 'damaged' ? {} : { flag: [view === 'waiting' ? 'not_checked_in' : 'checked_in'] }) },
});

// A button inside a clickable row: neither the click nor Enter/Space may also open the row.
const own = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };

const SYNC_LOOK: Record<ShopifySyncState['outcome'], { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  done: { label: 'Updated', variant: 'secondary' },
  skipped: { label: 'Nothing to do', variant: 'outline' },
  failed: { label: 'Not updated', variant: 'destructive' },
};

/** What the two buttons do, on the platform and in Shopify, in plain words. Open until it is closed. */
function HowItWorks() {
  const [open, setOpen] = useState(true);
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-4">
        <div>
          <p className="font-medium">What Restock and Damaged do</p>
          <p className="text-sm text-muted-foreground">Check a parcel in when it is physically in your hands, after opening it.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-4 pt-0 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-l-4 border-l-primary p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <PackageCheck className="size-4" /> Restock: the products are fine
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <span className="text-foreground">Here:</span> the units move from "Coming back" to the shelf (Inventory, Warehouse) and can be sold again.
              </li>
              <li>
                <span className="text-foreground">In Shopify:</span> if the order is still open there, it is cancelled with its items restocked (no refund, no email to the customer). If it was marked fulfilled, the units are added back to available.
              </li>
              <li>
                <span className="text-foreground">Money:</span> no sale was ever counted for a refused parcel, so revenue does not change. Only PostEx's return charge stays as a cost.
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-l-4 border-l-brand-coral p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <PackageX className="size-4 text-brand-coral" /> Damaged: the products cannot be sold
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <span className="text-foreground">Here:</span> the units move to "Damaged", never back to the shelf, and the parcel is listed under the Damaged tab with what was inside, who it was sent to and when.
              </li>
              <li>
                <span className="text-foreground">In Shopify:</span> an open order is cancelled and the units are taken off available as damaged. A fulfilled order needs nothing: the units already left Shopify's stock.
              </li>
              <li>
                <span className="text-foreground">Money:</span> the products' cost is written off as an expense (once their cost price is entered).
              </li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * The returns register: every parcel PostEx brought back to the warehouse, and whether someone
 * has checked it in as restocked or damaged, with what Shopify was told. Checking in shows at once
 * and is taken back if the server refuses. The Damaged view lists every damaged return in full.
 */
export function ReturnsPage() {
  const { can } = useAuth();
  const canCheckIn = can('returns.checkin');
  const [query, setQuery] = useListQuery(SPEC);
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const view: View = isView(requested) ? requested : 'waiting';
  const effective = useMemo(() => registerQuery(query, view), [query, view]);
  const list = useParcelList(effective);
  const { brand } = useBrand();
  const awaiting = useApi<{ returns: AwaitingReturn[] }>(`/api/v1/stock/returns-awaiting${brand ? `?store=${brand}` : ''}`);
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState<string | null>(null);

  const reloadList = list.reload;
  const reloadAwaiting = awaiting.reload;
  const onSaved = useCallback(() => {
    reloadList();
    reloadAwaiting();
  }, [reloadList, reloadAwaiting]);
  const { pending, checkIn } = useCheckIn(onSaved);

  const retry = useCallback(
    async (row: ParcelRow) => {
      setRetrying(row.id);
      try {
        const result = await apiPost<CheckInResponse>(`/api/v1/stock/returns/${row.id}/shopify-sync`, {});
        if (result.shopify?.outcome === 'failed') toast.error(`${row.trackingNumber}: Shopify was not updated`, { description: result.shopify.error ?? result.shopify.message });
        else toast.success(`${row.trackingNumber}: ${result.shopify?.message ?? 'Shopify updated'}`);
        reloadList();
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Could not reach Shopify');
      } finally {
        setRetrying(null);
      }
    },
    [reloadList],
  );

  const setView = (next: View) =>
    setParams((p) => {
      if (next === 'waiting') p.delete('view');
      else p.set('view', next);
      // Page 7 of one view is not page 7 of another.
      p.delete('page');
      return p;
    });

  const waitingIds = useMemo(() => (awaiting.data?.returns ?? []).map((r) => r.shipmentId), [awaiting.data]);
  const waiting = stillWaiting(waitingIds, pending);
  const rows = useMemo(() => (list.data ? withPending(list.data.rows, pending) : undefined), [list.data, pending]);

  const columns = useMemo<Column<ParcelRow>[]>(
    () => [
      { key: 'tracking', header: 'Tracking number', pinned: true, cell: (r) => <span className="font-mono text-xs">{r.trackingNumber}</span>, csv: (r) => r.trackingNumber },
      { key: 'order', header: 'Order', cell: (r) => (r.orderId ? orderLabel(r) : <Badge variant="outline">No order</Badge>), csv: (r) => orderLabel(r) },
      { key: 'store', header: 'Store', cell: (r) => (r.store === 'nur' ? 'NUR' : r.store === 'organics' ? 'Organics' : '—'), csv: (r) => storeLabel(r.store) },
      { key: 'city', header: 'City', cell: (r) => r.city ?? '—', csv: (r) => r.city ?? '' },
      { key: 'cod', header: 'COD', sortable: true, align: 'right', cell: (r) => formatPaisa(r.codPaisa), csv: (r) => codCsv(r.codPaisa) },
      {
        key: 'statusUpdatedAt',
        header: 'Returned',
        sortable: true,
        cell: (r) => (r.statusUpdatedAt ? <span title={formatKarachiTime(r.statusUpdatedAt)}>{fromNow(r.statusUpdatedAt)}</span> : '—'),
        csv: (r) => r.statusUpdatedAt ?? '',
      },
      {
        key: 'checkIn',
        header: 'Check-in',
        align: 'right',
        cell: (r) => {
          if (r.checkedIn) return <Badge variant={r.checkedIn === 'damaged' ? 'destructive' : 'secondary'}>{r.checkedIn === 'damaged' ? 'Damaged' : 'Restocked'}</Badge>;
          // A role that may see returns but not check them in is shown the state, not the buttons.
          if (!canCheckIn) return <span className="text-sm text-muted-foreground">Waiting</span>;
          const busy = pending.inFlight.includes(r.id);
          const act = (outcome: Outcome) => () => void checkIn(r.id, r.trackingNumber, outcome);
          return (
            <span className="flex justify-end gap-2" {...own}>
              <Button size="sm" variant="outline" disabled={busy} onClick={act('restocked')} aria-label={`Restock ${r.trackingNumber}`}>
                <PackageCheck className="size-4" />
                Restock
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={act('damaged')} aria-label={`Mark ${r.trackingNumber} damaged`}>
                <PackageX className="size-4" />
                Damaged
              </Button>
            </span>
          );
        },
        csv: (r) => r.checkedIn ?? 'waiting',
      },
      {
        key: 'shopify',
        header: 'Shopify',
        cell: (r) => {
          if (!r.checkedIn) return <span className="text-xs text-muted-foreground">after check-in</span>;
          if (!r.shopifySync) return <span className="text-xs text-muted-foreground">—</span>;
          const look = SYNC_LOOK[r.shopifySync.outcome];
          return (
            <span className="flex items-center gap-2" title={r.shopifySync.message} {...own}>
              <Badge variant={look.variant}>{look.label}</Badge>
              {r.shopifySync.outcome === 'failed' && canCheckIn && (
                <Button size="sm" variant="ghost" className="h-7 px-2" disabled={retrying === r.id} onClick={() => void retry(r)} aria-label={`Try Shopify again for ${r.trackingNumber}`}>
                  <RotateCw className={retrying === r.id ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  Retry
                </Button>
              )}
            </span>
          );
        },
        csv: (r) => (r.shopifySync ? `${r.shopifySync.outcome}: ${r.shopifySync.message}` : ''),
      },
    ],
    [pending.inFlight, checkIn, canCheckIn, retry, retrying],
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-sm text-muted-foreground">Parcels PostEx has brought back. Check each one in as restocked or damaged when it reaches the warehouse; Shopify is updated at the same time.</p>
      </div>
      <ReturnsAlert waiting={awaiting.data ? waiting : undefined} onOpen={false} />
      {canCheckIn && <ShopifyAccessNotice needs={['writeOrders', 'writeInventory']} purpose="update stock and orders when a return is checked in" />}
      <HowItWorks />
      <Card>
        <CardHeader className="space-y-3">
          <div role="group" aria-label="Which returns" className="flex flex-wrap gap-1 text-sm">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => setView(v.value)}
                className="rounded-md px-3 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
              >
                {v.label}
                {v.value === 'waiting' && awaiting.data ? ` (${waiting})` : ''}
              </button>
            ))}
          </div>
          {view !== 'damaged' && <FilterBar query={query} onChange={setQuery} dateLabel="Booked" searchPlaceholder="Scan or type a tracking number" />}
        </CardHeader>
        <CardContent>
          {view === 'damaged' ? (
            <DamagedRegister />
          ) : (
            <DataTable
              caption="Returned parcels"
              columns={columns}
              rows={rows}
              total={list.data?.total ?? 0}
              loading={list.loading}
              error={list.error ?? null}
              onRetry={list.reload}
              query={query}
              onQueryChange={setQuery}
              defaultSort={SPEC.defaultSort}
              pageSizes={SPEC.pageSizes}
              getRowId={(r) => r.id}
              rowLabel={(r) => `Returned parcel ${r.trackingNumber}`}
              onRowClick={(r) => navigate(`/parcels/${r.id}`)}
              exportRows={list.exportRows}
              exportName="returns"
              emptyMessage={view === 'waiting' ? 'Nothing waiting. Every returned parcel is checked in.' : 'No returns match these filters.'}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
