import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { type Column, DataTable } from '@/components/data-table';
import { FilterBar, type MultiFilter } from '@/components/filter-bar';
import { ReturnsAlert } from '@/components/returns-alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useListQuery } from '@/hooks/use-list-query';
import { useParcelList } from '@/hooks/use-parcel-list';
import type { ParcelRow } from '@/lib/api';
import { formatKarachiTime, formatPaisa } from '@/lib/format';
import type { QuerySpec } from '@/lib/list-query';
import { codCsv, orderLabel, stageText, storeLabel } from '@/lib/parcels';
import { FAILURE_REASONS, FLAG_LABELS, PARCEL_FLAGS, STAGES, STAGE_LABELS, stageTone } from '@/lib/postex';

const COLUMN_KEYS = ['tracking', 'order', 'store', 'stage', 'city', 'cod', 'days', 'bookedAt', 'statusUpdatedAt', 'attempts', 'flags'];

const SPEC_BASE: Omit<QuerySpec, 'multi'> = {
  sortKeys: ['bookedAt', 'statusUpdatedAt', 'cod', 'days'],
  defaultSort: { key: 'bookedAt', dir: 'desc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: COLUMN_KEYS,
  screen: 'parcels',
  defaultHidden: ['attempts'],
};

// Cities come from the data, so the spec accepts any short value for them.
const SPEC: QuerySpec = { ...SPEC_BASE, multi: { stage: STAGES, flag: PARCEL_FLAGS, city: null } };

const flagBadges = (row: ParcelRow) => (
  <span className="flex gap-1">
    {row.pr && <Badge variant="outline">PR</Badge>}
    {row.codPaisa === '0' && <Badge variant="outline">Zero COD</Badge>}
    {row.orderId === null && <Badge variant="outline">No order</Badge>}
    {row.stage === 'returned' && (row.checkedIn ? <Badge variant="secondary">{row.checkedIn === 'damaged' ? 'Damaged' : 'Restocked'}</Badge> : <Badge variant="destructive">Not checked in</Badge>)}
  </span>
);

const COLUMNS: Column<ParcelRow>[] = [
  { key: 'tracking', header: 'Tracking number', pinned: true, cell: (r) => <span className="font-mono text-xs">{r.trackingNumber}</span>, csv: (r) => r.trackingNumber },
  { key: 'order', header: 'Order', cell: (r) => orderLabel(r), csv: (r) => orderLabel(r) },
  { key: 'store', header: 'Store', cell: (r) => (r.store === 'nur' ? 'NUR' : r.store === 'organics' ? 'Organics' : '—'), csv: (r) => storeLabel(r.store) },
  {
    key: 'stage',
    header: 'Status',
    cell: (r) => (
      <span className="flex items-center gap-2">
        <Badge variant={stageTone(r.stage)}>{stageText(r.stage)}</Badge>
        {r.stage === 'attempted' && r.lastFailureReason && <span className="text-xs text-muted-foreground">{FAILURE_REASONS[r.lastFailureReason] ?? r.lastFailureReason}</span>}
      </span>
    ),
    csv: (r) => stageText(r.stage),
  },
  { key: 'city', header: 'City', cell: (r) => r.city ?? '—', csv: (r) => r.city ?? '' },
  { key: 'cod', header: 'COD', sortable: true, align: 'right', cell: (r) => formatPaisa(r.codPaisa), csv: (r) => codCsv(r.codPaisa) },
  { key: 'days', header: 'Days', sortable: true, align: 'right', cell: (r) => r.daysInTransit ?? '—', csv: (r) => (r.daysInTransit === null ? '' : String(r.daysInTransit)) },
  { key: 'bookedAt', header: 'Booked', sortable: true, cell: (r) => formatKarachiTime(r.bookedAt), csv: (r) => r.bookedAt ?? '' },
  { key: 'statusUpdatedAt', header: 'Last update', sortable: true, cell: (r) => formatKarachiTime(r.statusUpdatedAt), csv: (r) => r.statusUpdatedAt ?? '' },
  { key: 'attempts', header: 'Attempts', align: 'right', cell: (r) => r.attempts, csv: (r) => String(r.attempts) },
  { key: 'flags', header: 'Flags', cell: flagBadges, csv: (r) => [r.pr && 'PR', r.codPaisa === '0' && 'Zero COD', r.orderId === null && 'No order'].filter(Boolean).join('; ') },
];

/**
 * Every PostEx parcel: search by tracking number, order or phone, filter by status, city, booking
 * day and the flags people look for, within the sidebar's brand. The view is in the address, so it can be shared.
 */
export function ParcelsPage() {
  const [query, setQuery] = useListQuery(SPEC);
  const list = useParcelList(query);
  const navigate = useNavigate();
  const cities = useApi<{ cities: Array<{ city: string; parcels: number }> }>('/api/v1/parcels/cities');

  const filters = useMemo<MultiFilter[]>(
    () => [
      { key: 'stage', label: 'Status', options: STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })) },
      { key: 'flag', label: 'Flag', options: PARCEL_FLAGS.map((f) => ({ value: f, label: FLAG_LABELS[f] })) },
      { key: 'city', label: 'City', options: (cities.data?.cities ?? []).map((c) => ({ value: c.city, label: `${c.city} (${c.parcels})` })) },
    ],
    [cities.data],
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Parcels</h1>
        <p className="text-sm text-muted-foreground">Every parcel PostEx carries for us, with where it is and what it costs.</p>
      </div>
      <ReturnsAlert />
      <Card>
        <CardHeader>
          <FilterBar query={query} onChange={setQuery} multi={filters} dateLabel="Booked" searchPlaceholder="Tracking number, order or phone" />
        </CardHeader>
        <CardContent>
          <DataTable
            caption="PostEx parcels"
            columns={COLUMNS}
            rows={list.data?.rows}
            total={list.data?.total ?? 0}
            loading={list.loading}
            error={list.error ?? null}
            onRetry={list.reload}
            query={query}
            onQueryChange={setQuery}
            defaultSort={SPEC.defaultSort}
            pageSizes={SPEC.pageSizes}
            getRowId={(r) => r.id}
            rowLabel={(r) => `Parcel ${r.trackingNumber}`}
            onRowClick={(r) => navigate(`/parcels/${r.id}`)}
            exportRows={list.exportRows}
            exportName="parcels"
          />
        </CardContent>
      </Card>
    </>
  );
}
