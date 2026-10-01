import { useState } from 'react';
import { Save } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { BillsView, DocumentLines, InvoicesView, PaymentsView } from '@/components/accounting-documents';
import { PeriodClose } from '@/components/period-close';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { usePeriods } from '@/hooks/use-periods';
import { type DrillSpec, type InventoryCheck, type OpeningBalances, type StoreKey, apiPut } from '@/lib/api';
import { formatPaisa, paisaToInput, parseRupees } from '@/lib/format';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const ACCOUNT_NAMES: Record<string, string> = {
  '1000': 'Bank',
  '1100': 'COD receivable (PostEx)',
  '1150': 'Customer receivable',
  '1200': 'Partner receivable',
  '1300': 'Inventory',
  '1400': 'Input tax',
  '2000': 'Accounts payable',
  '2100': 'Sales tax payable',
  '3000': "Owner's equity",
};
/** Assets carry debit balances; liabilities and equity credit balances, entered as positive numbers. */
const CREDIT_NORMAL = new Set(['2000', '2100', '3000']);

interface Draft {
  code: string;
  store: '' | StoreKey;
  amount: string;
}

/**
 * The client's opening balances, as on the day before the system takes over. Assets are entered
 * as what they hold, liabilities and equity as what is owed; the difference becomes opening
 * equity, so an incomplete list still posts and the gap shows.
 */
function OpeningBalancesCard() {
  const { data, error, reload } = useApi<OpeningBalances>('/api/v1/accounting/opening-balances');
  const [date, setDate] = useState<string>();
  const [drafts, setDrafts] = useState<Draft[]>();
  const [saving, setSaving] = useState(false);

  const savedDrafts: Draft[] =
    data?.opening?.lines.map((l) => ({
      code: l.code,
      store: l.store ?? '',
      amount: paisaToInput(CREDIT_NORMAL.has(l.code) ? (l.balancePaisa.startsWith('-') ? l.balancePaisa.slice(1) : `-${l.balancePaisa}`) : l.balancePaisa),
    })) ?? [];
  const rows = drafts ?? (savedDrafts.length ? savedDrafts : [{ code: '1000', store: '' as const, amount: '' }]);
  const day = date ?? data?.opening?.date ?? '';
  const parsed = rows.map((r) => parseRupees(r.amount));
  const valid = day && rows.length > 0 && parsed.every((p) => p !== null);

  const save = async () => {
    setSaving(true);
    try {
      const lines = rows.map((r, i) => {
        const value = parsed[i]!;
        // Liabilities and equity are entered positive; the ledger holds them as credit balances.
        const balancePaisa = CREDIT_NORMAL.has(r.code) ? (value.startsWith('-') ? value.slice(1) : value === '0' ? '0' : `-${value}`) : value;
        return { code: r.code, balancePaisa, ...(r.store ? { store: r.store } : {}) };
      });
      const result = await apiPut<{ replaced: boolean }>('/api/v1/accounting/opening-balances', { date: day, lines });
      toast.success(result.replaced ? 'Opening balances replaced (the earlier entry is reversed)' : 'Opening balances saved');
      setDrafts(undefined);
      setDate(undefined);
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const update = (index: number, change: Partial<Draft>) => setDrafts(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opening balances</CardTitle>
        <CardDescription>
          From the client's last accounts. Any difference is posted to Opening balances (3100). {data?.opening ? `Posted as at ${data.opening.date}.` : 'Not entered yet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-brand-coral">{error}</p>}
        {data && data.entriesBeforeOpening.count > 0 && (
          <p className="rounded-lg border border-brand-coral/40 bg-brand-coral/5 p-2 text-xs text-brand-coral">
            {data.entriesBeforeOpening.count} entries are dated on or before the opening date (from {data.entriesBeforeOpening.earliest}). The client's balances
            already include that history, so it would be counted twice. Date the opening balances before {data.entriesBeforeOpening.earliest}, or take the
            balances from the client's books as at that day.
          </p>
        )}
        <label className="block text-xs">
          As at
          <Input type="date" className="mt-1 w-44" value={day} onChange={(e) => setDate(e.target.value)} />
        </label>
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select className={selectClass} value={row.code} onChange={(e) => update(index, { code: e.target.value })} aria-label="Account">
              {(data?.accounts ?? []).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {ACCOUNT_NAMES[a.code] ?? a.key}
                </option>
              ))}
            </select>
            <select className={selectClass} value={row.store} onChange={(e) => update(index, { store: e.target.value as '' | StoreKey })} aria-label="Brand">
              <option value="">Both</option>
              <option value="nur">NUR</option>
              <option value="organics">Organics</option>
            </select>
            <Input
              className="w-36"
              inputMode="decimal"
              placeholder="Rs"
              value={row.amount}
              aria-invalid={row.amount !== '' && parsed[index] === null}
              onChange={(e) => update(index, { amount: e.target.value })}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDrafts([...rows, { code: '1000', store: '', amount: '' }])}>
            Add line
          </Button>
          <Button size="sm" onClick={save} disabled={!valid || saving}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Do the books and the stock count agree? Inventory account vs units × cost, both as at the end of
 * one day. On the cut-over date it checks the opening balance against the opening stock count.
 */
function InventoryCheckCard() {
  const [asAt, setAsAt] = useState('');
  const { data, error, loading } = useApi<InventoryCheck>(`/api/v1/accounting/inventory-check${asAt ? `?asAt=${asAt}` : ''}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory check</CardTitle>
        <CardDescription>The Inventory account against the stock count × cost. Pick the opening date to check the opening figures.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input type="date" className="w-44" value={asAt} onChange={(e) => setAsAt(e.target.value)} aria-label="As at" />
        {loading && !data && <Skeleton className="h-16 w-full" />}
        {error && <p className="text-brand-coral">{error}</p>}
        {data && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Stock: {data.units} units of {data.variants} products × cost
                </span>
                <span>{formatPaisa(data.stockValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inventory account (1300)</span>
                <span>{formatPaisa(data.ledgerValue)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-1 font-medium">
                <span>
                  Difference <Badge variant={data.agrees ? 'secondary' : 'destructive'}>{data.agrees ? 'Agrees' : 'Does not agree'}</Badge>
                </span>
                <span>{formatPaisa(data.difference)}</span>
              </div>
            </div>
            {data.missingCost.length > 0 && (
              <div>
                <p className="text-xs font-medium text-brand-coral">No cost on {data.asAt}, so not valued ({data.missingCost.length}):</p>
                <ul className="text-xs text-muted-foreground">
                  {data.missingCost.slice(0, 8).map((m) => (
                    <li key={m.variantId}>
                      {m.title} {m.sku ? `(${m.sku})` : ''}: {m.units} units
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.negative.length > 0 && (
              <p className="text-xs text-brand-coral">{data.negative.length} products are below zero: sold before an opening count was entered.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}


const DOCUMENTS = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'bills', label: 'Bills' },
  { key: 'payments', label: 'Payments' },
] as const;
type DocumentKey = (typeof DOCUMENTS)[number]['key'];

/** Invoices, bills and payments, each opening the journal lines it posted. */
function Documents() {
  const [kind, setKind] = useState<DocumentKey>('invoices');
  const [open, setOpen] = useState<{ drill: DrillSpec; title: string }>();
  const { closed } = usePeriods();
  const onOpen = (drill: DrillSpec, title: string) => setOpen({ drill, title });
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Document" className="flex gap-1 text-sm">
        {DOCUMENTS.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={kind === d.key}
            onClick={() => {
              setKind(d.key);
              setOpen(undefined);
            }}
            className="rounded-md px-3 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
          >
            {d.label}
          </button>
        ))}
      </div>
      {kind === 'invoices' && <InvoicesView closed={closed} onOpen={onOpen} />}
      {kind === 'bills' && <BillsView closed={closed} onOpen={onOpen} />}
      {kind === 'payments' && <PaymentsView closed={closed} onOpen={onOpen} />}
      {open && <DocumentLines drill={open.drill} title={open.title} closed={closed} onClose={() => setOpen(undefined)} />}
    </div>
  );
}

/** The books' documents, month close and set-up. The reports (P&L, trial balance, ledgers) are under Reports. */
export function AccountingPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground">
          Double-entry, posted from deliveries, PostEx charges and payouts. Revenue counts only once a parcel is delivered. Profit and loss, the trial balance and the ledgers are in{' '}
          <Link className="underline underline-offset-2" to="/reports">
            Reports
          </Link>
          .
        </p>
      </div>
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Invoices, bills and payments</TabsTrigger>
          <TabsTrigger value="close">Month close</TabsTrigger>
          <TabsTrigger value="setup">Opening balances</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-3">
          <Card>
            <CardContent className="pt-6">
              <Documents />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="close" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Month close</CardTitle>
              <CardDescription>Months the books are final for are marked everywhere they appear.</CardDescription>
            </CardHeader>
            <CardContent>
              <PeriodClose />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="setup" className="mt-3">
          <div className="grid gap-6 lg:grid-cols-2">
            <OpeningBalancesCard />
            <InventoryCheckCard />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
