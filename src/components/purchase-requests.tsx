import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { VariantPicker } from '@/components/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListSkeleton, TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type PurchaseRequest, type ReorderSuggestion, type VariantHit, apiPost } from '@/lib/api';
import { formatKarachiTime, formatPaisa } from '@/lib/format';
import { wholeUnits } from '@/lib/purchasing';

const STATUS: Record<PurchaseRequest['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Open', variant: 'outline' },
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
      toast.success('Request recorded');
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

/** Step 1: someone says what is needed. Suggestions from what really sold sit beside the form. */
export function RequestsStep() {
  const [all, setAll] = useState(false);
  const requests = useApi<{ requests: PurchaseRequest[] }>(`/api/v1/purchasing/requests${all ? '?all=true' : ''}`);
  const suggestions = useApi<{ suggestions: ReorderSuggestion[] }>('/api/v1/purchasing/reorder-suggestions');
  const [busy, setBusy] = useState<string>();
  const suggested = (suggestions.data?.suggestions ?? []).filter((s) => s.suggestedQty > 0);

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/purchasing/requests/${id}/cancel`, {});
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Requests</CardTitle>
            <CardDescription>What people have asked to buy. A request is closed by an order or a cancellation.</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Include closed
          </label>
        </CardHeader>
        <CardContent>
          {requests.loading && !requests.data && <ListSkeleton rows={3} trailing="badge-button" rowClassName="py-2.5" label="Loading the requests" />}
          {requests.error && !requests.data && <p className="text-sm text-brand-coral">Could not load requests: {requests.error}</p>}
          {requests.data && requests.data.requests.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No open requests.</p>}
          <ul className="divide-y">
            {(requests.data?.requests ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p>
                    <span className="font-medium tabular-nums">{r.qty} ×</span> {r.title} <span className="font-mono text-xs text-muted-foreground">{r.sku ?? 'no SKU'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.requestedBy}, {formatKarachiTime(r.requestedAt)}
                    {r.reason ? ` · ${r.reason}` : ''}
                    {r.quotes > 0 ? ` · ${r.quotes} quote${r.quotes === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                  {(r.status === 'open' || r.status === 'quoted') && (
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void cancel(r.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
        </CardHeader>
        <CardContent>
          <NewRequest onDone={requests.reload} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>What to order now</CardTitle>
          <CardDescription>From units that reached customers, not orders placed: a parcel still out may come back. Covers the lead time and the cover period, less the shelf and what is already on order.</CardDescription>
        </CardHeader>
        <CardContent>
          {suggestions.loading && !suggestions.data && (
            <TableSkeleton
              rows={4}
              label="Loading the suggestions"
              columns={['Product', num('Sold / day'), num('On shelf'), num('On order'), num('Cover'), num('Order'), 'Last vendor', { as: 'button', align: 'right' }]}
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
                    <th scope="col" className="px-3 py-2 text-right font-medium">Sold / day</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">On shelf</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">On order</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cover</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Order</th>
                    <th scope="col" className="px-3 py-2 font-medium">Last vendor</th>
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
                      <td className="px-3 py-2 text-right tabular-nums">{s.warehouse}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.onOrder}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.daysOfCover === null ? '—' : `${Math.round(s.daysOfCover)} d`}</td>
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
