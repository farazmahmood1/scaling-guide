import { useState } from 'react';
import { ArrowRight, ChevronRight, ClipboardList, type LucideIcon, PackageCheck, Plus, ReceiptText, ShoppingCart } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { BillsList } from '@/components/purchase-bills';
import { NewOrder, OrderDetail, OrdersList } from '@/components/purchase-orders';
import { RequestsStep } from '@/components/purchase-requests';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import type { PurchaseOrderSummary, PurchaseRequest, Vendor, VendorBill } from '@/lib/api';
import { STEPS, type StepKey } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const isStep = (v: string | null): v is StepKey => STEPS.some((s) => s.key === v);

const ICONS: Record<StepKey, LucideIcon> = { requests: ClipboardList, orders: ShoppingCart, receive: PackageCheck, bills: ReceiptText };

/** How many things wait at each step, and the same in a few words, from the documents themselves. */
const waitingAt = (requests: PurchaseRequest[], orders: PurchaseOrderSummary[], bills: VendorBill[]): Record<StepKey, { count: number; text: string }> => {
  const toOrder = requests.filter((r) => r.status === 'open' || r.status === 'quoted').length;
  const toCome = orders.filter((o) => o.status === 'ordered' || o.status === 'partially_received').length;
  const toBill = orders.filter((o) => o.status === 'received' || (o.status === 'partially_received' && o.received > o.billed)).length;
  const toPay = bills.filter((b) => BigInt(b.outstanding) > 0n).length;
  return {
    requests: { count: toOrder, text: toOrder === 0 ? 'Nothing waiting' : `${toOrder} to order` },
    orders: { count: toCome, text: toCome === 0 ? 'No open orders' : `${toCome} waiting for goods` },
    receive: { count: toCome, text: toCome === 0 ? 'Nothing to receive' : `${toCome} to receive` },
    bills: {
      count: toBill + toPay,
      text: toBill + toPay === 0 ? 'Nothing to bill or pay' : [toBill > 0 && `${toBill} to bill`, toPay > 0 && `${toPay} to pay`].filter(Boolean).join(' · '),
    },
  };
};

/** The one thing to do on each step, in one line. */
const DO_THIS: Record<StepKey, string> = {
  requests: 'Add what you need on the right, then press Order on it.',
  orders: 'When the goods of an order arrive, press Goods arrived on it.',
  receive: 'Press Goods arrived on the order, type how many came, then Save.',
  bills: "Press Add bill when the supplier's bill comes, and Pay when you pay it.",
};

/**
 * Buying, in its four steps: a request says what is needed, an order commits to one supplier,
 * receiving brings the goods into stock at their cost, and the supplier's bill is recorded and
 * paid. The step and the open order are in the address, so a place in the flow can be shared.
 * Every order shows where it stands and has one button for its next step.
 */
export function PurchasePage() {
  const [params, setParams] = useSearchParams();
  const step: StepKey = isStep(params.get('step')) ? (params.get('step') as StepKey) : 'requests';
  const poId = params.get('po');
  // Bumped when something changes, so the counts and the lists beside an open order read again.
  const [changes, setChanges] = useState(0);
  const changed = () => setChanges((n) => n + 1);
  const [quick, setQuick] = useState(false);
  const vendors = useApi<{ vendors: Vendor[] }>('/api/v1/purchasing/vendors');
  const requests = useApi<{ requests: PurchaseRequest[] }>(`/api/v1/purchasing/requests?k=${changes}`);
  const orders = useApi<{ orders: PurchaseOrderSummary[] }>(`/api/v1/purchasing/orders?k=${changes}`);
  const bills = useApi<{ bills: VendorBill[] }>(`/api/v1/purchasing/bills?k=${changes}`);
  const waiting = requests.data && orders.data && bills.data ? waitingAt(requests.data.requests, orders.data.orders, bills.data.bills) : null;

  const go = (next: StepKey, po: string | null = null) =>
    setParams((p) => {
      p.set('step', next);
      if (po) p.set('po', po);
      else p.delete('po');
      return p;
    });
  const pick = (po: string | null) => go(step, po);
  const onNext = (next: 'receive' | 'bill', id: string) => go(next === 'receive' ? 'receive' : 'bills', id);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase</h1>
        <p className="text-sm text-muted-foreground">Buy stock from suppliers in four steps. Goods count as stock once they are received.</p>
      </div>

      <nav aria-label="Purchase steps" className="mb-3">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {STEPS.map((s, i) => {
            const Icon = ICONS[s.key];
            const active = step === s.key;
            const w = waiting?.[s.key];
            return (
              <li key={s.key} className="relative">
                <button
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  onClick={() => go(s.key)}
                  className={cn(
                    'flex h-full w-full items-center gap-3 rounded-xl border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active && 'border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/10',
                  )}
                >
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-muted', active && 'bg-primary text-primary-foreground')}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">Step {i + 1}</span>
                    <span className="block font-semibold">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                  {w && w.count > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums" title={w.text}>
                      {w.count}
                    </span>
                  )}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight aria-hidden className="absolute top-1/2 -right-3.5 z-10 hidden size-5 -translate-y-1/2 rounded-full border bg-background p-0.5 text-muted-foreground lg:block" />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <p className="mb-6 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="font-medium">What to do here: </span>
          {DO_THIS[step]}
          {waiting && <span className="text-muted-foreground"> ({waiting[step].text.toLowerCase()})</span>}
        </span>
      </p>

      {step === 'requests' && (
        <RequestsStep
          onChanged={changed}
          onOrdered={(po) => {
            changed();
            go('orders', po);
          }}
        />
      )}

      {step === 'orders' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Your orders</CardTitle>
                <CardDescription>Each order shows how far it has got. The button does its next step.</CardDescription>
              </div>
              <Button size="sm" variant={quick ? 'secondary' : 'outline'} onClick={() => setQuick(!quick)} aria-expanded={quick}>
                <Plus className="size-4" />
                Quick order
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {quick && (
                <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                  <p className="font-semibold">Quick order</p>
                  <p className="mb-3 text-sm text-muted-foreground">Order without a request: pick the supplier, the brand and the products.</p>
                  <NewOrder
                    vendors={vendors.data?.vendors ?? []}
                    onDone={(id) => {
                      setQuick(false);
                      changed();
                      pick(id);
                    }}
                  />
                </div>
              )}
              <OrdersList selected={poId} onSelect={pick} onAction={onNext} reloadKey={changes} empty="No orders yet. Make one from a request in step 1, or with Quick order." />
            </CardContent>
          </Card>
          {poId && <OrderDetail key={poId} poId={poId} focus="order" onChanged={changed} onNext={onNext} />}
        </div>
      )}

      {step === 'receive' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Goods to receive</CardTitle>
              <CardDescription>Orders with goods still to come.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList statuses={['ordered', 'partially_received']} selected={poId} onSelect={pick} onAction={onNext} reloadKey={changes} empty="Nothing to receive: every order has arrived, or none has been placed yet." />
            </CardContent>
          </Card>
          {poId && <OrderDetail key={poId} poId={poId} focus="receive" onChanged={changed} onNext={onNext} />}
        </div>
      )}

      {step === 'bills' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Waiting for a bill</CardTitle>
              <CardDescription>Goods received, the supplier's bill not entered yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList statuses={['partially_received', 'received']} selected={poId} onSelect={pick} onAction={onNext} reloadKey={changes} empty="Nothing waiting for a bill. An order shows here once its goods are received (step 3)." />
            </CardContent>
          </Card>
          {poId && <OrderDetail key={poId} poId={poId} focus="bill" onChanged={changed} onNext={onNext} />}
          <Card>
            <CardHeader>
              <CardTitle>Bills to pay</CardTitle>
              <CardDescription>What you owe each supplier, oldest due first.</CardDescription>
            </CardHeader>
            <CardContent>
              <BillsList reloadKey={changes} onChanged={changed} onOpenOrder={(id) => go('bills', id)} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
