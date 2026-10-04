import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { PartnerDetail } from '@/components/partner-detail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import { type Partner, apiPost } from '@/lib/api';
import { formatPaisa } from '@/lib/format';
import { cn } from '@/lib/utils';

function AddPartner({ onAdded }: { onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', city: '', terms: '' });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const phoneOk = form.phone.trim() === '' || /^\+92[0-9]{9,10}$/.test(form.phone.trim());

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''));
      const { id } = await apiPost<{ id: string }>('/api/v1/consignment/partners', body);
      toast.success(`${form.name.trim()} added`);
      setForm({ name: '', contact: '', phone: '', city: '', terms: '' });
      onAdded(id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add the partner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.name.trim() && phoneOk && !saving) void save();
      }}
    >
      <Input aria-label="Partner name" placeholder="Name (required)" value={form.name} onChange={set('name')} className="sm:col-span-2" />
      <Input aria-label="Contact person" placeholder="Contact person" value={form.contact} onChange={set('contact')} />
      <Input aria-label="Phone" placeholder="Phone as +92…" value={form.phone} aria-invalid={!phoneOk} onChange={set('phone')} />
      <Input aria-label="City" placeholder="City" value={form.city} onChange={set('city')} />
      <Input aria-label="Terms" placeholder="Terms (e.g. 30 days, 20% margin)" value={form.terms} onChange={set('terms')} />
      <Button type="submit" disabled={!form.name.trim() || !phoneOk || saving} className="sm:col-span-2">
        <Plus className="size-4" />
        Add partner
      </Button>
    </form>
  );
}

/**
 * Retail partners holding our stock on consignment: what each holds and owes, moving goods to and
 * from them, and importing their sales sheets. The selected partner is in the address, so the view
 * can be shared.
 */
export function PartnersPage() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi<{ partners: Partner[] }>('/api/v1/consignment/partners');
  const selectedId = params.get('partner');
  const partners = data?.partners ?? [];
  const selected = partners.find((p) => p.id === selectedId);

  const select = (id: string | null) =>
    setParams((p) => {
      if (id) p.set('partner', id);
      else p.delete('partner');
      return p;
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
          <p className="text-sm text-muted-foreground">Retail partners holding our stock on consignment, and what they owe.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{data ? `${partners.length} partner${partners.length === 1 ? '' : 's'}` : 'Partners'}</CardTitle>
            <CardDescription>Choose one to see its holdings, move stock and import its sales sheet.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !data && <TableSkeleton rows={4} label="Loading the partners" columns={['Partner', 'City', num('Units held'), num('Owes us')]} />}
            {error && !data && <p className="text-sm text-brand-coral">Could not load partners: {error}</p>}
            {data && partners.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No partners yet. Add the first one.</p>}
            {partners.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Retail partners</caption>
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Partner</th>
                      <th scope="col" className="px-3 py-2 font-medium">City</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Units held</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Owes us</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((p) => (
                      <tr key={p.id} className={cn('border-t', selectedId === p.id && 'bg-muted/50')}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          <Button variant="link" className="h-auto p-0" aria-pressed={selectedId === p.id} onClick={() => select(selectedId === p.id ? null : p.id)}>
                            {p.name}
                          </Button>
                          {!p.isActive && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                        </th>
                        <td className="px-3 py-2">{p.city ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.units}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(p.receivable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a partner</CardTitle>
            <CardDescription>Each partner gets a stock location of its own.</CardDescription>
          </CardHeader>
          <CardContent>
            <AddPartner
              onAdded={(id) => {
                reload();
                select(id);
              }}
            />
          </CardContent>
        </Card>
      </div>

      {selectedId && data && !selected && <p className="mt-6 text-sm text-muted-foreground">That partner was not found.</p>}
      {selected && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">{selected.name}</h2>
          <PartnerDetail key={selected.id} partner={selected} onChanged={reload} />
        </div>
      )}
    </>
  );
}
