import { useState } from 'react';
import { FileText } from 'lucide-react';

import { JournalLines } from '@/components/journal-lines';
import { Pager } from '@/components/pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type SkeletonColumn, TableSkeleton, num } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import type { DrillSpec, InvoiceRow, PagedRows, PaymentRow, VendorBill } from '@/lib/api';
import { formatPaisa } from '@/lib/format';
import { isClosedDate } from '@/lib/ledger';
import { ClosedMark } from '@/components/closed-period';

const PAGE = 25;

export type OnOpen = (drill: DrillSpec, title: string) => void;

interface Props {
  closed: ReadonlySet<string>;
  onOpen: OnOpen;
}

/** The "Entries" button every document has: opens the journal lines it posted. */
function EntriesButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} aria-label={label}>
      <FileText className="size-4" />
      Entries
    </Button>
  );
}

function State({ error, loading, hasData, empty, columns }: { error?: string; loading: boolean; hasData: boolean; empty: string | null; /** The table's columns, for its shape while it loads. */ columns: ReadonlyArray<string | SkeletonColumn> }) {
  if (error && !hasData) return <p role="alert" className="text-sm text-brand-coral">Could not load: {error}</p>;
  if (loading && !hasData) return <TableSkeleton rows={6} columns={columns} />;
  return empty ? <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p> : null;
}

/** Sales invoices to retail partners, one per brand per imported sales sheet. Paged on the server. */
export function InvoicesView({ closed, onOpen }: Props) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<PagedRows<InvoiceRow>>(`/api/v1/accounting/invoices?page=${page}&size=${PAGE}`);
  return (
    <div>
      <State columns={['Invoice', 'Partner', 'Issued', num('Total'), { as: 'button', align: 'right' }]} error={error} loading={loading} hasData={!!data} empty={data && data.rows.length === 0 ? 'No invoices yet. They are made when a partner\'s sales sheet is imported.' : null} />
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Invoices</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Invoice</th>
                <th scope="col" className="px-3 py-2 font-medium">Partner</th>
                <th scope="col" className="px-3 py-2 font-medium">Issued</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {i.number} {i.voidedAt && <Badge variant="destructive">Voided</Badge>}
                    <div className="text-xs font-normal text-muted-foreground">{i.store === 'nur' ? 'NUR by Juggun' : "Juggun's Organics"}</div>
                  </td>
                  <td className="px-3 py-2">{i.partner}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {i.issuedOn}
                    {isClosedDate(i.issuedOn, closed) && <ClosedMark className="ml-2" />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(i.total)}</td>
                  <td className="px-3 py-2 text-right">
                    {i.drill ? <EntriesButton label={`Entries of invoice ${i.number}`} onClick={() => onOpen(i.drill!, `Invoice ${i.number}`)} /> : <span className="text-xs text-muted-foreground">Before entries were linked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}
    </div>
  );
}

/** Vendor bills, oldest due first. There are few, so the list is paged here. */
export function BillsView({ closed, onOpen }: Props) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<{ bills: VendorBill[] }>('/api/v1/purchasing/bills');
  const bills = data?.bills ?? [];
  const shown = bills.slice((page - 1) * PAGE, page * PAGE);
  return (
    <div>
      <State columns={['Bill', 'Vendor', 'Dated', num('Total'), num('Owed'), { as: 'button', align: 'right' }]} error={error} loading={loading} hasData={!!data} empty={data && bills.length === 0 ? 'No vendor bills yet.' : null} />
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Vendor bills</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Bill</th>
                <th scope="col" className="px-3 py-2 font-medium">Vendor</th>
                <th scope="col" className="px-3 py-2 font-medium">Dated</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Owed</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {b.billNumber}
                    <div className="text-xs font-normal text-muted-foreground">{b.poNumber}</div>
                  </td>
                  <td className="px-3 py-2">{b.vendor}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {b.billDate}
                    {b.dueOn ? <div className="text-xs text-muted-foreground">due {b.dueOn}</div> : null}
                    {isClosedDate(b.billDate, closed) && <ClosedMark />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaisa(b.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.overdue && <Badge variant="destructive" className="mr-2">Overdue</Badge>}
                    {BigInt(b.outstanding) > 0n ? formatPaisa(b.outstanding) : 'Paid'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EntriesButton label={`Entries of bill ${b.billNumber}`} onClick={() => onOpen({ originType: 'vendor_bill', originId: b.id }, `Bill ${b.billNumber}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && bills.length > 0 && <Pager page={page} pageSize={PAGE} total={bills.length} onPage={setPage} />}
    </div>
  );
}

/** Money paid to vendors and received from PostEx, newest first. Paged on the server. */
export function PaymentsView({ closed, onOpen }: Props) {
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<'' | 'in' | 'out'>('');
  const { data, error, loading } = useApi<PagedRows<PaymentRow>>(`/api/v1/accounting/payments?page=${page}&size=${PAGE}${direction ? `&direction=${direction}` : ''}`);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Direction" className="flex gap-1 text-sm">
        {([['', 'All'], ['in', 'Received'], ['out', 'Paid out']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={direction === value}
            onClick={() => {
              setDirection(value);
              setPage(1);
            }}
            className="rounded-md px-3 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary aria-pressed:font-medium"
          >
            {label}
          </button>
        ))}
      </div>
      <State columns={['Date', 'Who', 'For', num('Amount'), { as: 'button', align: 'right' }]} error={error} loading={loading} hasData={!!data} empty={data && data.rows.length === 0 ? 'No payments.' : null} />
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Payments</caption>
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Who</th>
                <th scope="col" className="px-3 py-2 font-medium">For</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={`${p.kind}:${p.id}`} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.paidOn}
                    {isClosedDate(p.paidOn, closed) && <ClosedMark className="ml-2" />}
                  </td>
                  <td className="px-3 py-2">
                    {p.counterparty}
                    <div className="text-xs text-muted-foreground">{p.kind === 'postex_payout' ? 'PostEx payout' : `Vendor payment${p.method ? `, ${p.method.replace('_', ' ')}` : ''}`}</div>
                  </td>
                  <td className="px-3 py-2">{p.kind === 'postex_payout' ? `Receipt ${p.document ?? ''}` : `Bill ${p.document ?? ''}`}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={p.direction === 'in' ? 'text-primary' : ''}>
                      {p.direction === 'in' ? '+' : '−'} {formatPaisa(p.amount)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EntriesButton label={`Entries of the payment to ${p.counterparty}`} onClick={() => onOpen(p.drill, `${p.kind === 'postex_payout' ? 'Payout' : 'Payment'} ${p.document ?? p.id}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}
      <p className="text-xs text-muted-foreground">Payments from retail partners are not recorded in the system yet, so they do not appear here.</p>
    </div>
  );
}

/** The lines a document posted, shown below its list with the same closed-month marking as a report. */
export function DocumentLines({ drill, title, closed, onClose }: { drill: DrillSpec; title: string; closed: ReadonlySet<string>; onClose: () => void }) {
  return <JournalLines key={JSON.stringify(drill)} drill={drill} scope={{}} title={title} closed={closed} onClose={onClose} />;
}
