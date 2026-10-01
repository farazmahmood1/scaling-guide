import { useState } from 'react';
import { Link } from 'react-router';

import { PlaceChip } from '@/components/stock-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { type StockMovePage, apiGet } from '@/lib/api';
import { formatKarachiFull } from '@/lib/format';
import { bucketOf, placeName, reasonWords } from '@/lib/stock';

/**
 * Every move of one product, newest first: from where to where, how many, why, and which parcel
 * or person caused it. This is the ledger itself, so the numbers above can always be explained.
 */
export function MoveHistory({ variantId, title }: { variantId: string; title: string }) {
  const path = `/api/v1/stock/variants/${variantId}/moves?limit=50`;
  const first = useApi<StockMovePage>(path);
  const [more, setMore] = useState<{ after?: StockMovePage; pages: StockMovePage[] }>({ pages: [] });
  const [loading, setLoading] = useState(false);
  const extra = more.after === first.data ? more.pages : [];
  const moves = [...(first.data?.moves ?? []), ...extra.flatMap((p) => p.moves)];
  const next = (extra.at(-1) ?? first.data)?.nextBefore ?? null;

  const loadMore = async () => {
    if (!next) return;
    setLoading(true);
    try {
      const page = await apiGet<StockMovePage>(`${path}&before=${next}`);
      setMore({ after: first.data, pages: [...extra, page] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-label={`Move history of ${title}`} className="mt-4 rounded-lg border">
      <header className="border-b px-4 py-3">
        <h3 className="font-semibold">Move history</h3>
        <p className="text-sm text-muted-foreground">{title}</p>
      </header>
      <div className="px-4 py-3">
        {first.loading && !first.data && <Skeleton className="h-24 w-full" />}
        {first.error && !first.data && (
          <p role="alert" className="text-sm text-brand-coral">
            Could not load the history: {first.error}
          </p>
        )}
        {first.data && moves.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No moves recorded for this product yet.</p>}
        {moves.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Stock moves, newest first</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">When (Karachi)</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Units</th>
                  <th className="py-1.5 pr-3 font-medium">From → to</th>
                  <th className="py-1.5 pr-3 font-medium">Why</th>
                  <th className="py-1.5 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className="border-t align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatKarachiFull(m.occurredAt)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{m.qty}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <PlaceChip bucket={bucketOf(m.from.kind)} label={placeName(m.from)} />
                        <span aria-label="to">→</span>
                        <PlaceChip bucket={bucketOf(m.to.kind)} label={placeName(m.to)} />
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {reasonWords(m)}
                      {m.trackingNumber && m.shipmentId && (
                        <>
                          {' · '}
                          <Link className="font-mono text-xs underline underline-offset-2" to={`/parcels/${m.shipmentId}`}>
                            {m.trackingNumber}
                          </Link>
                        </>
                      )}
                      {m.note && <div className="text-xs text-muted-foreground">{m.note}</div>}
                    </td>
                    <td className="py-2 text-muted-foreground">{m.actor ?? 'the system'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Older moves'}
          </Button>
        )}
      </div>
    </section>
  );
}
