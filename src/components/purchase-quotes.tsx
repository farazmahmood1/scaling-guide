import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { VariantPicker } from '@/components/variant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type QuoteComparison, type StoreKey, type Vendor, type VariantHit, apiPost } from '@/lib/api';
import { formatPaisa, parseRupees } from '@/lib/format';
import { paisaDigits, today, wholeUnits } from '@/lib/purchasing';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const dateClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function AddVendor({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', city: '', leadTimeDays: '', paymentTermsDays: '' });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const lead = wholeUnits(form.leadTimeDays);
  const terms = wholeUnits(form.paymentTermsDays);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/purchasing/vendors', {
        name: form.name.trim(),
        ...(form.contactName.trim() ? { contactName: form.contactName.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
        ...(form.leadTimeDays.trim() ? { leadTimeDays: lead } : {}),
        ...(form.paymentTermsDays.trim() ? { paymentTermsDays: terms } : {}),
      });
      toast.success(`${form.name.trim()} added`);
      setForm({ name: '', contactName: '', phone: '', city: '', leadTimeDays: '', paymentTermsDays: '' });
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add the vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.name.trim() && lead !== null && terms !== null && !saving) void save();
      }}
    >
      <Input aria-label="Vendor name" placeholder="Name (required)" value={form.name} onChange={set('name')} className="sm:col-span-2" />
      <Input aria-label="Contact" placeholder="Contact" value={form.contactName} onChange={set('contactName')} />
      <Input aria-label="Phone" placeholder="Phone" value={form.phone} onChange={set('phone')} />
      <Input aria-label="City" placeholder="City" value={form.city} onChange={set('city')} />
      <Input aria-label="Lead time in days" placeholder="Lead time (days)" inputMode="numeric" value={form.leadTimeDays} aria-invalid={lead === null} onChange={set('leadTimeDays')} />
      <Input aria-label="Payment terms in days" placeholder="Pay within (days)" inputMode="numeric" value={form.paymentTermsDays} aria-invalid={terms === null} onChange={set('paymentTermsDays')} className="sm:col-span-2" />
      <Button type="submit" disabled={!form.name.trim() || lead === null || terms === null || saving} className="sm:col-span-2">
        <Plus className="size-4" />
        Add vendor
      </Button>
    </form>
  );
}

interface QuoteLine {
  variant: Pick<VariantHit, 'id' | 'product' | 'variant' | 'sku'>;
  qty: string;
  price: string;
}

/** A vendor's quotation: a price per product, as the vendor sent it. Prices are typed in rupees. */
function RecordQuotation({ vendors, onDone }: { vendors: Vendor[]; onDone: () => void }) {
  const [vendorId, setVendorId] = useState('');
  const [receivedOn, setReceivedOn] = useState(today());
  const [validUntil, setValidUntil] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [saving, setSaving] = useState(false);
  const active = vendors.filter((v) => v.isActive);
  const chosen = vendorId || active[0]?.id || '';
  const parsed = lines.map((l) => ({ qty: wholeUnits(l.qty), paisa: paisaDigits(parseRupees(l.price)) }));
  const valid = chosen && receivedOn && lines.length > 0 && parsed.every((p) => p.qty !== null && p.qty > 0 && p.paisa !== null);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/purchasing/quotations', {
        vendorId: chosen,
        receivedOn,
        ...(validUntil ? { validUntil } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: lines.map((l, i) => ({ variantId: l.variant.id, qty: parsed[i]!.qty, unitPricePaisa: parsed[i]!.paisa })),
      });
      toast.success('Quotation recorded');
      setLines([]);
      setReference('');
      setValidUntil('');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the quotation');
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
        <label className="flex items-center gap-1.5 text-sm">
          Received
          <input type="date" className={dateClass} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Valid until
          <input type="date" className={dateClass} value={validUntil} min={receivedOn} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <Input className="w-44" placeholder="Vendor's reference" aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <VariantPicker onPick={(v) => setLines((cur) => (cur.some((l) => l.variant.id === v.id) ? cur : [...cur, { variant: v, qty: '', price: '' }]))} />
      {lines.map((l, i) => (
        <div key={l.variant.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {l.variant.product} · {l.variant.variant}
          </span>
          <Input className="w-24" inputMode="numeric" placeholder="Units" aria-label={`Units of ${l.variant.product}`} value={l.qty} aria-invalid={parsed[i]!.qty === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <Input className="w-32" inputMode="decimal" placeholder="Rs each" aria-label={`Unit price of ${l.variant.product}`} value={l.price} aria-invalid={l.price !== '' && parsed[i]!.paisa === null} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button onClick={save} disabled={!valid || saving}>
        <Plus className="size-4" />
        Record quotation
      </Button>
    </div>
  );
}

/** The quotes for one product, cheapest first; ordering from one takes the whole quotation. */
function QuoteTable({ variantId, onOrdered }: { variantId: string; onOrdered: (poId: string) => void }) {
  const [store, setStore] = useState<StoreKey>('nur');
  const [busy, setBusy] = useState<string>();
  const quotes = useApi<{ quotes: QuoteComparison[] }>(`/api/v1/purchasing/quotations/compare/${variantId}`);
  const list = quotes.data?.quotes ?? [];

  const order = async (q: QuoteComparison) => {
    setBusy(q.quotationLineId);
    try {
      const po = await apiPost<{ id: string; number: string }>('/api/v1/purchasing/orders', { vendorId: q.vendorId, store, quotationId: q.quotationId, orderedOn: today() });
      toast.success(`${po.number} ordered from ${q.vendor}`);
      onOrdered(po.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not place the order');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        Order into
        <select className={selectClass} value={store} onChange={(e) => setStore(e.target.value as StoreKey)} aria-label="Store">
          <option value="nur">NUR by Juggun</option>
          <option value="organics">Juggun's Organics</option>
        </select>
      </label>
      {quotes.loading && !quotes.data && <TableSkeleton variant="plain" rows={3} label="Loading the quotes" columns={['Vendor', num('Unit price'), num('Units'), 'Received', { as: 'button', align: 'right' }]} />}
      {quotes.error && !quotes.data && <p className="text-sm text-brand-coral">Could not load quotes: {quotes.error}</p>}
      {quotes.data && list.length === 0 && <p className="text-sm text-muted-foreground">No quotes for this product yet.</p>}
      {list.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Quotes, cheapest first</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Vendor</th>
              <th className="py-1.5 text-right font-medium">Unit price</th>
              <th className="py-1.5 text-right font-medium">Units</th>
              <th className="py-1.5 font-medium">Received</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {list.map((q, i) => (
              <tr key={q.quotationLineId} className="border-t">
                <td className="py-2">
                  {q.vendor}
                  {i === 0 && !q.expired && <Badge className="ml-2">Cheapest</Badge>}
                  {q.expired && <Badge variant="outline" className="ml-2">Expired {q.validUntil}</Badge>}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{formatPaisa(q.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{q.qty}</td>
                <td className="py-2">{q.receivedOn}</td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="outline" disabled={busy === q.quotationLineId || q.expired} onClick={() => void order(q)}>
                    Order this quotation
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Compare({ onOrdered }: { onOrdered: (poId: string) => void }) {
  const [variant, setVariant] = useState<VariantHit>();
  return (
    <div className="space-y-3">
      {variant ? (
        <p className="text-sm">
          Quotes for {variant.product} · {variant.variant}{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setVariant(undefined)}>
            change
          </Button>
        </p>
      ) : (
        <VariantPicker onPick={setVariant} placeholder="Compare quotes for a product" />
      )}
      {variant && <QuoteTable key={variant.id} variantId={variant.id} onOrdered={onOrdered} />}
    </div>
  );
}

/** Step 2: vendors say what it costs. Record their quotations, compare, and order from the one you pick. */
export function QuotesStep({ onOrdered }: { onOrdered: (poId: string) => void }) {
  const vendors = useApi<{ vendors: Vendor[] }>('/api/v1/purchasing/vendors');
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Compare quotes</CardTitle>
          <CardDescription>Cheapest first. A quote past its date is marked and cannot be ordered.</CardDescription>
        </CardHeader>
        <CardContent>
          <Compare onOrdered={onOrdered} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
          <CardDescription>{vendors.data ? `${vendors.data.vendors.length} on file` : 'Who we buy from'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {vendors.data && (
            <ul className="divide-y text-sm">
              {vendors.data.vendors.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span>
                    {v.name}
                    {!v.isActive && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{BigInt(v.payable) > 0n ? `we owe ${formatPaisa(v.payable)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <AddVendor onDone={vendors.reload} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Record a quotation</CardTitle>
          <CardDescription>A vendor's price for each product, as they sent it.</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordQuotation vendors={vendors.data?.vendors ?? []} onDone={() => undefined} />
        </CardContent>
      </Card>
    </div>
  );
}
