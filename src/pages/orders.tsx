import { useMemo } from 'react';
import { Link } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { type Column, DataTable } from '@/components/data-table';
import { FilterBar, type MultiFilter } from '@/components/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useListQuery } from '@/hooks/use-list-query';
import { useOrderList } from '@/hooks/use-order-list';
import type { OrderListRow, StoreKey } from '@/lib/api';
import { TagChip } from '@/components/tag-chip';
import { formatKarachiTime, formatPaisa, paisaToInput } from '@/lib/format';
import type { QuerySpec } from '@/lib/list-query';
import { CHANNEL_LABELS, ORDER_CHANNELS, ORDER_FLAGS, ORDER_FLAG_LABELS, ORDER_STATES, ORDER_STATE_LABELS, orderStateText, orderStateTone, paymentText } from '@/lib/orders';
import { stageText, storeLabel } from '@/lib/parcels';
import { stageTone } from '@/lib/postex';

const COLUMN_KEYS = ['order', 'view', 'store', 'state', 'tags', 'customer', 'phone', 'city', 'total', 'items', 'placedAt', 'parcel', 'payment', 'flags'];

const SPEC_BASE: Omit<QuerySpec, 'multi'> = {
  sortKeys: ['placedAt', 'total', 'items'],
  defaultSort: { key: 'placedAt', dir: 'desc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: COLUMN_KEYS,
  screen: 'orders',
  defaultHidden: ['payment'],
};

// Cities and tags come from the data, so the spec accepts any short value for them.
const SPEC: QuerySpec = { ...SPEC_BASE, multi: { state: ORDER_STATES, channel: ORDER_CHANNELS, flag: ORDER_FLAGS, city: null, tag: null } };

type StatusTags = Record<StoreKey, readonly string[]>;

/** The order's Shopify tags: a confirmation decision in colour, other apps' tags quiet. */
const tagsColumn = (statusTags: StatusTags | undefined): Column<OrderListRow> => ({
  key: 'tags',
  header: 'Shopify tags',
  cell: (r) =>
    r.tags.length === 0 ? (
      <span className="text-xs text-muted-foreground">No tags</span>
    ) : (
      <span className="flex max-w-72 flex-wrap gap-1">
        {r.tags.map((t) => (
          <TagChip key={t} tag={t} statusTags={(r.store && statusTags?.[r.store]) || []} />
        ))}
      </span>
    ),
  csv: (r) => r.tags.join('; '),
});

const flagText = (row: OrderListRow): string[] =>
  [
    row.channel !== 'online' && CHANNEL_LABELS[row.channel],
    row.discountCodes.length > 0 && row.discountCodes.join(' '),
    row.parcels > 1 && `${row.parcels} parcels`,
  ].filter((f): f is string => typeof f === 'string');

const flagBadges = (row: OrderListRow) => (
  <span className="flex gap-1">
    {row.channel !== 'online' && <Badge variant="outline">{CHANNEL_LABELS[row.channel]}</Badge>}
    {row.discountCodes.length > 0 && <Badge variant="secondary">{row.discountCodes.join(' ')}</Badge>}
    {row.parcels > 1 && <Badge variant="outline">{row.parcels} parcels</Badge>}
  </span>
);

const COLUMNS: Column<OrderListRow>[] = [
  { key: 'order', header: 'Order', pinned: true, cell: (r) => <span className="font-mono text-xs">{r.orderNumber}</span>, csv: (r) => r.orderNumber },
  {
    key: 'view',
    header: '',
    pinned: true,
    exported: false,
    cell: (r) => (
      <Button asChild variant="outline" size="sm" className="h-7 px-2.5">
        <Link to={`/orders/${r.id}`} aria-label={`View order ${r.orderNumber}`}>
          View
        </Link>
      </Button>
    ),
    csv: () => '',
  },
  { key: 'store', header: 'Store', cell: (r) => (r.store === 'nur' ? 'NUR' : r.store === 'organics' ? 'Organics' : '—'), csv: (r) => storeLabel(r.store) },
  { key: 'state', header: 'Status', cell: (r) => <Badge variant={orderStateTone(r.state)}>{orderStateText(r.state)}</Badge>, csv: (r) => orderStateText(r.state) },
  { key: 'customer', header: 'Customer', cell: (r) => r.customerName ?? '—', csv: (r) => r.customerName ?? '' },
  { key: 'phone', header: 'Phone', cell: (r) => r.phone ?? '—', csv: (r) => r.phone ?? '' },
  { key: 'city', header: 'City', cell: (r) => r.city ?? '—', csv: (r) => r.city ?? '' },
  { key: 'total', header: 'Total', sortable: true, align: 'right', cell: (r) => formatPaisa(r.totalPaisa), csv: (r) => paisaToInput(r.totalPaisa) },
  { key: 'items', header: 'Items', sortable: true, align: 'right', cell: (r) => r.items, csv: (r) => String(r.items) },
  { key: 'placedAt', header: 'Placed', sortable: true, cell: (r) => formatKarachiTime(r.placedAt), csv: (r) => r.placedAt },
  {
    key: 'parcel',
    header: 'Parcel',
    cell: (r) =>
      r.parcel ? (
        <span className="flex items-center gap-2">
          <ParcelLink parcel={r.parcel} />
          <Badge variant={stageTone(r.parcel.stage)}>{stageText(r.parcel.stage)}</Badge>
        </span>
      ) : (
        <span className="text-muted-foreground">Not booked</span>
      ),
    csv: (r) => r.parcel?.trackingNumber ?? '',
  },
  { key: 'payment', header: 'Payment', cell: (r) => paymentText(r.financialStatus), csv: (r) => r.financialStatus ?? '' },
  { key: 'flags', header: 'Flags', cell: flagBadges, csv: (r) => flagText(r).join('; ') },
];

/** The tracking number, linking to the parcel for whoever may open parcels. */
function ParcelLink({ parcel }: { parcel: NonNullable<OrderListRow['parcel']> }) {
  const { can } = useAuth();
  const text = <span className="font-mono text-xs">{parcel.trackingNumber}</span>;
  if (!can('parcels.read')) return text;
  return (
    <Link className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={`/parcels/${parcel.id}`}>
      {text}
    </Link>
  );
}

/**
 * Every Shopify order and the state it is in: search by order number, customer, phone or tracking
 * number, filter by status, channel, city, placing day and the flags people look for, within the
 * sidebar's brand. The view is in the address, so it can be shared.
 */
export function OrdersPage() {
  const [query, setQuery] = useListQuery(SPEC);
  const list = useOrderList(query);
  const { can } = useAuth();
  const cities = useApi<{ cities: Array<{ city: string; orders: number }> }>('/api/v1/orders/cities');
  const tags = useApi<{ tags: Array<{ tag: string; orders: number }>; statusTags: StatusTags }>('/api/v1/orders/tags');
  const statusTags = tags.data?.statusTags;

  // A role that may not see phone numbers has no column of dashes in their place.
  const columns = useMemo(() => {
    const all = COLUMNS.flatMap((c) => (c.key === 'state' ? [c, tagsColumn(statusTags)] : [c]));
    return can('pii.phone') ? all : all.filter((c) => c.key !== 'phone');
  }, [can, statusTags]);

  const filters = useMemo<MultiFilter[]>(
    () => [
      { key: 'state', label: 'Status', options: ORDER_STATES.map((s) => ({ value: s, label: ORDER_STATE_LABELS[s] })) },
      { key: 'channel', label: 'Channel', options: ORDER_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] })) },
      { key: 'flag', label: 'Flag', options: ORDER_FLAGS.map((f) => ({ value: f, label: ORDER_FLAG_LABELS[f] })) },
      { key: 'city', label: 'City', options: (cities.data?.cities ?? []).map((c) => ({ value: c.city, label: `${c.city} (${c.orders})` })) },
      { key: 'tag', label: 'Shopify tag', options: (tags.data?.tags ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.orders})` })) },
    ],
    [cities.data, tags.data],
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">Every Shopify order, the state it is in, and the tags it carries in Shopify.</p>
      </div>
      <Card>
        <CardHeader>
          <FilterBar query={query} onChange={setQuery} multi={filters} dateLabel="Placed" searchPlaceholder="Order, customer, phone or tracking number" />
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Orders"
            columns={columns}
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
            exportRows={list.exportRows}
            exportName="orders"
          />
        </CardContent>
      </Card>
    </>
  );
}
