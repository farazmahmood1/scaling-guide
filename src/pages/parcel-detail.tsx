import { useMemo } from 'react';
import { ArrowLeft, PackageCheck, PackageX } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { Fact } from '@/components/fact';
import { ParcelTimeline } from '@/components/parcel-timeline';
import { FactsSkeleton, Line, Loading, SmallLine } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useCheckIn } from '@/hooks/use-check-in';
import type { ParcelDetail } from '@/lib/api';
import { withPending } from '@/lib/check-in';
import { describeItem, formatKarachiFull, formatPaisa, kindLabel } from '@/lib/format';
import { stageText, storeLabel } from '@/lib/parcels';
import { describeStatus, stageTone, timelineEntries } from '@/lib/postex';

const CHARGE_LABELS: Record<string, string> = {
  forward: 'Delivery charge',
  forward_tax: 'Tax on delivery',
  reversal: 'Return charge',
  reversal_tax: 'Tax on return',
};
const chargeLabel = (kind: string): string => CHARGE_LABELS[kind] ?? kind.replaceAll('_', ' ');

/** Integer paisa summed on BigInt: money never goes through a float. */
const sumPaisa = (amounts: readonly string[]): string =>
  amounts.reduce((total, a) => (/^-?\d+$/.test(a) ? total + BigInt(a) : total), 0n).toString();

/** The page while the parcel loads: its heading, the history on the left, the order, charges and payout cards on the right. */
function ParcelSkeleton() {
  const card = (title: string, description: string, rows: number) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FactsSkeleton rows={rows} />
      </CardContent>
    </Card>
  );
  return (
    <Loading label="Loading the parcel">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <div className="basis-full">
          <Line className="w-96" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>PostEx history</CardTitle>
            <CardDescription>Every status PostEx has reported, in Karachi time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Line className={['w-48', 'w-64', 'w-40', 'w-56'][i % 4]} />
                  <SmallLine className="w-36" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-6">
          {card('Shopify order', 'The order this parcel carries.', 7)}
          {card('Charges', 'What PostEx charged for carrying this parcel.', 3)}
          {card('Payout', 'The PostEx payment that included this parcel.', 1)}
        </div>
      </div>
    </Loading>
  );
}

/**
 * One parcel: its PostEx history beside the Shopify order it carries, what PostEx charged, the
 * payout that paid it out, and (for a returned parcel) the warehouse check-in.
 */
export function ParcelDetailPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<{ parcel: ParcelDetail }>(`/api/v1/parcels/${encodeURIComponent(id)}`);
  const { pending, checkIn } = useCheckIn(reload);
  const parcel = data?.parcel;
  const entries = useMemo(() => (parcel ? timelineEntries(parcel.events) : []), [parcel]);

  const back = (
    <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
      <Link to="/parcels">
        <ArrowLeft className="size-4" />
        All parcels
      </Link>
    </Button>
  );

  if (error && !parcel) {
    return (
      <>
        {back}
        <p role="alert" className="text-sm text-brand-coral">
          Could not load this parcel: {error}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
          Try again
        </Button>
      </>
    );
  }
  if (!parcel) {
    return (
      <>
        {back}
        <ParcelSkeleton />
      </>
    );
  }

  const shown = withPending([{ id: parcel.id, checkedIn: parcel.checkIn?.outcome ?? null }], pending)[0]!.checkedIn;
  const status = describeStatus(parcel.statusCode, parcel.statusMessage);
  const charged = sumPaisa(parcel.charges.map((c) => c.amountPaisa));
  const paidOut = sumPaisa(parcel.payouts.map((p) => p.amountPaisa));
  const busy = pending.inFlight.includes(parcel.id);

  return (
    <>
      {back}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{parcel.trackingNumber}</h1>
        <Badge variant={stageTone(parcel.stage)}>{stageText(parcel.stage)}</Badge>
        {parcel.pr && <Badge variant="outline">PR</Badge>}
        {parcel.codPaisa === '0' && <Badge variant="outline">Zero COD</Badge>}
        <p className="basis-full text-sm text-muted-foreground">
          {status.label}
          {status.reason ? `: ${status.reason}` : ''} · {storeLabel(parcel.store)} · last synced {formatKarachiFull(parcel.lastSyncedAt)}
        </p>
      </div>

      {parcel.openItems.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-brand-coral/40 bg-brand-coral/5 p-4 text-sm">
          <p className="font-medium">Open on the reconciliation queue</p>
          <ul className="mt-1 list-disc pl-5">
            {parcel.openItems.map((item) => (
              <li key={item.id}>
                {kindLabel(item.kind)}: {describeItem(item)}
              </li>
            ))}
          </ul>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to="/reconciliation">Open the queue</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>PostEx history</CardTitle>
            <CardDescription>Every status PostEx has reported, in Karachi time.</CardDescription>
          </CardHeader>
          <CardContent>
            <ParcelTimeline entries={entries} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shopify order</CardTitle>
              <CardDescription>{parcel.order ? `Linked by ${parcel.matchMethod?.replaceAll('_', ' ') ?? 'a person'}` : 'No order is linked to this parcel.'}</CardDescription>
            </CardHeader>
            <CardContent>
              {parcel.order ? (
                <>
                  <dl className="divide-y">
                    <Fact label="Order">{parcel.order.number}</Fact>
                    <Fact label="Store">{storeLabel(parcel.order.store)}</Fact>
                    <Fact label="Placed">{formatKarachiFull(parcel.order.placedAt)}</Fact>
                    <Fact label="Customer">{parcel.order.customerName ?? '—'}</Fact>
                    <Fact label="City">{parcel.order.city ?? parcel.city ?? '—'}</Fact>
                    <Fact label="Order total">{formatPaisa(parcel.order.totalPaisa)}</Fact>
                    <Fact label="PostEx collects">
                      <span className={parcel.codPaisa !== null && parcel.codPaisa !== parcel.order.totalPaisa ? 'font-medium text-brand-coral' : undefined}>{formatPaisa(parcel.codPaisa)}</span>
                    </Fact>
                  </dl>
                  {parcel.order.lines.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                      {parcel.order.lines.map((line, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span>
                            {line.qty} × {line.title}
                          </span>
                          <span className="tabular-nums">{formatPaisa(line.totalPaisa)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Reference on the label: {parcel.orderRef ? <span className="font-mono">{parcel.orderRef}</span> : 'none'}. Link it from the reconciliation queue.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
              <CardDescription>What PostEx charged for carrying this parcel.</CardDescription>
            </CardHeader>
            <CardContent>
              {parcel.charges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No charges recorded yet.</p>
              ) : (
                <dl className="divide-y">
                  {parcel.charges.map((c) => (
                    <Fact key={c.kind} label={chargeLabel(c.kind)}>
                      <span className="tabular-nums">{formatPaisa(c.amountPaisa)}</span>
                    </Fact>
                  ))}
                  <Fact label="Total">
                    <span className="font-medium tabular-nums">{formatPaisa(charged)}</span>
                  </Fact>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payout</CardTitle>
              <CardDescription>The PostEx payment that included this parcel.</CardDescription>
            </CardHeader>
            <CardContent>
              {parcel.payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{parcel.stage === 'delivered' ? 'Delivered, but not paid out yet.' : 'Nothing to pay out yet.'}</p>
              ) : (
                <dl className="divide-y">
                  {parcel.payouts.map((p) => (
                    <Fact key={p.cprNumber} label={`Receipt ${p.cprNumber}${p.paidAt ? ` · ${formatKarachiFull(p.paidAt)}` : ''}`}>
                      <span className="tabular-nums">{formatPaisa(p.amountPaisa)}</span>
                    </Fact>
                  ))}
                  {parcel.payouts.length > 1 && (
                    <Fact label="Total paid out">
                      <span className="font-medium tabular-nums">{formatPaisa(paidOut)}</span>
                    </Fact>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>

          {parcel.stage === 'returned' && (
            <Card>
              <CardHeader>
                <CardTitle>Warehouse check-in</CardTitle>
                <CardDescription>PostEx says this parcel is back. Until it is checked in, its stock is not on the shelf.</CardDescription>
              </CardHeader>
              <CardContent>
                {shown ? (
                  <p className="text-sm">
                    <Badge variant={shown === 'damaged' ? 'destructive' : 'secondary'}>{shown === 'damaged' ? 'Damaged' : 'Restocked'}</Badge>
                    {parcel.checkIn && (
                      <span className="ml-2 text-muted-foreground">
                        by {parcel.checkIn.by}, {formatKarachiFull(parcel.checkIn.at)}
                        {parcel.checkIn.note ? ` · ${parcel.checkIn.note}` : ''}
                      </span>
                    )}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => void checkIn(parcel.id, parcel.trackingNumber, 'restocked')}>
                      <PackageCheck className="size-4" />
                      Restock
                    </Button>
                    <Button variant="destructive" disabled={busy} onClick={() => void checkIn(parcel.id, parcel.trackingNumber, 'damaged')}>
                      <PackageX className="size-4" />
                      Damaged
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
