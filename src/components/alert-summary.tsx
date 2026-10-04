import { CircleCheck, PackageX, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { Definition } from '@/components/dashboard-ui';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Line, ListSkeleton } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import type { AwaitingReturn, StoreKey } from '@/lib/api';
import { DEFINITIONS } from '@/lib/dashboard';
import { alertRows } from '@/lib/alerts';

/** What needs a person, for the chosen brand: open queue items by kind and returns waiting at the warehouse. */
export function AlertSummary({ store }: { store: StoreKey | null }) {
  const suffix = store ? `?store=${store}` : '';
  const summary = useApi<{ open: Record<string, number> }>(`/api/v1/reconciliation/summary${suffix}`);
  const awaiting = useApi<{ returns: AwaitingReturn[] }>(`/api/v1/stock/returns-awaiting${suffix}`);
  const loading = (summary.loading && !summary.data) || (awaiting.loading && !awaiting.data);
  const failed = [summary.error && !summary.data ? 'the queue' : null, awaiting.error && !awaiting.data ? 'the returns' : null].filter((x): x is string => x !== null);
  const rows = alertRows(summary.data?.open ?? {}, awaiting.data?.returns.length ?? 0);
  const total = rows.reduce((n, r) => n + r.count, 0);

  return (
    <Card className="gap-3 py-4" data-testid="alert-summary">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0 px-4 pb-0">
        <div className="flex items-center gap-1">
          <h3 className="font-semibold">Needs attention</h3>
          <Definition term="Needs attention">{DEFINITIONS.alerts}</Definition>
        </div>
        <p className="text-xs text-muted-foreground">Right now{store ? `, ${store === 'nur' ? 'NUR by Juggun' : "Juggun's Organics"}` : ', both brands'}</p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4">
        {loading && (
          <>
            <div aria-hidden>
              <Line className="mb-1.5 w-32" />
            </div>
            <ListSkeleton rows={4} lines={1} icon trailing="number" rowClassName="py-2.5" label="Loading what needs attention" />
          </>
        )}
        {failed.length > 0 && (
          <p role="alert" className="mb-2 text-sm text-brand-coral">
            Could not load {failed.join(' or ')}. What is shown may be incomplete.
          </p>
        )}
        {!loading && failed.length === 0 && rows.length === 0 && (
          <p className="flex items-center gap-2 py-3 text-sm" role="status">
            <CircleCheck className="size-5 text-primary" aria-hidden />
            Nothing needs a person right now. Parcels, orders and cash agree.
          </p>
        )}
        {rows.length > 0 && (
          <>
            <p className="mb-1 text-sm text-muted-foreground">
              {total} thing{total === 1 ? '' : 's'} to look at
            </p>
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {r.returns ? <PackageX className="size-4 shrink-0 text-brand-coral" aria-hidden /> : <TriangleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <Link className="truncate underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={r.href}>
                      {r.label}
                    </Link>
                    <Definition term={r.label}>{r.meaning}</Definition>
                  </span>
                  <span className="font-semibold tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
