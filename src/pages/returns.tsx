import { useCallback, useMemo } from 'react';
import { PackageCheck, PackageX } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { type Column, DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { ReturnsAlert } from '@/components/returns-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useCheckIn } from '@/hooks/use-check-in';
import { useListQuery } from '@/hooks/use-list-query';
import { useParcelList } from '@/hooks/use-parcel-list';
import { type AwaitingReturn, type ParcelRow } from '@/lib/api';
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
  columnKeys: ['tracking', 'order', 'store', 'city', 'cod', 'statusUpdatedAt', 'checkIn'],
  screen: 'returns',
};

type View = 'waiting' | 'done' | 'all';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Checked in' },
  { value: 'all', label: 'All returns' },
];

/** The register is the parcels API narrowed to parcels back at the warehouse, by the chosen view. */
const registerQuery = (query: ListQuery, view: View): ListQuery => ({
  ...query,
  multi: { ...query.multi, stage: ['returned'], ...(view === 'all' ? {} : { flag: [view === 'waiting' ? 'not_checked_in' : 'checked_in'] }) },
});

// A button inside a clickable row: neither the click nor Enter/Space may also open the row.
const own = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };

/**
 * The returns register: every parcel PostEx brought back to the warehouse, and whether someone
 * has checked it in as restocked or damaged. Checking in shows at once and is taken back if the
 * server refuses. The alert at the top counts what is still waiting.
 */
export function ReturnsPage() {
  const { can } = useAuth();
  const canCheckIn = can('returns.checkin');
  const [query, setQuery] = useListQuery(SPEC);
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'done' ? 'done' : params.get('view') === 'all' ? 'all' : 'waiting';
  const effective = useMemo(() => registerQuery(query, view), [query, view]);
  const list = useParcelList(effective);
  const { brand } = useBrand();
  const awaiting = useApi<{ returns: AwaitingReturn[] }>(`/api/v1/stock/returns-awaiting${brand ? `?store=${brand}` : ''}`);
  const navigate = useNavigate();

  const reloadList = list.reload;
  const reloadAwaiting = awaiting.reload;
  const onSaved = useCallback(() => {
    reloadList();
    reloadAwaiting();
  }, [reloadList, reloadAwaiting]);
  const { pending, checkIn } = useCheckIn(onSaved);

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
    ],
    [pending.inFlight, checkIn, canCheckIn],
  );


  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-sm text-muted-foreground">Parcels PostEx has brought back. Check each one in as restocked or damaged when it reaches the warehouse.</p>
      </div>
      <ReturnsAlert waiting={awaiting.data ? waiting : undefined} onOpen={false} />
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
          <FilterBar query={query} onChange={setQuery} dateLabel="Booked" searchPlaceholder="Scan or type a tracking number" />
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </>
  );
}
