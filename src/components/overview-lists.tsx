import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Definition } from '@/components/dashboard-ui';
import { ListSkeleton, TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import type { ProductReportRow, QueuePage, RecentOrderRow, StoreKey } from '@/lib/api';
import { DEFINITIONS, type Period, compactRupees, topProducts } from '@/lib/dashboard';
import { formatKarachiTime, formatPaisa, fromNow } from '@/lib/format';
import { orderStateText, orderStateTone } from '@/lib/orders';
import { STORE_LABELS } from '@/lib/parcels';
import { cn } from '@/lib/utils';

/**
 * The lists among the dashboard's cards: who still has to be called, which products sell most, and
 * what the latest orders made. The page draws each only for a role that may read what is behind it,
 * so a card is never an empty box or a refused request.
 */

const query = (period: Period | null, store: StoreKey | null, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams(extra);
  if (period?.from) q.set('from', period.from);
  if (period?.to) q.set('to', period.to);
  if (store) q.set('store', store);
  return q.toString();
};

function ListCard({ title, term, definition, note, action, className, children }: { title: string; term?: string; definition: string; note: string; action?: { to: string; label: string }; className?: string; children: React.ReactNode }) {
  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 space-y-0 px-4 pb-0">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-semibold">{title}</h3>
            <Definition term={term ?? title}>{definition}</Definition>
          </div>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        {action && (
          <Link className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={action.to}>
            {action.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4">{children}</CardContent>
    </Card>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
const Failed = ({ what, error }: { what: string; error: string }) => (
  <p role="alert" className="py-4 text-sm text-brand-coral">
    Could not load {what}: {error}
  </p>
);

// ---- Confirmation queue ----

const QUEUE_ROWS = 5;

/** The newest orders with no status tag yet, and how many there are in all. */
export function ConfirmationQueueCard({ store, className }: { store: StoreKey | null; className?: string }) {
  const open = useApi<QueuePage>(`/api/v1/confirmations/queue?${query(null, store, { view: 'new', pageSize: String(QUEUE_ROWS) })}`);
  const d = open.data;

  return (
    <ListCard
      className={className}
      title="Confirmation queue"
      definition={DEFINITIONS.queue}
      note={d ? `${d.total.toLocaleString('en-PK')} with no status tag yet` : 'New orders with no status tag yet'}
      action={{ to: '/confirmations', label: 'Open Confirmations' }}
    >
      {open.error && !d ? (
        <Failed what="the queue" error={open.error} />
      ) : !d ? (
        <ListSkeleton rows={QUEUE_ROWS} trailing="badge" label="Loading the queue" />
      ) : d.rows.length === 0 ? (
        <Empty>No new orders: every order has a status tag.</Empty>
      ) : (
        <ul className="divide-y">
          {d.rows.map((r) => (
            <li key={r.orderId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  <span className="font-medium">{r.orderNumber}</span>
                  {r.customerName && <span> · {r.customerName}</span>}
                  {r.city && <span className="text-muted-foreground"> · {r.city}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.items} · placed {fromNow(r.placedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-medium tabular-nums">{formatPaisa(r.totalPaisa)}</span>
                <Badge variant="secondary">New</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

// ---- Top products ----

/** The products that sold the most units in the period, as bars. */
export function TopProductsCard({ period, periodLabel, store, className }: { period: Period; periodLabel: string; store: StoreKey | null; className?: string }) {
  const report = useApi<{ rows: ProductReportRow[] }>(`/api/v1/reports/products?${query(period, store)}`);
  const top = report.data ? topProducts(report.data.rows) : undefined;

  return (
    <ListCard className={className} title="Top products by sales" definition={DEFINITIONS.topProducts} note={`Units sold, delivered ${periodLabel}`}>
      {report.error && !top ? (
        <Failed what="the products" error={report.error} />
      ) : !top ? (
        <ListSkeleton rows={5} lines={1} trailing="number" label="Loading the products" />
      ) : top.length === 0 ? (
        <Empty>No product was delivered in this period.</Empty>
      ) : (
        <ol className="space-y-2.5">
          {top.map((p, i) => (
            <li key={p.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}</span>
                  {p.title}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {p.units.toLocaleString('en-PK')} {p.units === 1 ? 'unit' : 'units'}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, p.share * 100)}%`, backgroundColor: 'var(--viz-1)' }} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{compactRupees(p.revenue)} in sales</p>
            </li>
          ))}
        </ol>
      )}
    </ListCard>
  );
}

// ---- Recent orders ----

const profitClass = (paisa: string) => (BigInt(paisa) < 0n ? 'text-brand-coral' : 'text-emerald-600 dark:text-emerald-400');

/** The newest orders with what each made. A row opens its parcel, or the order in the Orders list when none is booked. */
export function RecentOrdersCard({ store, className }: { store: StoreKey | null; className?: string }) {
  const recent = useApi<{ rows: RecentOrderRow[] }>(`/api/v1/reports/recent-orders?${query(null, store)}`);
  const navigate = useNavigate();
  const rows = recent.data?.rows;
  // A role that may not see customers gets no names, so the column goes rather than showing dashes.
  const customers = rows?.some((r) => r.customerName !== null) ?? true;
  const open = (r: RecentOrderRow) => (r.parcelId ? `/parcels/${r.parcelId}` : `/orders?q=${encodeURIComponent(r.orderNumber)}`);

  return (
    <ListCard className={className} title="Recent orders — true profit per order" definition={DEFINITIONS.recentOrders} note="The latest orders, whenever they were placed. Click a row to open it." action={{ to: '/orders', label: 'View all' }}>
      {recent.error && !rows ? (
        <Failed what="the orders" error={recent.error} />
      ) : !rows ? (
        <TableSkeleton variant="plain" rows={5} label="Loading the recent orders" columns={[{ header: 'Order', sub: true }, ...(customers ? [{ header: 'Customer', sub: true }] : []), { header: 'Product', sub: true }, num('COD'), num('True profit'), { header: 'Status', as: 'badge' as const }]} />
      ) : rows.length === 0 ? (
        <Empty>No orders yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                {customers && <TableHead>Customer</TableHead>}
                <TableHead>Product</TableHead>
                <TableHead className="text-right">COD</TableHead>
                <TableHead className="text-right">True profit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.orderId} className="cursor-pointer" onClick={() => navigate(open(r))}>
                  <TableCell>
                    {/* The link is the keyboard's way into the row; the row's click is the mouse's. */}
                    <Link to={open(r)} className="font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={(e) => e.stopPropagation()}>
                      {r.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatKarachiTime(r.placedAt).split(',')[0]} · {STORE_LABELS[r.store]}
                    </p>
                  </TableCell>
                  {customers && (
                    <TableCell>
                      <p className="font-medium">{r.customerName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{r.city ?? '—'}</p>
                    </TableCell>
                  )}
                  <TableCell>
                    <p>
                      {r.product ?? '—'}
                      {r.otherProducts > 0 && <span className="text-muted-foreground"> +{r.otherProducts} more</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">Qty {r.units}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatPaisa(r.totalPaisa)}</TableCell>
                  <TableCell className="text-right">
                    {r.profit === null ? (
                      <>
                        <p className="text-muted-foreground">—</p>
                        <p className="text-xs text-muted-foreground">once delivered</p>
                      </>
                    ) : (
                      <>
                        <p className={cn('font-semibold tabular-nums', profitClass(r.profit))}>{formatPaisa(r.profit)}</p>
                        <p className="text-xs text-muted-foreground">after goods + courier</p>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStateTone(r.state)}>{orderStateText(r.state)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ListCard>
  );
}
