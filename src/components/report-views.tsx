import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

import { ClosedMark } from '@/components/closed-period';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import type { DrillSpec, PartnerLedgerRow, Pnl, TrialBalanceReport } from '@/lib/api';
import { downloadText } from '@/lib/csv';
import { formatPaisa } from '@/lib/format';
import { type Scope, monthLabel, netByMonth, partnerLedgerCsv, pivotPnl, pnlCsv, trialBalanceCsv } from '@/lib/ledger';
import { cn } from '@/lib/utils';

export type OnDrill = (drill: DrillSpec, title: string) => void;

interface ViewProps {
  scope: Scope;
  closed: ReadonlySet<string>;
  onDrill: OnDrill;
}

const query = (scope: Scope, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams(extra);
  if (scope.from) p.set('from', scope.from);
  if (scope.to) p.set('to', scope.to);
  if (scope.store) p.set('store', scope.store);
  return p.toString();
};

/** A figure that opens the lines behind it. Zero is shown quietly and is not a link: there is nothing to open. */
function Figure({ paisa, onClick, label, strong }: { paisa: string; onClick?: () => void; label: string; strong?: boolean }) {
  const text = formatPaisa(paisa);
  if (!onClick || paisa === '0') return <span className={cn('tabular-nums', paisa === '0' && 'text-muted-foreground/60', strong && 'font-semibold')}>{text}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn('rounded px-1 tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', strong && 'font-semibold')}
    >
      {text}
    </button>
  );
}

function Loading({ error, loading, hasData }: { error?: string; loading: boolean; hasData: boolean }) {
  if (error && !hasData) return <p role="alert" className="text-sm text-brand-coral">Could not load the report: {error}</p>;
  if (loading && !hasData) return <Skeleton className="h-48 w-full" />;
  return null;
}

const exportFile = (name: string, csv: string) => {
  downloadText(`${name}.csv`, csv);
  toast.success('Exported');
};

/** Profit and loss, one column or one per month. Every cell opens the journal lines it is made of. */
export function PnlView({ scope, closed, onDrill }: ViewProps) {
  const [byMonth, setByMonth] = useState(false);
  const { data, error, loading } = useApi<Pnl>(`/api/v1/reports/pnl?${query(scope, { byMonth: String(byMonth) })}`);
  const grid = useMemo(() => (data && byMonth ? pivotPnl(data.rows) : null), [data, byMonth]);
  const net = useMemo(() => (grid ? netByMonth(grid) : {}), [grid]);
  const single = data && !byMonth ? data.rows : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={byMonth} onChange={(e) => setByMonth(e.target.checked)} />A column for each month
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={() => {
            if (!data) return;
            // One column for the whole period when there is no month split.
            const g = grid ?? pivotPnl(data.rows.map((r) => ({ ...r, month: 'Period' })));
            exportFile('profit-and-loss', pnlCsv(g, netByMonth(g)));
          }}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>
      <Loading error={error} loading={loading} hasData={!!data} />
      {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing was posted in this period.</p>}

      {data && !byMonth && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Profit and loss</caption>
            <tbody>
              {(['income', 'expense'] as const).map((type) => (
                <FragmentRows key={type} heading={type === 'income' ? 'Income' : 'Expenses'} total={type === 'income' ? data.income : data.expenses}>
                  {single
                    .filter((r) => r.type === type)
                    .map((r) => (
                      <tr key={r.code} className="border-t">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Figure paisa={r.amount} label={`Journal lines of ${r.name}`} onClick={() => onDrill({ account: r.code }, `${r.code} ${r.name}`)} />
                        </td>
                      </tr>
                    ))}
                </FragmentRows>
              ))}
              <tr className="border-t-2 bg-muted/30 text-base font-semibold">
                <td className="px-3 py-2">Net profit</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {grid && grid.accounts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Profit and loss by month</caption>
            <thead className="bg-muted/40 text-right text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Account</th>
                {grid.months.map((m) => (
                  <th key={m} scope="col" className={cn('px-3 py-2 font-medium whitespace-nowrap', closed.has(m) && 'bg-slate-500/20')}>
                    {monthLabel(m)}
                    {closed.has(m) && <ClosedMark className="ml-1" />}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.accounts.map((a) => (
                <tr key={a.code} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-normal whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}
                  </th>
                  {grid.months.map((m) => (
                    <td key={m} className={cn('px-3 py-2 text-right', closed.has(m) && 'bg-slate-500/10')}>
                      <Figure paisa={a.byMonth[m] ?? '0'} label={`Journal lines of ${a.name} in ${monthLabel(m)}`} onClick={() => onDrill({ account: a.code, month: m }, `${a.code} ${a.name}, ${monthLabel(m)}`)} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Figure paisa={a.total} strong label={`Journal lines of ${a.name}`} onClick={() => onDrill({ account: a.code }, `${a.code} ${a.name}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/30 font-semibold">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">Net profit</th>
                {grid.months.map((m) => (
                  <td key={m} className={cn('px-3 py-2 text-right tabular-nums', closed.has(m) && 'bg-slate-500/20')}>
                    {formatPaisa(net[m] ?? '0')}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(Object.values(net).reduce((n, v) => n + BigInt(v), 0n).toString())}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRows({ heading, total, children }: { heading: string; total: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-muted/40">
        <th scope="colgroup" className="px-3 py-2 text-left font-semibold">
          {heading}
        </th>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPaisa(total)}</td>
      </tr>
      {children}
    </>
  );
}

/** The trial balance over the period: opening, movement and closing. A row opens that account's ledger. */
export function TrialBalanceView({ scope, onDrill }: ViewProps) {
  const { data, error, loading } = useApi<TrialBalanceReport>(`/api/v1/reports/trial-balance?${query(scope)}`);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={!data} onClick={() => data && exportFile('trial-balance', trialBalanceCsv(data.rows))}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>
      <Loading error={error} loading={loading} hasData={!!data} />
      {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing was posted yet.</p>}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Trial balance</caption>
            <thead className="bg-muted/40 text-right text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Account</th>
                <th scope="col" className="px-3 py-2 font-medium">Opening</th>
                <th scope="col" className="px-3 py-2 font-medium">Debit</th>
                <th scope="col" className="px-3 py-2 font-medium">Credit</th>
                <th scope="col" className="px-3 py-2 font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.code} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(r.opening)}</td>
                  <td className="px-3 py-2 text-right">
                    <Figure paisa={r.debit} label={`Journal lines of ${r.name}`} onClick={() => onDrill({ account: r.code }, `${r.code} ${r.name}`)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Figure paisa={r.credit} label={`Journal lines of ${r.name}`} onClick={() => onDrill({ account: r.code }, `${r.code} ${r.name}`)} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPaisa(r.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/30 font-medium">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">
                  Total {data.balanced ? <Badge variant="secondary">Balances</Badge> : <Badge variant="destructive">Does not balance</Badge>}
                </th>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.credit)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const KIND: Record<PartnerLedgerRow['partnerType'], string> = { postex_account: 'PostEx account', retail_partner: 'Retail partner', vendor: 'Vendor' };

/** Who owes what: PostEx's COD, partners' consignment sales, vendors' unpaid bills. A row opens its lines. */
export function PartnerLedgerView({ scope, onDrill }: ViewProps) {
  const { data, error, loading } = useApi<{ rows: PartnerLedgerRow[] }>(`/api/v1/reports/partner-ledger?${query(scope)}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Positive: owed to us. Negative: we owe.</p>
        <Button variant="outline" size="sm" disabled={!data} onClick={() => data && exportFile('partner-ledger', partnerLedgerCsv(data.rows))}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>
      <Loading error={error} loading={loading} hasData={!!data} />
      {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No partner balances yet.</p>}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Partner ledger</caption>
            <thead className="bg-muted/40 text-right text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Partner</th>
                <th scope="col" className="px-3 py-2 font-medium">Opening</th>
                <th scope="col" className="px-3 py-2 font-medium">Debit</th>
                <th scope="col" className="px-3 py-2 font-medium">Credit</th>
                <th scope="col" className="px-3 py-2 font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const drill = { partnerType: r.partnerType, partnerId: r.partnerId };
                return (
                  <tr key={`${r.partnerType}:${r.partnerId}`} className="border-t">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {r.name}
                      <div className="text-xs text-muted-foreground">{KIND[r.partnerType]}</div>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(r.opening)}</td>
                    <td className="px-3 py-2 text-right">
                      <Figure paisa={r.debit} label={`Journal lines of ${r.name}`} onClick={() => onDrill(drill, r.name)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Figure paisa={r.credit} label={`Journal lines of ${r.name}`} onClick={() => onDrill(drill, r.name)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Figure paisa={r.closing} strong label={`Journal lines of ${r.name}`} onClick={() => onDrill(drill, r.name)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
