import { useState } from 'react';
import { ArrowLeftRight, FileText, type LucideIcon, ReceiptText, Save } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { BillsView, DocumentLines, InvoicesView, PaymentsView } from '@/components/accounting-documents';
import { ExpensesPanel } from '@/components/expenses-panel';
import { JournalList } from '@/components/journal-list';
import { PeriodClose } from '@/components/period-close';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FactsSkeleton, Loading } from '@/components/skeletons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { usePeriods } from '@/hooks/use-periods';
import { type DrillSpec, type InventoryCheck, type OpeningBalances, type StoreKey, apiPut } from '@/lib/api';
import { formatPaisa, paisaToInput, parseRupees } from '@/lib/format';
import { plainAccount } from '@/lib/ledger';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const ACCOUNT_NAMES: Record<string, string> = {
  '1000': 'Bank',
  '1010': 'Cash in hand',
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
  // What the rows add up to, by kind: had (assets), owed (liabilities), the owner's (equity).
  const totalOf = (digit: string) => rows.reduce((n, r, i) => (r.code.startsWith(digit) && parsed[i] ? n + BigInt(parsed[i]!) : n), 0n);
  const had = totalOf('1');
  const owed = totalOf('2');
  const owner = totalOf('3');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Opening balances
          <Badge variant={data?.opening ? 'secondary' : 'outline'}>{data?.opening ? `Entered, as at ${data.opening.date}` : 'Not entered yet'}</Badge>
        </CardTitle>
        <CardDescription>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Filled in once, when you start using the app.</li>
            <li>What the business had and owed on the day before. Your accountant has these figures.</li>
            <li>Not filled in? Profit is still right; only the balance sheet starts from zero.</li>
          </ul>
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
              {(
                [
                  ['1', 'What the business had'],
                  ['2', 'What the business owed'],
                  ['3', "Owner's money"],
                ] as const
              ).map(([digit, label]) => (
                <optgroup key={digit} label={label}>
                  {(data?.accounts ?? [])
                    .filter((a) => a.code.startsWith(digit))
                    .map((a) => (
                      <option key={a.code} value={a.code}>
                        {plainAccount(a.code, ACCOUNT_NAMES[a.code] ?? a.key)} ({a.code})
                      </option>
                    ))}
                </optgroup>
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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Had</dt>
            <dd className="tabular-nums">{formatPaisa(had.toString())}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Owed</dt>
            <dd className="tabular-nums">{formatPaisa(owed.toString())}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Owner's money</dt>
            <dd className="tabular-nums">{formatPaisa(owner.toString())}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground" title="Had, less owed, less the owner's money: posted to Opening balances (3100)">
              Difference
            </dt>
            <dd className="font-medium tabular-nums">{formatPaisa((had - owed - owner).toString())}</dd>
          </div>
        </dl>
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
        <CardTitle>Stock check</CardTitle>
        <CardDescription>Does the stock value in the books match the counted units × their cost? Pick a date to check that day.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input type="date" className="w-44" value={asAt} onChange={(e) => setAsAt(e.target.value)} aria-label="As at" />
        {loading && !data && (
          <Loading label="Loading the inventory check">
            <FactsSkeleton rows={3} rowClassName="py-0.5" divided={false} />
          </Loading>
        )}
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


const DOCUMENTS: ReadonlyArray<{ key: 'invoices' | 'bills' | 'payments'; label: string; hint: string; icon: LucideIcon }> = [
  { key: 'invoices', label: 'Invoices', hint: 'What partner shops sold for us', icon: FileText },
  { key: 'bills', label: 'Bills', hint: 'What suppliers charged us', icon: ReceiptText },
  { key: 'payments', label: 'Payments', hint: 'Money in from PostEx, out to suppliers', icon: ArrowLeftRight },
];
type DocumentKey = (typeof DOCUMENTS)[number]['key'];

/** Invoices, bills and payments, each opening the journal lines it posted. */
function Documents() {
  const [kind, setKind] = useState<DocumentKey>('payments');
  const [open, setOpen] = useState<{ drill: DrillSpec; title: string }>();
  const { closed } = usePeriods();
  const onOpen = (drill: DrillSpec, title: string) => setOpen({ drill, title });
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Document" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DOCUMENTS.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={kind === d.key}
            onClick={() => {
              setKind(d.key);
              setOpen(undefined);
            }}
            className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:ring-1 aria-pressed:ring-primary"
          >
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-muted', kind === d.key && 'bg-primary text-primary-foreground')}>
              <d.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">{d.label}</span>
              <span className="block text-xs text-muted-foreground">{d.hint}</span>
            </span>
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

/** A tab's first lines: what it holds and where its entries come from, in plain words. */
function TabIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{children}</p>;
}

const TAB_KEYS = ['journal', 'expenses', 'documents', 'close', 'setup'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const isTab = (v: string | null): v is TabKey => (TAB_KEYS as readonly string[]).includes(v ?? '');

/**
 * The books: the journal of everything posted, the business's expenses, the documents that post
 * (invoices, bills, payments), month close and the opening balances. The reports (P&L, trial
 * balance, ledgers) are under Reports.
 */
export function AccountingPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = isTab(params.get('tab')) ? (params.get('tab') as TabKey) : 'journal';
  const setTab = (next: string) =>
    setParams((p) => {
      if (next === 'journal') p.delete('tab');
      else p.set('tab', next);
      return p;
    });
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground">
          Your books. The app writes most entries on its own, from PostEx and Shopify. Profit and loss and the ledgers are in{' '}
          <Link className="underline underline-offset-2" to="/reports">
            Reports
          </Link>
          .
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="documents">Invoices, bills and payments</TabsTrigger>
          <TabsTrigger value="close">Month close</TabsTrigger>
          <TabsTrigger value="setup">Opening balances</TabsTrigger>
        </TabsList>
        <TabsContent value="journal" className="mt-3">
          <TabIntro>Every money movement, newest first. Press a row to see what it changed.</TabIntro>
          <Card>
            <CardContent className="pt-6">
              <JournalList />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expenses" className="mt-3">
          <TabIntro>Ads, salaries, rent, packaging and other running costs. Add each one when you pay it; profit takes them off.</TabIntro>
          <ExpensesPanel />
        </TabsContent>
        <TabsContent value="documents" className="mt-3">
          <TabIntro>Each one has an Entries button that shows what it wrote in the books.</TabIntro>
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
              <CardDescription>Lock a month once its numbers are final, so its reports never change.</CardDescription>
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
