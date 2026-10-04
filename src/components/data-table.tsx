import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadText, toCsv } from '@/lib/csv';
import { type ListQuery, nextSort } from '@/lib/list-query';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The value in the CSV export; required, so an export never carries rendered markup. */
  csv: (row: T) => string;
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Cannot be hidden (the column that identifies the row). */
  pinned?: boolean;
  /** False for a column that holds a button, not data: it is left out of the CSV export. */
  exported?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  /** The current page from the server; undefined until the first load. */
  rows: readonly T[] | undefined;
  total: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  query: ListQuery;
  onQueryChange: (change: Partial<ListQuery>) => void;
  defaultSort: ListQuery['sort'];
  pageSizes: readonly number[];
  getRowId: (row: T) => string;
  /** Opens a row (click, Enter or Space). Without it, rows are not interactive. */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  /** Every row of the current view (filters and sort), for the CSV export. */
  exportRows?: () => Promise<readonly T[]>;
  exportName?: string;
  emptyMessage?: ReactNode;
  caption: string;
}

const numberFormat = new Intl.NumberFormat('en-PK');

/**
 * The table every list screen uses. The server pages, sorts and filters; this renders one page,
 * so 10,000 rows cost what 25 do. Rows open by click, Enter or Space; ↑/↓ move between rows,
 * Home/End jump to the first and last. Hidden columns are part of the view, so they are left out
 * of the export too.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, total, loading, error, query, onQueryChange, getRowId, onRowClick } = props;
  const [exporting, setExporting] = useState(false);
  const body = useRef<HTMLTableSectionElement>(null);
  const visible = columns.filter((c) => c.pinned || !query.hidden.includes(c.key));
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const first = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const last = Math.min(total, query.page * query.pageSize);

  const exportCsv = async () => {
    if (!props.exportRows) return;
    setExporting(true);
    try {
      const all = await props.exportRows();
      const data = visible.filter((c) => c.exported !== false);
      downloadText(`${props.exportName ?? 'export'}.csv`, toCsv(data.map((c) => c.header), all.map((row) => data.map((c) => c.csv(row)))));
      toast.success(`Exported ${numberFormat.format(all.length)} rows`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    const rowsEls = [...(body.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]') ?? [])];
    const index = rowsEls.indexOf(event.currentTarget);
    const focus = (i: number) => rowsEls[Math.max(0, Math.min(rowsEls.length - 1, i))]?.focus();
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(rowsEls.length - 1);
    else if ((event.key === 'Enter' || event.key === ' ') && onRowClick) onRowClick(row);
    else return;
    event.preventDefault();
  };

  const status = error ? 'error' : rows === undefined ? 'loading' : rows.length === 0 ? (loading ? 'loading' : 'empty') : 'populated';

  return (
    <div className="space-y-3" data-table-state={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status === 'populated' || (status === 'empty' && !loading)
            ? total === 0
              ? 'No rows'
              : `${numberFormat.format(first)}–${numberFormat.format(last)} of ${numberFormat.format(total)}`
            : status === 'loading'
              ? (
                  <>
                    <span className="sr-only">Loading…</span>
                    <Skeleton aria-hidden className="my-0.5 h-4 w-28" />
                  </>
                )
              : ''}
        </p>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns
                .filter((c) => !c.pinned)
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!query.hidden.includes(c.key)}
                    // Stay open, so several columns can be toggled in one go.
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) => onQueryChange({ hidden: on ? query.hidden.filter((k) => k !== c.key) : [...query.hidden, c.key] })}
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {props.exportRows && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0 || !!error}>
              <Download className="size-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{props.caption}</caption>
          <thead className="bg-muted/40">
            <tr>
              {visible.map((c) => {
                const sorted = query.sort?.key === c.key ? query.sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={cn('h-10 px-3 font-medium whitespace-nowrap text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', c.align === 'right' && 'flex-row-reverse')}
                        onClick={() => onQueryChange({ sort: nextSort(query.sort, c.key, props.defaultSort) })}
                      >
                        {c.header}
                        {sorted === 'asc' ? <ArrowUp className="size-3.5" /> : sorted === 'desc' ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={body} className={cn(loading && rows && rows.length > 0 && 'opacity-60 transition-opacity')}>
            {status === 'loading' &&
              // The same row height as a loaded row, and bars of a text's width on the column's own side.
              Array.from({ length: Math.min(query.pageSize, 10) }, (_, i) => (
                <tr key={i} className="border-t" aria-hidden>
                  {visible.map((c, j) => (
                    <td key={c.key} className="px-3 py-2">
                      <Skeleton className={cn('my-0.5 h-4 max-w-full', c.align === 'right' ? ['ml-auto w-16', 'ml-auto w-12', 'ml-auto w-20'][(i + j) % 3] : ['w-28', 'w-20', 'w-36', 'w-24'][(i + j * 2) % 4])} />
                    </td>
                  ))}
                </tr>
              ))}
            {status === 'error' && (
              <tr>
                <td colSpan={visible.length} className="px-3 py-10 text-center">
                  <p role="alert" className="text-sm text-brand-coral">
                    Could not load: {error}
                  </p>
                  {props.onRetry && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={props.onRetry}>
                      <RefreshCw className="size-4" />
                      Try again
                    </Button>
                  )}
                </td>
              </tr>
            )}
            {status === 'empty' && (
              <tr>
                <td colSpan={visible.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {props.emptyMessage ?? 'Nothing matches these filters.'}
                </td>
              </tr>
            )}
            {status === 'populated' &&
              rows!.map((row) => (
                <tr
                  key={getRowId(row)}
                  data-row
                  tabIndex={0}
                  aria-label={props.rowLabel?.(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={(e) => onRowKey(e, row)}
                  className={cn(
                    'border-t outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                  )}
                >
                  {visible.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2 whitespace-nowrap', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={query.pageSize}
            onChange={(e) => onQueryChange({ pageSize: Number(e.target.value) })}
          >
            {props.pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">
          Page {numberFormat.format(Math.min(query.page, pages))} of {numberFormat.format(pages)}
        </span>
        <Button variant="outline" size="icon-sm" disabled={query.page <= 1} onClick={() => onQueryChange({ page: query.page - 1 })} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={query.page >= pages} onClick={() => onQueryChange({ page: query.page + 1 })} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
