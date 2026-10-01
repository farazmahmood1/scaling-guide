import { ClosedMark } from '@/components/closed-period';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import type { EntryDetail as Entry } from '@/lib/api';
import { formatKarachiFull, formatPaisa } from '@/lib/format';
import { sourceLabel } from '@/lib/ledger';

/**
 * One journal entry whole: why it was posted, every line, and how it ties to a reversal. The last
 * step of any drill-through, so a figure can always be explained down to the posting. Its debits
 * and credits are summed here as a visible check.
 */
export function EntryDetail({ entryId, onOpenEntry }: { entryId: string; onOpenEntry?: (id: string) => void }) {
  const { data, error } = useApi<{ entry: Entry }>(`/api/v1/accounting/entries/${entryId}`);
  if (error && !data) return <p className="text-sm text-brand-coral">Could not load the entry: {error}</p>;
  if (!data) return <Skeleton className="h-24 w-full" />;
  const e = data.entry;
  const debit = e.lines.reduce((n, l) => n + BigInt(l.debit), 0n);
  const credit = e.lines.reduce((n, l) => n + BigInt(l.credit), 0n);

  return (
    <section aria-label={`Journal entry ${e.id}`} className="space-y-2 rounded-lg border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">Entry #{e.id}</h4>
        <span className="text-muted-foreground">{e.date}</span>
        <Badge variant="outline">{sourceLabel(e.sourceType)}</Badge>
        {e.periodClosedAt && <ClosedMark label={`Closed ${formatKarachiFull(e.periodClosedAt)}`} />}
        {e.reversedBy && (
          <Badge variant="destructive">
            Reversed
          </Badge>
        )}
        {e.reversesId && <Badge variant="secondary">Reversal</Badge>}
      </div>
      <p>{e.memo}</p>
      <p className="text-xs text-muted-foreground">
        Posted {formatKarachiFull(e.postedAt)} by {e.postedBy ?? 'the system'} · source {e.sourceType} {e.sourceId}
      </p>
      {(e.reversesId || e.reversedBy) && onOpenEntry && (
        <div className="flex flex-wrap gap-2">
          {e.reversesId && (
            <Button size="sm" variant="outline" onClick={() => onOpenEntry(e.reversesId!)}>
              Open the entry it reverses (#{e.reversesId})
            </Button>
          )}
          {e.reversedBy && (
            <Button size="sm" variant="outline" onClick={() => onOpenEntry(e.reversedBy!)}>
              Open the reversal (#{e.reversedBy})
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">Lines of entry {e.id}</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Account</th>
              <th className="py-1 pr-3 font-medium">Partner</th>
              <th className="py-1 pr-3 font-medium">Brand</th>
              <th className="py-1 pr-3 text-right font-medium">Debit</th>
              <th className="py-1 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {e.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1.5 pr-3">
                  <span className="font-mono text-xs text-muted-foreground">{l.code}</span> {l.name}
                </td>
                <td className="py-1.5 pr-3">{l.partner ?? '—'}</td>
                <td className="py-1.5 pr-3">{l.store ?? 'Both'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{l.debit === '0' ? '' : formatPaisa(l.debit)}</td>
                <td className="py-1.5 text-right tabular-nums">{l.credit === '0' ? '' : formatPaisa(l.credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-1.5" colSpan={3}>
                Total {debit === credit ? <Badge variant="secondary">Balances</Badge> : <Badge variant="destructive">Does not balance</Badge>}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatPaisa(debit.toString())}</td>
              <td className="py-1.5 text-right tabular-nums">{formatPaisa(credit.toString())}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
