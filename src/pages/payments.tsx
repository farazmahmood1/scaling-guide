import { Download, Wallet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { useBrand } from '@/brand/brand-context';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import type { PaymentWindow, PaymentsData } from '@/lib/api';
import { brandLabel } from '@/lib/brand';
import { downloadText, toCsv } from '@/lib/csv';
import { formatKarachiTime, formatPaisa } from '@/lib/format';
import { storeLabel } from '@/lib/parcels';
import { DEFAULT_WINDOW, PAYMENT_CSV_HEADER, PAYMENT_WINDOWS, chargesText, chargesTotal, isPaymentWindow, marginText, missingCost, paymentCsvRow, paymentLabel, windowReaching } from '@/lib/payments';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const COLUMNS = ['Order', 'Paid', num('Payment'), num('Delivery + tax'), num('Product cost'), num('Profit'), num('Margin')];

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'loss' }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-xl font-semibold tabular-nums', tone === 'loss' && 'text-brand-coral')}>{value}</dd>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The period's totals: what PostEx paid, what it kept, what the goods cost and what it all made. */
export function PaymentsSummary({ data }: { data: PaymentsData }) {
  const t = data.totals;
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Payment received" value={formatPaisa(t.payment)} hint={`${t.orders.toLocaleString('en-PK')} orders, from ${formatPaisa(t.cod)} cash on delivery`} />
      <Tile label="PostEx kept" value={formatPaisa(chargesTotal(t.deliveryFee, t.deliveryTax))} hint={`Delivery ${formatPaisa(t.deliveryFee)} + tax ${formatPaisa(t.deliveryTax)}`} />
      <Tile label="Product cost" value={formatPaisa(t.goods)} hint="What the goods sold cost us" />
      <Tile label="Profit" value={formatPaisa(t.profit)} hint={`Margin ${marginText(t.profit, t.revenue)} of the sale`} tone={BigInt(t.profit) < 0n ? 'loss' : undefined} />
    </dl>
  );
}

/** Each order PostEx paid in the period, newest payment first, with the period's totals under it. */
export function PaymentsTable({ data }: { data: PaymentsData }) {
  const t = data.totals;
  const uncosted = data.rows.filter(missingCost).length;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">PostEx payments, newest first</caption>
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Order</th>
              <th scope="col" className="px-3 py-2 font-medium">Paid</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Payment</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Delivery + tax</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Product cost</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Profit</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.orderId ?? r.trackingNumbers.join(',')} className="border-t">
                <td className="px-3 py-2">
                  {r.orderId ? (
                    <Link className="font-medium underline-offset-4 hover:underline" to={`/orders/${r.orderId}`}>
                      {r.orderNumber}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{paymentLabel(r)}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {storeLabel(r.store)}
                    {r.trackingNumbers.length > 1 ? ` · ${r.trackingNumbers.length} parcels` : ''}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatKarachiTime(r.paidAt)}
                  <div className="text-xs text-muted-foreground">CPR {r.cprNumbers.join(', ')}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="font-medium">{formatPaisa(r.payment)}</span>
                  {/* Paid before delivery (online): PostEx had nothing to collect and took its fee from the batch. */}
                  <div className="text-xs text-muted-foreground">{BigInt(r.cod) === 0n ? 'no cash to collect' : `of ${formatPaisa(r.cod)} COD`}</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {chargesText(r.deliveryFee, r.deliveryTax)}
                  {BigInt(r.deliveryTax) > 0n && <div className="text-xs text-muted-foreground">= {formatPaisa(chargesTotal(r.deliveryFee, r.deliveryTax))}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{missingCost(r) ? <Badge variant="outline">No cost price</Badge> : formatPaisa(r.goods)}</td>
                <td className={cn('px-3 py-2 text-right font-medium tabular-nums', BigInt(r.profit) < 0n && 'text-brand-coral')}>{formatPaisa(r.profit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{marginText(r.profit, r.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/40 font-medium">
            <tr>
              <th scope="row" colSpan={2} className="px-3 py-2 text-left">
                Total · {t.orders.toLocaleString('en-PK')} orders
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(t.payment)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{chargesText(t.deliveryFee, t.deliveryTax)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(t.goods)}</td>
              <td className={cn('px-3 py-2 text-right tabular-nums', BigInt(t.profit) < 0n && 'text-brand-coral')}>{formatPaisa(t.profit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{marginText(t.profit, t.revenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Payment is what PostEx paid for the order: its cash on delivery less the delivery fee and that fee&apos;s tax, which PostEx keeps. Profit is from the books: the sale (less sales tax) less the cost of the goods, PostEx&apos;s charges with
        their tax, and any marketing or write-off.
        {uncosted > 0 && ` ${uncosted === 1 ? '1 order has' : `${uncosted} orders have`} no cost price on file, so ${uncosted === 1 ? 'its' : 'their'} profit counts the goods as free and reads high.`}
      </p>
    </>
  );
}

/** A period with no payment: PostEx pays in batches days apart, so say when it last paid and offer the shortest period that shows it. */
export function NoPayments({ data, label, onChoose }: { data: PaymentsData; label: string; onChoose: (key: PaymentWindow) => void }) {
  const reach = data.lastPaidAt ? windowReaching(data.lastPaidAt, data.until) : null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <Wallet className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">No PostEx payments in the {label.toLowerCase()}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        PostEx pays delivered parcels out in batches, each under a payment receipt (CPR).{' '}
        {data.lastPaidAt ? `The last batch was paid on ${formatKarachiTime(data.lastPaidAt)}.` : 'It has not paid anything out yet.'}
      </p>
      {reach && reach.key !== data.window && (
        <Button size="sm" variant="outline" onClick={() => onChoose(reach.key)}>
          Show the {reach.label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

/**
 * What PostEx paid in the last day, week, two weeks or month, order by order: the payment, the
 * delivery fee and tax PostEx kept before paying, what the goods cost and what each order made.
 * The period is in the address, so a view can be shared; the brand is the sidebar's.
 */
export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const chosen = params.get('window');
  const span: PaymentWindow = isPaymentWindow(chosen) ? chosen : DEFAULT_WINDOW;
  const { brand } = useBrand();
  const { data, error, loading, reload } = useApi<PaymentsData>(`/api/v1/reports/payments?window=${span}${brand ? `&store=${brand}` : ''}`);
  const label = PAYMENT_WINDOWS.find((w) => w.key === span)!.label;
  const choose = (key: PaymentWindow) =>
    setParams((p) => {
      if (key === DEFAULT_WINDOW) p.delete('window');
      else p.set('window', key);
      return p;
    });

  const exportCsv = () => {
    if (!data) return;
    downloadText(`payments-${span}.csv`, toCsv(PAYMENT_CSV_HEADER, data.rows.map(paymentCsvRow)));
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          What PostEx paid {brand ? `for ${brandLabel(brand)}` : 'across both brands'}, what it kept for delivery and tax, and what each order made.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Period" className={selectClass} value={span} onChange={(e) => isPaymentWindow(e.target.value) && choose(e.target.value)}>
              {PAYMENT_WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
            {data && (
              <span className="text-sm text-muted-foreground">
                Paid {formatKarachiTime(data.since)} – {formatKarachiTime(data.until)}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" disabled={!data || data.rows.length === 0} onClick={exportCsv}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !data && <TableSkeleton rows={5} label="Loading payments" columns={COLUMNS} />}
          {error && !data && (
            <p role="alert" className="text-sm text-brand-coral">
              Could not load the payments: {error}{' '}
              <Button size="sm" variant="outline" onClick={reload}>
                Try again
              </Button>
            </p>
          )}
          {data && data.rows.length === 0 && <NoPayments data={data} label={label} onChoose={choose} />}
          {data && data.rows.length > 0 && (
            <>
              <PaymentsSummary data={data} />
              <PaymentsTable data={data} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
