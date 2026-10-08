import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { BillsList } from '@/components/purchase-bills';
import { NewOrder, OrderDetail, OrdersList } from '@/components/purchase-orders';
import { QuotesStep } from '@/components/purchase-quotes';
import { RequestsStep } from '@/components/purchase-requests';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import type { PurchaseOrderSummary, PurchaseRequest, Vendor, VendorBill } from '@/lib/api';
import { STEPS, type StepKey } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const isStep = (v: string | null): v is StepKey => STEPS.some((s) => s.key === v);

/** What each step is waiting on right now, in a few words, from the documents themselves. */
const waitingAt = (requests: PurchaseRequest[], orders: PurchaseOrderSummary[], bills: VendorBill[]): Record<StepKey, string> => {
  const open = requests.filter((r) => r.status === 'open').length;
  const quoted = requests.filter((r) => r.status === 'quoted').length;
  const toCome = orders.filter((o) => o.status === 'ordered' || o.status === 'partially_received').length;
  const toBill = orders.filter((o) => o.status === 'received' || (o.status === 'partially_received' && o.received > o.billed)).length;
  const toPay = bills.filter((b) => BigInt(b.outstanding) > 0n).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return {
    requests: open + quoted === 0 ? 'Nothing waiting' : plural(open + quoted, 'request to order', 'requests to order'),
    quotes: quoted === 0 ? 'Optional' : plural(quoted, 'quoted request', 'quoted requests'),
    orders: toCome === 0 ? 'No open orders' : plural(toCome, 'order waiting for goods', 'orders waiting for goods'),
    receive: toCome === 0 ? 'Nothing to receive' : plural(toCome, 'order to receive', 'orders to receive'),
    bills: toBill + toPay === 0 ? 'Nothing to bill or pay' : [toBill && plural(toBill, 'to bill', 'to bill'), toPay && plural(toPay, 'to pay', 'to pay')].filter(Boolean).join(' · '),
  };
};

const GUIDE: Record<StepKey, string> = {
  requests: 'Write down what needs buying, or take a suggestion from "What to order now". Then tick the requests for one supplier and create the order.',
  quotes: 'Optional. Use it when you ask several suppliers for prices and want to compare. If the supplier just sends a price on WhatsApp, skip this and put the price on the order.',
  orders: 'The orders you have placed with suppliers. An order says what you bought, from whom, at what price. Open one to see its next step.',
  receive: 'When the goods arrive, open the order and enter how many came. This is what puts them on the shelf (Inventory) at the order price, so profit uses the right cost.',
  bills: 'When the supplier sends the bill, record it against the order: it must match what was ordered and received. Then record the payment when you pay.',
};

/** The five steps in plain words, open the first time. */
function HowBuyingWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">How buying works here</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>
      {open && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Request:</span> someone writes what is needed (or presses Request on a suggestion).
          </li>
          <li>
            <span className="font-medium text-foreground">Quote (optional):</span> record suppliers' prices to compare them.
          </li>
          <li>
            <span className="font-medium text-foreground">Order:</span> tick the requests, choose the supplier, type the agreed price, place the order. You still send the order to
            the supplier on WhatsApp as today; this keeps the record.
          </li>
          <li>
            <span className="font-medium text-foreground">Receive:</span> when the goods arrive, enter how many came. Stock goes up and the product's cost is saved.
          </li>
          <li>
            <span className="font-medium text-foreground">Bill and pay:</span> record the supplier's bill, then the payment. What you owe each supplier is always shown.
          </li>
        </ol>
      )}
    </div>
  );
}

/**
 * Buying, in its five steps: a request says what is needed, quotes say what it costs (optional),
 * an order commits to one supplier, receiving brings the goods into stock at their cost, and the
 * supplier's bill is paid. The step and the open order are in the address, so a place in the flow
 * can be shared. Each order says what it is waiting for and offers that step.
 */
export function PurchasePage() {
  const [params, setParams] = useSearchParams();
  const step: StepKey = isStep(params.get('step')) ? (params.get('step') as StepKey) : 'requests';
  const poId = params.get('po');
  // Bumped when something changes, so the lists beside an open order read again.
  const [changes, setChanges] = useState(0);
  const changed = () => setChanges((n) => n + 1);
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
  const current = STEPS.find((s) => s.key === step)!;

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase</h1>
        <p className="text-sm text-muted-foreground">Buying stock from suppliers, from a request to a paid bill. Goods only count as stock when they are received.</p>
      </div>

      <HowBuyingWorks />

      <nav aria-label="Purchase steps" className="mb-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                aria-current={step === s.key ? 'step' : undefined}
                onClick={() => go(s.key)}
                title={s.hint}
                className={cn(
                  'flex h-full w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  step === s.key && 'border-primary bg-secondary',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums', step === s.key && 'bg-primary text-primary-foreground')}>{i + 1}</span>
                  {s.label}
                  {s.key === 'quotes' && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
                </span>
                <span className="text-xs text-muted-foreground">{waiting ? waiting[s.key] : ' '}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <p className="mb-6 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">
        <span className="font-medium">{current.label}: </span>
        {GUIDE[step]}
      </p>

      {step === 'requests' && <RequestsStep onOrdered={(po) => { changed(); go('orders', po); }} />}
      {step === 'quotes' && <QuotesStep onOrdered={(po) => { changed(); go('orders', po); }} />}

      {step === 'orders' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>Choose one to see what has arrived and been billed against it, and what to do next.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList selected={poId} onSelect={pick} reloadKey={changes} empty="No orders yet. Create one from requests in step 1, or with New order." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New order</CardTitle>
              <CardDescription>Without a request: pick the supplier, the brand and the products.</CardDescription>
            </CardHeader>
            <CardContent>
              <NewOrder
                vendors={vendors.data?.vendors ?? []}
                onDone={(id) => {
                  changed();
                  pick(id);
                }}
              />
            </CardContent>
          </Card>
          {poId && (
            <div className="lg:col-span-3">
              <OrderDetail key={poId} poId={poId} focus="order" onChanged={changed} onNext={onNext} />
            </div>
          )}
        </div>
      )}

      {step === 'receive' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Goods to receive</CardTitle>
              <CardDescription>Orders with units still to come. Choose the one that arrived.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList statuses={['ordered', 'partially_received']} selected={poId} onSelect={pick} reloadKey={changes} empty="Nothing to receive: every order has arrived, or none has been placed yet." />
            </CardContent>
          </Card>
          {poId && <OrderDetail key={poId} poId={poId} focus="receive" onChanged={changed} onNext={onNext} />}
        </div>
      )}

      {step === 'bills' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Waiting for a bill</CardTitle>
                <CardDescription>Orders received and not fully billed. Choose one to record the supplier's bill.</CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersList statuses={['partially_received', 'received']} selected={poId} onSelect={pick} reloadKey={changes} empty="Nothing waiting for a bill: goods must be received first." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bills and payments</CardTitle>
                <CardDescription>Oldest due first. Record a payment against a bill when you pay the supplier.</CardDescription>
              </CardHeader>
              <CardContent>
                <BillsList reloadKey={changes} onChanged={changed} onOpenOrder={(id) => go('bills', id)} />
              </CardContent>
            </Card>
          </div>
          {poId && <OrderDetail key={poId} poId={poId} focus="bill" onChanged={changed} onNext={onNext} />}
        </div>
      )}
    </>
  );
}
