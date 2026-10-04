import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { Fact } from '@/components/fact';
import { FactsSkeleton, Line, Loading, SmallLine } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import type { OrderDetailData } from '@/lib/api';
import { CONFIRMATION_LABELS, OUTCOME_LABELS, describeItem, formatKarachiFull, formatPaisa, kindLabel } from '@/lib/format';
import { CHANNEL_LABELS, orderStateText, orderStateTone, paymentText } from '@/lib/orders';
import { STORE_LABELS, stageText } from '@/lib/parcels';
import { stageTone } from '@/lib/postex';
import { cn } from '@/lib/utils';

const CHARGE_LABELS: Record<string, string> = {
  forward: 'Delivery charge',
  forward_tax: 'Tax on delivery',
  reversal: 'Return charge',
  reversal_tax: 'Tax on return',
};
const SOURCE_LABELS: Record<string, string> = { api: 'Shopify', csv_import: 'CSV import', consignment: "Partner's sales sheet" };
const CHANNEL_NAMES: Record<string, string> = { call: 'Call', whatsapp: 'WhatsApp' };

/** Shopify gives a product with no SKU of its own "0" or nothing; neither says anything to a reader. */
const realSku = (sku: string | null): boolean => sku !== null && !/^0*$/.test(sku.trim());

const when = (iso: string | null): string => (iso ? formatKarachiFull(iso) : '—');

/** The page while the order loads: its heading, then the cards in their places. */
function OrderSkeleton() {
  const card = (title: string, rows: number) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <FactsSkeleton rows={rows} />
      </CardContent>
    </Card>
  );
  return (
    <Loading label="Loading the order">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <div className="basis-full">
          <Line className="w-96" />
          <SmallLine className="w-48" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {card('Items', 6)}
          {card('Confirmation call', 4)}
        </div>
        <div className="space-y-6">
          {card('Customer and delivery', 5)}
          {card('Order', 6)}
        </div>
      </div>
    </Loading>
  );
}

/**
 * One order, drawn from what the server sent: everything the list leaves out. What a role may not
 * see (a phone number, a street, PostEx's charges, the profit) arrives empty and is not drawn. The
 * phone is also checked here, as on every screen that shows one, so a mistake on the server alone
 * could not put a number on a screen that should not have it.
 */
export function OrderView({ order, canOpenParcels, canSeePhone }: { order: OrderDetailData; canOpenParcels: boolean; canSeePhone: boolean }) {
  const o = order;
  const address = o.customer.address;
  const streets = [address?.line1, address?.line2].filter(Boolean);
  const place = [address?.city, address?.province, address?.postal].filter(Boolean).join(', ');

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{o.orderNumber}</h1>
        <Badge variant={orderStateTone(o.state)}>{orderStateText(o.state)}</Badge>
        {o.channel !== 'online' && <Badge variant="outline">{CHANNEL_LABELS[o.channel]}</Badge>}
        {o.cancelledAt && <Badge variant="destructive">Cancelled in Shopify</Badge>}
        <p className="basis-full text-sm text-muted-foreground">
          {STORE_LABELS[o.store]} · placed {formatKarachiFull(o.placedAt)} · payment {paymentText(o.financialStatus).toLowerCase()}
        </p>
      </div>

      {o.openItems.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-brand-coral/40 bg-brand-coral/5 p-4 text-sm">
          <p className="font-medium">Open on the reconciliation queue</p>
          <ul className="mt-1 list-disc pl-5">
            {o.openItems.map((item) => (
              <li key={item.id}>
                {kindLabel(item.kind)}: {describeItem(item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                {o.lines.reduce((n, l) => n + l.qty, 0)} {o.lines.reduce((n, l) => n + l.qty, 0) === 1 ? 'unit' : 'units'} across {o.lines.length} {o.lines.length === 1 ? 'product' : 'products'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {o.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">This order has no items.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-1.5 pr-3 font-medium">
                          Product
                        </th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                          Qty
                        </th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                          Price
                        </th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                          Discount
                        </th>
                        <th scope="col" className="py-1.5 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 pr-3">
                            <p>{l.title}</p>
                            {realSku(l.sku) && <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{l.qty}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatPaisa(l.unitPaisa)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{l.discountPaisa === '0' ? '—' : formatPaisa(l.discountPaisa)}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{formatPaisa(l.totalPaisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <dl className="mt-3 divide-y border-t">
                <Fact label="Subtotal">{formatPaisa(o.money.subtotalPaisa)}</Fact>
                <Fact label="Discount">{o.money.discountPaisa === '0' ? '—' : `− ${formatPaisa(o.money.discountPaisa)}`}</Fact>
                <Fact label="Shipping">{formatPaisa(o.money.shippingPaisa)}</Fact>
                <Fact label="Tax">{formatPaisa(o.money.taxPaisa)}</Fact>
                <Fact label="Total">
                  <span className="font-semibold">{formatPaisa(o.money.totalPaisa)}</span>
                </Fact>
              </dl>
            </CardContent>
          </Card>

          {o.channel === 'online' && (
            <Card>
              <CardHeader>
                <CardTitle>Confirmation call</CardTitle>
                <CardDescription>{o.confirmation ? `${o.confirmation.attempts} ${o.confirmation.attempts === 1 ? 'contact' : 'contacts'} made${o.confirmation.source === 'shopify_tags' ? ', from the Shopify tags' : ''}` : 'The desk has not looked at this order yet.'}</CardDescription>
              </CardHeader>
              {o.confirmation && (
                <CardContent>
                  <dl className="divide-y">
                    <Fact label="Status">{CONFIRMATION_LABELS[o.confirmation.state] ?? o.confirmation.state}</Fact>
                    <Fact label="Last handled by">{o.confirmation.agent ?? '—'}</Fact>
                    <Fact label="Confirmed">{when(o.confirmation.confirmedAt)}</Fact>
                    <Fact label="Last contact">{when(o.confirmation.lastAttemptAt)}</Fact>
                    {o.confirmation.nextAttemptAt && <Fact label="Next try">{when(o.confirmation.nextAttemptAt)}</Fact>}
                    {o.confirmation.outcomeReason && <Fact label="Reason">{o.confirmation.outcomeReason}</Fact>}
                  </dl>
                  {o.attempts.length > 0 && (
                    <ol className="mt-3 space-y-3 border-t pt-3 text-sm">
                      {o.attempts.map((a, i) => (
                        <li key={i}>
                          <p>
                            <span className="font-medium">{OUTCOME_LABELS[a.outcome] ?? a.outcome}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {a.agent}
                              {a.channel && ` · ${CHANNEL_NAMES[a.channel] ?? a.channel}`} · {formatKarachiFull(a.at)}
                            </span>
                          </p>
                          {a.reason && <p className="text-muted-foreground">Reason: {a.reason}</p>}
                          {a.note && <p className="text-muted-foreground">{a.note}</p>}
                          {a.followUpAt && <p className="text-muted-foreground">Follow up {formatKarachiFull(a.followUpAt)}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>Every change of state, and what caused it.</CardDescription>
            </CardHeader>
            <CardContent>
              {o.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {o.history.map((h, i) => (
                    <li key={i}>
                      <p>
                        <span className="font-medium">{h.from ? `${orderStateText(h.from)} → ${orderStateText(h.to)}` : orderStateText(h.to)}</span>
                        <span className="text-muted-foreground"> · {formatKarachiFull(h.at)}</span>
                      </p>
                      <p className="text-muted-foreground">{h.cause}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer and delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Fact label="Customer">{o.customer.name ?? '—'}</Fact>
                {canSeePhone && o.customer.phone && <Fact label="Phone">{o.customer.phone}</Fact>}
                <Fact label="Deliver to">
                  {streets.length === 0 && !place ? (
                    '—'
                  ) : (
                    <>
                      {streets.map((s) => (
                        <span key={s} className="block">
                          {s}
                        </span>
                      ))}
                      {place && <span className="block">{place}</span>}
                    </>
                  )}
                </Fact>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Fact label="Payment">{paymentText(o.financialStatus)}</Fact>
                <Fact label="Shopify fulfillment">{paymentText(o.fulfillmentStatus)}</Fact>
                <Fact label="Came from">{SOURCE_LABELS[o.source] ?? o.source}</Fact>
                <Fact label="Discount codes">
                  {o.discountCodes.length === 0 ? (
                    '—'
                  ) : (
                    <span className="flex flex-wrap justify-end gap-1">
                      {o.discountCodes.map((c) => (
                        <Badge key={c} variant="secondary">
                          {c}
                        </Badge>
                      ))}
                    </span>
                  )}
                </Fact>
                {o.influencer && (
                  <Fact label="Influencer">
                    {o.influencer.name} <span className="text-muted-foreground">@{o.influencer.handle}</span>
                  </Fact>
                )}
                <Fact label="Tags">
                  {o.tags.length === 0 ? (
                    '—'
                  ) : (
                    <span className="flex flex-wrap justify-end gap-1">
                      {o.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  )}
                </Fact>
                {o.cancelledAt && <Fact label="Cancelled">{when(o.cancelledAt)}</Fact>}
                {o.cancelReason && <Fact label="Cancel reason">{paymentText(o.cancelReason)}</Fact>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{o.parcels.length === 1 ? 'Parcel' : 'Parcels'}</CardTitle>
              <CardDescription>{o.parcels.length === 0 ? 'No parcel has been booked for this order.' : 'What PostEx has done with it.'}</CardDescription>
            </CardHeader>
            {o.parcels.length > 0 && (
              <CardContent className="space-y-4">
                {o.parcels.map((p) => {
                  const mismatch = p.codPaisa !== null && p.codPaisa !== o.money.totalPaisa;
                  return (
                    <div key={p.id} className={cn(o.parcels.length > 1 && 'rounded-lg border p-3')}>
                      <div className="flex flex-wrap items-center gap-2">
                        {canOpenParcels ? (
                          <Link className="font-mono text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={`/parcels/${p.id}`}>
                            {p.trackingNumber}
                          </Link>
                        ) : (
                          <span className="font-mono text-sm">{p.trackingNumber}</span>
                        )}
                        <Badge variant={stageTone(p.stage)}>{stageText(p.stage)}</Badge>
                      </div>
                      <dl className="divide-y">
                        <Fact label="PostEx says">{p.statusLabel ?? p.statusMessage ?? '—'}</Fact>
                        <Fact label="Booked">{when(p.bookedAt)}</Fact>
                        <Fact label="Delivered">{when(p.deliveredAt)}</Fact>
                        {p.daysInTransit !== null && <Fact label="Days since booking">{p.daysInTransit}</Fact>}
                        <Fact label="PostEx collects">
                          <span className={mismatch ? 'font-medium text-brand-coral' : undefined}>{formatPaisa(p.codPaisa)}</span>
                        </Fact>
                        <Fact label="Delivery attempts">{p.attempts}</Fact>
                        {p.lastFailureReason && <Fact label="Last failure">{p.lastFailureReason}</Fact>}
                        {p.charges?.map((c) => (
                          <Fact key={c.kind} label={CHARGE_LABELS[c.kind] ?? c.kind.replaceAll('_', ' ')}>
                            {formatPaisa(c.amountPaisa)}
                          </Fact>
                        ))}
                        {p.payouts && p.payouts.length === 0 && p.stage === 'delivered' && <Fact label="Payout">Not paid out yet</Fact>}
                        {p.payouts?.map((pay) => (
                          <Fact key={pay.cprNumber} label={`Paid out (${pay.cprNumber})`}>
                            {formatPaisa(pay.amountPaisa)} · {when(pay.paidAt)}
                          </Fact>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>

          {o.books && (
            <Card>
              <CardHeader>
                <CardTitle>What it made</CardTitle>
                <CardDescription>Revenue less the goods, PostEx&apos;s charges with tax, marketing and write-offs, from the books.</CardDescription>
              </CardHeader>
              <CardContent>
                {o.profitPaisa === null ? (
                  <p className="text-sm text-muted-foreground">Shown once the order is delivered or returned. Before then the books hold only part of the picture.</p>
                ) : (
                  <p className={cn('text-3xl font-semibold tracking-tight', BigInt(o.profitPaisa) < 0n ? 'text-brand-coral' : 'text-emerald-600 dark:text-emerald-400')}>{formatPaisa(o.profitPaisa)}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/** The order opened from the Orders list: loads it, and says so when it cannot. */
export function OrderDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, error, reload } = useApi<OrderDetailData>(`/api/v1/orders/${encodeURIComponent(id ?? '')}`);
  // The previous order stays in the cache while another loads; it is never drawn as this one.
  const order = data && data.id === id ? data : undefined;

  const back = (
    <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
      <Link to="/orders">
        <ArrowLeft className="size-4" />
        All orders
      </Link>
    </Button>
  );

  if (!order) {
    return (
      <>
        {back}
        {error ? (
          <>
            <p role="alert" className="text-sm text-brand-coral">
              Could not load this order: {error}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </>
        ) : (
          <OrderSkeleton />
        )}
      </>
    );
  }
  return (
    <>
      {back}
      <OrderView order={order} canOpenParcels={can('parcels.read')} canSeePhone={can('pii.phone')} />
    </>
  );
}
