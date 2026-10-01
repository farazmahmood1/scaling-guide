import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { type Column, DataTable } from '@/components/data-table';
import { FilterBar, type MultiFilter } from '@/components/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useListQuery } from '@/hooks/use-list-query';
import { formatKarachiTime, formatPaisa, paisaToInput } from '@/lib/format';
import type { QuerySpec } from '@/lib/list-query';
import { CITIES, type MockOrder, STATUSES, matching, mockOrders, page } from '@/lib/mock-orders';

const SPEC: QuerySpec = {
  multi: { status: STATUSES, store: ['nur', 'organics'], city: CITIES },
  sortKeys: ['orderNumber', 'placedAt', 'total', 'city', 'items'],
  defaultSort: { key: 'placedAt', dir: 'desc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: ['orderNumber', 'store', 'customer', 'city', 'status', 'items', 'placedAt', 'total'],
  defaultHidden: ['items'],
};

const FILTERS: MultiFilter[] = [
  { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })) },
  { key: 'store', label: 'Brand', options: [{ value: 'nur', label: 'NUR by Juggun' }, { value: 'organics', label: "Juggun's Organics" }] },
  { key: 'city', label: 'City', options: CITIES.map((c) => ({ value: c, label: c })) },
];

const COLUMNS: Column<MockOrder>[] = [
  { key: 'orderNumber', header: 'Order', pinned: true, sortable: true, cell: (r) => <span className="font-medium">{r.orderNumber}</span>, csv: (r) => r.orderNumber },
  { key: 'store', header: 'Brand', cell: (r) => (r.store === 'nur' ? 'NUR' : 'Organics'), csv: (r) => r.store },
  { key: 'customer', header: 'Customer', cell: (r) => r.customer, csv: (r) => r.customer },
  { key: 'city', header: 'City', sortable: true, cell: (r) => r.city, csv: (r) => r.city },
  { key: 'status', header: 'Status', cell: (r) => <Badge variant={r.status === 'returned' || r.status === 'cancelled' ? 'destructive' : 'secondary'}>{r.status}</Badge>, csv: (r) => r.status },
  { key: 'items', header: 'Items', sortable: true, align: 'right', cell: (r) => r.items, csv: (r) => String(r.items) },
  { key: 'placedAt', header: 'Placed', sortable: true, cell: (r) => formatKarachiTime(r.placedAt), csv: (r) => r.placedAt },
  // Exported as plain rupees with two decimals, read exactly from paisa.
  { key: 'total', header: 'Total', sortable: true, align: 'right', cell: (r) => formatPaisa(r.totalPaisa), csv: (r) => paisaToInput(r.totalPaisa) },
];

type Simulation = 'normal' | 'slow' | 'error' | 'empty';
const SIMULATIONS: Simulation[] = ['normal', 'slow', 'error', 'empty'];

/**
 * The DataTable and FilterBar over 10,000 made-up orders, behind a mock server with a network
 * delay. `?sim=` forces each state: `slow` (2 s, to see loading), `error`, `empty`.
 */
export function TableDemoPage() {
  const all = useMemo(() => mockOrders(), []);
  const [query, setQuery] = useListQuery(SPEC);
  const [params, setParams] = useSearchParams();
  const sim = (SIMULATIONS as string[]).includes(params.get('sim') ?? '') ? (params.get('sim') as Simulation) : 'normal';
  const [attempt, setAttempt] = useState(0);
  // What the server last answered, and for which request; loading is "the answer is for another one".
  const [answer, setAnswer] = useState<{ key: string; result?: { rows: MockOrder[]; total: number }; error: string | null }>();
  const key = JSON.stringify([query, sim, attempt]);
  const loading = answer?.key !== key;

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setAnswer(
          sim === 'error'
            ? { key, error: 'The server answered 503 (simulated)' }
            : { key, result: sim === 'empty' ? { rows: [], total: 0 } : page(all, query), error: null },
        ),
      sim === 'slow' ? 2000 : 150,
    );
    return () => clearTimeout(timer);
  }, [all, query, sim, key]);
  const result = answer?.result;
  const error = loading ? null : (answer?.error ?? null);

  const setSim = (value: Simulation) =>
    setParams((p) => {
      if (value === 'normal') p.delete('sim');
      else p.set('sim', value);
      return p;
    });

  const exportRows = useCallback(async () => (sim === 'empty' ? [] : matching(all, query)), [all, query, sim]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Table demo</h1>
        <p className="text-sm text-muted-foreground">The list table and filters every screen uses, over 10,000 made-up orders. Not in the menu; for checking the components.</p>
      </div>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Orders (mock)</CardTitle>
              <CardDescription>Copy the address to share this exact view.</CardDescription>
            </div>
            <div className="flex items-center gap-1 text-sm" role="group" aria-label="Simulate">
              <span className="text-muted-foreground">Simulate</span>
              {SIMULATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sim === s}
                  onClick={() => setSim(s)}
                  className="rounded-md px-2 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <FilterBar query={query} onChange={setQuery} multi={FILTERS} dateLabel="Placed" searchPlaceholder="Order, customer or city" />
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Mock orders"
            columns={COLUMNS}
            rows={result?.rows}
            total={result?.total ?? 0}
            loading={loading}
            error={error}
            onRetry={() => setAttempt((n) => n + 1)}
            query={query}
            onQueryChange={setQuery}
            defaultSort={SPEC.defaultSort}
            pageSizes={SPEC.pageSizes}
            getRowId={(r) => r.id}
            rowLabel={(r) => `Order ${r.orderNumber}`}
            onRowClick={(r) => toast(`Opened ${r.orderNumber}`, { description: 'Row click-through goes to the order page once it exists.' })}
            exportRows={exportRows}
            exportName="orders-demo"
          />
        </CardContent>
      </Card>
    </>
  );
}
