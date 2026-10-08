import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, MapPin, MessageCircle, Phone, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FactsSkeleton, Line, Loading, SmallLine, TableSkeleton, num } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type CustomerHistory, type DeskAlert, type DeskOrderPage, type QueuePage, type StoreKey, type TagEditResult, type TimelineEntry, apiPost, apiPut } from '@/lib/api';
import { describeItem, formatKarachiTime, formatPaisa, fromNow, kindLabel, percent } from '@/lib/format';
import { isStatusTag, sameTag } from '@/lib/tags';
import { ShopifyAccessNotice } from '@/components/shopify-access-notice';
import { TagChip } from '@/components/tag-chip';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const STORE_LABELS: Record<StoreKey, string> = { nur: 'NUR', organics: 'Organics' };

const rate = (value: number | null) => (value === null ? '—' : percent(value));

// ---- Tags ----

// ---- Alerts ----

function AlertsCard() {
  const { data, error } = useApi<{ alerts: DeskAlert[] }>('/api/v1/confirmations/alerts');
  if (error) return <p className="mb-4 text-sm text-brand-coral">Could not load alerts: {error}</p>;
  if (!data || data.alerts.length === 0) return null;
  return (
    <Card className="mb-6 border-brand-coral/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-brand-coral" />
          {data.alerts.length === 1 ? '1 order needs attention' : `${data.alerts.length} orders need attention`}
        </CardTitle>
        <CardDescription>Raised hourly. Each clears by itself once the order is booked, or the parcel is cancelled in PostEx.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {data.alerts.map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={alert.severity === 'error' ? 'destructive' : 'outline'}>{kindLabel(alert.kind)}</Badge>
              {alert.store && <span className="text-xs text-muted-foreground">{STORE_LABELS[alert.store]}</span>}
              <span>{describeItem(alert)}</span>
              <span className="text-xs text-muted-foreground">since {formatKarachiTime(alert.openedAt)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---- One order ----

const PARCEL_OUTCOME: Record<CustomerHistory['parcels'][number]['outcome'], string> = {
  delivered: 'delivered',
  refused: 'refused or returned',
  cancelled: 'cancelled',
  in_flight: 'still with PostEx',
};

function HistoryCard({ history }: { history: CustomerHistory | null }) {
  if (!history) return <p className="text-sm text-muted-foreground">No usable mobile number, so no history to show.</p>;
  const { counts, city } = history;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{counts.delivered}</div>
          <div className="text-xs text-muted-foreground">delivered</div>
        </div>
        <div className={`rounded-lg p-2 ${counts.refused > 0 ? 'bg-brand-coral/10' : 'bg-muted/50'}`}>
          <div className={`text-lg font-semibold ${counts.refused > 0 ? 'text-brand-coral' : ''}`}>{counts.refused}</div>
          <div className="text-xs text-muted-foreground">refused or returned</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <div className="text-lg font-semibold">{counts.cancelled}</div>
          <div className="text-xs text-muted-foreground">cancelled</div>
        </div>
      </div>
      <p className="text-muted-foreground">
        {counts.orders + counts.parcelsWithoutOrder === 0
          ? 'First order from this number, on either brand.'
          : `${counts.orders} earlier order${counts.orders === 1 ? '' : 's'} on both brands${counts.parcelsWithoutOrder > 0 ? ` and ${counts.parcelsWithoutOrder} PostEx parcel${counts.parcelsWithoutOrder === 1 ? '' : 's'} with no Shopify order` : ''}; delivery rate ${rate(history.deliveryRate)}.`}
        {/* A city nobody has delivered to yet (often a misspelling) has no rate to give. */}
        {city &&
          (city.returnRate === null
            ? ` No finished parcels to "${city.name}" yet, so no city return rate.`
            : ` Parcels to ${city.name} come back ${rate(city.returnRate)} of the time (${city.returned} of ${city.delivered + city.returned}).`)}
      </p>
      {history.orders.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {history.orders.slice(0, 20).map((o) => (
            <li key={o.orderId} className="flex justify-between gap-2">
              <span>
                {STORE_LABELS[o.store]} {o.orderNumber} · {formatKarachiTime(o.placedAt)}
              </span>
              <span className="text-muted-foreground">
                {formatPaisa(o.totalPaisa)} · {(o.state ?? '—').replaceAll('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {history.parcels.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">PostEx parcels with no Shopify order (booked by hand, or older than the orders kept here)</p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
            {history.parcels.slice(0, 20).map((p) => (
              <li key={p.shipmentId} className="flex justify-between gap-2">
                <span>
                  <span className="font-mono">{p.trackingNumber}</span> · {formatKarachiTime(p.bookedAt)}
                </span>
                <span className={p.outcome === 'refused' ? 'font-medium text-brand-coral' : 'text-muted-foreground'}>
                  {formatPaisa(p.codPaisa)} · {PARCEL_OUTCOME[p.outcome]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nothing on the timeline yet.</p>;
  return (
    <ol className="space-y-3 border-l pl-4 text-sm">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span className={`absolute top-1.5 -left-[21px] size-2 rounded-full ${e.source === 'platform' ? 'bg-brand-navy' : 'bg-muted-foreground/50'}`} aria-hidden />
          <div>{e.text}</div>
          <div className="text-xs text-muted-foreground">
            {formatKarachiTime(e.at)}
            {e.who && ` · ${e.who}`}
            {e.source === 'platform' && ' · from this page'}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

/** Shopify titles carry the marketing line after a dash: `Glow Lotion – A big no to dry skin`. */
const splitTitle = (title: string): [string, string | null] => {
  const m = /^(.+?)\s+[–—-]\s*(.+)$/.exec(title);
  return m ? [m[1]!, m[2]!] : [title, null];
};

function OrderPanel({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<DeskOrderPage>(`/api/v1/confirmations/orders/${orderId}`);
  // The server withholds the number from a role that may not see it; this makes the screen say so
  // instead of showing "No number", and shows nothing a number would have filled.
  const { can } = useAuth();
  const seesPhones = can('pii.phone');
  const [busy, setBusy] = useState(false);

  const change = async (edit: { add?: string[]; remove?: string[] }) => {
    setBusy(true);
    try {
      const result = await apiPut<TagEditResult>(`/api/v1/confirmations/orders/${orderId}/tags`, edit);
      if (result.status === 'written') toast.success(`${data?.order.orderNumber ?? 'Order'}: tags updated in Shopify`);
      reload();
      onChanged();
    } catch (cause) {
      // Nothing was changed on either side: Shopify is the record, and it said no.
      toast.error('Tags not changed', { description: cause instanceof Error ? cause.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <OrderPanelSkeleton />;
  if (error || !data) return <p className="text-sm text-brand-coral">Could not load the order: {error}</p>;
  const { order, history, timeline, shopify } = data;
  const editable = shopify.tagEditing && !order.cancelledInShopify && order.shopifyOrderId !== null;
  const missing = order.statusTags.filter((t) => !order.tags.some((have) => sameTag(have, t)));

  return (
    // Stays in view while the list beside it scrolls.
    <Card className="gap-0 py-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <CardHeader className="border-b py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
              <Badge variant="outline">{STORE_LABELS[order.store]}</Badge>
            </div>
            <CardDescription className="mt-1">Placed {formatKarachiTime(order.placedAt)}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{formatPaisa(order.totalPaisa)}</div>
            <div className="text-xs text-muted-foreground">cash on delivery</div>
          </div>
          <Button variant="ghost" size="icon-sm" className="-mr-2" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {order.booked && <Badge variant="secondary">Booked with PostEx</Badge>}
          {order.cancelledInShopify && <Badge variant="destructive">Cancelled in Shopify</Badge>}
          {order.shopifyUrl && (
            <Button asChild size="sm" variant="outline" className="h-7">
              <a href={order.shopifyUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open in Shopify
              </a>
            </Button>
          )}
        </div>
        {shopify.error && <p className="mt-2 text-xs text-brand-coral">Could not reach Shopify, so this is the order as last synced: {shopify.error}</p>}
      </CardHeader>

      <CardContent className="space-y-6 py-5">
        <section>
          <SectionTitle>Shopify tags</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {order.tags.length === 0 && <span className="text-sm text-muted-foreground">No tags yet: a new order.</span>}
            {order.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                statusTags={order.statusTags}
                disabled={busy}
                {...(editable && isStatusTag(tag, order.statusTags) ? { onRemove: () => change({ remove: [tag] }) } : {})}
              />
            ))}
          </div>
          {editable && missing.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs text-muted-foreground">Add a tag. It is saved in Shopify straight away.</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((tag) => (
                  <Button key={tag} size="sm" variant="outline" className="h-7 bg-background" disabled={busy} onClick={() => change({ add: [tag] })}>
                    <Plus className="size-3.5" />
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!shopify.tagEditing && <p className="mt-2 text-xs text-muted-foreground">Changing tags from here is switched off on the server. Change them in Shopify; they show here after the next sync.</p>}
        </section>

        <section>
          <SectionTitle>Customer</SectionTitle>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5 text-sm">
              <div className="font-medium">{order.customerName ?? 'Customer'}</div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="size-3.5 shrink-0" />
                {seesPhones ? (order.phone ?? 'No number') : 'Hidden for your role'}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                {order.city ?? 'No city'}
              </div>
            </div>
            {seesPhones && order.whatsappUrl && order.callUrl && (
              <div className="flex gap-2">
                <Button asChild size="sm" className="bg-[#1fa855] text-white hover:bg-[#1a9049]">
                  <a href={order.whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={order.callUrl}>
                    <Phone className="size-4" />
                    Call
                  </a>
                </Button>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>
            Items <span className="font-normal normal-case">({order.lines.reduce((n, l) => n + l.qty, 0)})</span>
          </SectionTitle>
          <ul className="divide-y rounded-lg border text-sm">
            {order.lines.map((line, i) => {
              const [name, detail] = splitTitle(line.title);
              return (
                <li key={i} className="flex items-start gap-3 px-3 py-2" title={line.title}>
                  <span className="w-7 shrink-0 text-muted-foreground tabular-nums">{line.qty}×</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{name}</div>
                    {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
                  </div>
                  <span className="shrink-0 tabular-nums">{formatPaisa(line.totalPaisa)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <SectionTitle>Customer history, both brands</SectionTitle>
          <HistoryCard history={history} />
        </section>

        <section>
          <SectionTitle>Timeline</SectionTitle>
          <Timeline entries={timeline} />
        </section>
      </CardContent>
    </Card>
  );
}

/** The order panel while its order loads: the heading, the tags, the customer and the history. */
function OrderPanelSkeleton() {
  return (
    <Card>
      <Loading label="Loading the order" className="flex flex-col gap-6">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Line className="mt-1.5 w-64" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {['w-28', 'w-20', 'w-24'].map((w, i) => (
              <Skeleton key={i} className={`h-5 ${w} rounded-full`} />
            ))}
          </div>
          <div className="space-y-1">
            <Line className="w-36" />
            <SmallLine className="w-60" />
            <SmallLine className="w-48" />
          </div>
          <div>
            <Line className="mb-2 w-48" />
            <FactsSkeleton rows={3} />
          </div>
        </CardContent>
      </Loading>
    </Card>
  );
}

// ---- The list ----

/** `new` and `all`, or `tag:<tag>` for the orders carrying one tag. */
type View = 'new' | 'all' | `tag:${string}`;

function OrdersList() {
  const [view, setView] = useState<View>('new');
  const { brand: store } = useBrand();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  // A brand changed in the sidebar is a filter change too: page 3 of one brand is not page 3 of the other.
  const [pagedBrand, setPagedBrand] = useState(store);
  if (pagedBrand !== store) {
    setPagedBrand(store);
    setPage(1);
  }
  const [selected, setSelected] = useState<string>();
  const pageSize = 25;
  const query = new URLSearchParams({
    ...(view.startsWith('tag:') ? { view: 'all', tag: view.slice(4) } : { view }),
    page: String(page),
    pageSize: String(pageSize),
    ...(store ? { store } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }).toString();
  const { data, error, loading, reload } = useApi<QueuePage>(`/api/v1/confirmations/queue?${query}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  // The filter offers the tags of the brand in view, or both brands' when none is picked.
  const filterTags = data ? [...new Set(store ? data.statusTags[store] : [...data.statusTags.nur, ...data.statusTags.organics])] : [];
  /** A filter change starts again from the first page. */
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await apiPost('/api/v1/confirmations/refresh', {});
      reload();
    } catch (cause) {
      toast.error('Could not sync from Shopify', { description: cause instanceof Error ? cause.message : undefined });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="min-w-0">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{data ? `${data.total} order${data.total === 1 ? '' : 's'}` : 'Orders'}</CardTitle>
              <CardDescription>{view === 'new' ? 'No status tag yet. Newest first.' : 'Not booked with PostEx yet. Newest first.'}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing || loading} title="Read the last three days of orders from Shopify now">
              <RefreshCw className={syncing || loading ? 'size-4 animate-spin' : 'size-4'} />
              Sync from Shopify
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectClass} value={view} onChange={(e) => filter(setView)(e.target.value as View)} aria-label="Show">
              <option value="new">New orders (no status tag)</option>
              <option value="all">All not booked</option>
              {filterTags.length > 0 && (
                <optgroup label="Tagged">
                  {filterTags.map((t) => (
                    <option key={t} value={`tag:${t}`}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Input className="w-full sm:w-56" placeholder="Order number or phone" value={search} onChange={(e) => filter(setSearch)(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data && (
            <TableSkeleton variant="ui" rows={8} label="Loading the orders" columns={[{ header: 'Order', sub: true }, { header: 'Customer', sub: true }, num('COD'), { header: 'Tags', as: 'badge' }, 'History']} />
          )}
          {error && <p className="text-sm text-brand-coral">Could not load the orders: {error}</p>}
          {data && data.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{view === 'new' ? 'No new orders. Every order has a status tag.' : 'No orders here.'}</p>}
          {data && data.rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>History</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.orderId} className={`cursor-pointer ${selected === row.orderId ? 'bg-muted' : ''}`} onClick={() => setSelected(row.orderId)}>
                        <TableCell>
                          <div className="font-medium">{row.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {STORE_LABELS[row.store]} · {fromNow(row.placedAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{row.customerName ?? '—'}</div>
                          <div className="max-w-56 truncate text-xs text-muted-foreground" title={row.items}>
                            {row.city ?? 'No city'} · {row.items}
                          </div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatPaisa(row.totalPaisa)}</TableCell>
                        <TableCell>
                          <div className="flex max-w-72 flex-wrap gap-1">
                            {row.tags.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : row.tags.map((t) => <TagChip key={t} tag={t} statusTags={data.statusTags[row.store]} />)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <span title="Delivered">✓ {row.history.delivered}</span>{' '}
                          <span title="Refused or returned" className={row.history.returned > 0 ? 'font-semibold text-brand-coral' : 'text-muted-foreground'}>
                            ↩ {row.history.returned}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="min-w-0">
        {selected ? (
          <OrderPanel key={selected} orderId={selected} onClose={() => setSelected(undefined)} onChanged={reload} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Pick an order to see its tags, the customer's history and the Shopify timeline.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * The Confirmations page: new orders, with their Shopify tags. Customers confirm on WhatsApp and
 * the store's automation tags the order; anything else is tagged here or in Shopify. Shopify is the
 * record either way: a tag changed here is changed in Shopify, and one changed there shows here.
 */
export function ConfirmationsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirmations</h1>
        <p className="text-sm text-muted-foreground">New orders nobody has tagged yet. Tags are Shopify's own: a change here is saved in Shopify, and a change in Shopify shows here.</p>
      </div>
      <ShopifyAccessNotice needs={['writeOrders']} purpose="change order tags" />
      <AlertsCard />
      <OrdersList />
    </>
  );
}
