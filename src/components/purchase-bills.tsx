import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { type VendorBill, apiPost } from '@/lib/api';
import { formatPaisa, paisaToInput, parseRupees } from '@/lib/format';
import { paisaDigits, today } from '@/lib/purchasing';

const dateClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';

/** Pay all or part of a bill. The amount starts at what is outstanding; the server refuses an overpayment. */
function PayForm({ bill, onDone }: { bill: VendorBill; onDone: () => void }) {
  const [amount, setAmount] = useState(paisaToInput(bill.outstanding));
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<'bank_transfer' | 'cash' | 'cheque'>('bank_transfer');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const paisa = paisaDigits(parseRupees(amount));
  const valid = paisa !== null && paisa !== '0';

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const result = await apiPost<{ outstanding: string }>(`/api/v1/purchasing/bills/${bill.id}/payments`, {
        amountPaisa: paisa,
        paidOn,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      toast.success(BigInt(result.outstanding) === 0n ? `${bill.billNumber} is paid in full` : `Paid; ${formatPaisa(result.outstanding)} still outstanding`);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The payment was not recorded');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !saving) void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-32" inputMode="decimal" aria-label="Amount in rupees" value={amount} aria-invalid={!valid} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <input type="date" className={dateClass} aria-label="Paid on" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
        <select className={selectClass} aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
        <Input className="w-40" placeholder="Reference" aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Button type="submit" size="sm" disabled={!valid || saving}>
          Record payment
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-brand-coral">
          {error}
        </p>
      )}
    </form>
  );
}

/** Step 5, after the bill: what is owed, oldest due first, and paying it. */
export function BillsList({ reloadKey, onChanged, onOpenOrder }: { reloadKey: number; onChanged: () => void; onOpenOrder: (poId: string) => void }) {
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const [paying, setPaying] = useState<string>();
  const { data, error, loading, reload } = useApi<{ bills: VendorBill[] }>(`/api/v1/purchasing/bills?unpaid=${unpaidOnly}&k=${reloadKey}`);
  const bills = data?.bills ?? [];

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
        Only bills still owed
      </label>
      {loading && !data && <Skeleton className="h-16 w-full" />}
      {error && !data && <p className="text-sm text-brand-coral">Could not load bills: {error}</p>}
      {data && bills.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{unpaidOnly ? 'No bills are owed.' : 'No bills yet.'}</p>}
      <ul className="divide-y">
        {bills.map((b) => (
          <li key={b.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p>
                  <span className="font-medium">{b.billNumber}</span> · {b.vendor}{' '}
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onOpenOrder(b.poId)}>
                    {b.poNumber}
                  </Button>
                </p>
                <p className="text-xs text-muted-foreground">
                  Billed {b.billDate}
                  {b.dueOn ? ` · due ${b.dueOn}` : ''} · total {formatPaisa(b.total)} · paid {formatPaisa(b.paid)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {b.overdue && <Badge variant="destructive">Overdue</Badge>}
                <span className="font-medium tabular-nums">{BigInt(b.outstanding) > 0n ? `${formatPaisa(b.outstanding)} owed` : 'Paid'}</span>
                {BigInt(b.outstanding) > 0n && (
                  <Button size="sm" variant={paying === b.id ? 'secondary' : 'outline'} onClick={() => setPaying(paying === b.id ? undefined : b.id)}>
                    Pay
                  </Button>
                )}
              </div>
            </div>
            {paying === b.id && (
              <PayForm
                bill={b}
                onDone={() => {
                  setPaying(undefined);
                  reload();
                  onChanged();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
