import { useState } from 'react';

import { type Closed, ReviewItemCard } from '@/components/review-item';
import { Button } from '@/components/ui/button';
import { Line, Loading, SmallLine } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { type ItemStatus, type ReviewItemPage, apiGet } from '@/lib/api';
import { bySeverity, profileFor } from '@/lib/reconciliation';

/**
 * The items of one kind (or, for history, of one status). It loads its own page of the queue, and
 * when an item is closed it only forgets that item: the list is not fetched again, so the rest of
 * the group stays where it was and nothing else on the screen flickers.
 */
export function ReviewGroup({ kind, status, count, onClosed, canAct = true }: { kind: string | null; status: ItemStatus; count?: number; onClosed: (kind: string, how: Closed) => void; canAct?: boolean }) {
  const path = `/api/v1/reconciliation/items?status=${status}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`;
  const first = useApi<ReviewItemPage>(path);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  // Later pages belong to the first page they followed; a reload drops them.
  const [later, setLater] = useState<{ after?: ReviewItemPage; pages: ReviewItemPage[] }>({ pages: [] });
  const extra = later.after === first.data ? later.pages : [];
  const nextBefore = (extra.at(-1) ?? first.data)?.nextBefore ?? null;
  const [loadingMore, setLoadingMore] = useState(false);
  const profile = kind ? profileFor(kind) : null;

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const more = await apiGet<ReviewItemPage>(`${path}&before=${nextBefore}`);
      setLater({ after: first.data, pages: [...extra, more] });
    } finally {
      setLoadingMore(false);
    }
  };

  const items = bySeverity([...(first.data?.items ?? []), ...extra.flatMap((p) => p.items)].filter((i) => !closed.has(i.id)));

  return (
    <section aria-label={profile?.title ?? 'Items'} className="rounded-xl border">
      {profile && (
        <header className="border-b px-4 py-3">
          <h2 className="flex items-baseline gap-2 font-semibold">
            {profile.title}
            {count !== undefined && <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}
          </h2>
          <p className="text-sm text-muted-foreground">{profile.question}</p>
          {profile.fix && (
            <p className="mt-1 text-sm">
              <span className="font-medium">What to do: </span>
              {profile.fix}
            </p>
          )}
        </header>
      )}
      <div className="px-4">
        {first.loading && !first.data && (
          <Loading label="Loading these items">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-wrap items-start justify-between gap-3 border-b py-4 last:border-b-0">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <SmallLine className="w-24" />
                    <SmallLine className="w-28" />
                  </div>
                  <Line className={['w-96', 'w-80', 'w-[26rem]'][i]} />
                  <SmallLine className="w-44" />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </Loading>
        )}
        {first.error && !first.data && (
          <div className="py-4">
            <p role="alert" className="text-sm text-brand-coral">
              Could not load these: {first.error}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={first.reload}>
              Try again
            </Button>
          </div>
        )}
        {first.data && items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing {status} here.</p>}
        {items.length > 0 && (
          <ul>
            {items.map((item) => (
              <ReviewItemCard
                key={item.id}
                item={item}
                canAct={canAct}
                onClosed={(how) => {
                  setClosed((c) => new Set(c).add(item.id));
                  onClosed(item.kind, how);
                }}
              />
            ))}
          </ul>
        )}
        {nextBefore && (
          <Button variant="ghost" size="sm" className="mb-3" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </section>
  );
}
