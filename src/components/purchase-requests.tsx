import { useState } from 'react';
import { ArrowRight, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { AddVendor } from '@/components/purchase-quotes';
import { VariantPicker } from '@/components/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListSkeleton, TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type PurchaseRequest, type ReorderSuggestion, type StoreKey, type Vendor, type VariantHit, apiPost } from '@/lib/api';
import { formatKarachiTime, formatPaisa, paisaToInput, parseRupees } from '@/lib/format';
import { paisaDigits, today, wholeUnits } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const dateClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const storeName = (s: StoreKey) => (s === 'nur' ? 'NUR by Juggun' : "Juggun's Organics");

const STATUS: Record<PurchaseRequest['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Waiting for an order', variant: 'outline' },
  quoted: { label: 'Quoted', variant: 'secondary' },
  ordered: { label: 'Ordered', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

function NewRequest({ onDone }: { onDone: () => void }) {
  const [variant, setVariant] = useState<VariantHit>();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const units = wholeUnits(qty);
  const valid = variant && units !== null && units > 0;

  const save = async () => {
    if (!variant || !units) return;
    setSaving(true);
    try {
      await apiPost('/api/v1/purchasing/requests', { variantId: variant.id, qty: units, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast.success('Request recorded. Next: tick it and create the order.');
      setVariant(undefined);
      setQty('');
      setReason('');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {variant ? (
        <p className="text-sm">
          {variant.product} · {variant.variant} <span className="font-mono text-xs text-muted-foreground">{variant.sku ?? 'no SKU'}</span>{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setVariant(undefined)}>
            change
          </Button>
        </p>
      ) : (
        <VariantPicker onPick={setVariant} />
      )}
      <div className="flex flex-wrap gap-2">
        <Input className="w-28" inputMode="numeric" placeholder="Units" aria-label="Units" value={qty} aria-invalid={units === null} onChange={(e) => setQty(e.target.value)} />
        <Input className="min-w-48 flex-1" placeholder="Why is it needed? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button onClick={save} disabled={!valid || saving}>
          <Plus className="size-4" />
          Request
        </Button>
      </div>
    </div>
  );
}

interface DraftLine {
  request: PurchaseRequest;
  qty: string;
  cost: string;
}

/**
 * The selected requests, turned into one purchase order to one supplier: how many and at what
 * price each, as agreed with the supplier (on WhatsApp or the phone). The requests close when the
 * order is placed.
 */
function CreateOrder({
  requests,
  lastCosts,
  onCancel,
  onPlaced,
}: {
  requests: PurchaseRequest[];
  lastCosts: Map<string, { vendorId: string; unitCost: string }>;
  onCancel: () => void;
  onPlaced: (poId: string) => void;
}) {
  const vendors = useApi<{ vendors: Vendor[] }>('/api/v1/purchasing/vendors');
  const active = (vendors.data?.vendors ?? []).filter((v) => v.isActive);
  const suggestedVendor = requests.map((r) => lastCosts.get(r.variantId)?.vendorId).find(Boolean);
  const [vendorId, setVendorId] = useState('');
  const chosen = vendorId || suggestedVendor || active[0]?.id || '';
  const [expectedOn, setExpectedOn] = useState('');
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    requests.map((r) => {
      const last = lastCosts.get(r.variantId);
      return { request: r, qty: String(r.qty), cost: last ? paisaToInput(last.unitCost) : '' };
    }),
  );
  const [saving, setSaving] = useState(false);
  const store = requests[0]!.store;
  const mixed = requests.some((r) => r.store !== store);
  const parsed = lines.map((l) => ({ qty: wholeUnits(l.qty), paisa: paisaDigits(parseRupees(l.cost)) }));
  const valid = chosen && !mixed && lines.length > 0 && parsed.every((p) => p.qty !== null && p.qty > 0 && p.paisa !== null);
  const total = parsed.reduce((n, p) => n + (p.qty && p.paisa ? BigInt(p.qty) * BigInt(p.paisa) : 0n), 0n);

  const place = async () => {
    setSaving(true);
    try {
      const po = await apiPost<{ id: string; number: string }>('/api/v1/purchasing/orders', {
        vendorId: chosen,
        store,
        orderedOn: today(),
        ...(expectedOn ? { expectedOn } : {}),
        lines: lines.map((l, i) => ({ variantId: l.request.variantId, qty: parsed[i]!.qty, unitCostPaisa: parsed[i]!.paisa, requestId: l.request.id })),
      });
      toast.success(`${po.number} placed. Next: when the goods arrive, receive them.`);
      onPlaced(po.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not place the order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">New purchase order for {storeName(store)}</p>
          <p className="text-sm text-muted-foreground">Fill in what you agreed with the supplier. Prices are per unit, in rupees.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {mixed && <p className="text-sm text-brand-coral">These requests are for both brands. An order is for one brand: select one brand's requests at a time.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Supplier
          <select className={cn(selectClass, 'mt-1 block')} value={chosen} onChange={(e) => setVendorId(e.target.value)}>
            {active.length === 0 && <option value="">Add a supplier first</option>}
            {active.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Expected on (optional)
          <input type="date" className={cn(dateClass, 'mt-1 block')} value={expectedOn} min={today()} onChange={(e) => setExpectedOn(e.target.value)} />
        </label>
        <Button variant="link" size="sm" onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'New supplier'}
        </Button>
      </div>
      {adding && (
        <div className="rounded-lg border bg-background p-3">
          <AddVendor
            onDone={() => {
              vendors.reload();
              setAdding(false);
            }}
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <caption className="sr-only">Order lines</caption>
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Product</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Units</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Rs per unit</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Line total</th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = parsed[i]!;
              return (
                <tr key={l.request.id} className="border-t">
                  <td className="px-3 py-2">
                    {l.request.title} <span className="font-mono text-xs text-muted-foreground">{l.request.sku ?? 'no SKU'}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input className="ml-auto h-8 w-24 text-right" inputMode="numeric" aria-label={`Units of ${l.request.title}`} value={l.qty} aria-invalid={p.qty === null || p.qty === 0} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input className="ml-auto h-8 w-28 text-right" inputMode="decimal" placeholder="Rs" aria-label={`Price of ${l.request.title}`} value={l.cost} aria-invalid={l.cost !== '' && p.paisa === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.qty && p.paisa ? formatPaisa((BigInt(p.qty) * BigInt(p.paisa)).toString()) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-3 py-2" colSpan={3}>
                Order total
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatPaisa(total.toString())}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button onClick={() => void place()} disabled={!valid || saving}>
        <ShoppingCart className="size-4" />
        Place order with {active.find((v) => v.id === chosen)?.name ?? 'the supplier'}
      </Button>
    </div>
  );
}

/**
 * Step 1: someone says what is needed, by hand or from the reorder suggestions. Tick the requests
 * to buy from one supplier and create the order; a quote first is optional.
 */
export function RequestsStep({ onOrdered }: { onOrdered: (poId: string) => void }) {
  const [all, setAll] = useState(false);
  const requests = useApi<{ requests: PurchaseRequest[] }>(`/api/v1/purchasing/requests${all ? '?all=true' : ''}`);
  const suggestions = useApi<{ suggestions: ReorderSuggestion[] }>('/api/v1/purchasing/reorder-suggestions');
  const [busy, setBusy] = useState<string>();
  const [picked, setPicked] = useState<string[]>([]);
  const [ordering, setOrdering] = useState<PurchaseRequest[] | null>(null);
  const suggested = (suggestions.data?.suggestions ?? []).filter((s) => s.suggestedQty > 0);
  const lastCosts = new Map((suggestions.data?.suggestions ?? []).flatMap((s) => (s.lastVendor ? [[s.variantId, { vendorId: s.lastVendor.id, unitCost: s.lastVendor.unitCost }] as const] : [])));
  const list = requests.data?.requests ?? [];
  const orderable = list.filter((r) => r.status === 'open' || r.status === 'quoted');
  const chosen = orderable.filter((r) => picked.includes(r.id));

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/purchasing/requests/${id}/cancel`, {});
      setPicked(picked.filter((p) => p !== id));
      requests.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not cancel');
    } finally {
      setBusy(undefined);
    }
  };

  const fromSuggestion = async (s: ReorderSuggestion) => {
    setBusy(s.variantId);
    try {
      await apiPost('/api/v1/purchasing/requests', {
        variantId: s.variantId,
        qty: s.suggestedQty,
        reason: `Reorder suggestion: ${s.delivered} delivered in ${s.windowDays} days, ${s.warehouse} on the shelf, ${s.onOrder} on order`,
      });
      toast.success(`Requested ${s.suggestedQty} of ${s.title}`);
      requests.reload();
      suggestions.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the request');
    } finally {
      setBusy(undefined);
    }
  };

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Requests</CardTitle>
            <CardDescription>What needs buying. Tick the ones to order from one supplier, then create the order.</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Include ordered and cancelled
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          {ordering && (
            <CreateOrder
              key={ordering.map((r) => r.id).join(',')}
              requests={ordering}
              lastCosts={lastCosts}
              onCancel={() => setOrdering(null)}
              onPlaced={(poId) => {
                setOrdering(null);
                setPicked([]);
                requests.reload();
                onOrdered(poId);
              }}
            />
          )}
          {!ordering && orderable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span>{chosen.length === 0 ? 'Tick requests to order them together.' : `${chosen.length} selected`}</span>
              <Button size="sm" className="ml-auto" disabled={chosen.length === 0} onClick={() => setOrdering(chosen)}>
                <ShoppingCart className="size-4" />
                Create purchase order
              </Button>
            </div>
          )}
          {requests.loading && !requests.data && <ListSkeleton rows={3} trailing="badge-button" rowClassName="py-2.5" label="Loading the requests" />}
          {requests.error && !requests.data && <p className="text-sm text-brand-coral">Could not load requests: {requests.error}</p>}
          {requests.data && list.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
              <ShoppingCart className="size-8 text-muted-foreground" />
              <p className="font-medium">Nothing waiting to be bought</p>
              <p className="max-w-sm text-sm text-muted-foreground">Add a request on the right, or press Request on a product under "What to order now".</p>
            </div>
          )}
          <ul className="divide-y">
            {list.map((r) => {
              const open = r.status === 'open' || r.status === 'quoted';
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  {open ? (
                    <input type="checkbox" className="size-4" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} disabled={ordering !== null} />
                  ) : (
                    <span className="size-4" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium tabular-nums">{r.qty} ×</span> {r.title} <span className="font-mono text-xs text-muted-foreground">{r.sku ?? 'no SKU'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {storeName(r.store)} · {r.requestedBy}, {formatKarachiTime(r.requestedAt)}
                      {r.reason ? ` · ${r.reason}` : ''}
                      {r.quotes > 0 ? ` · ${r.quotes} quote${r.quotes === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    {open && !ordering && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setOrdering([r])}>
                          Order
                          <ArrowRight className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void cancel(r.id)}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
          <CardDescription>Anyone can ask for stock. Pick the product and how many.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewRequest onDone={requests.reload} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>What to order now</CardTitle>
          <CardDescription>
            Worked out from what really reached customers in the last {suggestions.data?.suggestions[0]?.windowDays ?? 30} days, not from orders placed (a parcel still out may come
            back). "Order" is enough to cover the supplier's lead time and the cover period, less what is on the shelf and already on order. Shelf figures are only right once
            the shelf has been counted on the Inventory page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suggestions.loading && !suggestions.data && (
            <TableSkeleton
              rows={4}
              label="Loading the suggestions"
              columns={['Product', num('Sold / day'), num('On shelf'), num('On order'), num('Cover'), num('Order'), 'Last supplier', { as: 'button', align: 'right' }]}
            />
          )}
          {suggestions.data && suggested.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">Nothing needs reordering at the current sales rate.</p>}
          {suggested.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">Reorder suggestions</caption>
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Product</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Units delivered to customers per day">Sold / day</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">On shelf</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Ordered from suppliers, not arrived yet">On order</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Days the shelf and what is on order last at this rate">Cover</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Order</th>
                    <th scope="col" className="px-3 py-2 font-medium">Last supplier</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Request</span></th>
                  </tr>
                </thead>
                <tbody>
                  {suggested.map((s) => (
                    <tr key={s.variantId} className="border-t">
                      <td className="px-3 py-2">
                        {s.title} <span className="font-mono text-xs text-muted-foreground">{s.sku ?? 'no SKU'}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.dailyVelocity.toFixed(1)}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', s.warehouse < 0 && 'text-brand-coral')}>{s.warehouse}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.onOrder}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.daysOfCover === null ? '—' : `${Math.max(0, Math.round(s.daysOfCover))} d`}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{s.suggestedQty}</td>
                      <td className="px-3 py-2">{s.lastVendor ? `${s.lastVendor.name} at ${formatPaisa(s.lastVendor.unitCost)}` : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" disabled={busy === s.variantId || s.openRequests > 0} onClick={() => void fromSuggestion(s)}>
                          {s.openRequests > 0 ? 'Requested' : 'Request'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
