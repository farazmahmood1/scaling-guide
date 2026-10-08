import { type OrderListRow, type OrderPage, type OrderState, apiGet } from '@/lib/api';
import type { ListQuery } from '@/lib/list-query';
import { EXPORT_CAP } from '@/lib/parcels';

export const ORDER_STATES = ['placed', 'confirmed', 'ready_to_book', 'booked', 'in_transit', 'delivered', 'failed', 'returning', 'returned_received', 'cancelled', 'pr'] as const satisfies readonly OrderState[];

export const ORDER_STATE_LABELS: Record<OrderState, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  ready_to_book: 'Ready to book',
  booked: 'Booked',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  returning: 'Returning',
  returned_received: 'Returned, received',
  cancelled: 'Cancelled',
  pr: 'PR',
};

/** An order whose state has not been worked out yet is shown as such, never guessed. */
export const orderStateText = (state: OrderState | null): string => (state ? (ORDER_STATE_LABELS[state] ?? state) : '—');

export const orderStateTone = (state: OrderState | null): 'default' | 'secondary' | 'destructive' | 'outline' =>
  state === 'delivered'
    ? 'default'
    : state === 'failed' || state === 'returning' || state === 'returned_received' || state === 'cancelled'
      ? 'destructive'
      : state === 'pr'
        ? 'outline'
        : 'secondary';

export const ORDER_CHANNELS = ['online', 'consignment', 'pr'] as const;
export const CHANNEL_LABELS: Record<(typeof ORDER_CHANNELS)[number], string> = { online: 'Online', consignment: 'Consignment', pr: 'PR' };

export const ORDER_FLAGS = ['no_parcel', 'many_parcels', 'discounted'] as const;
export const ORDER_FLAG_LABELS: Record<(typeof ORDER_FLAGS)[number], string> = {
  no_parcel: 'No parcel yet',
  many_parcels: 'More than one parcel',
  discounted: 'Discounted',
};

/** Shopify's payment status in words (`partially_paid` → `Partially paid`); a dash when it gave none. */
export const paymentText = (status: string | null): string => (status ? status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ') : '—');

/** The orders API address for a list view: the same names the URL uses, so the two never drift. */
export const ordersPath = (q: ListQuery, page: { page: number; pageSize: number } = q): string => {
  const params = new URLSearchParams();
  if (q.search) params.set('q', q.search);
  for (const key of ['state', 'store', 'channel', 'flag', 'city', 'tag']) {
    const values = q.multi[key];
    if (values?.length) params.set(key, values.join(','));
  }
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.sort) params.set('sort', `${q.sort.key}:${q.sort.dir}`);
  params.set('page', String(page.page));
  params.set('size', String(page.pageSize));
  return `/api/v1/orders?${params}`;
};

const EXPORT_PAGE = 200;

/** Every row of a view (its filters and sort), a page at a time, for the CSV export. */
export async function fetchAllOrders(query: ListQuery): Promise<OrderListRow[]> {
  const rows: OrderListRow[] = [];
  for (let page = 1; ; page++) {
    const result = await apiGet<OrderPage>(ordersPath(query, { page, pageSize: EXPORT_PAGE }));
    rows.push(...result.rows);
    if (result.rows.length === 0 || rows.length >= result.total || rows.length >= EXPORT_CAP) return rows;
  }
}
