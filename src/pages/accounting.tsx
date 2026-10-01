import { Fragment, useState } from 'react';
import { Lock, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { type InventoryCheck, type LedgerLine, type OpeningBalances, type Period, type StoreKey, type TrialBalance, apiPost, apiPut } from '@/lib/api';
import { formatPaisa, paisaToInput, parseRupees } from '@/lib/format';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

/** The entries behind one trial balance figure. */
function Ledger({ code, query }: { code: string; query: string }) {
  const { data, loading, error } = useApi<{ lines: LedgerLine[] }>(`/api/v1/accounting/accounts/${code}/lines?${query}`);
  if (loading && !data) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-sm text-brand-coral">{error}</p>;
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-muted/30">
      <Table>
        <TableBody>
          {data?.lines.map((line) => (
            <TableRow key={`${line.entryId}:${line.debit}:${line.credit}`} className={line.reversed ? 'text-muted-foreground line-through' : ''}>
              <TableCell className="whitespace-nowrap text-xs">{line.date}</TableCell>
              <TableCell className="text-xs">{line.memo}</TableCell>
              <TableCell className="text-right text-xs">{line.debit !== '0' ? formatPaisa(line.debit) : ''}</TableCell>
              <TableCell className="text-right text-xs">{line.credit !== '0' ? formatPaisa(line.credit) : ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data && data.lines.length === 200 && <p className="p-2 text-xs text-muted-foreground">Showing the latest 200 lines.</p>}
    </div>
  );
}

function TrialBalanceCard() {
  const [to, setTo] = useState('');
  const [store, setStore] = useState<'' | StoreKey>('');
  const [open, setOpen] = useState<string>();
  const query = new URLSearchParams({ ...(to ? { to } : {}), ...(store ? { store } : {}) }).toString();
  const { data, error, loading, reload } = useApi<TrialBalance>(`/api/v1/accounting/trial-balance?${query}`);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Trial balance</CardTitle>
            <CardDescription>Every account's debits and credits. Click a row to see its entries.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Up to date" />
            <select className={selectClass} value={store} onChange={(e) => setStore(e.target.value as '' | StoreKey)} aria-label="Brand">
              <option value="">Both brands</option>
              <option value="nur">NUR by Juggun</option>
              <option value="organics">Juggun's Organics</option>
            </select>
            <Button variant="ghost" size="sm" onClick={reload} disabled={loading} aria-label="Refresh">
              <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data && <Skeleton className="h-40 w-full" />}
        {error && <p className="text-sm text-brand-coral">Could not load the trial balance: {error}</p>}
        {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing posted yet.</p>}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <Fragment key={row.code}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(open === row.code ? undefined : row.code)}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
                      </TableCell>
                      <TableCell className="text-right">{formatPaisa(row.debit)}</TableCell>
                      <TableCell className="text-right">{formatPaisa(row.credit)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPaisa(row.balance)}</TableCell>
                    </TableRow>
                    {open === row.code && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Ledger code={row.code} query={query} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>
                    Total{' '}
                    <Badge variant={data.balanced ? 'secondary' : 'destructive'}>{data.balanced ? 'Balances' : 'Does not balance'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatPaisa(data.debit)}</TableCell>
                  <TableCell className="text-right">{formatPaisa(data.credit)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodsCard() {
  const { data, error, reload } = useApi<{ periods: Period[] }>('/api/v1/accounting/periods');
  const [confirming, setConfirming] = useState<string>();
  // Karachi's date when the page opened: whether a month may be closed yet (the server decides too).
  const [today] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }));

  const close = async (period: Period) => {
    try {
      await apiPost(`/api/v1/accounting/periods/${period.year}/${period.month}/close`, {});
      toast.success(`${MONTHS[period.month - 1]} ${period.year} closed`);
      setConfirming(undefined);
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not close the month');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month close</CardTitle>
        <CardDescription>A month can be closed from the 5th of the next. Once closed, nothing can be dated in it; corrections go in the next open month.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-brand-coral">{error}</p>}
        {data?.periods.map((period) => {
          const key = `${period.year}-${period.month}`;
          const canClose = period.status === 'open' && today >= period.closableFrom;
          return (
            <div key={key} className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0">
              <div>
                <p className="font-medium">
                  {MONTHS[period.month - 1]} {period.year}
                </p>
                <p className="text-xs text-muted-foreground">
                  {period.entries} entries
                  {period.status === 'closed'
                    ? ` · closed ${period.closedAt ? new Date(period.closedAt).toLocaleDateString() : ''} by ${period.closedBy ?? 'unknown'}`
                    : ` · can close from ${period.closableFrom}`}
                </p>
              </div>
              {period.status === 'closed' ? (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="size-3" />
                  Closed
                </Badge>
              ) : confirming === key ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="destructive" onClick={() => close(period)}>
                    Close for good
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(undefined)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" disabled={!canClose} onClick={() => setConfirming(key)}>
                  Close month
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

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

/** The books: trial balance, month close and opening balances. Every figure is read from the journal. */
export function AccountingPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground">Double-entry, posted from deliveries, PostEx charges and payouts. Revenue counts only once a parcel is delivered.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <TrialBalanceCard />
        <div className="space-y-6">
          <PeriodsCard />
          <OpeningBalancesCard />
          <InventoryCheckCard />
        </div>
      </div>
    </>
  );
}
