import { Fragment, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

import { useBrand } from '@/brand/brand-context';
import { EntryDetail } from '@/components/entry-detail';
import { Pager } from '@/components/pager';
import { TableSkeleton, num } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import type { JournalGroup, JournalPage } from '@/lib/api';
import { formatPaisa } from '@/lib/format';
import { sourceLabel } from '@/lib/ledger';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm';
const PAGE = 50;

const JOURNAL_GROUPS: ReadonlyArray<{ value: JournalGroup; label: string; hint: string }> = [
  { value: 'sales', label: 'Sales', hint: 'A parcel delivered, or a partner sale invoiced' },
  { value: 'cost', label: 'Cost of goods', hint: 'What the delivered products cost, damaged write-offs, PR packages' },
  { value: 'postex', label: 'PostEx charges', hint: 'Delivery and return charges, with their tax' },
  { value: 'cash', label: 'Cash received', hint: 'PostEx payouts and partner payments' },
  { value: 'purchases', label: 'Purchases', hint: 'Goods received, vendor bills and payments' },
  { value: 'expenses', label: 'Expenses', hint: 'Ads, salaries, rent, packaging and the rest' },
  { value: 'opening', label: 'Opening balances', hint: 'The balances the books started from' },
  { value: 'reversals', label: 'Reversals', hint: 'Entries undone, with the reason' },
];

/**
 * The journal: every entry the books hold, newest first, whoever posted it. Most are posted by the
 * system as parcels are delivered, charged and paid out; people post purchases and expenses. Each
 * opens to its lines, which always balance.
 */
export function JournalList() {
  const { brand } = useBrand();
  const [group, setGroup] = useState<JournalGroup | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({
    page: String(page),
    size: String(PAGE),
    ...(brand ? { store: brand } : {}),
    ...(group ? { group } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const { data, error, loading } = useApi<JournalPage>(`/api/v1/accounting/entries?${params.toString()}`);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setOpen(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Kind
          <select className={cn(selectClass, 'mt-1 block')} value={group} onChange={(e) => reset(setGroup)(e.target.value as JournalGroup | '')}>
            <option value="">Everything</option>
            {JOURNAL_GROUPS.map((g) => (
              <option key={g.value} value={g.value} title={g.hint}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          From
          <Input type="date" className="mt-1 w-40" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        </label>
        <label className="text-xs">
          To
          <Input type="date" className="mt-1 w-40" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
        </label>
        <Input className="w-full sm:w-72" placeholder="Search: tracking number, vendor, memo" value={search} onChange={(e) => reset(setSearch)(e.target.value)} aria-label="Search the journal" />
      </div>

      {loading && !data && <TableSkeleton rows={8} label="Loading the journal" columns={['Date', 'What happened', 'Kind', 'Brand', num('Amount'), 'Posted by']} />}
      {error && !data && <p className="text-sm text-brand-coral">Could not load the journal: {error}</p>}
      {data && data.rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <BookOpen className="size-8 text-muted-foreground" />
          <p className="font-medium">No entries match</p>
          <p className="max-w-sm text-sm text-muted-foreground">Entries appear on their own as parcels are delivered, charged and paid out, and when purchases and expenses are recorded.</p>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Journal entries, newest first</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="w-8 px-2 py-2" />
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">What happened</th>
                <th scope="col" className="px-3 py-2 font-medium">Kind</th>
                <th scope="col" className="px-3 py-2 font-medium">Brand</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 font-medium">Posted by</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const expanded = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={cn('cursor-pointer border-t hover:bg-muted/40', expanded && 'bg-muted/40', r.reversedBy && 'text-muted-foreground')} onClick={() => setOpen(expanded ? null : r.id)}>
                      <td className="px-2 py-2">
                        <button type="button" aria-expanded={expanded} aria-label={`Lines of entry ${r.id}`} className="rounded p-0.5 hover:bg-muted">
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="max-w-md px-3 py-2">
                        <span className={cn(r.reversedBy && 'line-through')}>{r.memo}</span>
                        {r.reversedBy && <Badge variant="outline" className="ml-2">Reversed</Badge>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{sourceLabel(r.sourceType)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.stores.length === 0 ? 'Both' : r.stores.map((s) => (s === 'nur' ? 'NUR' : 'Organics')).join(', ')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(r.amount)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.postedBy ?? <span className="text-muted-foreground">System</span>}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-t">
                        <td colSpan={7} className="bg-muted/30 p-3">
                          <EntryDetail entryId={r.id} onOpenEntry={(id) => setOpen(id)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* A linked entry (a reversal and what it undid) that is not on this page opens here. */}
      {data && open && !data.rows.some((r) => r.id === open) && <EntryDetail key={open} entryId={open} onOpenEntry={(id) => setOpen(id)} />}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}
    </div>
  );
}
