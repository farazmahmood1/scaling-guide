import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { BillsList } from '@/components/purchase-bills';
import { NewOrder, OrderDetail, OrdersList } from '@/components/purchase-orders';
import { QuotesStep } from '@/components/purchase-quotes';
import { RequestsStep } from '@/components/purchase-requests';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import type { Vendor } from '@/lib/api';
import { STEPS, type StepKey } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const isStep = (v: string | null): v is StepKey => STEPS.some((s) => s.key === v);

/**
 * Buying, in its five steps: a request says what is needed, quotes say what it costs, an order
 * commits to one vendor, receiving brings the goods into stock at their cost, and the vendor's bill
 * is paid. The step and the open order are in the address, so a place in the flow can be shared.
 */
export function PurchasePage() {
  const [params, setParams] = useSearchParams();
  const step: StepKey = isStep(params.get('step')) ? (params.get('step') as StepKey) : 'requests';
  const poId = params.get('po');
  // Bumped when something changes, so the lists beside an open order read again.
  const [changes, setChanges] = useState(0);
  const changed = () => setChanges((n) => n + 1);
  const vendors = useApi<{ vendors: Vendor[] }>('/api/v1/purchasing/vendors');

  const go = (next: StepKey, po: string | null = null) =>
    setParams((p) => {
      p.set('step', next);
      if (po) p.set('po', po);
      else p.delete('po');
      return p;
    });
  const pick = (po: string | null) => go(step, po);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase</h1>
        <p className="text-sm text-muted-foreground">From a request to a paid bill. Goods only count as stock when they are received, and a bill is only accepted if it matches the order and the receipts.</p>
      </div>

      <nav aria-label="Purchase steps" className="mb-6">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                aria-current={step === s.key ? 'step' : undefined}
                onClick={() => go(s.key)}
                title={s.hint}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  step === s.key && 'border-primary bg-secondary font-medium',
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">{i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step === 'requests' && <RequestsStep />}
      {step === 'quotes' && <QuotesStep onOrdered={(po) => go('orders', po)} />}

      {step === 'orders' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>Choose one to see what has arrived and been billed against it.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList selected={poId} onSelect={pick} reloadKey={changes} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New order</CardTitle>
              <CardDescription>Without a quotation. To order from a quote, use the Quote step.</CardDescription>
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
              <OrderDetail key={poId} poId={poId} focus="order" onChanged={changed} />
            </div>
          )}
        </div>
      )}

      {step === 'receive' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Goods to receive</CardTitle>
              <CardDescription>Orders with units still to come. Receiving moves the units into the warehouse and sets their cost.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList statuses={['ordered', 'partially_received']} selected={poId} onSelect={pick} reloadKey={changes} />
            </CardContent>
          </Card>
          {poId && <OrderDetail key={poId} poId={poId} focus="receive" onChanged={changed} />}
        </div>
      )}

      {step === 'bills' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Waiting for a bill</CardTitle>
                <CardDescription>Orders received and not fully billed. Choose one to record the vendor's bill.</CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersList statuses={['partially_received', 'received']} selected={poId} onSelect={pick} reloadKey={changes} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bills and payments</CardTitle>
                <CardDescription>Oldest due first.</CardDescription>
              </CardHeader>
              <CardContent>
                <BillsList reloadKey={changes} onChanged={changed} onOpenOrder={(id) => go('bills', id)} />
              </CardContent>
            </Card>
          </div>
          {poId && <OrderDetail key={poId} poId={poId} focus="bill" onChanged={changed} />}
        </div>
      )}
    </>
  );
}
