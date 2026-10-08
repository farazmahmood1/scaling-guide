import { useState } from 'react';
import { ArrowRight, CircleCheck, PackageCheck, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { VariantPicker } from '@/components/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Line, TableSkeleton, num } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { type OrderStatus, type PurchaseOrderDetail, type PurchaseOrderSummary, type StoreKey, type Vendor, type VariantHit, apiPost } from '@/lib/api';
import { formatKarachiFull, formatPaisa, paisaToInput, parseRupees } from '@/lib/format';
import { ORDER_STATUS_TEXT, billDefaults, paisaDigits, toBill, toReceive, today, wholeUnits } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const dateClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const storeName = (s: StoreKey) => (s === 'nur' ? 'NUR by Juggun' : "Juggun's Organics");

export type NextStep = 'receive' | 'bill';

/** What an order is waiting for, in words, and the step that does it. */
const nextFor = (status: OrderStatus): { text: string; step: NextStep | null; action: string | null } => {
  switch (status) {
    case 'ordered':
      return { text: 'Waiting for the goods to arrive', step: 'receive', action: 'Goods arrived: receive them' };
    case 'partially_received':
      return { text: 'Part of the goods arrived; the rest is still to come', step: 'receive', action: 'Receive the rest' };
    case 'received':
      return { text: 'Goods received; waiting for the supplier\'s bill', step: 'bill', action: 'Record the supplier\'s bill' };
    case 'billed':
      return { text: 'Billed; waiting to be paid', step: 'bill', action: 'Record the payment' };
    case 'paid':
      return { text: 'Done: received, billed and paid', step: null, action: null };
    case 'cancelled':
      return { text: 'Cancelled', step: null, action: null };
  }
};

/** Orders, optionally only those in the given statuses (the steps that act on an order show the ones that need it). */
export function OrdersList({
  statuses,
  selected,
  onSelect,
  reloadKey,
  empty,
}: {
  statuses?: readonly OrderStatus[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  reloadKey: number;
  /** What to say when no order is at this step. */
  empty?: string;
}) {
  const { data, error, loading } = useApi<{ orders: PurchaseOrderSummary[] }>(`/api/v1/purchasing/orders?k=${reloadKey}`);
  const orders = (data?.orders ?? []).filter((o) => !statuses || statuses.includes(o.status));
  return (
    <div>
      {loading && !data && <TableSkeleton rows={4} label="Loading the orders" columns={[{ header: 'Order', sub: true }, 'Vendor', { header: 'Status', as: 'badge' }, num('Received'), num('Value')]} />}
      {error && !data && <p className="text-sm text-brand-coral">Could not load orders: {error}</p>}
      {data && orders.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{empty ?? 'Nothing here.'}</p>}
      {orders.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Purchase orders</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Order</th>
                <th scope="col" className="px-3 py-2 font-medium">Vendor</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Received</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
                <th scope="col" className="px-3 py-2 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={cn('border-t', selected === o.id && 'bg-muted/50')}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Button variant="link" className="h-auto p-0" aria-pressed={selected === o.id} onClick={() => onSelect(selected === o.id ? null : o.id)}>
                      {o.number}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {o.orderedOn} · {storeName(o.store)}
                      {o.expectedOn ? ` · due ${o.expectedOn}` : ''}
                    </div>
                  </th>
                  <td className="px-3 py-2">{o.vendor}</td>
                  <td className="px-3 py-2">
                    <Badge variant={ORDER_STATUS_TEXT[o.status].variant}>{ORDER_STATUS_TEXT[o.status].label}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {o.received} / {o.ordered}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(o.total)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{nextFor(o.status).text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface NewLine {
  variant: Pick<VariantHit, 'id' | 'product' | 'variant'>;
  qty: string;
  cost: string;
}

/** An order placed without a quotation: the vendor, the store it is for, and a price per product. */
export function NewOrder({ vendors, onDone }: { vendors: Vendor[]; onDone: (poId: string) => void }) {
  const active = vendors.filter((v) => v.isActive);
  const [vendorId, setVendorId] = useState('');
  const [store, setStore] = useState<StoreKey>('nur');
  const [expectedOn, setExpectedOn] = useState('');
  const [lines, setLines] = useState<NewLine[]>([]);
  const [saving, setSaving] = useState(false);
  const chosen = vendorId || active[0]?.id || '';
  const parsed = lines.map((l) => ({ qty: wholeUnits(l.qty), paisa: paisaDigits(parseRupees(l.cost)) }));
  const valid = chosen && lines.length > 0 && parsed.every((p) => p.qty !== null && p.qty > 0 && p.paisa !== null);

  const save = async () => {
    setSaving(true);
    try {
      const po = await apiPost<{ id: string; number: string }>('/api/v1/purchasing/orders', {
        vendorId: chosen,
        store,
        orderedOn: today(),
        ...(expectedOn ? { expectedOn } : {}),
        lines: lines.map((l, i) => ({ variantId: l.variant.id, qty: parsed[i]!.qty, unitCostPaisa: parsed[i]!.paisa })),
      });
      toast.success(`${po.number} placed`);
      setLines([]);
      onDone(po.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not place the order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={selectClass} value={chosen} onChange={(e) => setVendorId(e.target.value)} aria-label="Vendor">
          {active.length === 0 && <option value="">Add a vendor first</option>}
          {active.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select className={selectClass} value={store} onChange={(e) => setStore(e.target.value as StoreKey)} aria-label="Store">
          <option value="nur">NUR by Juggun</option>
          <option value="organics">Juggun's Organics</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          Expected
          <input type="date" className={dateClass} value={expectedOn} min={today()} onChange={(e) => setExpectedOn(e.target.value)} />
        </label>
      </div>
      <VariantPicker store={store} onPick={(v) => setLines((cur) => (cur.some((l) => l.variant.id === v.id) ? cur : [...cur, { variant: v, qty: '', cost: '' }]))} />
      {lines.map((l, i) => (
        <div key={l.variant.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {l.variant.product} · {l.variant.variant}
          </span>
          <Input className="w-24" inputMode="numeric" placeholder="Units" aria-label={`Units of ${l.variant.product}`} value={l.qty} aria-invalid={parsed[i]!.qty === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <Input className="w-32" inputMode="decimal" placeholder="Rs each" aria-label={`Unit cost of ${l.variant.product}`} value={l.cost} aria-invalid={l.cost !== '' && parsed[i]!.paisa === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button onClick={save} disabled={!valid || saving}>
        <Plus className="size-4" />
        Place order
      </Button>
    </div>
  );
}

/** Goods arrived: all or part of what is still to come. Each line starts at what is outstanding. */
function ReceiveForm({ order, onDone }: { order: PurchaseOrderDetail; onDone: () => void }) {
  const open = order.lines.filter((l) => toReceive(l) > 0);
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.id, String(toReceive(l))])));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = open.map((l) => ({ line: l, qty: wholeUnits(qtys[l.id] ?? '') }));
  const bad = parsed.some((p) => p.qty === null || p.qty > toReceive(p.line));
  const lines = parsed.filter((p) => p.qty !== null && p.qty > 0);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost(`/api/v1/purchasing/orders/${order.id}/receipts`, { ...(note.trim() ? { note: note.trim() } : {}), lines: lines.map((p) => ({ poLineId: p.line.id, qty: p.qty })) });
      toast.success(`Received ${lines.reduce((n, p) => n + p.qty!, 0)} units on ${order.number}: stock and cost updated`);
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the receipt');
    } finally {
      setSaving(false);
    }
  };

  if (open.length === 0) return <p className="text-sm text-muted-foreground">Everything on this order has arrived.</p>;
  return (
    <div className="space-y-2">
      {parsed.map(({ line, qty }) => (
        <div key={line.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{line.title}</span>
          <span className="text-xs text-muted-foreground">{toReceive(line)} to come</span>
          <Input className="w-24" inputMode="numeric" aria-label={`Received of ${line.title}`} value={qtys[line.id] ?? ''} aria-invalid={qty === null || qty > toReceive(line)} onChange={(e) => setQtys({ ...qtys, [line.id]: e.target.value })} />
        </div>
      ))}
      <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button onClick={save} disabled={saving || bad || lines.length === 0}>
        <PackageCheck className="size-4" />
        Record receipt
      </Button>
    </div>
  );
}

interface ChargeRow {
  description: string;
  amount: string;
}

/**
 * The vendor's bill. It starts from what arrived and is not billed, at the order's prices. The
 * server refuses a bill that does not match the order and the receipts, and says why; that reason
 * stays on screen beside the form so it can be acted on.
 */
function BillForm({ order, onDone }: { order: PurchaseOrderDetail; onDone: () => void }) {
  const defaults = billDefaults(order.lines);
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [dueOn, setDueOn] = useState('');
  const [tax, setTax] = useState('0');
  const [lines, setLines] = useState(() => defaults.map((d) => ({ poLineId: d.poLineId, qty: String(d.qty), price: paisaToInput(d.unitPaisa) })));
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [refusal, setRefusal] = useState<string>();
  const [saving, setSaving] = useState(false);
  const title = (id: string) => order.lines.find((l) => l.id === id)?.title ?? id;

  const parsedLines = lines.map((l) => ({ qty: wholeUnits(l.qty), paisa: paisaDigits(parseRupees(l.price)) }));
  const parsedCharges = charges.map((c) => ({ description: c.description.trim(), paisa: paisaDigits(parseRupees(c.amount)) }));
  const taxPaisa = paisaDigits(parseRupees(tax || '0'));
  const billed = lines.filter((_, i) => (parsedLines[i]!.qty ?? 0) > 0);
  const valid =
    billNumber.trim() &&
    taxPaisa !== null &&
    billed.length + charges.length > 0 &&
    parsedLines.every((p) => p.qty !== null && p.paisa !== null) &&
    parsedCharges.every((c) => c.description && c.paisa !== null);

  const save = async () => {
    setSaving(true);
    setRefusal(undefined);
    try {
      await apiPost(`/api/v1/purchasing/orders/${order.id}/bills`, {
        billNumber: billNumber.trim(),
        billDate,
        ...(dueOn ? { dueOn } : {}),
        taxPaisa,
        lines: lines.flatMap((l, i) => ((parsedLines[i]!.qty ?? 0) > 0 ? [{ poLineId: l.poLineId, qty: parsedLines[i]!.qty, unitPricePaisa: parsedLines[i]!.paisa }] : [])),
        charges: charges.map((c, i) => ({ description: c.description.trim(), amountPaisa: parsedCharges[i]!.paisa })),
      });
      toast.success(`Bill ${billNumber.trim()} recorded and posted`);
      onDone();
    } catch (cause) {
      // A refused bill is information, not a glitch: it names the line and the figures that disagree.
      setRefusal(cause instanceof Error ? cause.message : 'The bill was not recorded');
    } finally {
      setSaving(false);
    }
  };

  if (lines.length === 0 && order.lines.every((l) => toBill(l) === 0)) {
    return <p className="text-sm text-muted-foreground">Nothing received is waiting for a bill. Goods must arrive before the vendor's bill can be recorded.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="w-44" placeholder="Vendor's bill number" aria-label="Bill number" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm">
          Bill date
          <input type="date" className={dateClass} value={billDate} max={today()} onChange={(e) => setBillDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Due
          <input type="date" className={dateClass} value={dueOn} min={billDate} onChange={(e) => setDueOn(e.target.value)} />
        </label>
      </div>
      {lines.map((l, i) => (
        <div key={l.poLineId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{title(l.poLineId)}</span>
          <Input className="w-24" inputMode="numeric" aria-label={`Units billed of ${title(l.poLineId)}`} value={l.qty} aria-invalid={parsedLines[i]!.qty === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <Input className="w-32" inputMode="decimal" aria-label={`Unit price billed of ${title(l.poLineId)}`} value={l.price} aria-invalid={parsedLines[i]!.paisa === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
        </div>
      ))}
      {charges.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <Input className="min-w-40 flex-1" placeholder="Freight, packing…" aria-label="Charge description" value={c.description} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <Input className="w-32" inputMode="decimal" placeholder="Rs" aria-label="Charge amount" value={c.amount} aria-invalid={c.amount !== '' && parsedCharges[i]!.paisa === null} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove charge" onClick={() => setCharges(charges.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setCharges([...charges, { description: '', amount: '' }])}>
          <Plus className="size-4" />
          Add a charge
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Tax
          <Input className="w-28" inputMode="decimal" aria-label="Tax" value={tax} aria-invalid={taxPaisa === null} onChange={(e) => setTax(e.target.value)} />
        </label>
      </div>
      {refusal && (
        <p role="alert" className="rounded-lg border border-brand-coral/50 bg-brand-coral/5 p-3 text-sm">
          <span className="font-medium">The bill does not match the order and receipts: </span>
          {refusal}
        </p>
      )}
      <Button onClick={save} disabled={!valid || saving}>
        <ReceiptText className="size-4" />
        Record bill
      </Button>
    </div>
  );
}

/** One order, with what has arrived and been billed against each line, and the action for the step. */
export function OrderDetail({ poId, focus, onChanged, onNext }: { poId: string; focus: 'order' | 'receive' | 'bill'; onChanged: () => void; onNext?: (step: NextStep, poId: string) => void }) {
  const { data, error, reload } = useApi<{ order: PurchaseOrderDetail }>(`/api/v1/purchasing/orders/${poId}`);
  const [cancelling, setCancelling] = useState(false);
  const order = data?.order;
  const changed = () => {
    reload();
    onChanged();
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await apiPost(`/api/v1/purchasing/orders/${poId}/cancel`, {});
      toast.success('Order cancelled');
      changed();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  if (error && !order) return <p className="text-sm text-brand-coral">Could not load the order: {error}</p>;
  if (!order)
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div aria-hidden>
            <Skeleton className="h-5 w-56 max-w-full" />
            <Line className="mt-1.5 w-72" />
          </div>
          <Skeleton aria-hidden className="h-5 w-20 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-5">
          <TableSkeleton rows={3} label="Loading the order" columns={['Product', num('Ordered'), num('Received'), num('Billed'), num('Unit cost')]} />
        </CardContent>
      </Card>
    );
  const cancellable = order.status === 'ordered';
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>
            {order.number} · {order.vendor}
          </CardTitle>
          <CardDescription>
            {storeName(order.store)} · ordered {order.orderedOn}
            {order.expectedOn ? ` · expected ${order.expectedOn}` : ''} · {formatPaisa(order.total)}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={ORDER_STATUS_TEXT[order.status].variant}>{ORDER_STATUS_TEXT[order.status].label}</Badge>
          {cancellable && (
            <Button size="sm" variant="ghost" disabled={cancelling} onClick={() => void cancel()}>
              Cancel order
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {(() => {
          const next = nextFor(order.status);
          const here = next.step === focus;
          return (
            <div className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm', next.step ? 'border-primary/40 bg-primary/5' : 'bg-muted/40')}>
              {next.step ? <ArrowRight className="size-4 shrink-0 text-primary" /> : <CircleCheck className="size-4 shrink-0 text-muted-foreground" />}
              <span className="flex-1">
                <span className="font-medium">{next.text}.</span>
                {here && next.step === 'receive' && ' Enter what arrived below; it goes onto the shelf at this order\'s price.'}
                {here && next.step === 'bill' && order.status === 'received' && ' Enter the supplier\'s bill below; it must match what was ordered and received.'}
                {here && order.status === 'billed' && ' Record the payment against the bill in "Bills and payments" above.'}
              </span>
              {next.step && !here && onNext && (
                <Button size="sm" onClick={() => onNext(next.step!, order.id)}>
                  {next.action}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          );
        })()}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Lines of the order</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Product</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Ordered</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Received</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Billed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">{l.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.received}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.billed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(l.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {order.status !== 'cancelled' && focus === 'receive' && (
          <section aria-label="Receive goods">
            <h3 className="mb-2 font-semibold">Receive goods</h3>
            <ReceiveForm key={order.received} order={order} onDone={changed} />
          </section>
        )}
        {order.status !== 'cancelled' && focus === 'bill' && (
          <section aria-label="Record the vendor's bill">
            <h3 className="mb-2 font-semibold">Vendor's bill</h3>
            <BillForm key={order.billed} order={order} onDone={changed} />
          </section>
        )}

        {order.receipts.length > 0 && (
          <section aria-label="Receipts">
            <h3 className="mb-1 font-semibold">Receipts</h3>
            <ul className="text-sm text-muted-foreground">
              {order.receipts.map((r) => (
                <li key={r.id}>
                  {formatKarachiFull(r.receivedAt)} · {r.receivedBy} · {r.lines.reduce((n, l) => n + l.qty, 0)} units
                </li>
              ))}
            </ul>
          </section>
        )}
        {order.bills.length > 0 && (
          <section aria-label="Bills">
            <h3 className="mb-1 font-semibold">Bills</h3>
            <ul className="text-sm">
              {order.bills.map((b) => (
                <li key={b.id} className="py-0.5">
                  {b.billNumber} · {b.billDate} · {formatPaisa(b.total)} · paid {formatPaisa(b.paid)}
                  {!b.matches && <span className="ml-2 text-brand-coral">Does not match: {b.mismatches.join('; ')}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
