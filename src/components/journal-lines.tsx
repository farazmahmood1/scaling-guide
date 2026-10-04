import { Fragment, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { ClosedMark } from '@/components/closed-period';
import { EntryDetail } from '@/components/entry-detail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import type { DrillSpec, JournalLinesPage } from '@/lib/api';
import { downloadText } from '@/lib/csv';
import { formatPaisa } from '@/lib/format';
import { CLOSED_ROW_CLASS, type Scope, fetchAllLines, isClosedDate, linesCsv, linesQuery, sourceLabel } from '@/lib/ledger';
import { cn } from '@/lib/utils';

const SIZES = [50, 100, 200] as const;
const number = new Intl.NumberFormat('en-PK');

/**
 * The lines of one page, as a table: a line in a closed month carries a lock, the word "Closed" and
 * a slate tint; a reversed line is struck through; any line opens its whole entry. Totals and any
 * running balance are over the whole filter, not just this page.
 */
export function LinesTable({ data, title, closed, dim }: { data: JournalLinesPage; title: string; closed: ReadonlySet<string>; dim?: boolean }) {
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const withBalance = data.opening !== null;
  return (
    <div className={cn('overflow-x-auto rounded-lg border', dim && 'opacity-60 transition-opacity')}>
      <table className="w-full text-sm">
        <caption className="sr-only">Journal lines for {title}</caption>
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Date</th>
            <th scope="col" className="px-3 py-2 font-medium">Entry</th>
            <th scope="col" className="px-3 py-2 font-medium">Account</th>
            <th scope="col" className="px-3 py-2 font-medium">What</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Debit</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Credit</th>
            {withBalance && <th scope="col" className="px-3 py-2 text-right font-medium">Balance</th>}
          </tr>
        </thead>
        <tbody>
          {withBalance && data.page === 1 && (
            <tr className="border-t bg-muted/20 font-medium">
              <td className="px-3 py-2" colSpan={6}>
                Brought forward
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.opening)}</td>
            </tr>
          )}
          {data.lines.map((l) => {
            const isClosed = isClosedDate(l.date, closed);
            return (
              <Fragment key={l.lineId}>
                <tr className={cn('border-t align-top', isClosed && CLOSED_ROW_CLASS, l.reversed && 'text-muted-foreground')} data-closed={isClosed}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {l.date}
                    {isClosed && <ClosedMark className="ml-2" />}
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="link" className="h-auto p-0 tabular-nums" aria-expanded={openEntry === l.entryId} onClick={() => setOpenEntry(openEntry === l.entryId ? null : l.entryId)}>
                      #{l.entryId}
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">{l.accountCode}</span> {l.accountName}
                  </td>
                  <td className={cn('px-3 py-2', l.reversed && 'line-through')}>
                    {l.memo}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground no-underline">
                      {sourceLabel(l.originType)}
                      {l.isReversal && <Badge variant="secondary">Reversal</Badge>}
                      {l.reversed && <Badge variant="destructive">Reversed</Badge>}
                      {l.shipmentId && (
                        <Link className="underline underline-offset-2" to={`/parcels/${l.shipmentId}`}>
                          parcel
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.debit === '0' ? '' : formatPaisa(l.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.credit === '0' ? '' : formatPaisa(l.credit)}</td>
                  {withBalance && <td className="px-3 py-2 text-right font-medium tabular-nums">{l.balance === null ? '' : formatPaisa(l.balance)}</td>}
                </tr>
                {openEntry === l.entryId && (
                  <tr className="border-t bg-muted/20">
                    <td className="p-3" colSpan={withBalance ? 7 : 6}>
                      <EntryDetail entryId={l.entryId} onOpenEntry={setOpenEntry} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 bg-muted/30 font-medium">
          <tr>
            <td className="px-3 py-2" colSpan={4}>
              All {number.format(data.total)} lines
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.debit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(data.credit)}</td>
            {withBalance && <td className="px-3 py-2 text-right tabular-nums">{data.closing === null ? '' : formatPaisa(data.closing)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The journal lines behind a figure: the end of every drill-through. The server pages them (so a
 * ledger of any size opens at once) and the view exports to CSV.
 */
export function JournalLines({ drill, scope, title, closed, onClose }: { drill: DrillSpec; scope: Scope; title: string; closed: ReadonlySet<string>; onClose?: () => void }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<(typeof SIZES)[number]>(50);
  const [exporting, setExporting] = useState(false);
  const { data, error, loading, reload } = useApi<JournalLinesPage>(`/api/v1/reports/lines?${linesQuery(drill, scope, { page, size })}`);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAllLines(drill, scope);
      downloadText(`${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ledger'}.csv`, linesCsv(all.lines, all.hasBalance));
      toast.success(`Exported ${number.format(all.lines.length)} lines${all.truncated ? ' (stopped at the limit; narrow the period for the rest)' : ''}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-label={`Journal lines: ${title}`} className="rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data ? (data.total === 0 ? 'No journal lines' : `Lines ${number.format(first)}–${number.format(last)} of ${number.format(data.total)}`) : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !data || data.total === 0}>
            <Download className="size-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" aria-label="Close the lines" onClick={onClose}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 py-3">
        {error && !data && (
          <div role="alert" className="py-2 text-sm text-brand-coral">
            Could not load the lines: {error}
            <Button variant="outline" size="sm" className="ml-3" onClick={reload}>
              Try again
            </Button>
          </div>
        )}
        {!data && !error && <TableSkeleton rows={8} footer label="Loading the lines" columns={['Date', 'Entry', 'Account', { header: 'What', sub: true }, num('Debit'), num('Credit')]} />}
        {data && data.total === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing was posted for this.</p>}
        {data && data.total > 0 && <LinesTable data={data} title={title} closed={closed} dim={loading} />}

        {data && data.total > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              Lines per page
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value) as (typeof SIZES)[number]);
                  setPage(1);
                }}
              >
                {SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted-foreground">
              Page {number.format(data.page)} of {number.format(pages)}
            </span>
            <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
