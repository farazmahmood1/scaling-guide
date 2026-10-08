import { useState } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/auth/auth-context';
import { useBrand } from '@/brand/brand-context';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { type ExpenseCategory, type ExpensePage, type ExpenseRow, type StoreKey, apiPost } from '@/lib/api';
import { formatPaisa, parseRupees } from '@/lib/format';
import { today } from '@/lib/purchasing';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

const CATEGORIES: ReadonlyArray<{ value: ExpenseCategory; label: string; hint: string }> = [
  { value: 'advertising', label: 'Advertising', hint: 'Meta, Google and TikTok ads, influencer fees paid in cash' },
  { value: 'salaries', label: 'Salaries and wages', hint: 'Staff pay, confirmation agents, packers' },
  { value: 'rent', label: 'Rent', hint: 'Office and warehouse' },
  { value: 'packaging', label: 'Packaging', hint: 'Boxes, flyers, tape, inserts' },
  { value: 'utilities', label: 'Utilities', hint: 'Electricity, internet, phone' },
  { value: 'other', label: 'Other', hint: 'Anything else the business pays for' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<ExpenseCategory, string>;

/** Records one expense. Stock bought from a supplier is not an expense: it goes through Purchase. */
function NewExpense({ onDone }: { onDone: () => void }) {
  const { brand } = useBrand();
  const [form, setForm] = useState({ spentOn: today(), category: 'advertising' as ExpenseCategory, store: (brand ?? '') as '' | StoreKey, amount: '', paidFrom: 'bank' as 'bank' | 'cash', payee: '', note: '' });
  const [saving, setSaving] = useState(false);
  const amount = parseRupees(form.amount);
  const valid = form.spentOn && amount !== null && /^\d+$/.test(amount) && amount !== '0';
  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) => setForm({ ...form, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/v1/accounting/expenses', {
        spentOn: form.spentOn,
        category: form.category,
        store: form.store || null,
        amountPaisa: amount,
        paidFrom: form.paidFrom,
        ...(form.payee.trim() ? { payee: form.payee.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      toast.success(`${CATEGORY_LABEL[form.category]} of ${formatPaisa(amount)} recorded and posted`);
      setForm({ ...form, amount: '', payee: '', note: '' });
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !saving) void save();
      }}
    >
      <label className="text-xs">
        Date paid
        <Input type="date" className="mt-1" value={form.spentOn} max={today()} onChange={(e) => set('spentOn')(e.target.value)} />
      </label>
      <label className="text-xs">
        Amount (Rs)
        <Input className="mt-1" inputMode="decimal" placeholder="e.g. 15000" value={form.amount} aria-invalid={form.amount !== '' && !valid} onChange={(e) => set('amount')(e.target.value)} />
      </label>
      <label className="text-xs sm:col-span-2">
        What it was for
        <select className={cn(selectClass, 'mt-1 block w-full')} value={form.category} onChange={(e) => set('category')(e.target.value as ExpenseCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}: {c.hint}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Brand
        <select className={cn(selectClass, 'mt-1 block w-full')} value={form.store} onChange={(e) => set('store')(e.target.value as '' | StoreKey)}>
          <option value="">Both brands</option>
          <option value="nur">NUR by Juggun</option>
          <option value="organics">Juggun's Organics</option>
        </select>
      </label>
      <label className="text-xs">
        Paid from
        <select className={cn(selectClass, 'mt-1 block w-full')} value={form.paidFrom} onChange={(e) => set('paidFrom')(e.target.value as 'bank' | 'cash')}>
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
        </select>
      </label>
      <label className="text-xs">
        Paid to (optional)
        <Input className="mt-1" placeholder="e.g. Meta, landlord" value={form.payee} onChange={(e) => set('payee')(e.target.value)} />
      </label>
      <label className="text-xs">
        Note (optional)
        <Input className="mt-1" placeholder="e.g. September campaign" value={form.note} onChange={(e) => set('note')(e.target.value)} />
      </label>
      <Button type="submit" className="sm:col-span-2" disabled={!valid || saving}>
        <Plus className="size-4" />
        Record expense
      </Button>
    </form>
  );
}

function VoidButton({ row, onDone }: { row: ExpenseRow; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const voidIt = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/accounting/expenses/${row.id}/void`, { reason: reason.trim() });
      toast.success('Expense voided: its entry is reversed');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not void');
    } finally {
      setBusy(false);
    }
  };
  if (!asking)
    return (
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
        Void
      </Button>
    );
  return (
    <span className="flex items-center justify-end gap-1">
      <Input className="h-8 w-40" placeholder="Why? (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for voiding" />
      <Button size="sm" variant="destructive" disabled={!reason.trim() || busy} onClick={() => void voidIt()}>
        Void
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  );
}

/**
 * The business's running costs, which the profit and loss subtracts after the cost of goods and
 * PostEx's charges: without them, "net profit" is only gross profit. Each one posts to the books at
 * once; a mistake is voided (reversed), never edited.
 */
export function ExpensesPanel() {
  const { can } = useAuth();
  const { brand } = useBrand();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const params = new URLSearchParams({ ...(brand ? { store: brand } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(showVoided ? { voided: 'true' } : {}) });
  const { data, error, loading, reload } = useApi<ExpensePage>(`/api/v1/accounting/expenses?${params.toString()}`);
  const canWrite = can('accounting.close');

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>Shown in the profit and loss under their own lines. A brand-specific expense also shows in that brand's figures; one for both brands only in the combined view.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border p-3 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{formatPaisa(data.total)}</dd>
              </div>
              {CATEGORIES.filter((c) => data.byCategory[c.value] !== '0').map((c) => (
                <div key={c.value} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{formatPaisa(data.byCategory[c.value])}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              From
              <Input type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs">
              To
              <Input type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
              Show voided
            </label>
          </div>
          {loading && !data && <TableSkeleton rows={5} label="Loading the expenses" columns={['Date', 'What for', 'Brand', 'Paid from', num('Amount'), { as: 'button', align: 'right' }]} />}
          {error && !data && <p className="text-sm text-brand-coral">Could not load the expenses: {error}</p>}
          {data && data.rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
              <Receipt className="size-8 text-muted-foreground" />
              <p className="font-medium">No expenses recorded{from || to ? ' in these dates' : ''}</p>
              <p className="max-w-sm text-sm text-muted-foreground">Record ads, salaries, rent and packaging as they are paid, so the profit and loss shows real net profit.</p>
            </div>
          )}
          {data && data.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">Expenses, newest first</caption>
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2 font-medium">What for</th>
                    <th scope="col" className="px-3 py-2 font-medium">Brand</th>
                    <th scope="col" className="px-3 py-2 font-medium">Paid from</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn('border-t', r.voided && 'text-muted-foreground')}>
                      <td className="px-3 py-2 whitespace-nowrap">{r.spentOn}</td>
                      <td className="px-3 py-2">
                        {CATEGORY_LABEL[r.category]}
                        {r.payee && <span className="text-muted-foreground"> · {r.payee}</span>}
                        {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                        <div className="text-xs text-muted-foreground">by {r.createdBy}</div>
                        {r.voided && (
                          <Badge variant="outline" className="mt-1">
                            Voided by {r.voided.by}: {r.voided.reason}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.store === 'nur' ? 'NUR' : r.store === 'organics' ? 'Organics' : 'Both'}</td>
                      <td className="px-3 py-2">{r.paidFrom === 'bank' ? 'Bank' : 'Cash'}</td>
                      <td className={cn('px-3 py-2 text-right font-medium tabular-nums', r.voided && 'line-through')}>{formatPaisa(r.amount)}</td>
                      <td className="px-3 py-2 text-right">{canWrite && !r.voided && <VoidButton row={r} onDone={reload} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Record an expense</CardTitle>
            <CardDescription>Money the business paid out that is not stock. Stock from a supplier goes through Purchase, so it becomes a cost only when it is sold.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewExpense onDone={reload} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
