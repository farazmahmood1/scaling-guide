import { useCallback, useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, PackageCheck, PackageX, Split } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { DamagedRegister } from '@/components/damaged-register';
import { type Column, DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { CheckInControls, ShopifySyncCell } from '@/components/return-actions';
import { ReturnsAlert } from '@/components/returns-alert';
import { ShopifyAccessNotice } from '@/components/shopify-access-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useCheckIn } from '@/hooks/use-check-in';
import { useListQuery } from '@/hooks/use-list-query';
import { useParcelList } from '@/hooks/use-parcel-list';
import type { AwaitingReturn, ParcelRow } from '@/lib/api';
import { stillWaiting, withPending } from '@/lib/check-in';
import { formatKarachiTime, formatPaisa, fromNow } from '@/lib/format';
import type { ListQuery, QuerySpec } from '@/lib/list-query';
import { codCsv, orderLabel, storeLabel } from '@/lib/parcels';
import { returnStageText } from '@/lib/returns';

const SPEC: QuerySpec = {
  multi: { city: null },
  sortKeys: ['statusUpdatedAt', 'cod'],
  // Oldest first: the parcel that has waited longest is the one to check in next.
  defaultSort: { key: 'statusUpdatedAt', dir: 'asc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: ['tracking', 'order', 'store', 'city', 'cod', 'where', 'statusUpdatedAt', 'checkIn', 'shopify'],
  screen: 'returns',
};

/**
 * The active queue is the first two views: parcels to check in, and checked-in parcels whose
 * Shopify stock is not settled yet. A parcel leaves them once both are done, and stays in Checked
 * in (and All returns) for good, with its check-in and every Shopify attempt.
 */
type View = 'waiting' | 'shopify' | 'done' | 'damaged' | 'all';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'waiting', label: 'To check in' },
  { value: 'shopify', label: 'Needs Shopify' },
  { value: 'done', label: 'Checked in' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'all', label: 'All returns' },
];
const isView = (v: string | null): v is View => VIEWS.some((x) => x.value === v);

const VIEW_FLAG: Partial<Record<View, string>> = { waiting: 'not_checked_in', shopify: 'needs_shopify', done: 'checked_in' };

/** The register is the parcels API narrowed to parcels coming back or back, by the chosen view. */
const registerQuery = (query: ListQuery, view: View): ListQuery => ({
  ...query,
  multi: { ...query.multi, stage: ['returning', 'returned'], ...(VIEW_FLAG[view] ? { flag: [VIEW_FLAG[view]!] } : {}) },
});

/** What the two buttons do, on the platform and in Shopify, in plain words. Open until it is closed. */
function HowItWorks() {
  const [open, setOpen] = useState(true);
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-4">
        <div>
          <p className="font-medium">What Restock, Damaged, Split and Cancel in Shopify do</p>
          <p className="text-sm text-muted-foreground">Check a parcel in when it is physically in your hands, after opening it. You can check it in as soon as PostEx starts the return.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-4 pt-0 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-l-4 border-l-primary p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <PackageCheck className="size-4" /> Restock: the products are fine
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <span className="text-foreground">Here:</span> the units move from "Coming back" to the shelf (Inventory, Warehouse) and can be sold again.
              </li>
              <li>
                <span className="text-foreground">In Shopify:</span> the units are added back to available only where Shopify counts them as gone (the order was fulfilled, or cancelled without restocking). If Shopify already restocked them, nothing is added, so stock is never counted twice. <strong>The order is never cancelled.</strong>
              </li>
              <li>
                <span className="text-foreground">Order still open in Shopify:</span> Shopify still holds the units for it, so nothing is added and the parcel waits under Needs Shopify until the order is cancelled (see the last box).
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
                <span className="text-foreground">In Shopify:</span> nothing is added back. A fulfilled order needs nothing: the units already left Shopify's stock. An order still open there waits under Needs Shopify.
              </li>
              <li>
                <span className="text-foreground">Money:</span> the products' cost is written off as an expense (once their cost price is entered).
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-l-4 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Split className="size-4" /> Split: some fine, some damaged
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Say, per product, how many came back fine. Those go back on the shelf and to Shopify as above; the rest are damaged and written off.</li>
              <li>Only what came back is counted: the numbers always add up to what the parcel carried.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-l-4 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Ban className="size-4" /> Cancel in Shopify: its own step
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Offered only after check-in, for an order still open in Shopify, and asks you to confirm.</li>
              <li>Cancels with restock if the goods came back fine, without restock if damaged. No refund, no email to the customer.</li>
              <li>Cancelling the order in Shopify yourself works too: the platform notices within a few minutes and adds nothing twice.</li>
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
  const awaiting = useApi<{ returns: AwaitingReturn[]; comingBack: number }>(`/api/v1/stock/returns-awaiting${brand ? `?store=${brand}` : ''}`);
  const navigate = useNavigate();

  const reloadList = list.reload;
  const reloadAwaiting = awaiting.reload;
  const onSaved = useCallback(() => {
    reloadList();
    reloadAwaiting();
  }, [reloadList, reloadAwaiting]);
  const { pending, checkIn, retryShopify, cancelInShopify, busyShopify } = useCheckIn(onSaved);

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
      { key: 'where', header: 'Where', cell: (r) => <Badge variant={r.stage === 'returned' ? 'secondary' : 'outline'}>{returnStageText(r.stage)}</Badge>, csv: (r) => returnStageText(r.stage) },
      {
        key: 'statusUpdatedAt',
        header: 'Last PostEx update',
        sortable: true,
        cell: (r) => (r.statusUpdatedAt ? <span title={formatKarachiTime(r.statusUpdatedAt)}>{fromNow(r.statusUpdatedAt)}</span> : '—'),
        csv: (r) => r.statusUpdatedAt ?? '',
      },
      {
        key: 'checkIn',
        header: 'Check-in',
        align: 'right',
        cell: (r) => {
          if (r.checkedIn) {
            const look = { restocked: ['Restocked', 'secondary'], damaged: ['Damaged', 'destructive'], mixed: ['Split', 'outline'] } as const;
            return <Badge variant={look[r.checkedIn][1]}>{look[r.checkedIn][0]}</Badge>;
          }
          // A role that may see returns but not check them in is shown the state, not the buttons.
          if (!canCheckIn) return <span className="text-sm text-muted-foreground">Waiting</span>;
          return <CheckInControls shipmentId={r.id} trackingNumber={r.trackingNumber} busy={pending.inFlight.includes(r.id)} onCheckIn={(outcome, lines) => checkIn(r.id, r.trackingNumber, outcome, lines)} />;
        },
        csv: (r) => r.checkedIn ?? 'waiting',
      },
      {
        key: 'shopify',
        header: 'Shopify',
        cell: (r) => {
          if (!r.checkedIn) return <span className="text-xs text-muted-foreground">after check-in</span>;
          return (
            <ShopifySyncCell
              sync={r.shopifySync}
              trackingNumber={r.trackingNumber}
              canAct={canCheckIn && r.orderId !== null}
              busy={busyShopify === r.id}
              onRetry={() => void retryShopify(r.id, r.trackingNumber)}
              onCancel={() => void cancelInShopify(r.id, r.trackingNumber)}
            />
          );
        },
        csv: (r) => (r.shopifySync ? `${r.shopifySync.outcome}: ${r.shopifySync.message}` : ''),
      },
    ],
    [pending.inFlight, checkIn, canCheckIn, retryShopify, cancelInShopify, busyShopify],
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-sm text-muted-foreground">
          Parcels PostEx is bringing back or has brought back. Check each one in when it is in your hands: its stock moves here at once, and Shopify's stock is brought in line. Restocking never cancels the Shopify order.
          {awaiting.data && awaiting.data.comingBack > 0 ? ` ${awaiting.data.comingBack} more ${awaiting.data.comingBack === 1 ? 'is' : 'are'} on the way back.` : ''}
        </p>
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
          {view === 'shopify' && (
            <p className="text-sm text-muted-foreground">
              Checked in, but Shopify's stock is not settled: Shopify refused (Retry), or the order is still open there and keeps the units committed to it (Cancel in Shopify when you are ready, or cancel it in Shopify with Restock ticked). These are re-checked automatically every few minutes.
            </p>
          )}
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
