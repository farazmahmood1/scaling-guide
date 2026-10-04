import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useBrand } from '@/brand/brand-context';
import { ClosedBanner } from '@/components/closed-period';
import { JournalLines } from '@/components/journal-lines';
import { PartnerLedgerView, PnlView, TrialBalanceView } from '@/components/report-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TableSkeleton, num } from '@/components/skeletons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/use-api';
import { usePeriods } from '@/hooks/use-periods';
import type { DrillSpec, TrialBalanceReport } from '@/lib/api';
import { closedInRange, drillKey, reportRanges } from '@/lib/ledger';

const TABS = [
  { key: 'pnl', label: 'Profit and loss' },
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'general-ledger', label: 'General ledger' },
  { key: 'partner-ledger', label: 'Partner ledger' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

const inputClass = 'h-9 rounded-lg border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** One account's whole ledger: choose the account, then read it line by line with a running balance. */
function GeneralLedgerView({ account, onAccount, scope, closed }: { account: string; onAccount: (code: string) => void; scope: { from?: string | null; to?: string | null; store?: string | null }; closed: ReadonlySet<string> }) {
  const accounts = useApi<TrialBalanceReport>('/api/v1/reports/trial-balance');
  const rows = accounts.data?.rows ?? [];
  const chosen = account || rows[0]?.code || '';
  const name = rows.find((r) => r.code === chosen)?.name ?? '';
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        Account
        <select className={inputClass} value={chosen} onChange={(e) => onAccount(e.target.value)} aria-label="Account">
          {rows.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} {r.name}
            </option>
          ))}
        </select>
      </label>
      {accounts.loading && !accounts.data && (
        <TableSkeleton rows={8} footer label="Loading the ledger" columns={['Date', 'Entry', 'Account', { header: 'What', sub: true }, num('Debit'), num('Credit'), num('Balance')]} />
      )}
      {accounts.data && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing was posted yet.</p>}
      {chosen && <JournalLines key={`${chosen}:${drillKey({}, scope)}`} drill={{ account: chosen }} scope={scope} title={`${chosen} ${name}`.trim()} closed={closed} />}
    </div>
  );
}

/**
 * The reports: profit and loss, trial balance, general ledger and partner ledger, over a period
 * shared by all four and the brand chosen in the sidebar. Every figure opens the journal lines it is made of, and from a line
 * its whole entry. Months the books are closed for are marked wherever they appear.
 */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = isTab(params.get('tab')) ? (params.get('tab') as TabKey) : 'pnl';
  const all = params.get('all') === '1';
  const defaults = useMemo(() => reportRanges().find((r) => r.label === 'This year')!, []);
  // With nothing chosen the view is this year; "All time" is its own choice, not a missing one.
  const from = all ? null : (params.get('from') ?? defaults.from);
  const to = all ? null : (params.get('to') ?? defaults.to);
  const { brand: store } = useBrand();
  const scope = useMemo(() => ({ from, to, store }), [from, to, store]);
  const { closed } = usePeriods();
  const touched = closedInRange(from, to, closed);
  const [drill, setDrill] = useState<{ spec: DrillSpec; title: string }>();

  const set = (change: Record<string, string | null>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(change)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
      return p;
    });
  const setRange = (f: string | null, t: string | null) => {
    setDrill(undefined);
    set({ from: f, to: t, all: null });
  };

  const onDrill = (spec: DrillSpec, title: string) => setDrill({ spec, title });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Every figure is read from the journal, and opens the lines it is made of.</p>
      </div>

      <Card className="mb-4">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Period">
            <label className="flex items-center gap-1.5 text-sm">
              From
              <input type="date" className={inputClass} value={from ?? ''} max={to ?? undefined} onChange={(e) => setRange(e.target.value || null, to)} />
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              to
              <input type="date" className={inputClass} value={to ?? ''} min={from ?? undefined} onChange={(e) => setRange(from, e.target.value || null)} />
            </label>
            {reportRanges().map((r) => (
              <Button key={r.label} size="sm" variant="ghost" onClick={() => setRange(r.from, r.to)}>
                {r.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={all ? 'secondary' : 'ghost'}
              onClick={() => {
                setDrill(undefined);
                set({ all: '1', from: null, to: null });
              }}
            >
              All time
            </Button>
          </div>
          <ClosedBanner months={touched} />
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => { setDrill(undefined); set({ tab: v === 'pnl' ? null : v }); }}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Card className="mt-3">
          <CardContent className="space-y-4 pt-6">
            <TabsContent value="pnl">
              <PnlView scope={scope} closed={closed} onDrill={onDrill} />
            </TabsContent>
            <TabsContent value="trial-balance">
              <TrialBalanceView scope={scope} closed={closed} onDrill={onDrill} />
            </TabsContent>
            <TabsContent value="general-ledger">
              <GeneralLedgerView account={params.get('account') ?? ''} onAccount={(code) => set({ account: code })} scope={scope} closed={closed} />
            </TabsContent>
            <TabsContent value="partner-ledger">
              <PartnerLedgerView scope={scope} closed={closed} onDrill={onDrill} />
            </TabsContent>
            {tab !== 'general-ledger' && drill && (
              <JournalLines key={drillKey(drill.spec, scope)} drill={drill.spec} scope={scope} title={drill.title} closed={closed} onClose={() => setDrill(undefined)} />
            )}
          </CardContent>
        </Card>
      </Tabs>
    </>
  );
}
